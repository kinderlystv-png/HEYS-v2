/**
 * heys-api-photos — HEYS Photos API
 *
 * Endpoints (mapped via API Gateway):
 *   POST   /photos/upload   — returns presigned PUT URL для прямой загрузки в S3
 *   POST   /photos/delete   — удаляет объект из bucket
 *
 * Flow upload:
 *   1. Клиент шлёт POST /photos/upload с metadata (client_id, date, meal_id?, content_type?)
 *   2. Backend генерирует S3 key, presigned PUT URL (10 мин TTL), возвращает + публичный URL
 *   3. Клиент делает PUT на uploadUrl с binary body
 *   4. Готово — public URL уже работает (bucket public-read)
 *
 * Auth: JWT (curator) или session_token (client) — паттерн копирует heys-api-messages.
 *       Cookie heys_session_token поддержан для PR-C клиентов.
 */

const { getPool } = require('./shared/db-pool');
const { initSecrets } = require('./shared/secrets');
const crypto = require('crypto');
const { S3Client, DeleteObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

// ── S3 client (Yandex Object Storage) ────────────────────────────────────
let s3Client = null;
function getS3() {
  if (s3Client) return s3Client;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey
      || accessKeyId.startsWith('__IN_LOCKBOX__')
      || secretAccessKey.startsWith('__IN_LOCKBOX__')) {
    throw new Error('S3 credentials not configured (lockbox load failed?)');
  }
  s3Client = new S3Client({
    endpoint: 'https://storage.yandexcloud.net',
    region: 'ru-central1',
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: false,
  });
  return s3Client;
}

function getBucket() {
  return process.env.S3_PHOTOS_BUCKET || 'heys-photos';
}

function getPublicBaseUrl() {
  return `https://${getBucket()}.storage.yandexcloud.net`;
}

// ── CORS (та же allowlist что у остальных функций) ───────────────────────
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

// ── JWT verify (копия из heys-api-messages) ──────────────────────────────
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

function parseSessionCookie(cookieHeader) {
  if (!cookieHeader || typeof cookieHeader !== 'string') return null;
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const name = part.slice(0, eqIdx).trim();
    if (name === 'heys_session_token') {
      const raw = part.slice(eqIdx + 1).trim();
      try { return decodeURIComponent(raw); } catch { return raw; }
    }
  }
  return null;
}

async function resolveIdentity(authHeader, cookieHeader) {
  const bearer = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';
  const cookieSession = parseSessionCookie(cookieHeader);

  if (bearer) {
    const looksLikeJwt = bearer.split('.').length === 3 && bearer.includes('.');
    if (looksLikeJwt && process.env.JWT_SECRET) {
      const res = verifyJwt(bearer, process.env.JWT_SECRET);
      if (res.valid && res.payload?.role === 'curator' && res.payload?.sub) {
        return { kind: 'curator', id: res.payload.sub };
      }
    }
  }

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

// ── Helpers ──────────────────────────────────────────────────────────────
function sanitizeSegment(s) {
  if (!s) return '';
  return String(s).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

function randomId(n = 12) {
  return crypto.randomBytes(n).toString('hex');
}

function buildKey({ clientId, date, mealId, ext }) {
  // meal-photos/<client_id>/<date>/<meal_id>/<rnd>.<ext>
  // Если каких-то полей нет — заменяем 'misc'
  const cid = sanitizeSegment(clientId) || 'misc';
  const d = sanitizeSegment(date) || 'misc';
  const mid = sanitizeSegment(mealId) || 'misc';
  return `${cid}/${d}/${mid}/${randomId()}.${ext}`;
}

// ── Endpoints ────────────────────────────────────────────────────────────

async function handleUpload(identity, body) {
  const clientId = identity.kind === 'client' ? identity.id : (body?.client_id || null);
  const date = body?.date || null;
  const mealId = body?.meal_id || null;
  const contentType = body?.content_type || 'image/jpeg';
  const dataB64 = body?.data;

  if (!dataB64 || typeof dataB64 !== 'string') {
    return { statusCode: 400, body: { error: 'data_required' } };
  }

  // Курaтор может грузить от имени клиента — проверим ownership
  if (identity.kind === 'curator') {
    if (!body?.client_id) {
      return { statusCode: 400, body: { error: 'client_id_required' } };
    }
    const pool = getPool();
    const conn = await pool.connect();
    try {
      const r = await conn.query(
        `SELECT 1 FROM clients WHERE id = $1 AND curator_id = $2`,
        [body.client_id, identity.id]
      );
      if (!r.rows.length) {
        return { statusCode: 403, body: { error: 'curator_does_not_own_client' } };
      }
    } finally {
      conn.release();
    }
  }

  // Парсим base64 (data URL "data:image/jpeg;base64,..." или просто base64)
  const m = dataB64.match(/^data:([^;]+);base64,(.+)$/);
  const realB64 = m ? m[2] : dataB64;
  const realContentType = m ? m[1] : contentType;

  const buf = Buffer.from(realB64, 'base64');
  if (buf.length === 0) {
    return { statusCode: 400, body: { error: 'invalid_base64' } };
  }
  if (buf.length > 5 * 1024 * 1024) {
    return { statusCode: 413, body: { error: 'too_large', max_bytes: 5242880 } };
  }

  const ext = realContentType.includes('png') ? 'png'
    : realContentType.includes('webp') ? 'webp'
    : 'jpg';

  const key = buildKey({ clientId, date, mealId, ext });
  const bucket = getBucket();

  try {
    const s3 = getS3();
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buf,
      ContentType: realContentType,
      // SEC-006 (2026-06-14, Вариант B accepted-risk): bucket остаётся
      // anonymous-readable (см. docs/SECURITY_REVIEW_sec006_recommendation.md),
      // защита держится на ~318 битах энтропии ключа. Митигация против URL
      // leakage: Cache-Control private + no-store → ответ не кэшируется в
      // shared/intermediate caches (CDN, proxy), не оседает в browser-history
      // shared-cache, минимизирует window утечки URL через cache inspection.
      CacheControl: 'private, no-store, max-age=0',
      ACL: 'public-read',
    }));
  } catch (err) {
    console.error('[photos] S3 PutObject failed:', err.message);
    return { statusCode: 500, body: { error: 's3_put_failed', detail: err.message } };
  }

  return {
    statusCode: 200,
    body: {
      url: `${getPublicBaseUrl()}/${key}`,
      path: key,
    },
  };
}

