/**
 * heys-cron-photo-cleanup — SEC-022 fix
 *
 * Контекст: при `DELETE FROM clients WHERE id=<uuid>` FK CASCADE удаляет все ПДн
 * из БД (18 таблиц), НО photos в S3 `heys-photos/<cid>/...` остаются — нет связи
 * между S3 и БД. Это нарушение 152-ФЗ §14 («право на удаление»): фото еды могут
 * содержать PII (лицо, документы). Также storage bloat.
 *
 * Решение: weekly cron сканит S3 prefix'ы (= client_id UUIDs), проверяет каждый
 * в `clients` table, удаляет все объекты под prefix'ом если client_id не найден.
 *
 * Логика безопасности (anti-foot-shooting):
 *   - **DRY-RUN режим по умолчанию** (env DRY_RUN=1 ИЛИ если не задан). Только
 *     перечислит candidates, ничего не удалит.
 *   - **Soft-grace 7 дней**: orphan должен быть detected как orphan в 2+
 *     последовательных runs с разницей ≥7 дней. Защищает от race-condition
 *     (client_id создан но photo загружено до commit's row's INSERT).
 *   - **Hard cap**: за один run удаляет ≤100 orphan'ов (защита от cascade
 *     удаления при багу в clients table).
 *
 * Schedule: weekly (Mon 06:00 UTC = 09:00 MSK). Cron: `0 6 ? * MON *`
 *
 * Env vars:
 *   - PG_HOST, PG_PORT, PG_DATABASE, PG_USER, PG_PASSWORD (через Lockbox или .env)
 *   - S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY (через Lockbox или .env)
 *   - S3_PHOTOS_BUCKET (default: heys-photos)
 *   - DRY_RUN (default: '1' — НЕ удалять, только логировать)
 *   - HARD_CAP_PER_RUN (default: 100)
 *
 * Outputs:
 *   - INSERT в `photo_cleanup_log` (run_at, status, scanned_prefixes,
 *     orphan_candidates, deleted_count, dry_run, errors)
 *   - Telegram alert если deleted_count > 0 (через initSecrets credentials)
 */

const { S3Client, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { Pool } = require('pg');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { initSecrets } = require('./secrets');

const FOLDER_ID = 'b1gnv1a4q8i6de6atl6n';
const BUCKET = process.env.S3_PHOTOS_BUCKET || 'heys-photos';
const DRY_RUN = process.env.DRY_RUN !== '0'; // По умолчанию DRY-RUN. Чтобы реально удалять — DRY_RUN=0.
const HARD_CAP_PER_RUN = parseInt(process.env.HARD_CAP_PER_RUN || '100', 10);
const SOFT_GRACE_DAYS = 7;
const CLEANUP_LEASE_MINUTES = 15;

function diagnosticId(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 12);
}

