/**
 * heys-api-messages — HEYS Messenger API
 *
 * Endpoints (mapped via API Gateway):
 *   POST   /messages/send          — { body, intent_type?, intent_payload? }
 *                                     client → курятор: пишет в client_messages
 *                                     курятор → client: { client_id, body }
 *   GET    /messages/thread        — ?before=ts&limit=50 (client)
 *                                     ?client_id=X&before=ts&limit=50 (курятор)
 *   GET    /messages/inbox         — курятор-only: список клиентов с unread + preview
 *   POST   /messages/mark-read     — { up_to_ts } (client)
 *                                     { client_id, up_to_ts } (курятор)
 *
 * Phase 2 (TODO):
 *   POST   /messages/apply-intent  — курятор: { message_id } → применит intent в day record
 *
 * Auth (тот же паттерн что в heys-api-push):
 *   Клиент: Authorization: Bearer <session_token> (валидируется по client_sessions).
 *   Курятор: Authorization: Bearer <jwt> (HS256, role='curator').
 *
 * Rate limit:
 *   client → /send: 30 сообщений/минуту/client (in-memory counter, reset on cold start).
 */

const { getPool } = require('./shared/db-pool');
const { initSecrets } = require('./shared/secrets');
const webpush = require('web-push');
const crypto = require('crypto');

// ── VAPID config: лениво, после initSecrets() ────────────────────────────
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
    console.error('[messages] FATAL: VAPID keys not configured (lockbox load failed?)');
  }
}

// ── CORS (тот же allowlist что у heys-api-push) ──────────────────────────
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

// ── JWT verify (HS256) ───────────────────────────────────────────────────
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

// ── Identity resolution: { kind, id, sessionToken? } ─────────────────────
// Возвращает identity + sessionToken (нужен для RPC через session-auth).
async function resolveIdentity(authHeader) {
  if (!authHeader) return { error: 'missing_auth' };
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { error: 'missing_token' };

  const looksLikeJwt = token.split('.').length === 3 && token.includes('.');
  if (looksLikeJwt && process.env.JWT_SECRET) {
    const res = verifyJwt(token, process.env.JWT_SECRET);
    if (res.valid && res.payload?.role === 'curator' && res.payload?.sub) {
      return { kind: 'curator', id: res.payload.sub };
    }
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    const r = await client.query(
      `SELECT client_id FROM client_sessions
       WHERE token_hash = digest($1, 'sha256')
         AND expires_at > NOW()
         AND revoked_at IS NULL
       LIMIT 1`,
      [token]
    );
    if (r.rows[0]?.client_id) {
      return { kind: 'client', id: r.rows[0].client_id, sessionToken: token };
    }
    return { error: 'invalid_session' };
  } finally {
    client.release();
  }
}

// ── Rate limit (in-memory; reset on cold start) ──────────────────────────
// Защита от accidental flood: max 30 сообщений/минуту/client.
// Cold-start race (≤2 instances): documented behavior, MVP-accepted.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const rateMap = new Map(); // clientId → [{ts}, ...]

function rateLimitCheck(clientId) {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  let timestamps = rateMap.get(clientId) || [];
  timestamps = timestamps.filter((t) => t > cutoff);
  if (timestamps.length >= RATE_LIMIT_MAX) {
    return { allowed: false, retryAfter: Math.ceil((timestamps[0] + RATE_LIMIT_WINDOW_MS - now) / 1000) };
  }
  timestamps.push(now);
  rateMap.set(clientId, timestamps);
  return { allowed: true };
}

// ── Validation helpers ───────────────────────────────────────────────────
const VALID_INTENT_TYPES = new Set(['meal', 'training', 'weight']);

