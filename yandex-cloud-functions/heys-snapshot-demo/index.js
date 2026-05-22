/**
 * HEYS Snapshot Demo Cloud Function
 *
 * Каждый час делает публичный snapshot двух демо-аккаунтов (мужской/женский)
 * для интерактивного demo на лендинге heyslab.ru. Кладёт два JSON-файла
 * в публичный S3 bucket. Demo HEYS на try.heyslab.ru забирает их через fetch
 * и кормит OverlayStore.applyCloudSnapshot() + localStorage.
 *
 * Trigger: Yandex Cloud Functions Timer Trigger
 *   cron: 0 * * * ? *  (каждый час, в 00 минут UTC)
 *
 * Environment variables:
 *   PG_HOST, PG_PORT, PG_DATABASE, PG_USER, PG_PASSWORD — PostgreSQL
 *   S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY              — Yandex Object Storage credentials
 *   S3_BUCKET                                            — public bucket (default: heys-public-snapshot)
 *   S3_ENDPOINT                                          — endpoint (default: https://storage.yandexcloud.net)
 *   DEMO_MALE_CLIENT_ID                                  — Poplanton client_id
 *   DEMO_FEMALE_CLIENT_ID                                — Alexandra client_id
 *   MALE_PSEUDONYM, FEMALE_PSEUDONYM                     — displayed names (default: Дмитрий / Мария)
 *   DAYS_TO_INCLUDE                                      — days back from today (default: 30)
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID                 — alerts on failure
 *
 * Whitelist (only these keys go into snapshot):
 *   - heys_products_overlay_v2  (denormalized: shared_origin_id → full nutrient row)
 *   - heys_dayv2_YYYY-MM-DD     (last N days)
 *   - heys_norms                (plain)
 *   - heys_deleted_ids          (tombstones)
 *
 * Synthesized (real value is encrypted in DB, we build a neutral one):
 *   - heys_profile              (gender-specific synthetic profile)
 */

'use strict';

const { readFileSync, existsSync } = require('fs');
const { initSecrets } = require('./secrets');
const { join } = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { Pool } = require('pg');

// ═══════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════

const CONFIG = {
  pg: {
    host: process.env.PG_HOST || 'rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net',
    port: parseInt(process.env.PG_PORT || '6432', 10),
    database: process.env.PG_DATABASE || 'heys_production',
    user: process.env.PG_USER || 'heys_admin',
    password: process.env.PG_PASSWORD,
  },
  s3: {
    endpoint: process.env.S3_ENDPOINT || 'https://storage.yandexcloud.net',
    region: 'ru-central1',
    bucket: process.env.S3_BUCKET || 'heys-public-snapshot',
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
  demoAccounts: [
    {
      gender: 'male',
      clientId: process.env.DEMO_MALE_CLIENT_ID || 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a',
      pseudonym: process.env.MALE_PSEUDONYM || 'Дмитрий',
      profile: {
        name: process.env.MALE_PSEUDONYM || 'Дмитрий',
        gender: 'male',
        age: 35,
        height: 180,
        weight: 80,
        activity: 1.4,
      },
    },
    {
      gender: 'female',
      clientId: process.env.DEMO_FEMALE_CLIENT_ID || '4545ee50-4f5f-4fc0-b862-7ca45fa1bafc',
      pseudonym: process.env.FEMALE_PSEUDONYM || 'Мария',
      profile: {
        name: process.env.FEMALE_PSEUDONYM || 'Мария',
        gender: 'female',
        age: 30,
        height: 165,
        weight: 60,
        activity: 1.4,
      },
    },
  ],
  daysToInclude: parseInt(process.env.DAYS_TO_INCLUDE || '30', 10),
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  },
};

// ═══════════════════════════════════════════════════════════════════
// PostgreSQL pool (singleton)
// ═══════════════════════════════════════════════════════════════════

function loadCACert() {
  const paths = [
    join(__dirname, '..', 'certs', 'root.crt'),
    join(__dirname, 'certs', 'root.crt'),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      try { return readFileSync(p, 'utf8'); } catch { /* skip */ }
    }
  }
  return null;
}

