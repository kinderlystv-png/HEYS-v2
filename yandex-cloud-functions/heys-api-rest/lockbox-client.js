/**
 * Yandex Lockbox client — чтение секретов из Lockbox внутри Cloud Function.
 *
 * Получает IAM-токен через metadata endpoint функции (привязанной к SA),
 * далее берёт payload секрета по его ID. Все значения кешируются в памяти
 * runtime'а на CACHE_TTL_MS, чтобы не дёргать Lockbox API на каждый запрос.
 *
 * Использование:
 *   const { getSecret } = require('./shared/lockbox-client');
 *   const secrets = await getSecret(process.env.LOCKBOX_APP_SECRET_ID);
 *   const token = secrets.TELEGRAM_CLIENT_BOT_TOKEN;
 *
 * Если Lockbox недоступен (нет SA, нет permission, нет network) — getSecret
 * возвращает null. Вызывающий код должен иметь fallback на process.env.
 */

const http = require('http');
const https = require('https');

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // secretId -> { data, expiresAt }

function fetchJson(transport, options) {
  return new Promise((resolve, reject) => {
    const req = transport.get(options, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}: ${chunks.slice(0, 200)}`));
          return;
        }
        try {
          resolve(JSON.parse(chunks));
        } catch (e) {
          reject(new Error(`Invalid JSON from ${options.hostname}: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(3000, () => req.destroy(new Error('Request timeout')));
  });
}

async function getIamToken() {
  // YC metadata server слушает HTTP на порту 80 (а не HTTPS:443).
  // Header 'Metadata-Flavor: Google' — совместимость с GCP metadata.
  const meta = await fetchJson(http, {
    host: '169.254.169.254',
    port: 80,
    path: '/computeMetadata/v1/instance/service-accounts/default/token',
    headers: { 'Metadata-Flavor': 'Google' },
  });
  if (!meta || !meta.access_token) {
    throw new Error('No access_token in metadata response');
  }
  return meta.access_token;
}

async function fetchSecretPayload(secretId, iamToken) {
  // Сам Lockbox API — HTTPS.
  return fetchJson(https, {
    hostname: 'payload.lockbox.api.cloud.yandex.net',
    path: `/lockbox/v1/secrets/${encodeURIComponent(secretId)}/payload`,
    headers: { Authorization: `Bearer ${iamToken}` },
  });
}

/**
 * Возвращает объект { KEY: value, ... } из Lockbox secret или null при ошибке.
 */
async function getSecret(secretId) {
  if (!secretId) return null;

  const cached = cache.get(secretId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    const iamToken = await getIamToken();
    const payload = await fetchSecretPayload(secretId, iamToken);
    const data = {};
    for (const entry of payload.entries || []) {
      data[entry.key] = entry.textValue !== undefined
        ? entry.textValue
        : entry.binaryValue;
    }
    cache.set(secretId, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return data;
  } catch (err) {
    console.error('[lockbox] Failed to load secret', secretId, '-', err.message);
    return null;
  }
}

function clearCache() {
  cache.clear();
}

module.exports = { getSecret, clearCache };
