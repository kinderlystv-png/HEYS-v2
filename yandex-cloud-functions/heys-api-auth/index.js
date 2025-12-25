/**
 * heys-api-auth — Аутентификация кураторов
 * 
 * Endpoints:
 *   POST /auth/login — вход по email+password, возвращает JWT
 *   POST /auth/verify — проверка JWT токена
 *   POST /auth/refresh — обновление токена (опционально)
 * 
 * JWT payload: { sub: curator_id, email, role: 'curator', iat, exp }
 */

const { Client } = require('pg');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 P0 SECURITY: JWT Secret — читаем ВНУТРИ handler каждый раз!
// Это защищает от stale env при деплое без перезапуска инстансов
// ═══════════════════════════════════════════════════════════════════════════
const JWT_EXPIRES_IN = 24 * 60 * 60; // 24 часа в секундах

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 P0 SECURITY: CORS Whitelist (no wildcards!)
// ═══════════════════════════════════════════════════════════════════════════
const ALLOWED_ORIGINS = new Set([
  'https://heyslab.ru',
  'https://www.heyslab.ru',
  'https://app.heyslab.ru',
  'https://heys-static.website.yandexcloud.net',
  'https://heys-v2-web.vercel.app',
  'http://localhost:3001',
  'http://localhost:5173',
]);

/**
 * Возвращает CORS headers с проверкой origin.
 * Если origin не в whitelist — не ставим Access-Control-Allow-Origin.
 */
function getCorsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
    'Vary': 'Origin'  // 🔐 Важно для корректного кэширования
  };
  
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  // Если origin не разрешён — не добавляем Access-Control-Allow-Origin
  // Браузер заблокирует cross-origin запрос
  
  return headers;
}

// Подключение к PostgreSQL
function createPgClient() {
  const sslCertPath = path.join(__dirname, 'certs', 'root.crt');
  let ssl = false;
  
  if (fs.existsSync(sslCertPath)) {
    ssl = {
      rejectUnauthorized: true,
      ca: fs.readFileSync(sslCertPath).toString()
    };
  }
  
  return new Client({
    host: process.env.PG_HOST,
    port: parseInt(process.env.PG_PORT || '6432'),
    database: process.env.PG_DATABASE,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    ssl,
    connectionTimeoutMillis: 10000
  });
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

// ═══════════════════════════════════════════════════════════════════════════
// Handlers
// ═══════════════════════════════════════════════════════════════════════════

async function handleLogin(body, jwtSecret) {
  const { email, password } = body;
  
  if (!email || !password) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Email and password required' })
    };
  }
  
  const client = createPgClient();
  
  try {
    await client.connect();
    
    // Ищем куратора по email
    const result = await client.query(
      'SELECT id, email, password_hash, password_salt, name FROM curators WHERE email = $1 AND is_active = true',
      [email.toLowerCase().trim()]
    );
    
    if (result.rows.length === 0) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid credentials' })
      };
    }
    
    const curator = result.rows[0];
    
    // Проверяем пароль
    if (!verifyPassword(password, curator.password_hash, curator.password_salt)) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid credentials' })
      };
    }
    
    // Обновляем last_login
    await client.query(
      'UPDATE curators SET last_login_at = NOW() WHERE id = $1',
      [curator.id]
    );
    
    // Создаём JWT
    const accessToken = createJwt({
      sub: curator.id,
      email: curator.email,
      role: 'curator'
    }, jwtSecret);
    
    // Формируем ответ в формате совместимом с Supabase
    return {
      statusCode: 200,
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
      body: JSON.stringify({ error: 'Internal server error', details: e.message })
    };
  } finally {
    await client.end().catch(() => {});
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
  
  const client = createPgClient();
  
  try {
    await client.connect();
    
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
      body: JSON.stringify({ error: 'Internal server error', details: e.message })
    };
  } finally {
    await client.end().catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Main handler
// ═══════════════════════════════════════════════════════════════════════════

module.exports.handler = async function(event, context) {
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
  
  // Только POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }
  
  // Парсим путь: /auth/login, /auth/verify, /auth/register
  const path = event.path || event.url || '';
  const action = path.split('/').pop(); // login, verify, register
  
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
  
  let result;
  
  switch (action) {
    case 'login':
      result = await handleLogin(body, JWT_SECRET);
      break;
    case 'verify':
      result = await handleVerify(body, authHeader, JWT_SECRET);
      break;
    case 'register':
      result = await handleRegister(body, JWT_SECRET);
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
