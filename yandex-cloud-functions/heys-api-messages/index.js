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
 *   Курятор: Authorization: Bearer <jwt> или HttpOnly cookie heys_curator_jwt.
 *
 * Rate limit:
 *   client → /send: 30 сообщений/минуту/client (in-memory counter, reset on cold start).
 */

const { getPool, acquireHealthyClient } = require('./shared/db-pool');
const { initSecrets } = require('./shared/secrets');
const webpush = require('web-push');
const crypto = require('crypto');
const https = require('https');

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

// ── Cookie helpers: heys_session_token / heys_curator_jwt (HttpOnly) ─────
// Тот же паттерн что в heys-api-rpc/index.js:1085-1107. PR-C (2026-05-20):
// session token PIN-клиентов и curator JWT могут лежать в HttpOnly cookie,
// JS их не видит, нужно читать на сервере.
function parseCookieToken(cookieHeader, cookieName) {
  if (!cookieHeader || typeof cookieHeader !== 'string') return null;
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const name = part.slice(0, eqIdx).trim();
    if (name === cookieName) {
      const raw = part.slice(eqIdx + 1).trim();
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
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

// ── Identity resolution: { kind, id, sessionToken? } ─────────────────────
// Источники token'а (в порядке предпочтения):
//   1. Authorization: Bearer <jwt>  — куратор
//   2. Authorization: Bearer <session_token>  — клиент (legacy LS-session)
//   3. Cookie: heys_session_token=<…>  — клиент (новый PR-C cookie-flow)
//   4. Cookie: heys_curator_jwt=<…>  — куратор (HttpOnly curator-flow)
async function resolveIdentity(authHeader, cookieHeader) {
  const bearer = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';
  const cookieCuratorJwt = parseCuratorCookie(cookieHeader);
  const cookieSession = parseSessionCookie(cookieHeader);
  const bearerLooksLikeJwt = bearer.split('.').length === 3 && bearer.includes('.');
  const curatorJwt = (bearerLooksLikeJwt ? bearer : '') || cookieCuratorJwt;

  // JWT → куратор
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
      return { kind: 'client', id: r.rows[0].client_id, sessionToken };
    }
    return { error: 'invalid_session' };
  } finally {
    client.release();
  }
}

// ── Rate limit (DB-side, SEC-009 fix 2026-06-08) ─────────────────────────
// До этого был in-memory Map → reset на cold-start + race между N инстансами
// автоскейла (каждый видит 0 attempts → лимит обходится).
// Теперь — атомарный UPSERT в messages_rate_limits через SECDEF-функцию.
// Fixed window (не sliding) — пропустит до 2× max на границе, accepted.
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX = 30;

async function rateLimitCheck(clientId) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const res = await client.query(
      'SELECT check_messages_rate_limit($1::uuid, $2::int, $3::int) AS r',
      [clientId, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_SECONDS],
    );
    const r = res.rows?.[0]?.r || {};
    if (r.allowed) return { allowed: true };
    return { allowed: false, retryAfter: r.retry_after || RATE_LIMIT_WINDOW_SECONDS };
  } catch (e) {
    // Если БД-функция упала — лучше пропустить (open mode) чем заблокировать
    // легитимных пользователей. Это accepted ослабление при инфра-проблеме.
    console.warn('[messages] rate-limit check unavailable, fail-open', {
      code: e?.code || 'db_error',
    });
    return { allowed: true };
  } finally {
    client.release();
  }
}

