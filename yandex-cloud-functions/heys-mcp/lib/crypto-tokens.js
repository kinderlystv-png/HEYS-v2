'use strict';

/**
 * Stateless token primitives for heys-mcp.
 *
 * Почему stateless: OAuth-состояние (DCR-клиент, auth code, access/refresh)
 * живёт в подписанных токенах, а не в таблицах. Это убирает миграцию БД,
 * pg-подключение и лишнюю нагрузку на пул (max 3 соединения на serverless).
 *
 * Kill switch серверный только для КЛИЕНТСКИХ токенов: там внутри зашифрован
 * HEYS client-session token, и `revoke_session` мгновенно обрывает доступ
 * агента. Для кураторских токенов внутри лежит stateless JWT — мгновенного
 * отзыва нет; продление останавливает `curators.is_active = false`
 * (см. SEC-031 в lib/oauth.js). Не считать эту строку гарантией для обеих ролей.
 */

const crypto = require('node:crypto');

const KEY_INFO = {
  sign: 'heys-mcp/v1/sign',
  encrypt: 'heys-mcp/v1/encrypt',
};

/** HKDF-SHA256 без внешних зависимостей: доменное разделение одного секрета. */
function deriveKey(secret, info, length = 32) {
  if (!secret || typeof secret !== 'string') {
    throw new Error('token_secret_missing');
  }
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.alloc(0), Buffer.from(info, 'utf8'), length));
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return Buffer.from(String(str).replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Компактный JWS (HS256). Свой, а не библиотека — нужен один алгоритм,
 * а cloud function держим без внешних зависимостей.
 */
function signToken(payload, secret, { ttlSeconds, typ, nowMs = Date.now() }) {
  const key = deriveKey(secret, KEY_INFO.sign);
  const iat = Math.floor(nowMs / 1000);
  const body = { ...payload, typ, iat, exp: iat + ttlSeconds };
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify(body));
  const data = `${header}.${claims}`;
  const sig = b64url(crypto.createHmac('sha256', key).update(data).digest());
  return `${data}.${sig}`;
}

function verifyToken(token, secret, { typ, nowMs = Date.now() } = {}) {
  if (!token || typeof token !== 'string') return { ok: false, error: 'missing_token' };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, error: 'malformed_token' };
  const key = deriveKey(secret, KEY_INFO.sign);
  const data = `${parts[0]}.${parts[1]}`;
  const expected = b64url(crypto.createHmac('sha256', key).update(data).digest());
  if (!timingSafeEqualStr(expected, parts[2])) return { ok: false, error: 'bad_signature' };

  let claims;
  try {
    claims = JSON.parse(b64urlDecode(parts[1]).toString('utf8'));
  } catch (_) {
    return { ok: false, error: 'malformed_claims' };
  }
  if (typ && claims.typ !== typ) return { ok: false, error: 'wrong_token_type' };
  if (!Number.isFinite(claims.exp) || claims.exp * 1000 <= nowMs) return { ok: false, error: 'token_expired' };
  return { ok: true, claims };
}

/**
 * AES-256-GCM для session-токена внутри access-токена: даже если JWT попадёт
 * в лог целиком, 30-дневный HEYS session token из него не читается.
 */
function encryptSecret(plaintext, secret) {
  const key = deriveKey(secret, KEY_INFO.encrypt);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return `${b64url(iv)}.${b64url(enc)}.${b64url(cipher.getAuthTag())}`;
}

function decryptSecret(payload, secret) {
  if (!payload || typeof payload !== 'string') throw new Error('cipher_missing');
  const [ivPart, dataPart, tagPart] = payload.split('.');
  if (!ivPart || !dataPart || !tagPart) throw new Error('cipher_malformed');
  const key = deriveKey(secret, KEY_INFO.encrypt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, b64urlDecode(ivPart));
  decipher.setAuthTag(b64urlDecode(tagPart));
  return Buffer.concat([decipher.update(b64urlDecode(dataPart)), decipher.final()]).toString('utf8');
}

/**
 * Стандартный JWT HS256 на СЫРОМ секрете — без HKDF.
 * Нужен ровно для одного: перевыпуска кураторского JWT при refresh.
 * heys-api-rpc проверяет кураторские токены сырым JWT_SECRET (verifyJwt),
 * поэтому подпись обязана совпадать с той, что делает heys-api-auth.
 */
function signRawJwt(payload, rawSecret, { ttlSeconds, nowMs = Date.now() }) {
  if (!rawSecret || typeof rawSecret !== 'string') throw new Error('raw_jwt_secret_missing');
  const iat = Math.floor(nowMs / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ ...payload, iat, exp: iat + ttlSeconds }));
  const data = `${header}.${claims}`;
  const sig = b64url(crypto.createHmac('sha256', Buffer.from(rawSecret, 'utf8')).update(data).digest());
  return `${data}.${sig}`;
}

/** Проверка сырого JWT — в проде не используется, только контроль совместимости в тестах. */
function verifyRawJwt(token, rawSecret, { nowMs = Date.now() } = {}) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return { ok: false, error: 'malformed_token' };
  const data = `${parts[0]}.${parts[1]}`;
  const expected = b64url(crypto.createHmac('sha256', Buffer.from(rawSecret, 'utf8')).update(data).digest());
  if (!timingSafeEqualStr(expected, parts[2])) return { ok: false, error: 'bad_signature' };
  let claims;
  try {
    claims = JSON.parse(b64urlDecode(parts[1]).toString('utf8'));
  } catch (_) {
    return { ok: false, error: 'malformed_claims' };
  }
  if (!Number.isFinite(claims.exp) || claims.exp * 1000 <= nowMs) return { ok: false, error: 'token_expired' };
  return { ok: true, claims };
}

/** PKCE S256 (RFC 7636). plain не поддерживаем — OAuth 2.1 его запрещает. */
function verifyPkce(codeVerifier, codeChallenge) {
  if (!codeVerifier || !codeChallenge) return false;
  if (codeVerifier.length < 43 || codeVerifier.length > 128) return false;
  const digest = b64url(crypto.createHash('sha256').update(codeVerifier, 'ascii').digest());
  return timingSafeEqualStr(digest, codeChallenge);
}

module.exports = {
  signToken,
  verifyToken,
  signRawJwt,
  verifyRawJwt,
  encryptSecret,
  decryptSecret,
  verifyPkce,
  b64url,
  b64urlDecode,
  timingSafeEqualStr,
};
