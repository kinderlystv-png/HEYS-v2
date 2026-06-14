/**
 * heys-api-auth — Аутентификация кураторов
 * @version 2.2.0 — 2026-02-10: Добавлен LEFT JOIN с subscriptions для active_until в getClients
 * 
 * Endpoints:
 *   POST /auth/login — вход по email+password(+mfa_code), возвращает JWT
 *   POST /auth/verify — проверка JWT токена
 *   POST /auth/refresh — обновление токена (опционально)
 *   POST /auth/mfa/setup — выпуск TOTP-секрета для авторизованного куратора
 *   POST /auth/mfa/enable — включение TOTP после проверки кода
 *   POST /auth/mfa/disable — выключение TOTP после проверки кода
 *   GET  /auth/clients — список клиентов куратора (с subscription_status, trial_ends_at, active_until)
 * 
 * JWT payload: { sub: curator_id, email, role: 'curator', iat, exp }
 */

const { getPool } = require('./shared/db-pool');
const { initSecrets } = require('./shared/secrets');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 P0 SECURITY: JWT Secret — читаем ВНУТРИ handler каждый раз!
// Это защищает от stale env при деплое без перезапуска инстансов
// ═══════════════════════════════════════════════════════════════════════════
const JWT_EXPIRES_IN = 24 * 60 * 60; // 24 часа в секундах

// ═══════════════════════════════════════════════════════════════════════════
// 🛡️ Startup env validation — логируем проблемы сразу при cold start
// ═══════════════════════════════════════════════════════════════════════════
(function validateEnv() {
  const required = ['PG_PASSWORD', 'JWT_SECRET'];
  for (const key of required) {
    if (!process.env[key]) {
      console.error(`[HEYS.auth] ❌ FATAL: Missing required env: ${key}`);
    }
  }
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.error(`[HEYS.auth] ❌ JWT_SECRET too short (${process.env.JWT_SECRET.length} < 32)`);
  }
  if (!process.env.PG_HOST) {
    console.warn('[HEYS.auth] ⚠️ PG_HOST not set, using hardcoded default');
  }
})();

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 P0 SECURITY: CORS Whitelist (no wildcards!)
// ═══════════════════════════════════════════════════════════════════════════
const ALLOW_LOCALHOST_ORIGINS = process.env.ALLOW_LOCALHOST_ORIGINS === '1';
const ALLOWED_ORIGINS = new Set([
  'https://heyslab.ru',
  'https://www.heyslab.ru',
  'https://app.heyslab.ru',
  'https://heys-static.website.yandexcloud.net',
  'https://heys-v2-web.vercel.app',
  ...(ALLOW_LOCALHOST_ORIGINS ? [
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ] : []),
]);

/**
 * Возвращает CORS headers с проверкой origin.
 * Если origin не в whitelist — не ставим Access-Control-Allow-Origin.
 */
// ═══════════════════════════════════════════════════════════════════════════
// 🛡️ DB-level login rate limiting (brute-force protection)
// Per-IP: max 10 attempts / 15 min. Persisted in auth_rate_limits table so
// limits survive YC Function cold starts and work across parallel instances.
// Migration: database/2026-04-23_curator_login_rate_limits.sql
// ═══════════════════════════════════════════════════════════════════════════
const LOGIN_MAX_ATTEMPTS = 10;
const ACCOUNT_LOCK_MAX_ATTEMPTS = 10;
const ACCOUNT_LOCK_MINUTES = 15;
const TOTP_STEP_SECONDS = 30;
const TOTP_WINDOW_STEPS = 1;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

