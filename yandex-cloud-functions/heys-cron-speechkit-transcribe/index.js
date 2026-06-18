/**
 * heys-cron-speechkit-transcribe — async Yandex SpeechKit STT worker.
 *
 * Polls message_transcription_jobs:
 *   queued      → start longRunningRecognize → processing
 *   processing  → poll operation             → ready/failed
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { initSecrets } = require('./shared/secrets');

const DEFAULT_BUCKET = 'heys-photos';
const DEFAULT_LIMIT = 5;
const DEFAULT_START_MAX_ATTEMPTS = 3;
const DEFAULT_PROCESSING_LEASE_SECONDS = 45;
const DEFAULT_OPERATION_TIMEOUT_MINUTES = 30;
const DEFAULT_SPEECHKIT_FETCH_TIMEOUT_MS = 15000;
const SPEECHKIT_RECOGNIZE_URL = 'https://transcribe.api.cloud.yandex.net/speech/stt/v2/longRunningRecognize';
const OPERATION_URL = 'https://operation.api.cloud.yandex.net/operations/';

let pool = null;
let cachedIamToken = null;
let cachedIamTokenExpiresAt = 0;

function trace(event, details = {}) {
  try {
    console.log('[speechkit.trace]', JSON.stringify({
      event,
      ts: new Date().toISOString(),
      ...details,
    }));
  } catch (_) {
    console.log('[speechkit.trace]', event);
  }
}

function loadCACert() {
  const paths = [
    path.join(__dirname, 'certs', 'root.crt'),
    path.join(process.cwd(), 'certs', 'root.crt'),
  ];
  for (const certPath of paths) {
    if (fs.existsSync(certPath)) return fs.readFileSync(certPath, 'utf8');
  }
  return null;
}

function getPool() {
  if (!pool) {
    const ca = loadCACert();
    pool = new Pool({
      host: process.env.PG_HOST,
      port: parseInt(process.env.PG_PORT || '6432', 10),
      database: process.env.PG_DATABASE,
      user: process.env.PG_USER,
      password: process.env.PG_PASSWORD,
      ssl: ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true },
      max: 2,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
      query_timeout: 15000,
      allowExitOnIdle: true,
    });
  }
  return pool;
}

class SpeechkitHttpError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'SpeechkitHttpError';
    this.status = status;
  }
}

function envInt(name, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const value = parseInt(process.env[name] || '', 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

async function getMetadataIamToken() {
  const now = Date.now();
  if (cachedIamToken && cachedIamTokenExpiresAt > now + 60_000) {
    return cachedIamToken;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch('http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token', {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: controller.signal,
    });
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (_) { /* keep text */ }
    if (!response.ok) {
      throw new Error(json?.message || json?.error || text || `metadata HTTP ${response.status}`);
    }
    if (!json?.access_token) {
      throw new Error('metadata access_token missing');
    }
    const expiresIn = Number(json.expires_in || 0);
    cachedIamToken = json.access_token;
    cachedIamTokenExpiresAt = now + Math.max(60, expiresIn - 60) * 1000;
    trace('auth.metadata_token_ok', { expires_in: expiresIn || null });
    return cachedIamToken;
  } catch (error) {
    throw new Error(`speechkit_auth_missing: ${error.message || error}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function getAuthHeaders() {
  const apiKey = process.env.SPEECHKIT_API_KEY || process.env.YC_SPEECHKIT_KEY;
  const iamToken = process.env.SPEECHKIT_IAM_TOKEN || process.env.YC_IAM_TOKEN;
  if (apiKey) return { Authorization: `Api-Key ${apiKey}` };
  if (iamToken) return { Authorization: `Bearer ${iamToken}` };
  return { Authorization: `Bearer ${await getMetadataIamToken()}` };
}

function getFolderId() {
  const folderId = process.env.SPEECHKIT_FOLDER_ID || process.env.YC_FOLDER_ID;
  if (!folderId) throw new Error('speechkit_folder_missing');
  return folderId;
}

function objectUri(key) {
  const bucket = process.env.S3_PHOTOS_BUCKET || DEFAULT_BUCKET;
  return `https://storage.yandexcloud.net/${bucket}/${String(key || '').replace(/^\/+/, '')}`;
}

function speechkitEncodingForMime(mime) {
  const clean = String(mime || '').split(';')[0].trim().toLowerCase();
  if (clean === 'audio/wav' || clean === 'audio/x-wav') {
    return { audioEncoding: 'LINEAR16_PCM', sampleRateHertz: 16000 };
  }
  return { audioEncoding: 'OGG_OPUS' };
}

function buildRecognitionPayload(job) {
  const encoding = speechkitEncodingForMime(job.mime);
  return {
    config: {
      folderId: getFolderId(),
      specification: {
        languageCode: 'ru-RU',
        model: process.env.SPEECHKIT_MODEL || 'general',
        profanityFilter: false,
        literature_text: false,
        ...encoding,
      },
    },
    audio: {
      uri: objectUri(job.attachment_path),
    },
  };
}

async function speechkitFetch(url, body) {
  const authHeaders = await getAuthHeaders();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    envInt('SPEECHKIT_FETCH_TIMEOUT_MS', DEFAULT_SPEECHKIT_FETCH_TIMEOUT_MS, 1000, 60000),
  );
  let response;
  try {
    response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new SpeechkitHttpError('speechkit_fetch_timeout', 408);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) { /* keep text */ }
  if (!response.ok) {
    const message = json?.message || json?.error || text || `SpeechKit HTTP ${response.status}`;
    throw new SpeechkitHttpError(message, response.status);
  }
  return json || {};
}