function isMessengerObjectPath(key) {
  return /^[0-9a-f-]{36}\/\d{4}-\d{2}-\d{2}\/(?:voice\/)?msg-[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/i.test(String(key || ''));
}

let _pool = null;
function getPool() {
  if (_pool) return _pool;

  let ssl = false;
  const caPath = path.join(__dirname, 'certs', 'root.crt');
  if (fs.existsSync(caPath)) {
    try {
      const ca = fs.readFileSync(caPath, 'utf8');
      ssl = { rejectUnauthorized: true, ca };
    } catch (e) {
      console.warn('[cleanup] cert read failed, ssl=verify-ca', {
        code: e?.code || 'cert_read_error',
      });
      ssl = { rejectUnauthorized: false };
    }
  }

  _pool = new Pool({
    host: process.env.PG_HOST,
    port: parseInt(process.env.PG_PORT || '6432', 10),
    database: process.env.PG_DATABASE,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    ssl,
    max: 5,
    idleTimeoutMillis: 30_000,
  });
  return _pool;
}

let _s3 = null;
function getS3() {
  if (_s3) return _s3;
  _s3 = new S3Client({
    endpoint: 'https://storage.yandexcloud.net',
    region: 'ru-central1',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  });
  return _s3;
}

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn('[cleanup] Telegram disabled (no token/chat)');
    return null;
  }
  return new Promise((resolve) => {
    const data = JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' });
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${token}/sendMessage`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': data.length },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, body: body.slice(0, 200) }));
      },
    );
    req.on('error', (e) => {
      console.warn('[cleanup] Telegram unavailable', {
        code: e?.code || 'telegram_error',
      });
      resolve(null);
    });
    req.write(data);
    req.end();
  });
}

/**
 * Список prefix'ов 1-го уровня в bucket. Каждый prefix должен быть UUID client_id.
 */
async function listClientPrefixes() {
  const s3 = getS3();
  const prefixes = [];
  let token = undefined;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Delimiter: '/',
        ContinuationToken: token,
      }),
    );
    for (const cp of res.CommonPrefixes || []) {
      // CommonPrefix: "<uuid>/"
      const p = (cp.Prefix || '').replace(/\/$/, '');
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p)) {
        prefixes.push(p);
      }
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return prefixes;
}

/**
 * Список объектов под prefix'ом.
 */
async function listObjectsUnderPrefix(prefix) {
  const s3 = getS3();
  const keys = [];
  let token = undefined;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: `${prefix}/`,
        ContinuationToken: token,
      }),
    );
    for (const o of res.Contents || []) keys.push(o.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

/**
 * Удалить все объекты под prefix'ом. Возвращает кол-во удалённых.
 */
async function deletePrefix(prefix, limit = HARD_CAP_PER_RUN) {
  const s3 = getS3();
  const keys = await listObjectsUnderPrefix(prefix);
  let deleted = 0;
  for (const key of keys.slice(0, Math.max(0, limit))) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
      deleted++;
    } catch (e) {
      console.warn('[cleanup] object delete failed', { object_id: diagnosticId(key), code: e?.name || 'storage_error' });
    }
  }
  return deleted;
}

/**
 * Проверить existence client_id в БД.
 */
async function checkClientsExist(pool, clientIds) {
  if (!clientIds.length) return new Set();
  const client = await pool.connect();
  try {
    const res = await client.query(
      'SELECT id::text FROM clients WHERE id::text = ANY($1::text[])',
      [clientIds],
    );
    return new Set(res.rows.map((r) => r.id));
  } finally {
    client.release();
  }
}

/**
 * Soft-grace check: orphan должен быть detected как orphan в predыдущем run'е тоже.
 */
async function getPreviousOrphans(pool) {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT details
         FROM photo_cleanup_log
        WHERE run_at > NOW() - INTERVAL '${SOFT_GRACE_DAYS + 1} days'
          AND run_at < NOW() - INTERVAL '${SOFT_GRACE_DAYS - 1} days'
        ORDER BY run_at DESC
        LIMIT 1`,
    );
    if (!res.rows.length) return new Set();
    try {
      const details = res.rows[0].details || {};
      const ids = Array.isArray(details.orphan_candidate_ids)
        ? details.orphan_candidate_ids
        : (Array.isArray(details.orphan_candidates) ? details.orphan_candidates.map(diagnosticId) : []);
      return new Set(ids);
    } catch (_) {
      return new Set();
    }
  } finally {
    client.release();
  }
}

async function listAllObjects() {
  const s3 = getS3();
  const objects = [];
  let token;
  do {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      ContinuationToken: token,
    }));
    for (const object of res.Contents || []) {
      objects.push({ key: object.Key, lastModified: object.LastModified || null });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return objects;
}

async function getReferencedMessengerPaths(pool) {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT DISTINCT attachment->>'path' AS object_path
         FROM public.client_messages m
         CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.attachments, '[]'::jsonb)) attachment
        WHERE attachment ? 'path'`,
    );
    return new Set(res.rows.map((row) => row.object_path).filter(isMessengerObjectPath));
  } finally {
    client.release();
  }
}

async function isObjectPathReferenced(pool, objectPath) {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT 1
         FROM public.client_messages m
         CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.attachments, '[]'::jsonb)) attachment
        WHERE attachment->>'path' = $1
        LIMIT 1`,
      [objectPath],
    );
    return res.rows.length > 0;
  } finally {
    client.release();
  }
}

