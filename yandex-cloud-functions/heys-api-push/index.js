/**
 * heys-api-push — Web Push API
 *
 * Endpoints (mapped via API Gateway):
 *   GET    /push/vapid-key      — публичный VAPID public key (для subscribe на фронте)
 *   POST   /push/subscribe      — body: { endpoint, keys: {p256dh, auth} }
 *   POST   /push/unsubscribe    — body: { endpoint }
 *   POST   /push/prefs          — body: { prefs: {...} } (только клиент, сохраняется в kv_store)
 *   POST   /push/test           — отправить тестовый пуш на все подписки текущего юзера
 *
 * Auth:
 *   Клиент: Authorization: Bearer <session_token> (валидируем по client_sessions.token_hash).
 *   Курятор: Authorization: Bearer <jwt> или HttpOnly cookie heys_curator_jwt.
 *   В одном эндпоинте — оба пути; решаем по форме токена.
 */

const { getPool } = require('./shared/db-pool');
const { initSecrets } = require('./shared/secrets');
const webpush = require('web-push');
const crypto = require('crypto');

// ── VAPID config: лениво, после initSecrets() — иначе на cold start читаем
// плейсхолдер `__IN_LOCKBOX__heys-app-secrets__` из env и setVapidDetails ломается.
let vapidConfigured = false;
function ensureVapid() {
  if (vapidConfigured) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:noreply@heyslab.ru';
  if (pub && priv && !pub.startsWith('__IN_LOCKBOX__') && !priv.startsWith('__IN_LOCKBOX__')) {
    webpush.setVapidDetails(subject, pub, priv);
    vapidConfigured = true;
  } else {
    console.error('[push] FATAL: VAPID keys not configured (lockbox load failed?)');
  }
}

// ── CORS ─────────────────────────────────────────────────────────────────
const ALLOW_LOCALHOST = process.env.ALLOW_LOCALHOST_ORIGINS === '1';
const ALLOWED_ORIGINS = new Set([
  'https://heyslab.ru',
  'https://www.heyslab.ru',
  'https://app.heyslab.ru',
  'https://heys-static.website.yandexcloud.net',
  ...(ALLOW_LOCALHOST ? [
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:3003',
    'http://127.0.0.1:3003',
  ] : []),
]);

function corsHeaders(origin) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://app.heyslab.ru';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
  };
}

// ── JWT verify (HS256, тот же формат что в heys-api-auth) ───────────────
function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString();
}

function verifyJwt(token, secret) {
  try {
    const [headerB64, payloadB64, signature] = token.split('.');
    if (!headerB64 || !payloadB64 || !signature) return { valid: false };
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    if (signature !== expectedSig) return { valid: false };
    const payload = JSON.parse(base64UrlDecode(payloadB64));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return { valid: false };
    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
}

// ── Cookie helpers: heys_session_token / heys_curator_jwt (HttpOnly) ─────
// PR-C (2026-05-20): session token PIN-клиентов лежит в HttpOnly cookie,
// curator JWT тоже может быть HttpOnly; JS их не видит, нужно читать на сервере.
function parseCookieToken(cookieHeader, cookieName) {
  if (!cookieHeader || typeof cookieHeader !== 'string') return null;
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const name = part.slice(0, eqIdx).trim();
    if (name === cookieName) {
      const raw = part.slice(eqIdx + 1).trim();
      try { return decodeURIComponent(raw); } catch { return raw; }
    }
  }
  return null;
}

function parseSessionCookie(cookieHeader) {
  return parseCookieToken(cookieHeader, 'heys_session_token');
}

function parseCuratorCookie(cookieHeader) {
  return parseCookieToken(cookieHeader, 'heys_curator_jwt');
}

// ── Identity resolution ─────────────────────────────────────────────────
// Источники token'а (в порядке предпочтения):
//   1. Authorization: Bearer <jwt>  — курaтор
//   2. Authorization: Bearer <session_token>  — клиент (legacy LS-session)
//   3. Cookie: heys_session_token=<…>  — клиент (новый PR-C cookie-flow)
//   4. Cookie: heys_curator_jwt=<…>  — куратор (HttpOnly curator-flow)
async function resolveIdentity(authHeader, cookieHeader) {
  const bearer = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';
  const cookieCuratorJwt = parseCuratorCookie(cookieHeader);
  const cookieSession = parseSessionCookie(cookieHeader);
  const bearerLooksLikeJwt = bearer.split('.').length === 3 && bearer.includes('.');
  const curatorJwt = (bearerLooksLikeJwt ? bearer : '') || cookieCuratorJwt;

  // JWT → курaтор
  if (curatorJwt) {
    const looksLikeJwt = curatorJwt.split('.').length === 3 && curatorJwt.includes('.');
    if (looksLikeJwt && process.env.JWT_SECRET) {
      const res = verifyJwt(curatorJwt, process.env.JWT_SECRET);
      if (res.valid && res.payload?.role === 'curator' && res.payload?.sub) {
        return { kind: 'curator', id: res.payload.sub };
      }
    }
  }

  // Иначе — session token (из Bearer или cookie)
  const sessionToken = bearer || cookieSession;
  if (!sessionToken) return { error: 'missing_auth' };

  const pool = getPool();
  const client = await pool.connect();
  try {
    const r = await client.query(
      `SELECT client_id FROM client_sessions
       WHERE token_hash = digest($1, 'sha256')
         AND expires_at > NOW()
         AND revoked_at IS NULL
       LIMIT 1`,
      [sessionToken]
    );
    if (r.rows[0]?.client_id) {
      return { kind: 'client', id: r.rows[0].client_id };
    }
    return { error: 'invalid_session' };
  } finally {
    client.release();
  }
}