async function handleDelete(identity, body) {
  const path = body?.path;
  if (!path || typeof path !== 'string') {
    return { statusCode: 400, body: { error: 'path_required' } };
  }
  // Простая проверка ownership: для клиента path должен начинаться с его client_id/
  if (identity.kind === 'client') {
    if (!path.startsWith(`${identity.id}/`)) {
      return { statusCode: 403, body: { error: 'not_your_photo' } };
    }
  } else {
    // Курaтор: path начинается с client_id, проверяем что клиент принадлежит куратору
    const clientId = path.split('/')[0];
    if (!clientId) {
      return { statusCode: 400, body: { error: 'invalid_path' } };
    }
    const pool = getPool();
    const conn = await pool.connect();
    try {
      const r = await conn.query(
        `SELECT 1 FROM clients WHERE id = $1 AND curator_id = $2`,
        [clientId, identity.id]
      );
      if (!r.rows.length) {
        return { statusCode: 403, body: { error: 'curator_does_not_own_client' } };
      }
    } finally {
      conn.release();
    }
  }

  try {
    const s3 = getS3();
    await s3.send(new DeleteObjectCommand({ Bucket: getBucket(), Key: path }));
  } catch (err) {
    console.error('[photos] delete failed:', err.message);
    return { statusCode: 500, body: { error: 'delete_failed', detail: err.message } };
  }

  return { statusCode: 200, body: { success: true } };
}

// ── Main handler ─────────────────────────────────────────────────────────
module.exports.handler = async function (event) {
  await initSecrets();
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const cors = corsHeaders(origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  // 🛡️ SEC-018 (2026-06-08): Body size limit — защита от DoS/OOM.
  // 8 MB: base64-payload до ~5MB после декода (см. line ~215) + 33% base64-оверхед.
  // Аналог heys-api-rpc/index.js:1517-1518 (256 KB). Photos нужно больше из-за base64.
  const MAX_BODY_BYTES = 8 * 1024 * 1024;
  if (event.body && typeof event.body === 'string' && Buffer.byteLength(event.body, 'utf8') > MAX_BODY_BYTES) {
    return { statusCode: 413, headers: cors, body: JSON.stringify({ error: 'Payload too large' }) };
  }

  const path = event.path || event.url || '';
  const pathParts = path.split('?')[0].split('/').filter(Boolean);
  // ['photos', 'upload' | 'delete']
  const action = pathParts[1] || '';

  const identity = await resolveIdentity(
    event.headers?.Authorization || event.headers?.authorization,
    event.headers?.cookie || event.headers?.Cookie
  );
  if (identity.error) {
    return { statusCode: 401, headers: cors, body: JSON.stringify({ error: identity.error }) };
  }

  let body = {};
  try {
    if (event.body) {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    }
  } catch {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'invalid_json' }) };
  }

  try {
    let res;
    switch (action) {
      case 'upload':
        res = await handleUpload(identity, body);
        break;
      case 'delete':
        res = await handleDelete(identity, body);
        break;
      default:
        res = { statusCode: 404, body: { error: 'unknown_action', action } };
    }
    return { statusCode: res.statusCode, headers: cors, body: JSON.stringify(res.body) };
  } catch (err) {
    console.error('[photos] handler error:', err.message, err.stack);
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: 'internal_error', message: err.message }),
    };
  }
};