async function claimQueuedCleanup(pool, limit) {
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE public.messenger_media_cleanup_queue
          SET status = 'retry', claimed_at = NULL, available_at = NOW(), updated_at = NOW(),
              last_error_code = 'lease_expired'
        WHERE status = 'processing'
          AND claimed_at < NOW() - ($1::int * INTERVAL '1 minute')`,
      [CLEANUP_LEASE_MINUTES],
    );
    const res = await client.query(
      `WITH candidates AS (
         SELECT object_path
           FROM public.messenger_media_cleanup_queue
          WHERE status IN ('pending', 'retry')
            AND available_at <= NOW()
          ORDER BY available_at, created_at
          FOR UPDATE SKIP LOCKED
          LIMIT $1
       )
       UPDATE public.messenger_media_cleanup_queue q
          SET status = 'processing', claimed_at = NOW(), updated_at = NOW()
         FROM candidates c
        WHERE q.object_path = c.object_path
       RETURNING q.object_path, q.attempts`,
      [Math.max(0, limit)],
    );
    return res.rows;
  } catch (error) {
    if (error?.code === '42P01') return [];
    throw error;
  } finally {
    client.release();
  }
}

async function finishQueuedCleanup(pool, objectPath, error = null) {
  const client = await pool.connect();
  try {
    if (!error) {
      await client.query(
        `UPDATE public.messenger_media_cleanup_queue
            SET status = 'completed', completed_at = NOW(), claimed_at = NULL,
                last_error_code = NULL, updated_at = NOW()
          WHERE object_path = $1 AND status = 'processing'`,
        [objectPath],
      );
      return;
    }
    await client.query(
      `UPDATE public.messenger_media_cleanup_queue
          SET status = 'retry', attempts = attempts + 1, claimed_at = NULL,
              available_at = NOW() + LEAST(INTERVAL '24 hours',
                INTERVAL '5 minutes' * POWER(2, LEAST(attempts, 8))),
              last_error_code = $2, updated_at = NOW()
        WHERE object_path = $1 AND status = 'processing'`,
      [objectPath, String(error?.name || 'storage_error').slice(0, 80)],
    );
  } finally {
    client.release();
  }
}

async function deleteObject(key) {
  await getS3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

async function processQueuedCleanup(pool, limit, dryRun) {
  if (dryRun) {
    const client = await pool.connect();
    try {
      const res = await client.query(
        `SELECT COUNT(*)::int AS count
           FROM public.messenger_media_cleanup_queue
          WHERE status IN ('pending', 'retry') AND available_at <= NOW()`,
      );
      return { claimed: Math.min(Number(res.rows[0]?.count || 0), limit), deleted: 0, failed: 0 };
    } catch (error) {
      if (error?.code === '42P01') return { claimed: 0, deleted: 0, failed: 0 };
      throw error;
    } finally {
      client.release();
    }
  }
  const claimed = await claimQueuedCleanup(pool, limit);
  let deleted = 0;
  let failed = 0;
  for (const item of claimed) {
    try {
      if (await isObjectPathReferenced(pool, item.object_path)) {
        await finishQueuedCleanup(pool, item.object_path);
        console.log('[cleanup] media_cleanup_noop', { object_id: diagnosticId(item.object_path), reason: 'referenced' });
        continue;
      }
      await deleteObject(item.object_path);
      await finishQueuedCleanup(pool, item.object_path);
      deleted += 1;
      console.log('[cleanup] media_cleanup_completed', { object_id: diagnosticId(item.object_path) });
    } catch (error) {
      await finishQueuedCleanup(pool, item.object_path, error);
      failed += 1;
      console.warn('[cleanup] media_cleanup_failed', {
        object_id: diagnosticId(item.object_path), code: error?.name || 'storage_error',
      });
    }
  }
  return { claimed: claimed.length, deleted, failed };
}

function findAbandonedMessengerObjects(objects, referencedPaths, now = Date.now()) {
  const cutoff = now - SOFT_GRACE_DAYS * 24 * 60 * 60 * 1000;
  return objects.filter((object) => {
    if (!isMessengerObjectPath(object.key) || referencedPaths.has(object.key)) return false;
    const modifiedAt = object.lastModified ? new Date(object.lastModified).getTime() : now;
    return Number.isFinite(modifiedAt) && modifiedAt <= cutoff;
  });
}

function publicRunSummary(runData, durationMs) {
  return {
    status: runData.status,
    scannedPrefixes: runData.scannedPrefixes,
    orphanCandidates: runData.orphanCandidates.length,
    eligibleForDelete: runData.eligibleForDelete.length,
    queuedCleanupClaimed: runData.queuedCleanupClaimed,
    abandonedCandidates: runData.abandonedCandidates,
    deletedCount: runData.deletedCount,
    dryRun: runData.dryRun,
    errors: runData.errors.length,
    hardCapHit: runData.hardCapHit,
    durationMs,
  };
}

async function recordRun(pool, runData) {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO photo_cleanup_log
         (run_at, status, scanned_prefixes, orphan_candidates_count, deleted_count, dry_run, details)
       VALUES (NOW(), $1::text, $2::int, $3::int, $4::int, $5::boolean, $6::jsonb)`,
      [
        runData.status,
        runData.scannedPrefixes,
        runData.orphanCandidates.length,
        runData.deletedCount,
        runData.dryRun,
        JSON.stringify({
          orphan_candidate_ids: runData.orphanCandidates.map(diagnosticId),
          eligible_for_delete_count: runData.eligibleForDelete.length,
          queued_cleanup_claimed: runData.queuedCleanupClaimed,
          abandoned_candidates: runData.abandonedCandidates,
          errors: runData.errors.slice(0, 10),
          hard_cap_hit: runData.hardCapHit,
        }),
      ],
    );
    if (runData.status === 'ok') {
      await client.query(
        `INSERT INTO public.maintenance_heartbeat (task, last_ok_at, stale_alerted_at, max_silence)
         VALUES ('cron_photo_cleanup', now(), NULL, interval '8 days')
         ON CONFLICT (task) DO UPDATE
           SET last_ok_at = now(), stale_alerted_at = NULL, max_silence = EXCLUDED.max_silence`,
      );
    }
  } finally {
    client.release();
  }
}