async function checkLoginRateLimit(ip) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT attempts, reset_at FROM auth_rate_limits WHERE ip = $1 AND reset_at > NOW()`,
      [ip]
    );
    if (res.rows.length === 0) return { allowed: true };
    const { attempts, reset_at } = res.rows[0];
    if (attempts >= LOGIN_MAX_ATTEMPTS) {
      const retryAfter = Math.max(1, Math.ceil((new Date(reset_at).getTime() - Date.now()) / 1000));
      return { allowed: false, retryAfter };
    }
    return { allowed: true };
  } finally {
    client.release();
  }
}

async function recordLoginAttempt(ip, success) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    if (success) {
      await client.query('DELETE FROM auth_rate_limits WHERE ip = $1', [ip]);
    } else {
      await client.query(`
        INSERT INTO auth_rate_limits(ip, attempts, reset_at)
        VALUES($1, 1, NOW() + INTERVAL '15 minutes')
        ON CONFLICT(ip) DO UPDATE SET
          attempts = CASE
            WHEN auth_rate_limits.reset_at <= NOW() THEN 1
            ELSE auth_rate_limits.attempts + 1
          END,
          reset_at = CASE
            WHEN auth_rate_limits.reset_at <= NOW() THEN NOW() + INTERVAL '15 minutes'
            ELSE auth_rate_limits.reset_at
          END
      `, [ip]);
    }
  } finally {
    client.release();
  }
}

function getCorsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
    'Vary': 'Origin',  // 🔐 Важно для корректного кэширования
    // 🔒 Security headers
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // SEC-005 (2026-06-08): CSP на JSON-ответ. Браузер не исполняет JSON, но эта
    // строгая политика блокирует любые попытки рендера ответа как HTML и любые
    // встраивания через iframe — defense-in-depth, не ломает API-клиента.
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'"
  };

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  // Если origin не разрешён — не добавляем Access-Control-Allow-Origin
  // Браузер заблокирует cross-origin запрос

  return headers;
}

// Подключение к PostgreSQL через connection pool
function getClient() {
  const pool = getPool();
  return pool.connect();
}

// ═══════════════════════════════════════════════════════════════════════════
// JWT функции (простая реализация без внешних библиотек)
// ═══════════════════════════════════════════════════════════════════════════

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString();
}

function createJwt(payload, jwtSecret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);

  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + JWT_EXPIRES_IN
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = crypto
    .createHmac('sha256', jwtSecret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return `${headerB64}.${payloadB64}.${signature}`;
}

function verifyJwt(token, jwtSecret) {
  try {
    const [headerB64, payloadB64, signature] = token.split('.');

    // Проверяем подпись
    const expectedSig = crypto
      .createHmac('sha256', jwtSecret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    if (signature !== expectedSig) {
      return { valid: false, error: 'Invalid signature' };
    }

    // Декодируем payload
    const payload = JSON.parse(base64UrlDecode(payloadB64));

    // Проверяем срок действия
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return { valid: false, error: 'Token expired' };
    }

    return { valid: true, payload };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Curator MFA (TOTP) — без внешних зависимостей
// ═══════════════════════════════════════════════════════════════════════════

function base32Encode(buffer) {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');

  let out = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, '0');
    out += BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  return out;
}

function base32Decode(value) {
  const clean = String(value || '')
    .toUpperCase()
    .replace(/[\s=-]/g, '');

  let bits = '';
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('Invalid base32 character');
    bits += idx.toString(2).padStart(5, '0');
  }

  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function createTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function generateTotpCode(secretBase32, timestampMs = Date.now()) {
  const secret = base32Decode(secretBase32);
  const counter = Math.floor(timestampMs / 1000 / TOTP_STEP_SECONDS);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', secret).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  );
  return String(binCode % 1000000).padStart(6, '0');
}

function safeEqualString(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifyTotpCode(secretBase32, code, timestampMs = Date.now(), windowSteps = TOTP_WINDOW_STEPS) {
  const cleanCode = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleanCode)) return false;

  for (let offset = -windowSteps; offset <= windowSteps; offset++) {
    const expected = generateTotpCode(secretBase32, timestampMs + offset * TOTP_STEP_SECONDS * 1000);
    if (safeEqualString(cleanCode, expected)) return true;
  }
  return false;
}

function getMfaCipherKey(jwtSecret) {
  return crypto.createHash('sha256').update(`heys-curator-mfa-v1:${jwtSecret}`).digest();
}

function encryptMfaSecret(secret, jwtSecret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getMfaCipherKey(jwtSecret), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url')
  ].join(':');
}

function decryptMfaSecret(ciphertext, jwtSecret) {
  const [version, ivB64, tagB64, dataB64] = String(ciphertext || '').split(':');
  if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) throw new Error('Invalid MFA secret format');

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getMfaCipherKey(jwtSecret),
    Buffer.from(ivB64, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}

function makeOtpAuthUrl(email, secret) {
  const label = encodeURIComponent(`HEYS:${email}`);
  const issuer = encodeURIComponent('HEYS');
  return `otpauth://totp/${label}?secret=${encodeURIComponent(secret)}&issuer=${issuer}&algorithm=SHA1&digits=6&period=${TOTP_STEP_SECONDS}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Password hashing (bcrypt-like с PBKDF2)
// ═══════════════════════════════════════════════════════════════════════════