async function requestAlreadyStored(clientId, requestId, senderRole, curatorId = null) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT 1 FROM public.client_messages
        WHERE client_id = $1 AND sender_role = $3 AND request_id = $2
          AND ($4::uuid IS NULL OR curator_id = $4)
        LIMIT 1`,
      [clientId, requestId, senderRole, curatorId],
    );
    return result.rows.length > 0;
  } catch (error) {
    console.warn('[messages] idempotency precheck unavailable', { code: error?.code || 'db_error' });
    return null;
  } finally {
    client.release();
  }
}

// ── Validation helpers ───────────────────────────────────────────────────
const VALID_INTENT_TYPES = new Set(['meal', 'training', 'weight']);
const VALID_ATTACHMENT_TYPES = new Set(['image', 'audio']);
const VALID_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const VALID_AUDIO_MIME = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav']);
const VALID_TRANSCRIPT_STATUSES = new Set([
  'none',
  'queued',
  'processing',
  'ready',
  'failed',
  'unsupported_format',
  'budget_capped',
  'consent_required',
]);
const TRANSCRIPTION_CONSENT_TYPE = 'speech_transcription';
const TRANSCRIPTION_CONSENT_VERSION = '1.0';
const TRANSCRIPTION_PROVIDER = 'yandex_speechkit';
const SUPPORTED_TRANSCRIPTION_MIME = new Set(['audio/ogg', 'audio/wav', 'audio/x-wav']);
const MAX_AUDIO_DURATION_MS = 5 * 60 * 1000;
const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_TRANSCRIPT_TEXT_LENGTH = 4000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sanitizeDiagnosticValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeDiagnosticValue);
  if (!value || typeof value !== 'object') return value;
  const clean = {};
  for (const [key, nested] of Object.entries(value)) {
    if (/^(actor_id|client_id|curator_id|path|attachment_path|object_path|url|endpoint|body|transcript|token|p256dh|auth)$/i.test(key)) continue;
    clean[key] = sanitizeDiagnosticValue(nested);
  }
  return clean;
}

function trace(event, details = {}) {
  try {
    console.log('[messages.trace]', JSON.stringify({
      event,
      ts: new Date().toISOString(),
      ...sanitizeDiagnosticValue(details),
    }));
  } catch (_) {
    console.log('[messages.trace]', event);
  }
}

function compactAttachment(att) {
  if (!att || typeof att !== 'object') return null;
  return {
    type: normalizeAttachmentType(att),
    mime: normalizeMime(att.mime),
    duration_ms: Number(att.duration_ms || 0) || null,
    size_bytes: Number(att.size_bytes || 0) || null,
    transcript_status: att.transcript_status || null,
  };
}

function compactAudio(attachments) {
  return (Array.isArray(attachments) ? attachments : [])
    .filter((att) => normalizeAttachmentType(att) === 'audio')
    .map(compactAttachment);
}

function normalizeMime(mime) {
  return String(mime || '').split(';')[0].trim().toLowerCase();
}

function estimateSpeechKitCost(durationMs, pricePer15s = process.env.SPEECHKIT_ASYNC_PRICE_PER_15S_RUB) {
  const price = Number(pricePer15s || 0);
  const seconds = Math.max(15, Math.ceil(Number(durationMs || 0) / 1000));
  const billableSeconds = Math.ceil(seconds / 15) * 15;
  return {
    billableSeconds,
    estimatedCostRub: Number.isFinite(price) && price > 0 ? (billableSeconds / 15) * price : 0,
  };
}

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

function normalizeAttachmentType(att) {
  if (att?.type === 'audio' || att?.media_type === 'audio') return 'audio';
  return 'image';
}

function validateAttachments(attachments) {
  if (!Array.isArray(attachments)) return { ok: false, error: 'invalid_attachments' };
  if (attachments.length > 10) return { ok: false, error: 'too_many_attachments' };
  for (const att of attachments) {
    if (!att || typeof att !== 'object' || Array.isArray(att)) {
      return { ok: false, error: 'invalid_attachment' };
    }
    const type = normalizeAttachmentType(att);
    if (!VALID_ATTACHMENT_TYPES.has(type)) {
      return { ok: false, error: 'invalid_attachment_type' };
    }
    if (typeof att.url !== 'string' || !/^https:\/\//.test(att.url) || att.url.length > 1200) {
      return { ok: false, error: 'invalid_attachment_url' };
    }
    if (typeof att.path !== 'string' || att.path.length < 3 || att.path.length > 500) {
      return { ok: false, error: 'invalid_attachment_path' };
    }
    const mime = normalizeMime(att.mime);
    if (type === 'audio') {
      const durationMs = Number(att.duration_ms || 0);
      const sizeBytes = Number(att.size_bytes || 0);
      if (!VALID_AUDIO_MIME.has(mime)) return { ok: false, error: 'invalid_audio_mime' };
      if (!Number.isFinite(durationMs) || durationMs < 250 || durationMs > MAX_AUDIO_DURATION_MS) {
        return { ok: false, error: 'invalid_audio_duration' };
      }
      if (sizeBytes && (!Number.isFinite(sizeBytes) || sizeBytes > MAX_ATTACHMENT_SIZE_BYTES)) {
        return { ok: false, error: 'invalid_audio_size' };
      }
      const transcriptStatus = att.transcript_status;
      if (transcriptStatus && !VALID_TRANSCRIPT_STATUSES.has(transcriptStatus)) {
        return { ok: false, error: 'invalid_transcript_status' };
      }
      if (att.transcript_text !== undefined &&
          (typeof att.transcript_text !== 'string' || att.transcript_text.length > MAX_TRANSCRIPT_TEXT_LENGTH)) {
        return { ok: false, error: 'invalid_transcript_text' };
      }
      if (att.transcript_provider !== undefined &&
          (typeof att.transcript_provider !== 'string' || att.transcript_provider.length > 80)) {
        return { ok: false, error: 'invalid_transcript_provider' };
      }
      if (att.transcript_error !== undefined &&
          (typeof att.transcript_error !== 'string' || att.transcript_error.length > 200)) {
        return { ok: false, error: 'invalid_transcript_error' };
      }
    } else if (mime && !VALID_IMAGE_MIME.has(mime)) {
      return { ok: false, error: 'invalid_image_mime' };
    }
  }
  return { ok: true };
}

function getAttachmentBaseUrl() {
  if (process.env.MESSENGER_ATTACHMENTS_BASE_URL) {
    return process.env.MESSENGER_ATTACHMENTS_BASE_URL.replace(/\/+$/, '');
  }
  const bucket = process.env.S3_PHOTOS_BUCKET || 'heys-photos';
  return `https://${bucket}.storage.yandexcloud.net`;
}

function isMessengerObjectPath(path, clientId) {
  if (!path || !clientId || !path.startsWith(`${clientId}/`)) return false;
  const rest = path.slice(String(clientId).length + 1);
  return /^\d{4}-\d{2}-\d{2}\/(?:voice\/)?msg-[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(rest);
}

function validateAttachmentOwnership(attachments, clientId) {
  const baseUrl = getAttachmentBaseUrl();
  for (const att of attachments) {
    if (!isMessengerObjectPath(att.path, clientId)) {
      return { ok: false, error: 'attachment_not_owned' };
    }
    if (att.url !== `${baseUrl}/${att.path}`) {
      return { ok: false, error: 'attachment_url_path_mismatch' };
    }
  }
  return { ok: true };
}

function headAttachmentUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'HEAD', timeout: 3000 }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
    req.on('error', reject);
    req.end();
  });
}

async function verifyAttachmentObjectsExist(attachments, headFn = headAttachmentUrl) {
  try {
    const results = await Promise.all(attachments.map((attachment) => headFn(attachment.url)));
    return results.every(Boolean)
      ? { ok: true }
      : { ok: false, error: 'attachment_object_not_found', statusCode: 400 };
  } catch {
    return { ok: false, error: 'attachment_verification_unavailable', statusCode: 503 };
  }
}