// ── Endpoint handlers ───────────────────────────────────────────────────

async function handleVapidKey() {
  return { statusCode: 200, body: { publicKey: process.env.VAPID_PUBLIC_KEY || '' } };
}

async function handleSubscribe(identity, body, userAgent) {
  const { endpoint, keys } = body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return { statusCode: 400, body: { error: 'missing_subscription_fields' } };
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    if (identity.kind === 'client') {
      await client.query(
        `INSERT INTO push_subscriptions (client_id, endpoint, p256dh, auth, user_agent, created_at, last_used_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (client_id, endpoint) DO UPDATE SET
           p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth,
           user_agent = EXCLUDED.user_agent,
           last_used_at = NOW()`,
        [identity.id, endpoint, keys.p256dh, keys.auth, userAgent || null]
      );
    } else {
      await client.query(
        `INSERT INTO curator_push_subscriptions (curator_id, endpoint, p256dh, auth, user_agent, created_at, last_used_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (curator_id, endpoint) DO UPDATE SET
           p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth,
           user_agent = EXCLUDED.user_agent,
           last_used_at = NOW()`,
        [identity.id, endpoint, keys.p256dh, keys.auth, userAgent || null]
      );
    }
    return { statusCode: 200, body: { success: true } };
  } finally {
    client.release();
  }
}

async function handleUnsubscribe(identity, body) {
  const { endpoint } = body || {};
  if (!endpoint) return { statusCode: 400, body: { error: 'missing_endpoint' } };

  const pool = getPool();
  const client = await pool.connect();
  try {
    if (identity.kind === 'client') {
      await client.query(
        `DELETE FROM push_subscriptions WHERE client_id = $1 AND endpoint = $2`,
        [identity.id, endpoint]
      );
    } else {
      await client.query(
        `DELETE FROM curator_push_subscriptions WHERE curator_id = $1 AND endpoint = $2`,
        [identity.id, endpoint]
      );
    }
    return { statusCode: 200, body: { success: true } };
  } finally {
    client.release();
  }
}

// Дефолтные prefs клиента (для merge при сохранении частичных настроек).
const DEFAULT_CLIENT_PREFS = {
  enabled: true,
  quiet_start: '23:00',
  quiet_end: '09:00',
  meal_reminder_enabled: true,
  meal_reminder_gap_hours: 4,
  evening_summary_enabled: true,
  evening_summary_time: '21:00',
  streak_celebration_enabled: true,
  hunger_follow_up_enabled: true,
};

const DEFAULT_CURATOR_PREFS = {
  enabled: true,
  quiet_start: '22:00',
  quiet_end: '08:00',
  inactive_client_enabled: true,
};

async function handlePrefs(identity, body) {
  const incoming = body?.prefs || {};
  const pool = getPool();
  const client = await pool.connect();
  try {
    if (identity.kind === 'client') {
      // Читаем текущие prefs.
      const r = await client.query(
        `SELECT v FROM client_kv_store WHERE client_id = $1 AND k = 'heys_push_prefs' LIMIT 1`,
        [identity.id]
      );
      const current = r.rows[0]?.v || {};
      const merged = { ...DEFAULT_CLIENT_PREFS, ...current, ...incoming };
      await client.query(
        `INSERT INTO client_kv_store (client_id, k, v, updated_at)
         VALUES ($1, 'heys_push_prefs', $2, NOW())
         ON CONFLICT (client_id, k) DO UPDATE SET v = EXCLUDED.v, updated_at = NOW()`,
        [identity.id, JSON.stringify(merged)]
      );
      return { statusCode: 200, body: { success: true, prefs: merged } };
    }

    // Курятор — пока кладём prefs в curator_push_subscriptions как UPDATE,
    // но это per-device. Чище — отдельная таблица curators_prefs, но пока
    // ограничимся хранением одним JSONB-ключом в первой записи подписки.
    // На MVP кладём в новую таблицу curator_prefs (создаём lazily через UPSERT).
    await client.query(
      `CREATE TABLE IF NOT EXISTS curator_prefs (
         curator_id UUID PRIMARY KEY,
         v JSONB NOT NULL DEFAULT '{}'::jsonb,
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`
    );
    const r = await client.query(
      `SELECT v FROM curator_prefs WHERE curator_id = $1 LIMIT 1`,
      [identity.id]
    );
    const current = r.rows[0]?.v || {};
    const merged = { ...DEFAULT_CURATOR_PREFS, ...current, ...incoming };
    await client.query(
      `INSERT INTO curator_prefs (curator_id, v, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (curator_id) DO UPDATE SET v = EXCLUDED.v, updated_at = NOW()`,
      [identity.id, JSON.stringify(merged)]
    );
    return { statusCode: 200, body: { success: true, prefs: merged } };
  } finally {
    client.release();
  }
}