function hashPassword(password, salt = null) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const { hash: computed } = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(computed));
}

async function recordAccountLoginFailure(client, curatorId) {
  if (!curatorId) return null;
  const result = await client.query(`
    UPDATE curators
    SET
      failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1,
      last_failed_login_at = NOW(),
      login_locked_until = CASE
        WHEN COALESCE(failed_login_attempts, 0) + 1 >= $2
          THEN NOW() + ($3::int * INTERVAL '1 minute')
        ELSE login_locked_until
      END
    WHERE id = $1
    RETURNING login_locked_until
  `, [curatorId, ACCOUNT_LOCK_MAX_ATTEMPTS, ACCOUNT_LOCK_MINUTES]);

  return result.rows[0]?.login_locked_until || null;
}

async function resetAccountLoginFailures(client, curatorId) {
  await client.query(
    `UPDATE curators
     SET failed_login_attempts = 0,
         login_locked_until = NULL,
         last_failed_login_at = NULL,
         last_login_at = NOW()
     WHERE id = $1`,
    [curatorId]
  );
}

function isAccountLocked(curator) {
  if (!curator?.login_locked_until) return false;
  return new Date(curator.login_locked_until).getTime() > Date.now();
}

function accountLockRetryAfter(curator) {
  if (!curator?.login_locked_until) return 1;
  return Math.max(1, Math.ceil((new Date(curator.login_locked_until).getTime() - Date.now()) / 1000));
}

function getMfaCodeFromBody(body) {
  return body?.mfa_code || body?.mfaCode || body?.totp || body?.otp || '';
}

function authenticateCuratorFromHeader(authHeader, jwtSecret) {
  if (!authHeader) return { valid: false, statusCode: 401, error: 'Authorization required' };
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const jwtResult = verifyJwt(token, jwtSecret);
  if (!jwtResult.valid) return { valid: false, statusCode: 401, error: jwtResult.error };
  if (jwtResult.payload.role !== 'curator') {
    return { valid: false, statusCode: 403, error: 'Curator role required' };
  }
  return { valid: true, curatorId: jwtResult.payload.sub, email: jwtResult.payload.email };
}

// ═══════════════════════════════════════════════════════════════════════════
// Handlers
// ═══════════════════════════════════════════════════════════════════════════

async function handleLogin(body, jwtSecret, ip) {
  // 🛡️ Rate limit check (DB-level, multi-instance safe)
  const rl = await checkLoginRateLimit(ip);
  if (!rl.allowed) {
    return {
      statusCode: 429,
      body: JSON.stringify({ error: 'Too many login attempts', retryAfter: rl.retryAfter })
    };
  }

  const { email, password } = body;

  if (!email || !password) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Email and password required' })
    };
  }

  const client = await getClient();

  try {

    // Ищем куратора по email
    const result = await client.query(
      `SELECT id, email, password_hash, password_salt, name,
              mfa_enabled, mfa_totp_secret_ciphertext,
              failed_login_attempts, login_locked_until
       FROM curators
       WHERE email = $1 AND is_active = true`,
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      await recordLoginAttempt(ip, false);
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid credentials' })
      };
    }

    const curator = result.rows[0];

    if (isAccountLocked(curator)) {
      return {
        statusCode: 429,
        body: JSON.stringify({
          error: 'Too many login attempts',
          retryAfter: accountLockRetryAfter(curator)
        })
      };
    }

    // Проверяем пароль
    if (!verifyPassword(password, curator.password_hash, curator.password_salt)) {
      await recordAccountLoginFailure(client, curator.id);
      await recordLoginAttempt(ip, false);
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid credentials' })
      };
    }

    if (curator.mfa_enabled) {
      const mfaCode = getMfaCodeFromBody(body);
      if (!mfaCode) {
        return {
          statusCode: 401,
          body: JSON.stringify({
            error: 'mfa_required',
            mfa_required: true,
            message: 'MFA code required'
          })
        };
      }

      let mfaOk = false;
      try {
        const secret = decryptMfaSecret(curator.mfa_totp_secret_ciphertext, jwtSecret);
        mfaOk = verifyTotpCode(secret, mfaCode);
      } catch (e) {
        console.error('MFA secret verification error:', e.message);
      }

      if (!mfaOk) {
        await recordAccountLoginFailure(client, curator.id);
        await recordLoginAttempt(ip, false);
        return {
          statusCode: 401,
          body: JSON.stringify({ error: 'Invalid credentials' })
        };
      }
    }

    await recordLoginAttempt(ip, true);
    await resetAccountLoginFailures(client, curator.id);

    // Создаём JWT
    const accessToken = createJwt({
      sub: curator.id,
      email: curator.email,
      role: 'curator'
    }, jwtSecret);

    // Формируем ответ в формате совместимом с Supabase.
    //
    // PR-B (2026-05-20): дополнительно выставляем JWT в HttpOnly cookie
    // `heys_curator_jwt`. Это defense-in-depth: пока legacy-код всё ещё
    // читает access_token из тела и сохраняет в localStorage, server-side
    // путь уже умеет принимать тот же токен из cookie через handler
    // heys-api-rpc. После того как все legacy-callers переведут на
    // cookie-only, JWT из тела ответа можно будет убрать (Phase 2).
    //
    // Domain=.heyslab.ru — frontend на app.heyslab.ru, API на api.heyslab.ru
    // (разные поддомены одного зарегистрированного домена).
    // SameSite=Lax — Strict ломает cross-subdomain в некоторых браузерах.
    return {
      statusCode: 200,
      headers: {
        'Set-Cookie': `heys_curator_jwt=${encodeURIComponent(accessToken)}; Domain=.heyslab.ru; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${JWT_EXPIRES_IN}`
      },
      body: JSON.stringify({
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: JWT_EXPIRES_IN,
        expires_at: Math.floor(Date.now() / 1000) + JWT_EXPIRES_IN,
        user: {
          id: curator.id,
          email: curator.email,
          role: 'curator',
          user_metadata: {
            name: curator.name
          }
        }
      })
    };

  } catch (e) {
    console.error('Login error:', e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  } finally {
    client.release();
  }
}

