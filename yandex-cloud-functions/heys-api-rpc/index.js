/**
 * HEYS API RPC — Yandex Cloud Function
 * PostgreSQL RPC вызовы напрямую к Yandex.Cloud PostgreSQL
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 P0 SECURITY: Conditional logging (never log env in production)
// ═══════════════════════════════════════════════════════════════════════════
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';  // debug | info | warn | error
const IS_DEBUG = LOG_LEVEL === 'debug';

function debugLog(...args) {
  if (IS_DEBUG) console.log(...args);
}

function infoLog(...args) {
  if (IS_DEBUG || LOG_LEVEL === 'info') console.log(...args);
}

// 🔐 В production логируем только факт старта, без деталей конфигурации
infoLog('[RPC Init] Starting... LOG_LEVEL=' + LOG_LEVEL);
debugLog('[RPC Init] Debug mode enabled (never enable in production!)');

// Загрузка CA сертификата Yandex Cloud
const CA_CERT_PATH = path.join(__dirname, 'certs', 'root.crt');
let CA_CERT = null;
try {
  if (fs.existsSync(CA_CERT_PATH)) {
    CA_CERT = fs.readFileSync(CA_CERT_PATH, 'utf8');
    debugLog('[RPC Init] CA cert loaded');
  } else {
    // 🔐 Это ошибка конфигурации, логируем всегда
    console.error('[RPC Init] CA cert NOT FOUND at:', CA_CERT_PATH);
  }
} catch (e) {
  console.error('[RPC Init] CA cert error:', e.message);
}

// Конфигурация PostgreSQL
const PG_CONFIG = {
  host: process.env.PG_HOST || 'rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net',
  port: parseInt(process.env.PG_PORT || '6432'),
  database: process.env.PG_DATABASE || 'heys_production',
  user: process.env.PG_USER || 'heys_admin',
  password: process.env.PG_PASSWORD,
  ssl: CA_CERT ? {
    rejectUnauthorized: true,
    ca: CA_CERT
  } : {
    rejectUnauthorized: false
  },
  // Таймауты
  connectionTimeoutMillis: 5000,
  query_timeout: 10000
};

debugLog('[RPC Init] PG_CONFIG ssl:', CA_CERT ? 'verify-full with cert' : 'no verify');

/**
 * 🔐 Извлечение реального IP клиента из заголовков
 * Yandex Cloud Functions / API Gateway добавляют X-Forwarded-For
 * Формат: "client_ip, proxy1_ip, proxy2_ip"
 * 
 * 🔐 P1: Защита от DoS через длинные заголовки:
 * - Обрезаем входящую строку до 128 символов
 * - Берём только первый IP до запятой
 * - Возвращаем null если не парсится (SQL сделает safe cast)
 */
function extractClientIp(headers) {
  if (!headers) return null;
  
  // Нормализуем ключи (могут быть разные регистры)
  const h = {};
  for (const [k, v] of Object.entries(headers)) {
    h[k.toLowerCase()] = v;
  }
  
  // 1. X-Forwarded-For (основной)
  if (h['x-forwarded-for']) {
    // 🔐 P1: Ограничиваем длину строки (защита от DoS)
    const raw = String(h['x-forwarded-for']).slice(0, 128);
    // Берём только первый IP до запятой
    const firstIp = raw.split(',')[0]?.trim();
    if (firstIp && isValidIp(firstIp)) {
      return firstIp;
    }
  }
  
  // 2. X-Real-IP (Nginx)
  const realIp = h['x-real-ip'] ? String(h['x-real-ip']).slice(0, 45) : null;
  if (realIp && isValidIp(realIp)) {
    return realIp;
  }
  
  // 3. CF-Connecting-IP (Cloudflare)
  const cfIp = h['cf-connecting-ip'] ? String(h['cf-connecting-ip']).slice(0, 45) : null;
  if (cfIp && isValidIp(cfIp)) {
    return cfIp;
  }
  
  return null;
}

/**
 * Валидация IP адреса (IPv4 или IPv6)
 */
function isValidIp(ip) {
  if (!ip) return false;
  // IPv4
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    return ip.split('.').every(n => parseInt(n) <= 255);
  }
  // IPv6 (упрощённая проверка)
  if (ip.includes(':') && /^[0-9a-fA-F:]+$/.test(ip)) {
    return true;
  }
  return false;
}

const ALLOWED_ORIGINS = [
  'https://heyslab.ru',
  'https://www.heyslab.ru',
  'https://app.heyslab.ru',
  'https://heys-static.website.yandexcloud.net',
  'https://heys-v2-web.vercel.app',
  'http://localhost:3001',
  'http://localhost:5173',
];