function validateIntent(intentType, intentPayload) {
  if (intentType === null || intentType === undefined) return { ok: true };
  if (!VALID_INTENT_TYPES.has(intentType)) {
    return { ok: false, error: 'invalid_intent_type' };
  }
  if (!intentPayload || typeof intentPayload !== 'object') {
    return { ok: false, error: 'intent_payload_required' };
  }
  if (intentType === 'meal') {
    const { product_id, product_name, grams } = intentPayload;
    if (typeof product_name !== 'string' || product_name.length < 1 || product_name.length > 120) {
      return { ok: false, error: 'invalid_product_name' };
    }
    if (typeof grams !== 'number' || grams < 1 || grams > 5000) {
      return { ok: false, error: 'invalid_grams' };
    }
    if (product_id !== undefined && product_id !== null && typeof product_id !== 'string') {
      return { ok: false, error: 'invalid_product_id' };
    }
  } else if (intentType === 'training') {
    const { training_type, duration_min } = intentPayload;
    if (typeof training_type !== 'string' || training_type.length < 1 || training_type.length > 80) {
      return { ok: false, error: 'invalid_training_type' };
    }
    if (typeof duration_min !== 'number' || duration_min < 1 || duration_min > 600) {
      return { ok: false, error: 'invalid_duration_min' };
    }
  } else if (intentType === 'weight') {
    const { weight_kg } = intentPayload;
    if (typeof weight_kg !== 'number' || weight_kg < 20 || weight_kg > 400) {
      return { ok: false, error: 'invalid_weight_kg' };
    }
  }
  return { ok: true };
}

// ── Push delivery (fan-out на все endpoints получателя) ──────────────────
async function sendPushToCurator(curatorId, payload) {
  const pool = getPool();
  const client = await pool.connect();
  let subs = [];
  try {
    const r = await client.query(
      `SELECT endpoint, p256dh, auth FROM curator_push_subscriptions WHERE curator_id = $1`,
      [curatorId]
    );
    subs = r.rows;
  } finally {
    client.release();
  }
  if (subs.length === 0) return { sent: 0, total: 0 };

  const payloadStr = JSON.stringify(payload);
  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payloadStr
      )
    )
  );

  const deadEndpoints = results
    .map((r, i) => (r.status === 'rejected' && r.reason?.statusCode === 410 ? subs[i].endpoint : null))
    .filter(Boolean);
  if (deadEndpoints.length) {
    const c2 = await pool.connect();
    try {
      await c2.query(
        `DELETE FROM curator_push_subscriptions WHERE curator_id = $1 AND endpoint = ANY($2::text[])`,
        [curatorId, deadEndpoints]
      );
    } finally {
      c2.release();
    }
  }

  return { sent: results.filter((r) => r.status === 'fulfilled').length, total: subs.length };
}

async function sendPushToClient(clientId, payload) {
  const pool = getPool();
  const client = await pool.connect();
  let subs = [];
  try {
    const r = await client.query(
      `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE client_id = $1`,
      [clientId]
    );
    subs = r.rows;
  } finally {
    client.release();
  }
  if (subs.length === 0) return { sent: 0, total: 0 };

  const payloadStr = JSON.stringify(payload);
  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payloadStr
      )
    )
  );

  const deadEndpoints = results
    .map((r, i) => (r.status === 'rejected' && r.reason?.statusCode === 410 ? subs[i].endpoint : null))
    .filter(Boolean);
  if (deadEndpoints.length) {
    const c2 = await pool.connect();
    try {
      await c2.query(
        `DELETE FROM push_subscriptions WHERE client_id = $1 AND endpoint = ANY($2::text[])`,
        [clientId, deadEndpoints]
      );
    } finally {
      c2.release();
    }
  }

  return { sent: results.filter((r) => r.status === 'fulfilled').length, total: subs.length };
}

async function fetchClientName(clientId) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const r = await client.query(
      `SELECT name FROM clients WHERE id = $1 LIMIT 1`,
      [clientId]
    );
    return r.rows[0]?.name || 'Клиент';
  } finally {
    client.release();
  }
}