let pool = null;

function getPool() {
  if (pool) return pool;
  const ca = loadCACert();
  pool = new Pool({
    host: CONFIG.pg.host,
    port: CONFIG.pg.port,
    database: CONFIG.pg.database,
    user: CONFIG.pg.user,
    password: CONFIG.pg.password,
    ssl: ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true },
    max: 2,
    idleTimeoutMillis: 15000,
    connectionTimeoutMillis: 10000,
    query_timeout: 90000,
    statement_timeout: 90000,
    allowExitOnIdle: true,
  });
  pool.on('error', (err) => {
    console.error('[SnapshotDemo:Pool] idle error:', err.message);
  });
  return pool;
}

// ═══════════════════════════════════════════════════════════════════
// S3 client (singleton)
// ═══════════════════════════════════════════════════════════════════

let s3 = null;

function getS3() {
  if (s3) return s3;
  s3 = new S3Client({
    endpoint: CONFIG.s3.endpoint,
    region: CONFIG.s3.region,
    credentials: {
      accessKeyId: CONFIG.s3.accessKeyId,
      secretAccessKey: CONFIG.s3.secretAccessKey,
    },
  });
  return s3;
}

// ═══════════════════════════════════════════════════════════════════
// Telegram alerts
// ═══════════════════════════════════════════════════════════════════