// ⚠️ SECURITY: Только клиентские RPC функции!
// Админские функции (set_subscription_*, get_*_for_curator) — в отдельный heys-api-admin
const ALLOWED_FUNCTIONS = [
  // === AUTH (клиентская) ===
  'get_client_salt',
  // 🔐 P2: Removed verify_client_pin (no rate-limit)
  'client_pin_auth',
  // 🔐 P2: Removed create_client_with_pin — curator-only (иначе спам-регистрация)
  // 🔐 P2: Removed verify_client_pin_v2 (returned plaintext PIN!)
  'verify_client_pin_v3',             // 🔐 P1: С rate-limit по IP!
  'revoke_session',                   // Logout (отзыв сессии)
  
  // === SUBSCRIPTION (клиентская) ===
  'get_subscription_status_by_session', // Статус подписки по session_token
  'start_trial_by_session',             // Старт триала (идемпотентно)
  
  // === TRIAL QUEUE (очередь на триал) ===
  'get_public_trial_capacity',          // Публичный виджет мест (без auth!)
  'request_trial',                      // Запрос триала: offer или очередь
  'get_trial_queue_status',             // Статус в очереди
  'claim_trial_offer',                  // Подтверждение offer → старт триала
  'cancel_trial_queue',                 // Отмена запроса на триал
  'assign_trials_from_queue',           // Воркер: раздача offers (cron)
  // ❌ check_subscription_status(UUID) — убрано, принимает UUID без проверки владельца
  
  // === KV STORAGE (🔐 P1: session-версии — IDOR fix!) ===
  'get_client_data_by_session',           // 🔐 P1: session-версия (IDOR fix)
  'get_client_kv_by_session',             // 🔐 P1: чтение KV (session-safe)
  'upsert_client_kv_by_session',          // 🔐 P1: запись KV (session-safe)
  'batch_upsert_client_kv_by_session',    // 🔐 P1: пакетная запись (session-safe)
  'delete_client_kv_by_session',          // 🔐 P1: удаление KV (session-safe)
  
  // ❌ УБРАНО (IDOR — принимают UUID от клиента!):
  // 'save_client_kv'             — IDOR: клиент может передать чужой UUID
  // 'get_client_kv'              — IDOR: клиент может читать чужие данные
  // 'delete_client_kv'           — IDOR: клиент может удалять чужие данные
  // 'upsert_client_kv'           — IDOR: клиент может писать в чужие данные
  // 'batch_upsert_client_kv'     — IDOR: клиент может пакетно писать в чужие данные
  
  // === PRODUCTS (read-only или с модерацией) ===
  'get_shared_products',
  'create_pending_product_by_session', // 🔐 P1: session-версия для PIN-клиентов (на модерацию)
  'publish_shared_product_by_session', // 🔐 P3: прямая публикация для кураторов (REST→RPC, session)
  'publish_shared_product_by_curator', // 🔐 P3: прямая публикация для кураторов (REST→RPC, JWT)
  
  // === CONSENTS ===
  'log_consents',                     // Логирование согласий с ПЭП
  'check_required_consents',          // Проверка обязательных согласий
  'revoke_consent',                   // Отзыв согласия
  'get_client_consents',              // Получение всех согласий клиента
  
  // ❌ УБРАНО (SECURITY RISK — были доступны публично!):
  // 'reset_client_pin'                 — только через куратора/админ-API
  // 'get_curator_clients'              — только через админ-API
  // 'get_subscription_status_for_curator' — только через админ-API
  // 'set_subscription_active_until'    — только через админ-API
  // 'require_client_id'                — oracle валидности токенов (полезен атакующему)
  // 'log_security_event'               — DoS по security_events, логируем внутри SECURITY DEFINER
  // 'check_subscription_status(UUID)'  — утечка статуса по чужому client_id
];

// Маппинг параметров (если нужно)
// Сейчас не используем, т.к. функции ожидают те же имена что и фронтенд
const PARAM_MAPPING = {
  // Маппинг клиентских параметров → параметры функций PostgreSQL
  'phone': 'p_phone',
  'pin': 'p_pin',
  'session_token': 'p_session_token',
  'client_id': 'p_client_id',
  // 'p_phone': 'p_phone_normalized',  // НЕ НУЖНО — функции уже используют p_phone
};

function getCorsHeaders(origin) {
  const isAllowed = ALLOWED_ORIGINS.some(allowed => origin?.startsWith(allowed));
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json'
  };
}