function buildIntentPushBody(intentType, payload) {
  if (intentType === 'meal') {
    return `съел ${payload.product_name} ${payload.grams}г`;
  }
  if (intentType === 'training') {
    return `тренировался: ${payload.training_type}, ${payload.duration_min} мин`;
  }
  if (intentType === 'weight') {
    return `вес: ${payload.weight_kg} кг`;
  }
  return 'новое сообщение';
}

// ── Endpoint handlers ────────────────────────────────────────────────────

async function handleSend(identity, body) {
  if (identity.kind === 'client') {
    const rateRes = rateLimitCheck(identity.id);
    if (!rateRes.allowed) {
      return {
        statusCode: 429,
        body: { error: 'rate_limit_exceeded', retry_after: rateRes.retryAfter },
      };
    }

    const { body: msgBody, intent_type, intent_payload } = body || {};
    if ((!msgBody || msgBody.trim().length === 0) && !intent_type) {
      return { statusCode: 400, body: { error: 'body_or_intent_required' } };
    }
    if (msgBody && msgBody.length > 2000) {
      return { statusCode: 400, body: { error: 'body_too_long' } };
    }
    const intentValidation = validateIntent(intent_type || null, intent_payload || null);
    if (!intentValidation.ok) {
      return { statusCode: 400, body: { error: intentValidation.error } };
    }

    const pool = getPool();
    const conn = await pool.connect();
    let rpcResult;
    try {
      const r = await conn.query(
        `SELECT public.send_message_as_client($1, $2, $3, $4) AS result`,
        [
          identity.sessionToken,
          msgBody || null,
          intent_type || null,
          intent_payload ? JSON.stringify(intent_payload) : null,
        ]
      );
      rpcResult = r.rows[0]?.result;
    } finally {
      conn.release();
    }

    if (!rpcResult?.success) {
      return { statusCode: 400, body: rpcResult || { error: 'rpc_failed' } };
    }

    // Push куратору (best-effort, не блокирует ответ)
    const clientName = await fetchClientName(identity.id);
    const pushBody = intent_type
      ? buildIntentPushBody(intent_type, intent_payload)
      : (msgBody.length > 80 ? msgBody.slice(0, 77) + '...' : msgBody);
    const pushPayload = {
      title: `${clientName}: ${pushBody}`,
      body: 'Открыть сообщение',
      tag: `message-from-${identity.id}`,
      url: `/?switch_client=${identity.id}&open_messages=1`,
    };
    sendPushToCurator(rpcResult.curator_id, pushPayload).catch((err) => {
      console.error('[messages] push to curator failed:', err.message);
    });

    return {
      statusCode: 200,
      body: { success: true, message_id: rpcResult.message_id, created_at: rpcResult.created_at },
    };
  }

  // curator → client
  const { client_id, body: msgBody } = body || {};
  if (!client_id || typeof client_id !== 'string') {
    return { statusCode: 400, body: { error: 'client_id_required' } };
  }
  if (!msgBody || msgBody.trim().length === 0) {
    return { statusCode: 400, body: { error: 'body_required' } };
  }
  if (msgBody.length > 2000) {
    return { statusCode: 400, body: { error: 'body_too_long' } };
  }

  const pool = getPool();
  const conn = await pool.connect();
  let rpcResult;
  try {
    const r = await conn.query(
      `SELECT public.send_message_as_curator($1, $2, $3) AS result`,
      [identity.id, client_id, msgBody]
    );
    rpcResult = r.rows[0]?.result;
  } finally {
    conn.release();
  }

  if (!rpcResult?.success) {
    return { statusCode: 400, body: rpcResult || { error: 'rpc_failed' } };
  }

  // Push клиенту (best-effort)
  const pushBody = msgBody.length > 80 ? msgBody.slice(0, 77) + '...' : msgBody;
  const pushPayload = {
    title: 'Сообщение от куратора',
    body: pushBody,
    tag: 'message-from-curator',
    url: '/?open_messages=1',
  };
  sendPushToClient(client_id, pushPayload).catch((err) => {
    console.error('[messages] push to client failed:', err.message);
  });

  return {
    statusCode: 200,
    body: { success: true, message_id: rpcResult.message_id, created_at: rpcResult.created_at },
  };
}