async function sendAlert(message, isError = true) {
  const { botToken, chatId } = CONFIG.telegram;
  if (!botToken || !chatId) return;
  const emoji = isError ? '🚨' : '✅';
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `${emoji} *HEYS Demo Snapshot*\n\n${message}`,
        parse_mode: 'Markdown',
      }),
    });
  } catch (err) {
    console.error('[SnapshotDemo:TG] error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Snapshot builder
// ═══════════════════════════════════════════════════════════════════

/**
 * Pull plain (non-encrypted) whitelist keys + last N day-keys for a client.
 * Returns a map { k → parsed JSON value }.
 */
async function fetchPlainKvKeys(dbClient, clientId, daysToInclude) {
  // Last N day-keys are computed by ISO date from today (UTC); HEYS uses date-string keys
  // so we filter by k LIKE 'heys_dayv2_YYYY-MM-DD' and sort DESC.
  const { rows } = await dbClient.query(
    `SELECT k, v
       FROM client_kv_store
      WHERE client_id = $1
        AND v_encrypted IS NULL
        AND (
          k IN ('heys_norms', 'heys_deleted_ids', 'heys_hr_zones', 'heys_ratio_zones',
                'heys_planning_projects', 'heys_planning_tasks', 'heys_planning_slots', 'heys_planning_links_v1')
          OR (k LIKE 'heys_dayv2_____-__-__' AND k > 'heys_dayv2_' || (CURRENT_DATE - $2::int)::text)
        )
      ORDER BY k`,
    [clientId, daysToInclude],
  );
  const out = {};
  for (const row of rows) out[row.k] = row.v;
  return out;
}

/**
 * Pull denormalized products overlay: for each row that has shared_origin_id
 * without full nutrient fields, replace it with the full row from shared_products.
 * Keeps client's local Type-B rows as-is.
 */
async function fetchDenormalizedProducts(dbClient, clientId) {
  const { rows } = await dbClient.query(
    `WITH overlay AS (
        SELECT jsonb_array_elements(v) AS row
          FROM client_kv_store
         WHERE k = 'heys_products_overlay_v2' AND client_id = $1
     )
     SELECT COALESCE(
       jsonb_agg(
         CASE
           WHEN (o.row->>'shared_origin_id') IS NOT NULL
                AND NOT (o.row ? 'kcal100' AND o.row ? 'protein100')
                AND sp.id IS NOT NULL
           THEN
             -- Replace stub with full nutrient data from shared_products,
             -- strip creator-identifying fields, keep client-side flags
             (to_jsonb(sp)
              - 'created_by_user_id' - 'created_by_client_id'
              - 'updated_at' - 'created_at')
             || jsonb_build_object(
                  'id', o.row->>'id',
                  'in_my_list', COALESCE((o.row->>'in_my_list')::boolean, true),
                  '_custom', true
                )
           ELSE
             o.row - 'shared_origin_id'
         END
       ),
       '[]'::jsonb
     ) AS products
       FROM overlay o
  LEFT JOIN shared_products sp
         ON sp.id = (o.row->>'shared_origin_id')::uuid`,
    [clientId],
  );
  return rows[0]?.products ?? [];
}

/**
 * Build the full snapshot payload for a single demo account.
 */
async function buildAccountSnapshot(account) {
  const pool = getPool();
  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    const lsKeys = await fetchPlainKvKeys(dbClient, account.clientId, CONFIG.daysToInclude);
    const products = await fetchDenormalizedProducts(dbClient, account.clientId);
    await dbClient.query('COMMIT');

    // Synthetic profile — real one is encrypted; we use neutral demo values
    lsKeys.heys_profile = account.profile;

    return {
      schemaVersion: 1,
      gender: account.gender,
      pseudonym: account.pseudonym,
      generatedAt: new Date().toISOString(),
      daysIncluded: CONFIG.daysToInclude,
      lsKeys,
      products,
    };
  } catch (err) {
    try { await dbClient.query('ROLLBACK'); } catch { /* noop */ }
    throw err;
  } finally {
    dbClient.release();
  }
}

/**
 * Upload snapshot JSON to S3 with public-read ACL and short cache.
 */
async function uploadSnapshot(gender, snapshot) {
  const body = JSON.stringify(snapshot);
  const cmd = new PutObjectCommand({
    Bucket: CONFIG.s3.bucket,
    Key: `snapshot-${gender}.json`,
    Body: body,
    ContentType: 'application/json; charset=utf-8',
    CacheControl: 'public, max-age=300, must-revalidate',
    ACL: 'public-read',
  });
  await getS3().send(cmd);
  return body.length;
}

// ═══════════════════════════════════════════════════════════════════
// Handler
// ═══════════════════════════════════════════════════════════════════

// Export internals for tests
exports._internal = { buildAccountSnapshot, fetchPlainKvKeys, fetchDenormalizedProducts, CONFIG };

exports.handler = async () => {
  await initSecrets();
  const startTime = Date.now();
  const results = { success: [], failed: [] };

  for (const account of CONFIG.demoAccounts) {
    try {
      const snapshot = await buildAccountSnapshot(account);
      const sizeBytes = await uploadSnapshot(account.gender, snapshot);
      results.success.push({
        gender: account.gender,
        keyCount: Object.keys(snapshot.lsKeys).length,
        productCount: snapshot.products.length,
        sizeKB: Math.round(sizeBytes / 1024),
      });
      console.log(
        `[SnapshotDemo] ${account.gender}: ${Object.keys(snapshot.lsKeys).length} keys, ` +
        `${snapshot.products.length} products, ${Math.round(sizeBytes / 1024)} KB`,
      );
    } catch (err) {
      console.error(`[SnapshotDemo] ${account.gender}: FAILED —`, err.message);
      results.failed.push({ gender: account.gender, error: err.message.slice(0, 200) });
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  const summary = {
    success: results.failed.length === 0,
    successCount: results.success.length,
    failedCount: results.failed.length,
    details: results,
    durationSec,
    timestamp: new Date().toISOString(),
  };

  console.log('[SnapshotDemo] Done:', JSON.stringify(summary));

  if (results.failed.length > 0) {
    await sendAlert(
      `Snapshot failed for: ${results.failed.map((f) => f.gender).join(', ')}\n` +
      `Errors: ${results.failed.map((f) => f.error).join('; ').slice(0, 300)}\n` +
      `Duration: ${durationSec}s`,
    );
  }

  return { statusCode: 200, body: JSON.stringify(summary) };
};
