'use strict';

const dns = require('node:dns');
const https = require('node:https');

const DEFAULT_TELEGRAM_REQUEST_TIMEOUT_MS = 15000;
const TELEGRAM_API_FALLBACK_IPV4 = '149.154.167.220';
const TELEGRAM_CONNECT_ATTEMPT_TIMEOUT_MS = 250;
const MAX_TELEGRAM_RESPONSE_BYTES = 5 * 1024 * 1024;

function getTelegramRequestTimeoutMs() {
  const value = Number(process.env.TELEGRAM_REQUEST_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TELEGRAM_REQUEST_TIMEOUT_MS;
}

function createTelegramLookup(lookupImpl = dns.lookup) {
  return (hostname, lookupOptions, callback) => {
    const useResolvedAddresses = (error, resolved = []) => {
      const source = Array.isArray(resolved) ? resolved : [resolved];
      const addresses = [];
      const seen = new Set();

      for (const entry of source) {
        if (!entry || typeof entry.address !== 'string' || ![4, 6].includes(entry.family)) continue;
        const key = `${entry.family}:${entry.address}`;
        if (seen.has(key)) continue;
        seen.add(key);
        addresses.push({ address: entry.address, family: entry.family });
      }

      if (!seen.has(`4:${TELEGRAM_API_FALLBACK_IPV4}`)) {
        addresses.push({ address: TELEGRAM_API_FALLBACK_IPV4, family: 4 });
      }
      if (error) {
        console.warn('[Maintenance] Telegram DNS lookup failed; using TLS-verified fallback', {
          code: error.code || null,
        });
      }

      process.nextTick(() => {
        if (lookupOptions?.all) callback(null, addresses);
        else callback(null, addresses[0].address, addresses[0].family);
      });
    };

    try {
      lookupImpl(hostname, { all: true, verbatim: true }, useResolvedAddresses);
    } catch (error) {
      useResolvedAddresses(error);
    }
  };
}

function fetchTelegramWithDnsFallback(
  url,
  options = {},
  timeoutMs = getTelegramRequestTimeoutMs(),
  requestImpl = https.request,
  lookupImpl = dns.lookup,
) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    if (target.protocol !== 'https:' || target.hostname !== 'api.telegram.org') {
      reject(new Error('Telegram fallback only supports https://api.telegram.org'));
      return;
    }

    let settled = false;
    let responseBytes = 0;
    let timer = null;
    const chunks = [];
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };

    const request = requestImpl({
      protocol: 'https:',
      hostname: target.hostname,
      servername: target.hostname,
      port: target.port || 443,
      path: `${target.pathname}${target.search}`,
      method: options.method || 'GET',
      headers: options.headers || {},
      rejectUnauthorized: true,
      autoSelectFamily: true,
      autoSelectFamilyAttemptTimeout: TELEGRAM_CONNECT_ATTEMPT_TIMEOUT_MS,
      lookup: createTelegramLookup(lookupImpl),
    }, (response) => {
      response.on('data', (chunk) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        responseBytes += buffer.length;
        if (responseBytes > MAX_TELEGRAM_RESPONSE_BYTES) {
          request.destroy(new Error('Telegram fallback response is too large'));
          return;
        }
        chunks.push(buffer);
      });
      response.on('end', () => {
        const status = response.statusCode || 0;
        const body = Buffer.concat(chunks).toString('utf8');
        finish(resolve, {
          ok: status >= 200 && status < 300,
          status,
          json: async () => JSON.parse(body),
          text: async () => body,
        });
      });
      response.on('error', (error) => finish(reject, error));
    });

    request.on('error', (error) => finish(reject, error));
    timer = setTimeout(() => {
      const error = new Error('Telegram request timed out');
      error.name = 'AbortError';
      request.destroy(error);
    }, timeoutMs);

    if (options.body !== undefined && options.body !== null) {
      request.write(options.body);
    }
    request.end();
  });
}

module.exports = {
  TELEGRAM_API_FALLBACK_IPV4,
  TELEGRAM_CONNECT_ATTEMPT_TIMEOUT_MS,
  createTelegramLookup,
  fetchTelegramWithDnsFallback,
  getTelegramRequestTimeoutMs,
};
