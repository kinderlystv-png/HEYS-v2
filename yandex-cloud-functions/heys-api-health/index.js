/**
 * HEYS Health Check — Yandex Cloud Function
 * Проверка работоспособности API + DB ping (SELECT 1)
 * Также обрабатывает stub для /auth/v1/user (Supabase SDK совместимость)
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Singleton pool для health checks (lightweight)
let healthPool = null;

function getHealthPool() {
  if (!healthPool) {
    // CA cert
    let ca = null;
    const certPath = path.join(__dirname, 'certs', 'root.crt');
    if (fs.existsSync(certPath)) {
      ca = fs.readFileSync(certPath, 'utf8');
    }

    healthPool = new Pool({
      host: process.env.PG_HOST || 'rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net',
      port: parseInt(process.env.PG_PORT || '6432'),
      database: process.env.PG_DATABASE || 'heys_production',
      user: process.env.PG_USER || 'heys_admin',
      password: process.env.PG_PASSWORD,
      ssl: ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: false },
      max: 1,
      idleTimeoutMillis: 3000,
      connectionTimeoutMillis: 5000,
      keepAlive: true,
      allowExitOnIdle: true
    });

    healthPool.on('error', (err) => {
      console.error('[Health] ❌ Pool error:', err.message);
      healthPool.end().catch(() => { });
      healthPool = null;
    });
  }
  return healthPool;
}

/**
 * Проверка БД через SELECT 1
 * @returns {{ ok: boolean, latencyMs: number, error?: string }}
 */
async function checkDatabase() {
  const start = Date.now();
  try {
    const pool = getHealthPool();
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      return { ok: true, latencyMs: Date.now() - start };
    } finally {
      client.release();
    }
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: err.message };
  }
}

// CORS headers
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization, x-client-info, prefer, x-supabase-api-version',
  'Access-Control-Max-Age': '86400'
};

module.exports.handler = async function (event, context) {
  const urlPath = event.path || event.url || '';
  const method = (event.httpMethod || event.method || 'GET').toUpperCase();

  // CORS preflight
  if (method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: ''
    };
  }

  // Stub для /auth/v1/user — Supabase SDK совместимость
  if (urlPath.includes('/auth/v1/user')) {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS
      },
      body: JSON.stringify({ data: { user: null }, error: null })
    };
  }

  // Health check с DB ping
  const db = await checkDatabase();
  const overallStatus = db.ok ? 'ok' : 'degraded';

  return {
    statusCode: db.ok ? 200 : 503,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS
    },
    body: JSON.stringify({
      status: overallStatus,
      service: 'HEYS API',
      region: 'ru-central1',
      timestamp: new Date().toISOString(),
      checks: {
        database: {
          status: db.ok ? 'ok' : 'error',
          latencyMs: db.latencyMs,
          ...(db.error && { error: db.error })
        }
      }
    })
  };
};