async function handleMfa(action, body, authHeader, jwtSecret) {
  const auth = authenticateCuratorFromHeader(authHeader, jwtSecret);
  if (!auth.valid) {
    return {
      statusCode: auth.statusCode,
      body: JSON.stringify({ error: auth.error })
    };
  }

  const client = await getClient();
  try {
    const current = await client.query(
      `SELECT id, email, mfa_enabled, mfa_totp_secret_ciphertext
       FROM curators
       WHERE id = $1 AND is_active = true`,
      [auth.curatorId]
    );

    if (current.rows.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Curator not found' }) };
    }

    const curator = current.rows[0];

    if (action === 'status') {
      return {
        statusCode: 200,
        body: JSON.stringify({
          mfa_enabled: !!curator.mfa_enabled,
          has_secret: !!curator.mfa_totp_secret_ciphertext
        })
      };
    }

    if (action === 'setup') {
      const secret = createTotpSecret();
      const encrypted = encryptMfaSecret(secret, jwtSecret);
      await client.query(
        `UPDATE curators
         SET mfa_totp_secret_ciphertext = $2,
             mfa_enabled = false,
             mfa_enabled_at = NULL
         WHERE id = $1`,
        [curator.id, encrypted]
      );

      return {
        statusCode: 200,
        body: JSON.stringify({
          secret,
          otpauth_url: makeOtpAuthUrl(curator.email, secret),
          mfa_enabled: false
        })
      };
    }

    if (action === 'enable') {
      if (!curator.mfa_totp_secret_ciphertext) {
        return { statusCode: 400, body: JSON.stringify({ error: 'MFA setup required' }) };
      }
      const secret = decryptMfaSecret(curator.mfa_totp_secret_ciphertext, jwtSecret);
      if (!verifyTotpCode(secret, getMfaCodeFromBody(body))) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid MFA code' }) };
      }
      await client.query(
        `UPDATE curators
         SET mfa_enabled = true,
             mfa_enabled_at = NOW()
         WHERE id = $1`,
        [curator.id]
      );
      return { statusCode: 200, body: JSON.stringify({ mfa_enabled: true }) };
    }

    if (action === 'disable') {
      if (!curator.mfa_enabled) {
        return { statusCode: 200, body: JSON.stringify({ mfa_enabled: false }) };
      }
      const secret = decryptMfaSecret(curator.mfa_totp_secret_ciphertext, jwtSecret);
      if (!verifyTotpCode(secret, getMfaCodeFromBody(body))) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid MFA code' }) };
      }
      await client.query(
        `UPDATE curators
         SET mfa_enabled = false,
             mfa_enabled_at = NULL,
             mfa_totp_secret_ciphertext = NULL
         WHERE id = $1`,
        [curator.id]
      );
      return { statusCode: 200, body: JSON.stringify({ mfa_enabled: false }) };
    }

    return { statusCode: 404, body: JSON.stringify({ error: 'Unknown MFA action' }) };
  } catch (e) {
    console.error('MFA error:', e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  } finally {
    client.release();
  }
}