function isTransientSpeechkitError(err) {
  const status = Number(err?.status || err?.statusCode || 0);
  if (status === 408 || status === 409 || status === 425 || status === 429 || status >= 500) return true;
  const msg = String(err?.message || err || '').toLowerCase();
  return [
    'fetch failed',
    'network',
    'timeout',
    'timed out',
    'econnreset',
    'etimedout',
    'socket hang up',
    'temporarily unavailable',
    'rate limit',
  ].some((needle) => msg.includes(needle));
}

async function startRecognition(job) {
  const body = buildRecognitionPayload(job);
  trace('recognize.start', {
    job_id: job.id,
    message_id: job.message_id,
    attachment_path: job.attachment_path,
    actor_role: job.actor_role,
    client_id: job.client_id,
    curator_id: job.curator_id,
    mime: job.mime,
    duration_ms: job.duration_ms,
    encoding: body.config?.specification?.audioEncoding,
    sample_rate_hertz: body.config?.specification?.sampleRateHertz || null,
  });
  const result = await speechkitFetch(SPEECHKIT_RECOGNIZE_URL, body);
  if (!result.id) throw new Error('speechkit_operation_id_missing');
  trace('recognize.operation_created', {
    job_id: job.id,
    message_id: job.message_id,
    operation_id: result.id,
  });
  return result.id;
}

async function pollOperation(operationId) {
  return speechkitFetch(OPERATION_URL + encodeURIComponent(operationId));
}

function extractTranscript(operation) {
  const response = operation?.response || operation;
  const chunks = response?.chunks || response?.results || [];
  const parts = [];
  for (const chunk of chunks) {
    const alternatives = chunk.alternatives || chunk.channelTag?.alternatives || [];
    const best = alternatives[0];
    const text = best?.text || best?.transcript || chunk.text || '';
    if (text) parts.push(String(text).trim());
  }
  return parts.filter(Boolean).join(' ').trim();
}

async function updateJob(id, fields) {
  const sets = [];
  const values = [];
  let i = 1;
  for (const [key, value] of Object.entries(fields)) {
    sets.push(`${key} = $${i++}`);
    values.push(value);
  }
  sets.push('updated_at = NOW()');
  values.push(id);
  await getPool().query(
    `UPDATE message_transcription_jobs SET ${sets.join(', ')} WHERE id = $${i}`,
    values,
  );
}

async function setAttachmentTranscript(job, status, text = null, error = null) {
  await getPool().query(
    `SELECT public.set_message_attachment_transcript($1, $2, $3, $4, $5, $6)`,
    [job.message_id, job.attachment_path, status, text, 'yandex_speechkit', error],
  );
}

