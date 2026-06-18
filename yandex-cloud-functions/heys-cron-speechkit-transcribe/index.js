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
const SPEECHKIT_RECOGNIZE_URL = 'https://transcribe.api.cloud.yandex.net/speech/stt/v2/longRunningRecognize';
const OPERATION_URL = 'https://operation.api.cloud.yandex.net/operations/';

let pool = null;

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

function getAuthHeaders() {
  const apiKey = process.env.SPEECHKIT_API_KEY || process.env.YC_SPEECHKIT_KEY;
  const iamToken = process.env.SPEECHKIT_IAM_TOKEN || process.env.YC_IAM_TOKEN;
  if (apiKey) return { Authorization: `Api-Key ${apiKey}` };
  if (iamToken) return { Authorization: `Bearer ${iamToken}` };
  throw new Error('speechkit_auth_missing');
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

function buildRecognitionPayload(job) {
  return {
    config: {
      folderId: getFolderId(),
      specification: {
        languageCode: 'ru-RU',
        model: process.env.SPEECHKIT_MODEL || 'general',
        profanityFilter: false,
        literature_text: false,
        audioEncoding: 'OGG_OPUS',
      },
    },
    audio: {
      uri: objectUri(job.attachment_path),
    },
  };
}

async function speechkitFetch(url, body) {
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) { /* keep text */ }
  if (!response.ok) {
    const message = json?.message || json?.error || text || `SpeechKit HTTP ${response.status}`;
    throw new Error(message);
  }
  return json || {};
}

async function startRecognition(job) {
  const body = buildRecognitionPayload(job);
  const result = await speechkitFetch(SPEECHKIT_RECOGNIZE_URL, body);
  if (!result.id) throw new Error('speechkit_operation_id_missing');
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
  const r = await getPool().query(
    `SELECT *
       FROM message_transcription_jobs
      WHERE status = 'processing'
        AND operation_id IS NOT NULL
      ORDER BY updated_at ASC
      LIMIT $1`,
    [limit],
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
  }
  return r.rows.length;
}

async function processStart(job) {
  try {
    const operationId = await startRecognition(job);
    await updateJob(job.id, { operation_id: operationId, status: 'processing' });
    return { id: job.id, started: true, operation_id: operationId };
  } catch (err) {
    const msg = String(err?.message || err).slice(0, 500);
    await updateJob(job.id, {
      status: 'failed',
      error: msg,
      completed_at: new Date().toISOString(),
    });
    await setAttachmentTranscript(job, 'failed', null, msg);
    return { id: job.id, started: false, error: msg };
  }
}

async function processPoll(job) {
  try {
    const operation = await pollOperation(job.operation_id);
    if (!operation.done) return { id: job.id, done: false };
    if (operation.error) {
      const msg = String(operation.error.message || operation.error.code || 'speechkit_failed').slice(0, 500);
      await updateJob(job.id, { status: 'failed', error: msg, completed_at: new Date().toISOString() });
      await setAttachmentTranscript(job, 'failed', null, msg);
      return { id: job.id, done: true, status: 'failed', error: msg };
    }
    const transcript = extractTranscript(operation);
    if (!transcript) {
      await updateJob(job.id, { status: 'failed', error: 'empty_transcript', completed_at: new Date().toISOString() });
      await setAttachmentTranscript(job, 'failed', null, 'empty_transcript');
      return { id: job.id, done: true, status: 'failed', error: 'empty_transcript' };
    }
    await updateJob(job.id, { status: 'ready', error: null, completed_at: new Date().toISOString() });
    await setAttachmentTranscript(job, 'ready', transcript.slice(0, 4000), null);
    return { id: job.id, done: true, status: 'ready', chars: transcript.length };
  } catch (err) {
    const msg = String(err?.message || err).slice(0, 500);
    await updateJob(job.id, { error: msg });
    return { id: job.id, done: false, error: msg };
  }
}

module.exports.handler = async function () {
  await initSecrets();
  const limit = Math.min(parseInt(process.env.SPEECHKIT_WORKER_LIMIT || DEFAULT_LIMIT, 10) || DEFAULT_LIMIT, 20);
  const requeued = await requeueStaleStartingJobs();
  const claimed = await claimQueued(limit);
  const started = [];
  for (const job of claimed) started.push(await processStart(job));

  const processing = await fetchProcessing(limit);
  const polled = [];
  for (const job of processing) polled.push(await processPoll(job));

  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      requeued,
      claimed: claimed.length,
      started,
      polled,
    }),
  };
};

module.exports._test = {
  extractTranscript,
  buildRecognitionPayload,
  estimateObjectUri: objectUri,
};