async function handleVerify(body, authHeader, jwtSecret) {
  // Извлекаем токен из Authorization header
  let token = body?.token;

  if (!token && authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match) token = match[1];
  }

  if (!token) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Token required' })
    };
  }

  const result = verifyJwt(token, jwtSecret);

  if (!result.valid) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: result.error })
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      valid: true,
      user: {
        id: result.payload.sub,
        email: result.payload.email,
        role: result.payload.role
      },
      expires_at: result.payload.exp
    })
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🚪 CLIENT LOGOUT — отзыв клиентской сессии (P0.15)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /auth/client-logout
 * Body: { session_token: string }  (или Authorization: Bearer <token>)
 *
 * Дёргает SQL-функцию revoke_session(p_session_token), которая ставит
 * client_sessions.revoked_at = NOW() для соответствующего token_hash.
 * После этого токен сразу невалиден для всех endpoint'ов, проверяющих
 * client_sessions (heys-api-payments, heys-api-rpc и т.д.).
 */
async function handleClientLogout(body, authHeader) {
  const token =
    body?.session_token ||
    body?.token ||
    (authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : null);

  if (!token || typeof token !== 'string') {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'session_token required' }),
    };
  }

  const client = await getClient();
  try {
    const result = await client.query(
      `SELECT public.revoke_session($1) AS revoked`,
      [token]
    );
    const revoked = result.rows?.[0]?.revoked === true;
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, revoked }),
    };
  } catch (e) {
    console.error('[AUTH] revoke_session error:', e.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Logout failed' }),
    };
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 GET CLIENTS — Curator-only endpoint (JWT required)
// ═══════════════════════════════════════════════════════════════════════════

async function handleGetClients(curatorId) {
  const client = await getClient();

  try {

    // Получаем клиентов куратора (включая телефон и подписку для отображения куратору)
    // 🔧 v2.2.0 — добавлен LEFT JOIN с subscriptions для active_until (UI показывает даты подписок)
    const result = await client.query(
      `SELECT 
         c.id, 
         c.name, 
         c.phone_normalized, 
         c.updated_at, 
         c.subscription_status, 
         c.trial_ends_at,
         s.active_until,
         CASE WHEN c.pin_hash IS NOT NULL THEN true ELSE false END AS has_pin
       FROM clients c
       LEFT JOIN subscriptions s ON s.client_id = c.id
       WHERE c.curator_id = $1 
       ORDER BY c.updated_at ASC`,
      [curatorId]
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ data: result.rows })
    };

  } catch (e) {
    console.error('GetClients error:', e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 CREATE CLIENT — Curator-only endpoint (JWT required)
// ═══════════════════════════════════════════════════════════════════════════

async function handleCreateClient(curatorId, body) {
  const { name } = body;

  if (!name) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Name required' })
    };
  }

  const client = await getClient();

  try {

    const result = await client.query(
      `INSERT INTO clients (name, curator_id)
       VALUES ($1, $2)
       RETURNING id, name, updated_at`,
      [name, curatorId]
    );

    return {
      statusCode: 201,
      body: JSON.stringify({ data: result.rows[0] })
    };

  } catch (e) {
    console.error('CreateClient error:', e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 UPDATE CLIENT — Curator-only endpoint (JWT required)
// Supports: name, phone, pin (all optional, at least one required)
// ═══════════════════════════════════════════════════════════════════════════

async function handleUpdateClient(curatorId, clientId, body) {
  if (!clientId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Client ID required' })
    };
  }

  const { name, phone, pin } = body;

  if (!name && !phone && !pin) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'At least one field required: name, phone, or pin' })
    };
  }

  // Normalize phone if provided
  let phoneNormalized = null;
  if (phone) {
    const digits = (phone + '').replace(/\D/g, '');
    // Accept 10 digits (without country code) or 11 digits starting with 7/8
    let body10;
    if (digits.length === 10) {
      body10 = digits;
    } else if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) {
      body10 = digits.slice(1);
    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid phone format. Expected +7XXXXXXXXXX' })
      };
    }
    phoneNormalized = '+7' + body10;
  }

  // Validate pin if provided. NOTE: actual bcrypt-hashing happens on the DB side
  // (crypt(pin, gen_salt('bf'))) because verify_client_pin_v3 expects bcrypt.
  // Earlier SHA256 produced hashes incompatible with verify_client_pin_v3 — clients
  // could not log in after a PIN change.
  let plainPin = null;
  if (pin) {
    if (!/^\d{4,6}$/.test(pin)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'PIN must be 4–6 digits' })
      };
    }
    plainPin = pin;
  }

  const client = await getClient();

  try {
    // Build dynamic UPDATE — only include provided fields
    const setClauses = [];
    const params = [];
    let idx = 1;

    if (name) {
      setClauses.push(`name = $${idx++}`);
      params.push(name);
    }
    if (phoneNormalized) {
      setClauses.push(`phone = $${idx++}`);
      params.push(phoneNormalized);
      setClauses.push(`phone_normalized = $${idx++}`);
      params.push(phoneNormalized);
    }
    if (plainPin) {
      // bcrypt через pgcrypto в SQL — совместимо с verify_client_pin_v3
      setClauses.push(`pin_hash = crypt($${idx++}, gen_salt('bf'))`);
      params.push(plainPin);
      // Сбрасываем pin_salt (legacy SHA256-схема его требовала, bcrypt salt уже в hash)
      setClauses.push(`pin_salt = NULL`);
      setClauses.push(`pin_updated_at = NOW()`);
      setClauses.push(`pin_failed_attempts = 0`);
      setClauses.push(`pin_locked_until = NULL`);
    }
    setClauses.push(`updated_at = NOW()`);
    params.push(clientId);
    params.push(curatorId);

    const sql = `
      UPDATE clients
      SET ${setClauses.join(', ')}
      WHERE id = $${idx++} AND curator_id = $${idx++}
      RETURNING id, name, phone_normalized, updated_at
    `;

    const result = await client.query(sql, params);

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Client not found or access denied' })
      };
    }

    console.info('[heys-api-auth] ✅ updateClient:', { clientId, updatedFields: Object.keys({ name, phone, pin }).filter(k => body[k]) });

    return {
      statusCode: 200,
      body: JSON.stringify({ data: result.rows[0] })
    };

  } catch (e) {
    console.error('UpdateClient error:', e);
    // Phone uniqueness violation
    if (e.constraint === 'clients_phone_normalized_key' || (e.message && e.message.includes('unique') && e.message.includes('phone'))) {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: 'Phone already in use by another client' })
      };
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 DELETE CLIENT — Curator-only endpoint (JWT required)
// ═══════════════════════════════════════════════════════════════════════════