async function claimQueued(limit) {
  const r = await getPool().query(
    `SELECT public.claim_message_transcription_jobs($1) AS result`,
    [limit],
  );
  return r.rows[0]?.result?.jobs || [];
}

async function fetchProcessing(limit) {
  const leaseSeconds = envInt(
    'SPEECHKIT_PROCESSING_LEASE_SECONDS',
    DEFAULT_PROCESSING_LEASE_SECONDS,
    10,
    300,
  );
  const r = await getPool().query(
    `WITH picked AS (
       SELECT id
         FROM message_transcription_jobs
        WHERE status = 'processing'
          AND operation_id IS NOT NULL
          AND updated_at < NOW() - ($2::text)::interval
        ORDER BY updated_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE message_transcription_jobs j
        SET updated_at = NOW()
       FROM picked
      WHERE j.id = picked.id
      RETURNING j.*`,
    [limit, `${leaseSeconds} seconds`],
  );
  return r.rows;
}

async function requeueStaleStartingJobs() {
  const r = await getPool().query(
    `UPDATE message_transcription_jobs
        SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'queued' END,
            error = CASE WHEN attempts >= 3 THEN 'speechkit_start_timeout' ELSE error END,
            completed_at = CASE WHEN attempts >= 3 THEN NOW() ELSE completed_at END,
            updated_at = NOW()
      WHERE status = 'processing'
        AND operation_id IS NULL
        AND updated_at < NOW() - INTERVAL '10 minutes'
      RETURNING id, message_id, attachment_path, status, error`,
  );
  for (const job of r.rows) {
    if (job.status === 'failed') await setAttachmentTranscript(job, 'failed', null, job.error);
    trace('job.requeued_or_failed_stale', {
      job_id: job.id,
      message_id: job.message_id,
      attachment_path: job.attachment_path,
      status: job.status,
      error: job.error || null,
    });
  }
  return r.rows.length;
}

async function failExpiredProcessingJobs() {
  const timeoutMinutes = envInt(
    'SPEECHKIT_OPERATION_TIMEOUT_MINUTES',
    DEFAULT_OPERATION_TIMEOUT_MINUTES,
    5,
    24 * 60,
  );
  const r = await getPool().query(
    `UPDATE message_transcription_jobs
        SET status = 'failed',
            error = 'speechkit_operation_timeout',
            completed_at = NOW(),
            updated_at = NOW()
      WHERE status = 'processing'
        AND operation_id IS NOT NULL
        AND COALESCE(started_at, created_at) < NOW() - ($1::text)::interval
      RETURNING id, message_id, attachment_path, operation_id, error`,
    [`${timeoutMinutes} minutes`],
  );
  for (const job of r.rows) {
    await setAttachmentTranscript(job, 'failed', null, job.error);
    trace('job.failed_expired_processing', {
      job_id: job.id,
      message_id: job.message_id,
      attachment_path: job.attachment_path,
      operation_id: job.operation_id,
      timeout_minutes: timeoutMinutes,
    });
  }
  return r.rows.length;
}

async function processStart(job) {
  try {
    const operationId = await startRecognition(job);
    await updateJob(job.id, {
      operation_id: operationId,
      status: 'processing',
      started_at: new Date().toISOString(),
      error: null,
    });
    trace('job.processing', {
      job_id: job.id,
      message_id: job.message_id,
      attachment_path: job.attachment_path,
      operation_id: operationId,
    });
    return { id: job.id, started: true, operation_id: operationId };
  } catch (err) {
    const msg = String(err?.message || err).slice(0, 500);
    const attempts = Number(job.attempts || 0);
    const maxAttempts = envInt('SPEECHKIT_START_MAX_ATTEMPTS', DEFAULT_START_MAX_ATTEMPTS, 1, 10);
    if (isTransientSpeechkitError(err) && attempts < maxAttempts) {
      await updateJob(job.id, {
        status: 'queued',
        operation_id: null,
        error: msg,
      });
      trace('job.start_retry_queued', {
        job_id: job.id,
        message_id: job.message_id,
        attachment_path: job.attachment_path,
        mime: job.mime,
        attempts,
        max_attempts: maxAttempts,
        error: msg,
      });
      return { id: job.id, started: false, retry: true, attempts, error: msg };
    }
    await updateJob(job.id, {
      status: 'failed',
      error: msg,
      completed_at: new Date().toISOString(),
    });
    await setAttachmentTranscript(job, 'failed', null, msg);
    trace('job.start_failed', {
      job_id: job.id,
      message_id: job.message_id,
      attachment_path: job.attachment_path,
      mime: job.mime,
      error: msg,
    });
    return { id: job.id, started: false, error: msg };
  }
}