function rpcStatusCode(result) {
  if (result?.success) return 200;
  const error = result?.error;
  if (error === 'idempotency_conflict') return 409;
  if (error === 'curator_does_not_own_client' || error === 'message_not_found_or_forbidden') return 403;
  if (error === 'message_not_found') return 404;
  if (error === 'message_store_failed' || error === 'idempotency_state_unavailable' ||
      error === 'message_state_update_failed' || error === 'message_delete_failed') return 500;
  return 400;
}

function buildGenericMessagePush(senderRole, targetClientId = null) {
  if (senderRole === 'client') {
    return {
      title: 'Новое сообщение от клиента',
      body: 'Открыть диалог',
      tag: 'message-from-client',
      url: targetClientId ? `/?switch_client=${targetClientId}&open_messages=1` : '/?open_messages=1',
    };
  }
  return {
    title: 'Новое сообщение от куратора',
    body: 'Открыть диалог',
    tag: 'message-from-curator',
    url: '/?open_messages=1',
  };
}

function canonicalizeJson(value) {
  if (Array.isArray(value)) return value.map((item) => canonicalizeJson(item === undefined ? null : item));
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    if (value[key] !== undefined) result[key] = canonicalizeJson(value[key]);
    return result;
  }, {});
}

function buildSendRequestFingerprint(payload) {
  const canonical = canonicalizeJson(payload);
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function stripClientTranscriptFields(att) {
  if (normalizeAttachmentType(att) !== 'audio') return { ...att };
  const clean = { ...att };
  delete clean.transcript_text;
  delete clean.transcript_provider;
  delete clean.transcript_created_at;
  delete clean.transcript_error;
  clean.transcript_status = 'none';
  if (clean.mime) clean.mime = normalizeMime(clean.mime);
  return clean;
}

async function hasSpeechTranscriptionConsent(identity) {
  const pool = getPool();
  const conn = await pool.connect();
  try {
    if (identity.kind === 'client') {
      const r = await conn.query(
        `SELECT 1 FROM consents
         WHERE client_id = $1
           AND consent_type = $2
           AND granted = true
           AND revoked_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        [identity.id, TRANSCRIPTION_CONSENT_TYPE],
      );
      return r.rows.length > 0;
    }
    const r = await conn.query(
      `SELECT 1 FROM curator_consents
       WHERE curator_id = $1
         AND consent_type = $2
         AND granted = true
         AND revoked_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [identity.id, TRANSCRIPTION_CONSENT_TYPE],
    );
    return r.rows.length > 0;
  } finally {
    conn.release();
  }
}

async function getTranscriptionMonthlySpend() {
  const pool = getPool();
  const conn = await pool.connect();
  try {
    const r = await conn.query(
      `SELECT COALESCE(SUM(estimated_cost_rub), 0)::numeric AS total
       FROM message_transcription_jobs
       WHERE created_at >= date_trunc('month', NOW())
         AND status IN ('queued', 'processing', 'ready')`,
    );
    return Number(r.rows[0]?.total || 0);
  } finally {
    conn.release();
  }
}

async function prepareAttachmentsForSend(identity, attachments) {
  const prepared = attachments.map(stripClientTranscriptFields);
  const audio = prepared.filter((att) => normalizeAttachmentType(att) === 'audio');
  if (audio.length === 0) return { attachments: prepared, jobs: [] };

  const hasConsent = await hasSpeechTranscriptionConsent(identity);
  const monthlyCap = Number(process.env.SPEECHKIT_PILOT_MONTHLY_CAP_RUB || 500);
  let spend = await getTranscriptionMonthlySpend();
  const spendBefore = spend;
  const jobs = [];

  for (const att of audio) {
    const mime = normalizeMime(att.mime);
    if (!hasConsent) {
      att.transcript_status = 'consent_required';
      continue;
    }
    if (!SUPPORTED_TRANSCRIPTION_MIME.has(mime)) {
      att.transcript_status = 'unsupported_format';
      continue;
    }
    const estimate = estimateSpeechKitCost(att.duration_ms);
    if (monthlyCap > 0 && estimate.estimatedCostRub > 0 && spend + estimate.estimatedCostRub > monthlyCap) {
      att.transcript_status = 'budget_capped';
      continue;
    }
    spend += estimate.estimatedCostRub;
    att.transcript_status = 'queued';
    att.transcript_provider = TRANSCRIPTION_PROVIDER;
    jobs.push({ attachment: att, estimate });
  }

  trace('transcription.prepare', {
    actor_role: identity.kind,
    actor_id: identity.id,
    consent: hasConsent,
    monthly_cap_rub: monthlyCap,
    spend_before_rub: spendBefore,
    spend_after_rub: spend,
    jobs: jobs.length,
    audio: compactAudio(prepared),
  });

  return { attachments: prepared, jobs };
}

async function enqueueTranscriptionJobs({ messageId, actorRole, clientId, curatorId, jobs }) {
  if (!messageId || !jobs?.length) return;
  const pool = getPool();
  const conn = await pool.connect();
  try {
    for (const job of jobs) {
      const att = job.attachment;
      const result = await conn.query(
        `INSERT INTO message_transcription_jobs (
           message_id, attachment_path, actor_role, client_id, curator_id,
           status, duration_ms, mime, billable_seconds, estimated_cost_rub
         )
         VALUES ($1, $2, $3, $4, $5, 'queued', $6, $7, $8, $9)
         ON CONFLICT (message_id, attachment_path) DO NOTHING`,
        [
          messageId,
          att.path,
          actorRole,
          clientId,
          curatorId,
          Number(att.duration_ms || 0),
          normalizeMime(att.mime),
          job.estimate.billableSeconds,
          job.estimate.estimatedCostRub,
        ],
      );
      trace('transcription.job.insert', {
        message_id: messageId,
        actor_role: actorRole,
        client_id: clientId,
        curator_id: curatorId,
        attachment_path: att.path,
        mime: normalizeMime(att.mime),
        duration_ms: Number(att.duration_ms || 0),
        billable_seconds: job.estimate.billableSeconds,
        estimated_cost_rub: job.estimate.estimatedCostRub,
        inserted: result.rowCount > 0,
      });
    }
  } finally {
    conn.release();
  }
}

async function enqueueTranscriptionJobsBestEffort(args) {
  try {
    await enqueueTranscriptionJobs(args);
  } catch (err) {
    console.warn('[messages.transcription] enqueue failed', {
      messageId: args?.messageId,
      code: err?.code || 'enqueue_failed',
    });
  }
}

async function enqueuePendingTranscriptionForMessage(identity, messageId) {
  if (!messageId || typeof messageId !== 'string') {
    return { queued: 0, skipped: 'message_id_missing' };
  }

  const pool = getPool();
  const conn = await pool.connect();
  try {
    const r = await conn.query(
      `SELECT id, client_id, curator_id, sender_role, attachments
         FROM client_messages
        WHERE id = $1
          AND created_at >= NOW() - INTERVAL '15 minutes'
        LIMIT 1`,
      [messageId],
    );
    const row = r.rows[0];
    if (!row) return { queued: 0, skipped: 'message_not_found_or_too_old' };

    const actorRole = identity.kind === 'client' ? 'client' : 'curator';
    if (row.sender_role !== actorRole) return { queued: 0, skipped: 'sender_role_mismatch' };
    if (identity.kind === 'client' && String(row.client_id) !== String(identity.id)) {
      return { queued: 0, skipped: 'forbidden' };
    }
    if (identity.kind === 'curator' && String(row.curator_id) !== String(identity.id)) {
      return { queued: 0, skipped: 'forbidden' };
    }

    const attachments = Array.isArray(row.attachments) ? row.attachments : [];
    const candidates = attachments.filter((att) =>
      normalizeAttachmentType(att) === 'audio' &&
      att?.path &&
      (!att.transcript_status || att.transcript_status === 'consent_required')
    );
    if (candidates.length === 0) return { queued: 0, skipped: 'no_pending_audio' };

    const monthlyCap = Number(process.env.SPEECHKIT_PILOT_MONTHLY_CAP_RUB || 500);
    let spend = await getTranscriptionMonthlySpend();
    const jobs = [];

    for (const att of candidates) {
      const mime = normalizeMime(att.mime);
      if (!SUPPORTED_TRANSCRIPTION_MIME.has(mime)) {
        await conn.query(
          `SELECT public.set_message_attachment_transcript($1, $2, 'unsupported_format', NULL, NULL, NULL) AS result`,
          [messageId, att.path],
        );
        continue;
      }
      const estimate = estimateSpeechKitCost(att.duration_ms);
      if (monthlyCap > 0 && estimate.estimatedCostRub > 0 && spend + estimate.estimatedCostRub > monthlyCap) {
        await conn.query(
          `SELECT public.set_message_attachment_transcript($1, $2, 'budget_capped', NULL, NULL, NULL) AS result`,
          [messageId, att.path],
        );
        continue;
      }
      spend += estimate.estimatedCostRub;
      await conn.query(
        `SELECT public.set_message_attachment_transcript($1, $2, 'queued', NULL, $3, NULL) AS result`,
        [messageId, att.path, TRANSCRIPTION_PROVIDER],
      );
      jobs.push({ attachment: att, estimate });
    }

    await enqueueTranscriptionJobs({
      messageId,
      actorRole,
      clientId: row.client_id,
      curatorId: row.curator_id,
      jobs,
    });
    trace('transcription.enqueue_after_consent', {
      message_id: messageId,
      actor_role: actorRole,
      client_id: row.client_id,
      curator_id: row.curator_id,
      queued: jobs.length,
      audio: compactAudio(attachments),
    });
    return { queued: jobs.length };
  } catch (err) {
    console.warn('[messages.transcription] enqueue after consent failed', {
      messageId,
      code: err?.code || 'enqueue_failed',
    });
    return { queued: 0, error: 'enqueue_failed' };
  } finally {
    conn.release();
  }
}

function getRequestIp(event) {
  return event.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
    event.headers?.['X-Forwarded-For']?.split(',')[0]?.trim() ||
    event.requestContext?.identity?.sourceIp ||
    null;
}

async function getTranscriptionConsent(identity) {
  const pool = getPool();
  const conn = await pool.connect();
  try {
    if (identity.kind === 'client') {
      const r = await conn.query(
        `SELECT granted, document_version, created_at, revoked_at
           FROM consents
          WHERE client_id = $1
            AND consent_type = $2
          ORDER BY created_at DESC
          LIMIT 1`,
        [identity.id, TRANSCRIPTION_CONSENT_TYPE],
      );
      const row = r.rows[0] || null;
      return {
        success: true,
        consent_type: TRANSCRIPTION_CONSENT_TYPE,
        version: row?.document_version || TRANSCRIPTION_CONSENT_VERSION,
        granted: !!(row?.granted && !row?.revoked_at),
        decided: !!row,
        created_at: row?.created_at || null,
        revoked_at: row?.revoked_at || null,
      };
    }
    const r = await conn.query(
      `SELECT granted, document_version, created_at, revoked_at
         FROM curator_consents
        WHERE curator_id = $1
          AND consent_type = $2
        ORDER BY created_at DESC
        LIMIT 1`,
      [identity.id, TRANSCRIPTION_CONSENT_TYPE],
    );
    const row = r.rows[0] || null;
    return {
      success: true,
      consent_type: TRANSCRIPTION_CONSENT_TYPE,
      version: row?.document_version || TRANSCRIPTION_CONSENT_VERSION,
      granted: !!(row?.granted && !row?.revoked_at),
      decided: !!row,
      created_at: row?.created_at || null,
      revoked_at: row?.revoked_at || null,
    };
  } finally {
    conn.release();
  }
}

async function setTranscriptionConsent(identity, granted, event) {
  const ip = getRequestIp(event);
  const userAgent = event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null;
  const pool = getPool();
  const conn = await pool.connect();
  try {
    if (identity.kind === 'client') {
      const payload = [{
        type: TRANSCRIPTION_CONSENT_TYPE,
        granted: !!granted,
        version: TRANSCRIPTION_CONSENT_VERSION,
        signature_method: 'checkbox',
      }];
      const r = await conn.query(
        `SELECT public.log_consents_by_session($1, $2::jsonb, $3, $4) AS result`,
        [identity.sessionToken, JSON.stringify(payload), ip, userAgent],
      );
      const result = r.rows[0]?.result || {};
      if (!result.success) return result;
      return {
        success: true,
        consent_type: TRANSCRIPTION_CONSENT_TYPE,
        version: TRANSCRIPTION_CONSENT_VERSION,
        granted: !!granted,
      };
    }

    await conn.query('BEGIN');
    await conn.query(
      `UPDATE curator_consents
          SET granted = false,
              revoked_at = NOW()
        WHERE curator_id = $1
          AND consent_type = $2
          AND granted = true
          AND revoked_at IS NULL`,
      [identity.id, TRANSCRIPTION_CONSENT_TYPE],
    );
    await conn.query(
      `INSERT INTO curator_consents (
         curator_id, consent_type, document_version, granted,
         ip_address, user_agent, consent_method, signature_method, created_at
       )
       VALUES ($1, $2, $3, $4, NULLIF($5::text, '')::inet,
               $6, 'checkbox', 'checkbox', NOW())`,
      [identity.id, TRANSCRIPTION_CONSENT_TYPE, TRANSCRIPTION_CONSENT_VERSION, !!granted, ip, userAgent],
    );
    await conn.query('COMMIT');
    return {
      success: true,
      consent_type: TRANSCRIPTION_CONSENT_TYPE,
      version: TRANSCRIPTION_CONSENT_VERSION,
      granted: !!granted,
    };
  } catch (err) {
    try { await conn.query('ROLLBACK'); } catch (_) { /* ignore */ }
    console.error('[messages] consent update failed', { code: err?.code || 'unhandled' });
    return { success: false, error: 'consent_update_failed' };
  } finally {
    conn.release();
  }
}

function buildAttachmentBadge(attachments) {
  const imageCount = attachments.filter((att) => normalizeAttachmentType(att) === 'image').length;
  const audioCount = attachments.filter((att) => normalizeAttachmentType(att) === 'audio').length;
  const parts = [];
  if (imageCount > 0) parts.push(`📷${imageCount > 1 ? '×' + imageCount : ''}`);
  if (audioCount > 0) parts.push(`🎙️${audioCount > 1 ? '×' + audioCount : ''}`);
  return parts.length ? ' ' + parts.join(' ') : '';
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
  trace('push_subscriptions_loaded', { actor_role: 'curator', subscription_count: subs.length });
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

  trace('push_delivery_completed', {
    actor_role: 'curator',
    sent: results.filter((r) => r.status === 'fulfilled').length,
    failed: results.filter((r) => r.status === 'rejected').length,
    status_codes: results
      .filter((r) => r.status === 'rejected')
      .map((r) => r.reason?.statusCode || 'push_error'),
  });

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
  trace('push_subscriptions_loaded', { actor_role: 'client', subscription_count: subs.length });
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

  trace('push_delivery_completed', {
    actor_role: 'client',
    sent: results.filter((r) => r.status === 'fulfilled').length,
    failed: results.filter((r) => r.status === 'rejected').length,
    status_codes: results
      .filter((r) => r.status === 'rejected')
      .map((r) => r.reason?.statusCode || 'push_error'),
  });

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

// ── Endpoint handlers ────────────────────────────────────────────────────

async function handleSend(identity, body) {
  if (identity.kind === 'client') {
    const { body: msgBody, intent_type, intent_payload, attachments, request_id: requestId } = body || {};
    const inputAttachments = Array.isArray(attachments) ? attachments : [];
    trace('send.request', {
      actor_role: 'client',
      client_id: identity.id,
      has_body: Boolean(msgBody && msgBody.trim()),
      intent_type: intent_type || null,
      attachments: inputAttachments.length,
      audio: compactAudio(inputAttachments),
      request_id: requestId || null,
    });
    if (!UUID_RE.test(String(requestId || ''))) {
      return { statusCode: 400, body: { error: 'invalid_request_id' } };
    }
    if (msgBody !== undefined && msgBody !== null && typeof msgBody !== 'string') {
      return { statusCode: 400, body: { error: 'invalid_body' } };
    }
    const replayCandidate = await requestAlreadyStored(identity.id, requestId, 'client');
    if (!replayCandidate) {
      const rateRes = await rateLimitCheck(identity.id);
      if (!rateRes.allowed) {
        return {
          statusCode: 429,
          body: { error: 'rate_limit_exceeded', retry_after: rateRes.retryAfter },
        };
      }
    }
    if ((!msgBody || msgBody.trim().length === 0) && !intent_type && inputAttachments.length === 0) {
      return { statusCode: 400, body: { error: 'body_intent_or_attachment_required' } };
    }
    if (msgBody && msgBody.length > 2000) {
      return { statusCode: 400, body: { error: 'body_too_long' } };
    }
    const attachmentsValidation = validateAttachments(inputAttachments);
    if (!attachmentsValidation.ok) {
      return { statusCode: 400, body: { error: attachmentsValidation.error } };
    }
    const attachmentsOwnership = validateAttachmentOwnership(inputAttachments, identity.id);
    if (!attachmentsOwnership.ok) {
      trace('attachment_rejected', {
        actor_role: 'client', request_id: requestId, error: attachmentsOwnership.error,
      });
      return { statusCode: 400, body: { error: attachmentsOwnership.error } };
    }
    const attachmentObjects = replayCandidate
      ? { ok: true }
      : await verifyAttachmentObjectsExist(inputAttachments);
    if (!attachmentObjects.ok) {
      trace('attachment_rejected', {
        actor_role: 'client', request_id: requestId, error: attachmentObjects.error,
      });
      return { statusCode: attachmentObjects.statusCode, body: { error: attachmentObjects.error } };
    }
    const intentValidation = validateIntent(intent_type || null, intent_payload || null);
    if (!intentValidation.ok) {
      return { statusCode: 400, body: { error: intentValidation.error } };
    }
    const requestFingerprint = buildSendRequestFingerprint({
      body: msgBody?.trim() || null,
      intent_type: intent_type || null,
      intent_payload: intent_payload || null,
      attachments: inputAttachments.map(stripClientTranscriptFields),
    });
    const transcription = await prepareAttachmentsForSend(identity, inputAttachments);
    const attachmentsArr = transcription.attachments;

    const pool = getPool();
    const conn = await pool.connect();
    let rpcResult;
    try {
      const r = await conn.query(
        `SELECT public.send_message_as_client_v2($1, $2, $3, $4, $5, $6, $7) AS result`,
        [
          identity.sessionToken,
          msgBody || null,
          intent_type || null,
          intent_payload ? JSON.stringify(intent_payload) : null,
          JSON.stringify(attachmentsArr),
          requestId,
          requestFingerprint,
        ]
      );
      rpcResult = r.rows[0]?.result;
    } finally {
      conn.release();
    }

    if (!rpcResult?.success) {
      trace('send.rpc_failed', {
        actor_role: 'client',
        client_id: identity.id,
        error: rpcResult?.error || 'rpc_failed',
        audio: compactAudio(attachmentsArr),
      });
      const result = rpcResult || { success: false, error: 'rpc_failed' };
      return { statusCode: rpcStatusCode(result), body: result };
    }

    trace(rpcResult.replayed ? 'send_replayed' : 'send_created', {
      actor_role: 'client',
      message_id: rpcResult.message_id,
      request_id: requestId,
      audio: compactAudio(attachmentsArr),
      transcription_jobs: transcription.jobs.length,
    });

    if (!rpcResult.replayed) {
      await enqueueTranscriptionJobsBestEffort({
        messageId: rpcResult.message_id,
        actorRole: 'client',
        clientId: rpcResult.client_id || identity.id,
        curatorId: rpcResult.curator_id || null,
        jobs: transcription.jobs,
      });

      const pushPayload = buildGenericMessagePush('client', identity.id);
      sendPushToCurator(rpcResult.curator_id, pushPayload).then(() => {
        trace('push_generic_sent', { actor_role: 'client', message_id: rpcResult.message_id });
      }).catch(() => {
        console.error('[messages] push to curator failed');
      });
    }

    return {
      statusCode: 200,
      body: {
        success: true,
        message_id: rpcResult.message_id,
        created_at: rpcResult.created_at,
        replayed: !!rpcResult.replayed,
      },
    };
  }

  // curator → client
  const {
    client_id,
    body: msgBody,
    attachments: curatorAttachments,
    request_id: requestId,
  } = body || {};
  const inputCuratorAttachments = Array.isArray(curatorAttachments) ? curatorAttachments : [];
  trace('send.request', {
    actor_role: 'curator',
    curator_id: identity.id,
    client_id: client_id || null,
    has_body: Boolean(msgBody && msgBody.trim()),
    attachments: inputCuratorAttachments.length,
    audio: compactAudio(inputCuratorAttachments),
    request_id: requestId || null,
  });
  if (!client_id || typeof client_id !== 'string') {
    return { statusCode: 400, body: { error: 'client_id_required' } };
  }
  if (!UUID_RE.test(String(requestId || ''))) {
    return { statusCode: 400, body: { error: 'invalid_request_id' } };
  }
  if (msgBody !== undefined && msgBody !== null && typeof msgBody !== 'string') {
    return { statusCode: 400, body: { error: 'invalid_body' } };
  }
  const replayCandidate = await requestAlreadyStored(client_id, requestId, 'curator', identity.id);
  if ((!msgBody || msgBody.trim().length === 0) && inputCuratorAttachments.length === 0) {
    return { statusCode: 400, body: { error: 'body_or_attachment_required' } };
  }
  if (msgBody && msgBody.length > 2000) {
    return { statusCode: 400, body: { error: 'body_too_long' } };
  }
  const curatorAttachmentsValidation = validateAttachments(inputCuratorAttachments);
  if (!curatorAttachmentsValidation.ok) {
    return { statusCode: 400, body: { error: curatorAttachmentsValidation.error } };
  }
  const curatorAttachmentsOwnership = validateAttachmentOwnership(inputCuratorAttachments, client_id);
  if (!curatorAttachmentsOwnership.ok) {
    trace('attachment_rejected', {
      actor_role: 'curator', request_id: requestId, error: curatorAttachmentsOwnership.error,
    });
    return { statusCode: 400, body: { error: curatorAttachmentsOwnership.error } };
  }
  const curatorAttachmentObjects = replayCandidate
    ? { ok: true }
    : await verifyAttachmentObjectsExist(inputCuratorAttachments);
  if (!curatorAttachmentObjects.ok) {
    trace('attachment_rejected', {
      actor_role: 'curator', request_id: requestId, error: curatorAttachmentObjects.error,
    });
    return {
      statusCode: curatorAttachmentObjects.statusCode,
      body: { error: curatorAttachmentObjects.error },
    };
  }
  const requestFingerprint = buildSendRequestFingerprint({
    body: msgBody?.trim() || null,
    attachments: inputCuratorAttachments.map(stripClientTranscriptFields),
  });
  const curatorTranscription = await prepareAttachmentsForSend(identity, inputCuratorAttachments);
  const curatorAttachmentsArr = curatorTranscription.attachments;

  const pool = getPool();
  const conn = await pool.connect();
  let rpcResult;
  try {
    const r = await conn.query(
      `SELECT public.send_message_as_curator_v2($1, $2, $3, $4, $5, $6) AS result`,
      [identity.id, client_id, msgBody || null, JSON.stringify(curatorAttachmentsArr), requestId, requestFingerprint]
    );
    rpcResult = r.rows[0]?.result;
  } finally {
    conn.release();
  }

  if (!rpcResult?.success) {
    trace('send.rpc_failed', {
      actor_role: 'curator',
      curator_id: identity.id,
      client_id,
      error: rpcResult?.error || 'rpc_failed',
      audio: compactAudio(curatorAttachmentsArr),
    });
    const result = rpcResult || { success: false, error: 'rpc_failed' };
    return { statusCode: rpcStatusCode(result), body: result };
  }

  trace(rpcResult.replayed ? 'send_replayed' : 'send_created', {
    actor_role: 'curator',
    message_id: rpcResult.message_id,
    request_id: requestId,
    audio: compactAudio(curatorAttachmentsArr),
    transcription_jobs: curatorTranscription.jobs.length,
  });

  if (!rpcResult.replayed) {
    await enqueueTranscriptionJobsBestEffort({
      messageId: rpcResult.message_id,
      actorRole: 'curator',
      clientId: client_id,
      curatorId: identity.id,
      jobs: curatorTranscription.jobs,
    });

    const pushPayload = buildGenericMessagePush('curator');
    sendPushToClient(client_id, pushPayload).then(() => {
      trace('push_generic_sent', { actor_role: 'curator', message_id: rpcResult.message_id });
    }).catch(() => {
      console.error('[messages] push to client failed');
    });
  }

  return {
    statusCode: 200,
    body: {
      success: true,
      message_id: rpcResult.message_id,
      created_at: rpcResult.created_at,
      replayed: !!rpcResult.replayed,
    },
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
  const conn = await acquireHealthyClient();
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

async function handleEdit(identity, body) {
  const messageId = body?.message_id;
  const newBody = body?.body;
  if (!messageId || typeof messageId !== 'string') {
    return { statusCode: 400, body: { error: 'message_id_required' } };
  }
  if (!newBody || typeof newBody !== 'string' || !newBody.trim()) {
    return { statusCode: 400, body: { error: 'body_required' } };
  }
  if (newBody.length > 2000) {
    return { statusCode: 400, body: { error: 'body_too_long' } };
  }
  const pool = getPool();
  const conn = await pool.connect();
  try {
    let rpcResult;
    if (identity.kind === 'client') {
      const r = await conn.query(
        `SELECT public.edit_message_as_client($1, $2, $3) AS result`,
        [identity.sessionToken, messageId, newBody]
      );
      rpcResult = r.rows[0]?.result;
    } else {
      const r = await conn.query(
        `SELECT public.edit_message_as_curator($1, $2, $3) AS result`,
        [identity.id, messageId, newBody]
      );
      rpcResult = r.rows[0]?.result;
    }
    const result = rpcResult || { success: false, error: 'rpc_no_result' };
    return { statusCode: result.success ? 200 : 400, body: result };
  } finally {
    conn.release();
  }
}

async function handleDelete(identity, body) {
  const messageId = body?.message_id;
  if (!messageId || typeof messageId !== 'string') {
    return { statusCode: 400, body: { error: 'message_id_required' } };
  }
  const pool = getPool();
  const conn = await pool.connect();
  try {
    let rpcResult;
    if (identity.kind === 'client') {
      const r = await conn.query(
        `SELECT public.delete_message_as_client($1, $2) AS result`,
        [identity.sessionToken, messageId]
      );
      rpcResult = r.rows[0]?.result;
    } else {
      const r = await conn.query(
        `SELECT public.delete_message_as_curator($1, $2) AS result`,
        [identity.id, messageId]
      );
      rpcResult = r.rows[0]?.result;
    }
    const result = rpcResult || { success: false, error: 'rpc_no_result' };
    return { statusCode: result.success ? 200 : 400, body: result };
  } finally {
    conn.release();
  }
}

async function handleSetAcked(identity, body) {
  if (identity.kind !== 'client') {
    return { statusCode: 403, body: { error: 'client_only' } };
  }
  const messageId = body?.message_id;
  if (!messageId || typeof messageId !== 'string') {
    return { statusCode: 400, body: { error: 'message_id_required' } };
  }
  if (typeof body?.desired_state !== 'boolean') {
    return { statusCode: 400, body: { error: 'desired_state_required' } };
  }
  const pool = getPool();
  const conn = await pool.connect();
  try {
    const r = await conn.query(
      `SELECT public.set_message_acked_as_client($1, $2, $3) AS result`,
      [identity.sessionToken, messageId, body.desired_state]
    );
    const result = r.rows[0]?.result || { success: false, error: 'rpc_no_result' };
    return { statusCode: rpcStatusCode(result), body: result };
  } finally {
    conn.release();
  }
}

async function handleUnreadCount(identity, query) {
  const pool = getPool();
  const conn = await pool.connect();
  try {
    if (identity.kind === 'client') {
      const r = await conn.query(
        `SELECT public.get_my_unread_count_as_client($1) AS result`,
        [identity.sessionToken]
      );
      return { statusCode: 200, body: r.rows[0]?.result || { unread_count: 0 } };
    }
    // Курaтор: для указанного client_id или сумма по всем.
    // ВАЖНО: для куратора «непрочитанное» = «не обработанное» (done_at IS NULL),
    // а не read_at. Куратор может зайти в тред и закрыть, не сделав ничего —
    // такие сообщения должны висеть в badge'ах пока он не пометит ✓ Обработано.
    const clientId = query.client_id;
    if (clientId) {
      const own = await conn.query(
        `SELECT 1 FROM clients WHERE id = $1 AND curator_id = $2`,
        [clientId, identity.id]
      );
      if (!own.rows.length) {
        return { statusCode: 403, body: { error: 'curator_does_not_own_client' } };
      }
      const r = await conn.query(
        `SELECT COUNT(*)::int AS cnt FROM client_messages
         WHERE client_id = $1
           AND curator_id = $2
           AND sender_role = 'client'
           AND done_at IS NULL`,
        [clientId, identity.id]
      );
      return { statusCode: 200, body: { success: true, unread_count: r.rows[0]?.cnt || 0 } };
    }
    const r = await conn.query(
      `SELECT COUNT(*)::int AS cnt FROM client_messages
       WHERE curator_id = $1
         AND sender_role = 'client'
         AND done_at IS NULL`,
      [identity.id]
    );
    return { statusCode: 200, body: { success: true, unread_count: r.rows[0]?.cnt || 0 } };
  } finally {
    conn.release();
  }
}

async function handleTranscriptionConsent(identity, body, event) {
  if (event.httpMethod === 'GET') {
    return { statusCode: 200, body: await getTranscriptionConsent(identity) };
  }
  const granted = body?.granted !== false;
  trace('transcription.consent.set', {
    actor_role: identity.kind,
    actor_id: identity.id,
    granted,
    message_id: body?.message_id || null,
  });
  const result = await setTranscriptionConsent(identity, granted, event);
  if (!result.success) return { statusCode: 400, body: result };
  const enqueueResult = granted
    ? await enqueuePendingTranscriptionForMessage(identity, body?.message_id)
    : null;
  trace('transcription.consent.saved', {
    actor_role: identity.kind,
    actor_id: identity.id,
    granted,
    message_id: body?.message_id || null,
    enqueue: enqueueResult || null,
  });
  const consent = await getTranscriptionConsent(identity);
  return {
    statusCode: 200,
    body: {
      ...consent,
      ...(enqueueResult ? { transcription_enqueue: enqueueResult } : {}),
    },
  };
}

async function handleSetDone(identity, body) {
  if (identity.kind !== 'curator') {
    return { statusCode: 403, body: { error: 'curator_only' } };
  }
  const messageId = body?.message_id;
  if (!messageId || typeof messageId !== 'string') {
    return { statusCode: 400, body: { error: 'message_id_required' } };
  }
  if (typeof body?.desired_state !== 'boolean') {
    return { statusCode: 400, body: { error: 'desired_state_required' } };
  }
  const pool = getPool();
  const conn = await pool.connect();
  try {
    const r = await conn.query(
      `SELECT public.set_message_done_by_curator($1, $2, $3) AS result`,
      [identity.id, messageId, body.desired_state]
    );
    const result = r.rows[0]?.result || { success: false, error: 'rpc_no_result' };
    return { statusCode: rpcStatusCode(result), body: result };
  } finally {
    conn.release();
  }
}

module.exports._test = {
  validateAttachments,
  validateAttachmentOwnership,
  verifyAttachmentObjectsExist,
  isMessengerObjectPath,
  getAttachmentBaseUrl,
  sanitizeDiagnosticValue,
  rpcStatusCode,
  buildGenericMessagePush,
  canonicalizeJson,
  buildSendRequestFingerprint,
  handleSend,
  handleSetDone,
  handleSetAcked,
  buildAttachmentBadge,
  normalizeAttachmentType,
  normalizeMime,
  estimateSpeechKitCost,
  stripClientTranscriptFields,
  MAX_AUDIO_DURATION_MS,
  MAX_TRANSCRIPT_TEXT_LENGTH,
  VALID_TRANSCRIPT_STATUSES,
};

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

  // Все endpoints требуют auth (JWT, legacy LS-Bearer или HttpOnly cookie)
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
      case 'delete':
        res = await handleDelete(identity, body);
        break;
      case 'edit':
        res = await handleEdit(identity, body);
        break;
      case 'toggle-done':
        res = { statusCode: 410, body: { error: 'use_set_done' } };
        break;
      case 'set-done':
        res = await handleSetDone(identity, body);
        break;
      case 'unread-count':
        res = await handleUnreadCount(identity, query);
        break;
      case 'toggle-acked':
        res = { statusCode: 410, body: { error: 'use_set_acked' } };
        break;
      case 'set-acked':
        res = await handleSetAcked(identity, body);
        break;
      case 'transcription-consent':
        res = await handleTranscriptionConsent(identity, body, event);
        break;
      default:
        res = { statusCode: 404, body: { error: 'unknown_action', action } };
    }
    return { statusCode: res.statusCode, headers: cors, body: JSON.stringify(res.body) };
  } catch (err) {
    console.error('[messages] handler error', { code: err?.code || 'unhandled' });
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: 'internal_error' }),
    };
  }
};
