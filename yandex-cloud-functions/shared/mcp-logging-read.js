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

/**
 * Фильтр ловит строку и в json_payload, и в message (см. mcp-telemetry.js).
 */
const CALL_FILTER = 'json_payload.t = "mcp_call" OR message: "mcp_call"';

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

function postJson(host, path, body, token, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({
      host,
      path,
      method: 'POST',
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
  getToken = getIamToken,
} = {}) {
  if (!logGroupId) throw new Error('logGroupId required');
  if (!since || !until) throw new Error('since and until required');

  const iam = token || await getToken({ timeoutMs: Math.min(timeoutMs, 5000) });
  const request = fetchPage || ((body) => postJson(
    LOGGING_READER_HOST,
    '/v1/read',
    body,
    iam,
    { timeoutMs },
  ));

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
  postJson,
  readMcpCalls,
  DEFAULT_MAX_PAGES,
  DEFAULT_TIMEOUT_MS,
};
