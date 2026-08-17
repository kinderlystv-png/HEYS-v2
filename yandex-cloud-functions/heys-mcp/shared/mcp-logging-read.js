'use strict';

/**
 * Чтение строк `mcp_call` из Yandex Cloud Logging.
 *
 * Канонический модуль: deploy-all.sh копирует в heys-mcp/shared и
 * heys-maintenance/shared перед упаковкой функции.
 */

const http = require('node:http');
const https = require('node:https');

const LOGGING_READER_HOST = 'reader.logging.yandexcloud.net';
const METADATA_HOST = '169.254.169.254';
const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_MAX_PAGES = 10;
const DEFAULT_TIMEOUT_MS = 20000;
const MAX_READ_ATTEMPTS = 3;
const MAX_TOKEN_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 400;

const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 4 });

/**
 * Фильтр ловит строку и в json_payload, и в message (см. mcp-telemetry.js).
 */
const CALL_FILTER = 'json_payload.t = "mcp_call" OR message: "mcp_call"';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableNetworkError(err) {
  if (!err) return false;
  const msg = String(err.message || err);
  const code = err.code;
  return code === 'ECONNRESET'
    || code === 'ECONNREFUSED'
    || code === 'ETIMEDOUT'
    || code === 'EPIPE'
    || code === 'EAI_AGAIN'
    || /socket hang up/i.test(msg)
    || /Logging read timeout/i.test(msg)
    || /Metadata timeout/i.test(msg);
}

function isAuthError(err) {
  return /HTTP 401\b/.test(String(err && err.message ? err.message : err));
}

function getIamToken({ timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get({
      host: METADATA_HOST,
      port: 80,
      path: '/computeMetadata/v1/instance/service-accounts/default/token',
      headers: { 'Metadata-Flavor': 'Google' },
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(chunks);
          if (!parsed || !parsed.access_token) reject(new Error('No access_token from metadata'));
          else resolve(parsed.access_token);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Metadata timeout')));
  });
}

async function getIamTokenWithRetry({ timeoutMs = 5000 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_TOKEN_ATTEMPTS; attempt += 1) {
    try {
      return await getIamToken({ timeoutMs });
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_TOKEN_ATTEMPTS && isRetryableNetworkError(err)) {
        console.warn('[mcp-logging-read] IAM token attempt', attempt, 'failed:', err.message, '— retrying');
        await sleep(RETRY_BASE_DELAY_MS * attempt);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

function postJson(host, path, body, token, { timeoutMs = DEFAULT_TIMEOUT_MS, agent = httpsAgent } = {}) {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({
      host,
      path,
      method: 'POST',
      agent,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        Authorization: `Bearer ${token}`,
      },
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Logging read failed: HTTP ${res.statusCode} ${chunks.slice(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(chunks)); }
        catch (e) { reject(new Error(`Invalid JSON from Logging: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Logging read timeout')));
    req.write(payload);
    req.end();
  });
}

async function readLoggingPage(body, iamRef, { timeoutMs, getToken, postJsonImpl = postJson } = {}) {
  let authRetried = false;
  let lastErr;

  for (let attempt = 1; attempt <= MAX_READ_ATTEMPTS; attempt += 1) {
    try {
      return await postJsonImpl(
        LOGGING_READER_HOST,
        '/v1/read',
        body,
        iamRef.token,
        { timeoutMs },
      );
    } catch (err) {
      lastErr = err;
      if (!authRetried && isAuthError(err)) {
        authRetried = true;
        iamRef.token = await getToken({ timeoutMs: Math.min(timeoutMs, 5000) });
        continue;
      }
      if (attempt < MAX_READ_ATTEMPTS && isRetryableNetworkError(err)) {
        console.warn(
          '[mcp-logging-read] Logging read attempt',
          attempt,
          'failed:',
          err.message,
          '— retrying',
        );
        await sleep(RETRY_BASE_DELAY_MS * attempt);
        continue;
      }
      throw err;
    }
  }

  throw lastErr;
}

function extractRecord(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const payload = entry.jsonPayload || entry.json_payload;
  if (payload && payload.t === 'mcp_call') return payload;
  const raw = entry.message;
  if (typeof raw === 'string' && raw.includes('"mcp_call"')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.t === 'mcp_call') return parsed;
    } catch (_) { /* не наша строка */ }
    const start = raw.indexOf('{"t":"mcp_call"');
    if (start >= 0) {
      try {
        const parsed = JSON.parse(raw.slice(start));
        if (parsed && parsed.t === 'mcp_call') return parsed;
      } catch (_) { /* битая строка */ }
    }
  }
  return null;
}

/**
 * Читает mcp_call в узком окне since/until (ISO).
 */
async function readMcpCalls({
  logGroupId,
  since,
  until,
  token,
  maxPages = DEFAULT_MAX_PAGES,
  pageSize = DEFAULT_PAGE_SIZE,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchPage = null,
  getToken = getIamTokenWithRetry,
} = {}) {
  if (!logGroupId) throw new Error('logGroupId required');
  if (!since || !until) throw new Error('since and until required');

  const iamRef = { token: token || await getToken({ timeoutMs: Math.min(timeoutMs, 5000) }) };
  const request = fetchPage || ((body) => readLoggingPage(body, iamRef, { timeoutMs, getToken }));

  const records = [];
  let pageToken;
  let pages = 0;

  do {
    const body = {
      logGroupId,
      criteria: {
        logGroupId,
        since,
        until,
        pageSize,
        filter: CALL_FILTER,
      },
    };
    if (pageToken) body.pageToken = pageToken;

    const page = await request(body);
    for (const entry of (page && page.entries) || []) {
      const rec = extractRecord(entry);
      if (rec) records.push(rec);
    }
    pageToken = page && page.nextPageToken;
    pages += 1;
  } while (pageToken && pages < maxPages);

  return { records, pages, truncated: Boolean(pageToken) };
}

module.exports = {
  CALL_FILTER,
  extractRecord,
  getIamToken,
  getIamTokenWithRetry,
  isRetryableNetworkError,
  postJson,
  readMcpCalls,
  readLoggingPage,
  DEFAULT_MAX_PAGES,
  DEFAULT_TIMEOUT_MS,
  MAX_READ_ATTEMPTS,
};
