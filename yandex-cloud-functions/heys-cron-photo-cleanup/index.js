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

const { initSecrets } = require('./secrets');

const FOLDER_ID = 'b1gnv1a4q8i6de6atl6n';
const BUCKET = process.env.S3_PHOTOS_BUCKET || 'heys-photos';
const DRY_RUN = process.env.DRY_RUN !== '0'; // По умолчанию DRY-RUN. Чтобы реально удалять — DRY_RUN=0.
const HARD_CAP_PER_RUN = parseInt(process.env.HARD_CAP_PER_RUN || '100', 10);
const SOFT_GRACE_DAYS = 7;

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
      console.warn('[cleanup] cert read failed, ssl=verify-ca:', e.message);
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
      console.warn('[cleanup] Telegram err:', e.message);
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
async function deletePrefix(prefix) {
  const s3 = getS3();
  const keys = await listObjectsUnderPrefix(prefix);
  let deleted = 0;
  for (const key of keys) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
      deleted++;
    } catch (e) {
      console.warn(`[cleanup] delete failed key=${key}:`, e.message);
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
      `SELECT details->>'orphan_candidates' AS candidates
         FROM photo_cleanup_log
        WHERE run_at > NOW() - INTERVAL '${SOFT_GRACE_DAYS + 1} days'
          AND run_at < NOW() - INTERVAL '${SOFT_GRACE_DAYS - 1} days'
        ORDER BY run_at DESC
        LIMIT 1`,
    );
    if (!res.rows.length) return new Set();
    try {
      const arr = JSON.parse(res.rows[0].candidates || '[]');
      return new Set(arr);
    } catch (_) {
      return new Set();
    }
  } finally {
    client.release();
  }
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
          orphan_candidates: runData.orphanCandidates,
          eligible_for_delete: runData.eligibleForDelete,
          errors: runData.errors.slice(0, 10),
          hard_cap_hit: runData.hardCapHit,
        }),
      ],
    );
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
    deletedCount: 0,
    dryRun: DRY_RUN,
    errors: [],
    hardCapHit: false,
  };

  try {
    const pool = getPool();

    // 1. List все prefix'ы в bucket (= client_id UUIDs)
    console.log(`[cleanup] Listing prefixes in s3://${BUCKET}/`);
    const prefixes = await listClientPrefixes();
    runData.scannedPrefixes = prefixes.length;
    console.log(`[cleanup] Found ${prefixes.length} client-prefixes`);

    if (prefixes.length === 0) {
      runData.status = 'ok';
      await recordRun(pool, runData);
      return { statusCode: 200, body: JSON.stringify({ ...runData, durationMs: Date.now() - startTime }) };
    }

    // 2. Check каждый в clients table → выявить orphans
    const existing = await checkClientsExist(pool, prefixes);
    const currentOrphans = prefixes.filter((p) => !existing.has(p));
    runData.orphanCandidates = currentOrphans;
    console.log(`[cleanup] Orphan candidates this run: ${currentOrphans.length}`);

    // 3. Soft-grace: только удаляем orphans, которые были orphan'ами 7 дней назад
    const previousOrphans = await getPreviousOrphans(pool);
    runData.eligibleForDelete = currentOrphans.filter((p) => previousOrphans.has(p));
    console.log(
      `[cleanup] Eligible for delete (orphan ≥${SOFT_GRACE_DAYS} days): ${runData.eligibleForDelete.length}`,
    );

    // 4. Hard cap
    const toDelete = runData.eligibleForDelete.slice(0, HARD_CAP_PER_RUN);
    if (runData.eligibleForDelete.length > HARD_CAP_PER_RUN) {
      runData.hardCapHit = true;
      console.warn(`[cleanup] HARD CAP hit: ${runData.eligibleForDelete.length} > ${HARD_CAP_PER_RUN}`);
    }

    // 5. Delete (или dry-run logging)
    if (DRY_RUN) {
      console.log(`[cleanup] DRY_RUN — would delete ${toDelete.length} prefix(es):`, toDelete);
    } else {
      for (const prefix of toDelete) {
        try {
          const deleted = await deletePrefix(prefix);
          runData.deletedCount += deleted;
          console.log(`[cleanup] Deleted ${deleted} object(s) under ${prefix}/`);
        } catch (e) {
          runData.errors.push({ prefix, error: e.message });
          console.warn(`[cleanup] Delete failed for ${prefix}:`, e.message);
        }
      }
    }

    // 6. Telegram alert если что-то удалено
    if (runData.deletedCount > 0 || (DRY_RUN && toDelete.length > 0)) {
      const action = DRY_RUN ? 'DRY-RUN: would delete' : 'Deleted';
      await sendTelegram(
        `📸 *Photo cleanup* (${BUCKET})\n\n` +
          `Scanned prefixes: ${runData.scannedPrefixes}\n` +
          `Orphan candidates: ${runData.orphanCandidates.length}\n` +
          `Eligible (≥${SOFT_GRACE_DAYS}d): ${runData.eligibleForDelete.length}\n` +
          `${action}: ${DRY_RUN ? toDelete.length : runData.deletedCount}\n` +
          (runData.hardCapHit ? `⚠️ HARD CAP hit (${HARD_CAP_PER_RUN})\n` : '') +
          (runData.errors.length ? `Errors: ${runData.errors.length}\n` : ''),
      );
    }

    await recordRun(pool, runData);
    return {
      statusCode: 200,
      body: JSON.stringify({ ...runData, durationMs: Date.now() - startTime }),
    };
  } catch (err) {
    console.error('[cleanup] FATAL:', err.message);
    runData.status = 'failed';
    runData.errors.push({ fatal: err.message });
    try {
      await recordRun(getPool(), runData);
    } catch (_) {}
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