async function handleDeleteClient(curatorId, clientId) {
  if (!clientId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Client ID required' })
    };
  }

  const client = await getClient();

  try {

    // Удаляем клиента только если принадлежит куратору
    const result = await client.query(
      `DELETE FROM clients 
       WHERE id = $1 AND curator_id = $2
       RETURNING id`,
      [clientId, curatorId]
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Client not found or access denied' })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (e) {
    console.error('DeleteClient error:', e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 GET CLIENT KV — Curator-only endpoint (JWT required)
// ═══════════════════════════════════════════════════════════════════════════

async function handleGetClientKv(curatorId, clientId, options = {}) {
  console.info('[GetClientKv] ℹ️ START', { curatorId, clientId, options });

  if (!clientId) {
    console.error('[GetClientKv] ❌ ERROR: Client ID required');
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Client ID required' })
    };
  }

  const encryptionKey = process.env.HEYS_ENCRYPTION_KEY;
  console.info('[GetClientKv] ℹ️ encryptionKey length:', encryptionKey?.length || 0);

  if (!encryptionKey || encryptionKey.length < 16) {
    console.error('[GetClientKv] ❌ ERROR: Server encryption key missing');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server encryption key missing' })
    };
  }

  const client = await getClient();

  try {
    // Проверяем доступ к клиенту
    const access = await client.query(
      `SELECT 1 FROM clients WHERE id = $1 AND curator_id = $2 LIMIT 1`,
      [clientId, curatorId]
    );
    console.info('[GetClientKv] ℹ️ access check:', access.rows.length > 0 ? 'OK' : 'DENIED');

    if (!access.rows.length) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Client not found or access denied' })
      };
    }

    // Устанавливаем ключ для расшифровки health данных
    // Используем set_config, т.к. SET не принимает параметр $1
    await client.query(`SELECT set_config('heys.encryption_key', $1, true)`, [encryptionKey]);
    console.info('[GetClientKv] ℹ️ encryption key SET');

    const prefix = options.prefix ? String(options.prefix) : null;
    const keys = Array.isArray(options.keys) ? options.keys : null;
    const since = options.since || null; // 🚀 Delta Sync: ISO timestamp
    console.info('[GetClientKv] ℹ️ filter:', { prefix, keys, since });

    let query = `
      SELECT k,
             CASE
               WHEN key_version IS NOT NULL AND v_encrypted IS NOT NULL
                 THEN decrypt_health_data(v_encrypted)
               ELSE v
             END AS v,
             updated_at
      FROM client_kv_store
      WHERE client_id = $1
    `;

    const params = [clientId];
    let paramIdx = 2;

    if (keys && keys.length > 0) {
      query += ` AND k = ANY($${paramIdx}::text[])`;
      params.push(keys);
      paramIdx++;
    } else if (prefix) {
      query += ` AND k LIKE $${paramIdx}`;
      params.push(`${prefix}%`);
      paramIdx++;
    }

    // 🚀 Delta Sync: фильтр по updated_at > since
    if (since) {
      query += ` AND updated_at > $${paramIdx}::timestamptz`;
      params.push(since);
      paramIdx++;
    }

    const result = await client.query(query, params);
    const isDelta = !!since;
    console.info(`[GetClientKv] ℹ️ result rows: ${result.rows.length}${isDelta ? ' (delta since ' + since + ')' : ' (full)'}`);

    // Проверяем что v не null/пустой
    const sample = result.rows.slice(0, 3).map(r => ({ k: r.k, hasV: r.v != null, vType: typeof r.v }));
    console.info('[GetClientKv] ℹ️ sample:', JSON.stringify(sample));

    return {
      statusCode: 200,
      body: JSON.stringify({ data: result.rows })
    };
  } catch (e) {
    console.error('[GetClientKv] ERROR:', e.message, e.stack);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  } finally {
    client.release();
  }
}