async function handleThread(identity, query) {
  const before = query.before || null;
  const limit = Math.min(parseInt(query.limit || '50', 10) || 50, 200);

  if (identity.kind === 'client') {
    const pool = getPool();
    const conn = await pool.connect();
    try {
      const r = await conn.query(
        `SELECT public.get_messages_thread_as_client($1, $2::timestamptz, $3) AS result`,
        [identity.sessionToken, before, limit]
      );
      return { statusCode: 200, body: r.rows[0]?.result || { messages: [] } };
    } finally {
      conn.release();
    }
  }

  // curator
  const clientId = query.client_id;
  if (!clientId) {
    return { statusCode: 400, body: { error: 'client_id_required' } };
  }
  const pool = getPool();
  const conn = await pool.connect();
  try {
    const r = await conn.query(
      `SELECT public.get_messages_thread_as_curator($1, $2, $3::timestamptz, $4) AS result`,
      [identity.id, clientId, before, limit]
    );
    return { statusCode: 200, body: r.rows[0]?.result || { messages: [] } };
  } finally {
    conn.release();
  }
}

async function handleInbox(identity) {
  if (identity.kind !== 'curator') {
    return { statusCode: 403, body: { error: 'curator_only' } };
  }
  const pool = getPool();
  const conn = await pool.connect();
  try {
    const r = await conn.query(
      `SELECT public.get_curator_unread_counts($1) AS result`,
      [identity.id]
    );
    return { statusCode: 200, body: r.rows[0]?.result || { inbox: [] } };
  } finally {
    conn.release();
  }
}

async function handleMarkRead(identity, body) {
  const upToTs = body?.up_to_ts || null;

  if (identity.kind === 'client') {
    const pool = getPool();
    const conn = await pool.connect();
    try {
      const r = await conn.query(
        `SELECT public.mark_messages_read_as_client($1, $2::timestamptz) AS result`,
        [identity.sessionToken, upToTs]
      );
      return { statusCode: 200, body: r.rows[0]?.result || { updated: 0 } };
    } finally {
      conn.release();
    }
  }

  // curator
  const clientId = body?.client_id;
  if (!clientId) {
    return { statusCode: 400, body: { error: 'client_id_required' } };
  }
  const pool = getPool();
  const conn = await pool.connect();
  try {
    const r = await conn.query(
      `SELECT public.mark_messages_read_as_curator($1, $2, $3::timestamptz) AS result`,
      [identity.id, clientId, upToTs]
    );
    return { statusCode: 200, body: r.rows[0]?.result || { updated: 0 } };
  } finally {
    conn.release();
  }
}

// ── Main handler ─────────────────────────────────────────────────────────
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
  // ['messages', 'send' | 'thread' | 'inbox' | 'mark-read']
  const action = pathParts[1] || '';

  // Все endpoints требуют auth
  const identity = await resolveIdentity(event.headers?.Authorization || event.headers?.authorization);
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

  const query = event.queryStringParameters || {};

  try {
    let res;
    switch (action) {
      case 'send':
        res = await handleSend(identity, body);
        break;
      case 'thread':
        res = await handleThread(identity, query);
        break;
      case 'inbox':
        res = await handleInbox(identity);
        break;
      case 'mark-read':
        res = await handleMarkRead(identity, body);
        break;
      default:
        res = { statusCode: 404, body: { error: 'unknown_action', action } };
    }
    return { statusCode: res.statusCode, headers: cors, body: JSON.stringify(res.body) };
  } catch (err) {
    console.error('[messages] handler error:', err.message, err.stack);
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: 'internal_error', message: err.message }),
    };
  }
};