async function processPoll(job) {
  try {
    const operation = await pollOperation(job.operation_id);
    if (!operation.done) {
      trace('operation.pending', {
        job_id: job.id,
        message_id: job.message_id,
        operation_id: job.operation_id,
      });
      return { id: job.id, done: false };
    }
    if (operation.error) {
      const msg = String(operation.error.message || operation.error.code || 'speechkit_failed').slice(0, 500);
      await updateJob(job.id, { status: 'failed', error: msg, completed_at: new Date().toISOString() });
      await setAttachmentTranscript(job, 'failed', null, msg);
      trace('operation.failed', {
        job_id: job.id,
        message_id: job.message_id,
        operation_id: job.operation_id,
        error: msg,
      });
      return { id: job.id, done: true, status: 'failed', error: msg };
    }
    const transcript = extractTranscript(operation);
    if (!transcript) {
      await updateJob(job.id, { status: 'failed', error: 'empty_transcript', completed_at: new Date().toISOString() });
      await setAttachmentTranscript(job, 'failed', null, 'empty_transcript');
      trace('operation.empty_transcript', {
        job_id: job.id,
        message_id: job.message_id,
        operation_id: job.operation_id,
      });
      return { id: job.id, done: true, status: 'failed', error: 'empty_transcript' };
    }
    await updateJob(job.id, { status: 'ready', error: null, completed_at: new Date().toISOString() });
    await setAttachmentTranscript(job, 'ready', transcript.slice(0, 4000), null);
    trace('operation.ready', {
      job_id: job.id,
      message_id: job.message_id,
      operation_id: job.operation_id,
      chars: transcript.length,
    });
    return { id: job.id, done: true, status: 'ready', chars: transcript.length };
  } catch (err) {
    const msg = String(err?.message || err).slice(0, 500);
    await updateJob(job.id, { error: msg });
    trace('operation.poll_error', {
      job_id: job.id,
      message_id: job.message_id,
      operation_id: job.operation_id,
      error: msg,
    });
    return { id: job.id, done: false, error: msg };
  }
}

module.exports.handler = async function () {
  await initSecrets();
  const limit = Math.min(parseInt(process.env.SPEECHKIT_WORKER_LIMIT || DEFAULT_LIMIT, 10) || DEFAULT_LIMIT, 20);
  const requeued = await requeueStaleStartingJobs();
  const expired = await failExpiredProcessingJobs();
  const claimed = await claimQueued(limit);
  trace('worker.claimed', {
    limit,
    requeued,
    expired,
    claimed: claimed.length,
    jobs: claimed.map((job) => ({
      job_id: job.id,
      message_id: job.message_id,
      attachment_path: job.attachment_path,
      mime: job.mime,
      duration_ms: job.duration_ms,
      attempts: job.attempts,
    })),
  });
  const started = [];
  for (const job of claimed) started.push(await processStart(job));

  const processing = await fetchProcessing(limit);
  trace('worker.processing_loaded', {
    limit,
    processing: processing.length,
    jobs: processing.map((job) => ({
      job_id: job.id,
      message_id: job.message_id,
      operation_id: job.operation_id,
    })),
  });
  const polled = [];
  for (const job of processing) polled.push(await processPoll(job));

  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      requeued,
      expired,
      claimed: claimed.length,
      started,
      polled,
    }),
  };
};

module.exports._test = {
  extractTranscript,
  buildRecognitionPayload,
  speechkitEncodingForMime,
  estimateObjectUri: objectUri,
  isTransientSpeechkitError,
};
