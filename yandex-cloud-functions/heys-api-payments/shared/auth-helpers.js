/**
 * HEYS Shared Auth Helpers
 *
 * Общие функции для проверки клиентских и кураторских сессий
 * в Yandex Cloud Functions.
 *
 * Хранение токенов: в client_sessions / curator_sessions колонка token_hash
 * содержит SHA256-digest от plain-токена. Никогда не храним plain.
 *
 * Usage:
 *   const { extractBearerToken, verifyClientSession } = require('../shared/auth-helpers');
 *
 *   const token = extractBearerToken(event);
 *   if (!token) return errorResponse(401, 'Auth required', 'NO_TOKEN');
 *
 *   const session = await verifyClientSession(client, token);
 *   if (!session) return errorResponse(401, 'Invalid session', 'INVALID_SESSION');
 *
 *   // session.client_id — UUID клиента
 */

/**
 * Извлекает клиентский session_token из заголовков event (Yandex Cloud Function format).
 * Поддерживает Authorization / authorization, legacy X-Session-Token и
 * HttpOnly cookie heys_session_token.
 *
 * @param {object} event — Yandex Cloud Function event
 * @returns {string|null} — plain токен или null если отсутствует/невалидный формат
 */
function extractBearerToken(event) {
  const headers = event?.headers || {};
  const raw =
    headers.Authorization ||
    headers.authorization ||
    headers['X-Session-Token'] ||
    headers['x-session-token'] ||
    null;

  if (raw && typeof raw === 'string') {
    const match = raw.match(/^Bearer\s+(.+)$/i);
    if (match) return match[1].trim();

    // Fallback: сырой токен в X-Session-Token (legacy)
    if (raw.length > 16 && !raw.includes(' ')) return raw.trim();
  }

  const cookieHeader = headers.cookie || headers.Cookie || '';
  if (typeof cookieHeader === 'string' && cookieHeader) {
    for (const part of cookieHeader.split(';')) {
      const eqIdx = part.indexOf('=');
      if (eqIdx <= 0) continue;
      if (part.slice(0, eqIdx).trim() !== 'heys_session_token') continue;
      const encoded = part.slice(eqIdx + 1).trim();
      if (!encoded) return null;
      let token = encoded;
      try {
        token = decodeURIComponent(encoded);
      } catch (_) {
        token = encoded;
      }
      if (token.length > 16 && !token.includes(' ')) return token;
      return null;
    }
  }

  return null;
}

function extractCookieToken(event, name) {
  const headers = event?.headers || {};
  const cookieHeader = headers.cookie || headers.Cookie || '';
  if (typeof cookieHeader !== 'string' || !cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx <= 0) continue;
    if (part.slice(0, eqIdx).trim() !== name) continue;
    const encoded = part.slice(eqIdx + 1).trim();
    if (!encoded) return null;
    try {
      return decodeURIComponent(encoded);
    } catch (_) {
      return encoded;
    }
  }
  return null;
}

function extractCuratorJwt(event) {
  const headers = event?.headers || {};
  const auth = headers.Authorization || headers.authorization || '';
  if (typeof auth === 'string') {
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (match) return match[1].trim();
  }
  return extractCookieToken(event, 'heys_curator_jwt');
}

/**
 * Валидирует клиентскую сессию по plain-токену.
 * SHA256-digest сравнивается с client_sessions.token_hash на стороне БД.
 *
 * @param {import('pg').PoolClient} client — DB-клиент из pool.connect()
 * @param {string} token — plain-токен из Authorization заголовка
 * @returns {Promise<{client_id: string} | null>} — client_id или null если сессия невалидна/истекла/отозвана
 */
async function verifyClientSession(client, token) {
  if (!token) return null;

  const result = await client.query(
    `SELECT client_id
     FROM client_sessions
     WHERE token_hash = digest($1, 'sha256')
       AND expires_at > NOW()
       AND revoked_at IS NULL
     LIMIT 1`,
    [token]
  );

  const clientId = result.rows?.[0]?.client_id;
  return clientId ? { client_id: clientId } : null;
}

/**
 * Валидирует кураторскую сессию по plain-токену.
 * Используется в админ-эндпоинтах (refund, и т.п.).
 *
 * @param {import('pg').PoolClient} client — DB-клиент из pool.connect()
 * @param {string} token — plain-токен куратора
 * @returns {Promise<{curator_id: string} | null>}
 */
async function verifyCuratorSession(client, token) {
  if (!token) return null;

  const result = await client.query(
    `SELECT curator_id
     FROM curator_sessions
     WHERE token_hash = digest($1, 'sha256')
       AND expires_at > NOW()
       AND revoked_at IS NULL
     LIMIT 1`,
    [token]
  );

  const curatorId = result.rows?.[0]?.curator_id;
  return curatorId ? { curator_id: curatorId } : null;
}

/**
 * Декодирует и проверяет HS256 JWT куратора. Использует тот же алгоритм,
 * что и [heys-api-auth/index.js:189-219].
 *
 * @param {string} token — JWT-токен (3 части через ".")
 * @param {string} jwtSecret — process.env.JWT_SECRET
 * @returns {{valid: true, payload: object} | {valid: false, error: string}}
 */
function verifyCuratorJwt(token, jwtSecret) {
  if (!token || !jwtSecret) {
    return { valid: false, error: 'missing-token-or-secret' };
  }

  const crypto = require('crypto');

  const base64UrlEncode = (buf) =>
    Buffer.from(buf).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const base64UrlDecode = (str) =>
    Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'malformed' };
    }
    const [headerB64, payloadB64, signature] = parts;

    const expectedSig = crypto
      .createHmac('sha256', jwtSecret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    // timing-safe сравнение
    const a = Buffer.from(signature, 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { valid: false, error: 'invalid-signature' };
    }

    const payload = JSON.parse(base64UrlDecode(payloadB64));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return { valid: false, error: 'expired' };
    }

    return { valid: true, payload };
  } catch (e) {
    return { valid: false, error: e.message || 'parse-error' };
  }
}

module.exports = {
  extractBearerToken,
  extractCookieToken,
  extractCuratorJwt,
  verifyClientSession,
  verifyCuratorSession,
  verifyCuratorJwt,
};