async function handleTest(identity) {
  const pool = getPool();
  const client = await pool.connect();
  let subs = [];
  try {
    if (identity.kind === 'client') {
      const r = await client.query(
        `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE client_id = $1`,
        [identity.id]
      );
      subs = r.rows;
    } else {
      const r = await client.query(
        `SELECT endpoint, p256dh, auth FROM curator_push_subscriptions WHERE curator_id = $1`,
        [identity.id]
      );
      subs = r.rows;
    }
  } finally {
    client.release();
  }

  if (subs.length === 0) {
    return { statusCode: 200, body: { success: false, error: 'no_subscriptions' } };
  }

  const payload = JSON.stringify({
    title: 'HEYS — тестовый пуш',
    body: 'Если ты это видишь — уведомления настроены правильно.',
    tag: 'test',
    url: '/',
  });

  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      )
    )
  );

  // Чистим dead endpoints (410 Gone).
  const deadEndpoints = results
    .map((r, i) => (r.status === 'rejected' && r.reason?.statusCode === 410 ? subs[i].endpoint : null))
    .filter(Boolean);
  if (deadEndpoints.length) {
    const c2 = await pool.connect();
    try {
      const table = identity.kind === 'client' ? 'push_subscriptions' : 'curator_push_subscriptions';
      const idCol = identity.kind === 'client' ? 'client_id' : 'curator_id';
      await c2.query(
        `DELETE FROM ${table} WHERE ${idCol} = $1 AND endpoint = ANY($2::text[])`,
        [identity.id, deadEndpoints]
      );
    } finally {
      c2.release();
    }
  }

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  return {
    statusCode: 200,
    body: {
      success: true,
      sent,
      total: subs.length,
      cleaned: deadEndpoints.length,
    },
  };
}

// ── Main handler ────────────────────────────────────────────────────────
module.exports.handler = async function (event) {
  await initSecrets();
  ensureVapid();
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const cors = corsHeaders(origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  const path = event.path || event.url || '';
  const pathParts = path.split('?')[0].split('/').filter(Boolean);
  // ['push', 'vapid-key' | 'subscribe' | 'unsubscribe' | 'prefs' | 'test']
  const action = pathParts[1] || '';

  // GET /push/vapid-key — публичный, без auth.
  if (action === 'vapid-key') {
    const res = await handleVapidKey();
    return { statusCode: res.statusCode, headers: cors, body: JSON.stringify(res.body) };
  }

  // Все остальные требуют auth.
  const identity = await resolveIdentity(
    event.headers?.Authorization || event.headers?.authorization,
    event.headers?.cookie || event.headers?.Cookie
  );
  if (identity.error) {
    return {
      statusCode: 401,
      headers: cors,
      body: JSON.stringify({ error: identity.error }),
    };
  }

  let body = {};
  try {
    if (event.body) {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    }
  } catch {
    return {
      statusCode: 400,
      headers: cors,
      body: JSON.stringify({ error: 'invalid_json' }),
    };
  }

  const userAgent = event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null;

  try {
    let res;
    switch (action) {
      case 'subscribe':
        res = await handleSubscribe(identity, body, userAgent);
        break;
      case 'unsubscribe':
        res = await handleUnsubscribe(identity, body);
        break;
      case 'prefs':
        res = await handlePrefs(identity, body);
        break;
      case 'test':
        res = await handleTest(identity);
        break;
      default:
        res = { statusCode: 404, body: { error: 'unknown_action', action } };
    }
    return { statusCode: res.statusCode, headers: cors, body: JSON.stringify(res.body) };
  } catch (err) {
    console.error('[push] handler error:', err.message, err.stack);
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: 'internal_error', message: err.message }),
    };
  }
};