module.exports.handler = async function (event, context) {
  // 🔐 P0: Conditional logging — no request details in production
  debugLog('[RPC Handler] Request received');
  debugLog('[RPC Handler] Method:', event.httpMethod);
  debugLog('[RPC Handler] Path:', event.path);
  // 🔐 Никогда не логируем query params / body целиком — могут содержать токены
  
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const corsHeaders = getCorsHeaders(origin);

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: ''
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

  // Получаем имя функции из URL
  const fnName = event.queryStringParameters?.fn || event.params?.fn;
  
  if (!fnName) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Missing function name (fn parameter)' })
    };
  }

  // Проверяем что функция разрешена
  if (!ALLOWED_FUNCTIONS.includes(fnName)) {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({ error: `Function "${fnName}" not allowed` })
    };
  }

  // Парсим тело запроса
  let params = {};
  try {
    if (event.body) {
      params = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    }
  } catch (e) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Invalid JSON body' })
    };
  }

  // Применяем маппинг параметров
  const mappedParams = {};
  for (const [key, value] of Object.entries(params)) {
    const mappedKey = PARAM_MAPPING[key] || key;
    mappedParams[mappedKey] = value;
  }
  params = mappedParams;

  // 🔐 P1: Извлекаем IP клиента для rate-limit
  // Yandex Cloud Functions: X-Forwarded-For содержит реальный IP
  const clientIp = extractClientIp(event.headers);
  debugLog('[RPC Handler] Client IP:', clientIp ? '***extracted***' : 'null');

  // 🔐 P2: Для verify_client_pin_v3 добавляем IP и User-Agent автоматически
  if (fnName === 'verify_client_pin_v3') {
    params.p_ip = clientIp || null;
    params.p_user_agent = event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null;
    debugLog('[RPC Handler] Added p_ip and p_user_agent to verify_client_pin_v3');
  }

  // Подключаемся к PostgreSQL
  const client = new Client(PG_CONFIG);

  try {
    await client.connect();

    // Формируем вызов RPC функции
    const paramKeys = Object.keys(params);
    
    // 🔐 P2: Для некоторых функций нужны явные типы (pg передаёт unknown)
    const TYPE_HINTS = {
      'verify_client_pin_v3': {
        'p_phone': '::text',
        'p_pin': '::text',
        'p_ip': '::text',
        'p_user_agent': '::text'
      },
      // 🔐 P2: batch KV функции требуют ::jsonb для массива items
      'batch_upsert_client_kv_by_session': {
        'p_session_token': '::text',
        'p_items': '::jsonb'
      },
      'upsert_client_kv_by_session': {
        'p_session_token': '::text',
        'p_key': '::text',
        'p_value': '::jsonb'
      },
      'create_pending_product_by_session': {
        'p_session_token': '::text',
        'p_product_name': '::text',
        'p_product_data': '::jsonb'
      },
      // 🔐 P3: Публикация продуктов кураторами
      'publish_shared_product_by_session': {
        'p_session_token': '::text',
        'p_product_data': '::jsonb'
      },
      'publish_shared_product_by_curator': {
        'p_curator_id': '::uuid',
        'p_product_data': '::jsonb'
      }
    };
    
    const hints = TYPE_HINTS[fnName] || {};
    
    // PostgreSQL 14+ named parameters: p_phone => $1::text
    const paramNames = paramKeys.map((k, i) => {
      const hint = hints[k] || '';
      return `${k} => $${i + 1}${hint}`;
    }).join(', ');
    
    let query;
    let values;
    
    if (paramKeys.length > 0) {
      // Вызов функции с именованными параметрами
      query = `SELECT * FROM ${fnName}(${paramNames})`;
      // 🔐 P2: Для ::jsonb параметров нужен JSON.stringify (pg driver передаёт object as-is)
      values = paramKeys.map(k => {
        const hint = hints[k] || '';
        const val = params[k];
        // Если это jsonb и значение — объект/массив, сериализуем в строку
        if (hint === '::jsonb' && val !== null && typeof val === 'object') {
          return JSON.stringify(val);
        }
        return val;
      });
    } else {
      query = `SELECT * FROM ${fnName}()`;
      values = [];
    }

    const result = await client.query(query, values);
    
    // 🔐 P2 FIX: Закрываем соединение ДО return (serverless best practice)
    await client.end();

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(result.rows.length === 1 ? result.rows[0] : result.rows)
    };

  } catch (error) {
    console.error('[RPC Error]', fnName, error.message);
    
    // Пытаемся закрыть соединение даже при ошибке
    try { await client.end(); } catch (e) { /* ignore */ }
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Database error',
        message: error.message,
        code: error.code
      })
    };
  }
};