async function handleRegister(body, jwtSecret) {
  const { email, password, name } = body;

  if (!email || !password) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Email and password required' })
    };
  }

  if (password.length < 8) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Password must be at least 8 characters' })
    };
  }

  const client = await getClient();

  try {

    // Проверяем что email не занят
    const existing = await client.query(
      'SELECT id FROM curators WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (existing.rows.length > 0) {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: 'Email already registered' })
      };
    }

    // Хешируем пароль
    const { hash, salt } = hashPassword(password);

    // Создаём куратора
    const result = await client.query(
      `INSERT INTO curators (email, password_hash, password_salt, name, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, email, name`,
      [email.toLowerCase().trim(), hash, salt, name || email.split('@')[0]]
    );

    const curator = result.rows[0];

    // Создаём JWT
    const accessToken = createJwt({
      sub: curator.id,
      email: curator.email,
      role: 'curator'
    }, jwtSecret);

    return {
      statusCode: 201,
      body: JSON.stringify({
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: JWT_EXPIRES_IN,
        user: {
          id: curator.id,
          email: curator.email,
          role: 'curator'
        }
      })
    };

  } catch (e) {
    console.error('Register error:', e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Main handler
// ═══════════════════════════════════════════════════════════════════════════

module.exports.handler = async function (event, context) {
  await initSecrets();
  // 🔐 Извлекаем origin и строим CORS headers
  const origin = event.headers?.origin || event.headers?.Origin || null;
  const corsHeaders = getCorsHeaders(origin);

  // Preflight CORS — работает ВСЕГДА, даже без JWT_SECRET
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  // 🔐 P0: JWT_SECRET читаем ВНУТРИ handler каждый раз (защита от stale env)
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error('[FATAL] JWT_SECRET is missing or too short (min 32 chars)');
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Server configuration error' })
    };
  }

  // 🔐 Explicit 403 для браузерных запросов с неразрешённым origin
  // Server-to-server (origin === null) пропускаем
  if (origin && !corsHeaders['Access-Control-Allow-Origin']) {
    return {
      statusCode: 403,
      headers: {
        'Content-Type': 'application/json',
        'Vary': 'Origin',
        // 🔐 Минимальные CORS headers для диагностики (браузер покажет 403 вместо "CORS error")
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({ error: 'cors_denied' })
    };
  }

  // Только POST, GET, PATCH, DELETE
  const allowedMethods = ['POST', 'GET', 'PATCH', 'DELETE'];
  if (!allowedMethods.includes(event.httpMethod)) {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Парсим путь: /auth/login, /auth/verify, /auth/register, /auth/clients, /auth/clients/:id, /auth/clients/:id/kv
  const path = event.path || event.url || '';
  const pathParts = path.split('/').filter(Boolean); // ['auth', 'clients'] или ['auth', 'clients', '{clientId}']
  const action = pathParts[1]; // login, verify, register, clients
  const mfaAction = pathParts[2]; // setup, enable, disable, status
  const subAction = pathParts[3]; // kv

  // Client ID из path parameters (Yandex API Gateway использует event.params)
  // Fallback на pathParts[2] если это реальный UUID, а не литерал {clientId}
  const pathResourceId = pathParts[2];
  const isLiteralPlaceholder = pathResourceId?.startsWith('{') && pathResourceId?.endsWith('}');
  const resourceId = event.params?.clientId || event.pathParameters?.clientId ||
    (isLiteralPlaceholder ? null : pathResourceId) || null;

  let body = {};
  try {
    if (event.body) {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    }
  } catch (e) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Invalid JSON body' })
    };
  }

  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  const clientIp = (
    event.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ??
    event.headers?.['X-Forwarded-For']?.split(',')[0]?.trim() ??
    event.requestContext?.identity?.sourceIp ??
    'unknown'
  );

  let result;

  switch (action) {
    case 'login':
      result = await handleLogin(body, JWT_SECRET, clientIp);
      break;
    case 'verify':
      result = await handleVerify(body, authHeader, JWT_SECRET);
      break;
    case 'register':
      result = await handleRegister(body, JWT_SECRET);
      break;
    case 'mfa':
      result = await handleMfa(mfaAction, body, authHeader, JWT_SECRET);
      break;
    case 'client-logout':
      // P0.15: отзыв клиентской PIN-сессии
      result = await handleClientLogout(body, authHeader);
      break;
    case 'clients':
      // 🔐 Требует JWT авторизации
      if (!authHeader) {
        result = {
          statusCode: 401,
          body: JSON.stringify({ error: 'Authorization required' })
        };
      } else {
        const jwtResult = verifyJwt(authHeader.replace(/^Bearer\s+/i, ''), JWT_SECRET);
        if (!jwtResult.valid) {
          result = {
            statusCode: 401,
            body: JSON.stringify({ error: jwtResult.error })
          };
        } else if (jwtResult.payload.role !== 'curator') {
          result = {
            statusCode: 403,
            body: JSON.stringify({ error: 'Curator role required' })
          };
        } else {
          const curatorId = jwtResult.payload.sub;

          // /auth/clients/:id/kv — выгрузка KV с расшифровкой
          if (resourceId && subAction === 'kv' && (event.httpMethod === 'GET' || event.httpMethod === 'POST')) {
            const qp = event.queryStringParameters || {};
            const keysFromQuery = qp.keys ? String(qp.keys).split(',').map((k) => k.trim()).filter(Boolean) : null;
            const keysFromBody = Array.isArray(body?.keys) ? body.keys : null;
            const prefix = body?.prefix || qp.prefix || null;
            const since = body?.since || qp.since || null; // 🚀 Delta Sync
            const keys = keysFromBody || keysFromQuery;
            result = await handleGetClientKv(curatorId, resourceId, { keys, prefix, since });
            break;
          }

          // Роутинг по HTTP методу
          switch (event.httpMethod) {
            case 'GET':
              result = await handleGetClients(curatorId);
              break;
            case 'POST':
              result = await handleCreateClient(curatorId, body);
              break;
            case 'PATCH':
              result = await handleUpdateClient(curatorId, resourceId || body.id, body);
              break;
            case 'DELETE':
              result = await handleDeleteClient(curatorId, resourceId || body.id);
              break;
            default:
              result = { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed for clients' }) };
          }
        }
      }
      break;
    default:
      result = {
        statusCode: 404,
        body: JSON.stringify({ error: 'Unknown action', path, action })
      };
  }

  return {
    ...result,
    headers: { ...corsHeaders, ...result.headers }
  };
};

module.exports._test = {
  base32Encode,
  base32Decode,
  createTotpSecret,
  generateTotpCode,
  verifyTotpCode,
  encryptMfaSecret,
  decryptMfaSecret,
  makeOtpAuthUrl,
  isAccountLocked,
  accountLockRetryAfter
};