module.exports.handler = async function (_event, _context) {
  await initSecrets();

  const startTime = Date.now();
  const runData = {
    status: 'ok',
    scannedPrefixes: 0,
    orphanCandidates: [],
    eligibleForDelete: [],
    queuedCleanupClaimed: 0,
    abandonedCandidates: 0,
    deletedCount: 0,
    dryRun: DRY_RUN,
    errors: [],
    hardCapHit: false,
  };

  try {
    const pool = getPool();

    // 1. Drain durable cleanup rows created atomically with message deletion.
    const queued = await processQueuedCleanup(pool, HARD_CAP_PER_RUN, DRY_RUN);
    runData.queuedCleanupClaimed = queued.claimed;
    runData.deletedCount += queued.deleted;
    if (queued.failed) runData.errors.push({ stage: 'cleanup_queue', count: queued.failed });
    let remainingCap = Math.max(0, HARD_CAP_PER_RUN - (DRY_RUN ? queued.claimed : queued.deleted));

    // 2. Existing client-deletion cleanup remains, but shares one object cap.
    console.log('[cleanup] Listing client prefixes');
    const prefixes = await listClientPrefixes();
    runData.scannedPrefixes = prefixes.length;
    console.log(`[cleanup] Found ${prefixes.length} client-prefixes`);

    // 3. Check каждый в clients table → выявить orphans
    const existing = await checkClientsExist(pool, prefixes);
    const currentOrphans = prefixes.filter((p) => !existing.has(p));
    runData.orphanCandidates = currentOrphans;
    console.log(`[cleanup] Orphan candidates this run: ${currentOrphans.length}`);

    // 4. Soft-grace: только удаляем orphans, которые были orphan'ами 7 дней назад
    const previousOrphans = await getPreviousOrphans(pool);
    runData.eligibleForDelete = currentOrphans.filter((p) => previousOrphans.has(diagnosticId(p)));
    console.log(
      `[cleanup] Eligible for delete (orphan ≥${SOFT_GRACE_DAYS} days): ${runData.eligibleForDelete.length}`,
    );

    // 5. Hard cap is per object across queue, orphan clients and abandoned media.
    const toDelete = runData.eligibleForDelete;
    if (runData.eligibleForDelete.length > remainingCap) {
      runData.hardCapHit = true;
      console.warn('[cleanup] HARD CAP reached');
    }

    // 6. Delete orphan-client objects (или dry-run logging).
    if (DRY_RUN) {
      console.log(`[cleanup] DRY_RUN — ${toDelete.length} orphan client prefix(es) eligible`);
    } else {
      for (const prefix of toDelete) {
        if (remainingCap <= 0) break;
        try {
          const deleted = await deletePrefix(prefix, remainingCap);
          runData.deletedCount += deleted;
          remainingCap -= deleted;
          console.log('[cleanup] Deleted orphan-client objects', {
            client_ref: diagnosticId(prefix), count: deleted,
          });
        } catch (e) {
          runData.errors.push({ stage: 'orphan_client', ref: diagnosticId(prefix), code: e?.name || 'storage_error' });
          console.warn('[cleanup] Orphan-client delete failed', { client_ref: diagnosticId(prefix) });
        }
      }
    }

    // 7. Active clients: delete only old, unreferenced messenger namespace objects.
    const allObjects = await listAllObjects();
    const referencedPaths = await getReferencedMessengerPaths(pool);
    const abandoned = findAbandonedMessengerObjects(allObjects, referencedPaths);
    runData.abandonedCandidates = abandoned.length;
    const abandonedToDelete = abandoned.slice(0, remainingCap);
    if (abandoned.length > remainingCap) runData.hardCapHit = true;
    if (!DRY_RUN) {
      for (const object of abandonedToDelete) {
        try {
          await deleteObject(object.key);
          runData.deletedCount += 1;
          remainingCap -= 1;
          console.log('[cleanup] media_cleanup_completed', { object_id: diagnosticId(object.key) });
        } catch (error) {
          runData.errors.push({ stage: 'abandoned_media', object_id: diagnosticId(object.key), code: error?.name || 'storage_error' });
          console.warn('[cleanup] media_cleanup_failed', { object_id: diagnosticId(object.key) });
        }
      }
    }

    // 8. Telegram alert содержит только агрегаты.
    if (runData.deletedCount > 0 || (DRY_RUN && (toDelete.length > 0 || queued.claimed > 0 || abandoned.length > 0))) {
      const action = DRY_RUN ? 'DRY-RUN: would delete' : 'Deleted';
      await sendTelegram(
        `📸 *Photo cleanup* (${BUCKET})\n\n` +
          `Scanned prefixes: ${runData.scannedPrefixes}\n` +
          `Orphan candidates: ${runData.orphanCandidates.length}\n` +
          `Eligible (≥${SOFT_GRACE_DAYS}d): ${runData.eligibleForDelete.length}\n` +
          `Queued messenger cleanup: ${queued.claimed}\n` +
          `Abandoned messenger media: ${abandoned.length}\n` +
          `${action}: ${DRY_RUN ? queued.claimed + abandonedToDelete.length : runData.deletedCount}\n` +
          (runData.hardCapHit ? `⚠️ HARD CAP hit (${HARD_CAP_PER_RUN})\n` : '') +
          (runData.errors.length ? `Errors: ${runData.errors.length}\n` : ''),
      );
    }

    await recordRun(pool, runData);
    return {
      statusCode: 200,
      body: JSON.stringify(publicRunSummary(runData, Date.now() - startTime)),
    };
  } catch (err) {
    console.error('[cleanup] FATAL', { code: err?.code || err?.name || 'unhandled' });
    runData.status = 'failed';
    runData.errors.push({ stage: 'fatal', code: err?.code || err?.name || 'unhandled' });
    try {
      await recordRun(getPool(), runData);
    } catch (_) {}
    return { statusCode: 500, body: JSON.stringify({ error: 'internal_error' }) };
  }
};

module.exports._test = {
  diagnosticId,
  isMessengerObjectPath,
  findAbandonedMessengerObjects,
  publicRunSummary,
  SOFT_GRACE_DAYS,
};
