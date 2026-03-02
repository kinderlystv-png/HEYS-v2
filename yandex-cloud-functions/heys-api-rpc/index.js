/**
 * HEYS API RPC — Yandex Cloud Function
 * PostgreSQL RPC вызовы напрямую к Yandex.Cloud PostgreSQL
 * v2.5.3 — verify stable deployment (2026-02-10)
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { getPool } = require('./shared/db-pool');

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 P0 SECURITY: Conditional logging (never log env in production)
// ═══════════════════════════════════════════════════════════════════════════
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';  // debug | info | warn | error
const IS_DEBUG = LOG_LEVEL === 'debug';

// ═══════════════════════════════════════════════════════════════════════════
// 🛡️ Startup env validation — логируем проблемы сразу при cold start
// ═══════════════════════════════════════════════════════════════════════════
(function validateEnv() {
  const required = ['PG_PASSWORD'];
  const recommended = ['PG_HOST', 'JWT_SECRET', 'HEYS_ENCRYPTION_KEY'];

  for (const key of required) {
    if (!process.env[key]) {
      console.error(`[HEYS.rpc] ❌ FATAL: Missing required env: ${key}`);
    }
  }
  for (const key of recommended) {
    if (!process.env[key]) {
      console.warn(`[HEYS.rpc] ⚠️ Missing recommended env: ${key}`);
    }
  }
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.error(`[HEYS.rpc] ❌ JWT_SECRET too short (${process.env.JWT_SECRET.length} < 32)`);
  }
})();

function debugLog(...args) {
  if (IS_DEBUG) console.info(...args);
}

function infoLog(...args) {
  if (IS_DEBUG || LOG_LEVEL === 'info') console.info(...args);
}

function normalizeEncryptionKey(rawKey) {
  if (!rawKey) return null;
  const key = String(rawKey).trim();
  if (!key) return null;

  const isHex = /^[0-9a-fA-F]+$/.test(key);
  const hasEvenLength = key.length % 2 === 0;
  if (isHex && hasEvenLength && key.length >= 32) {
    return key;
  }

  return Buffer.from(key, 'utf8').toString('hex');
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

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 JWT Verification (для curator-only функций)
// ═══════════════════════════════════════════════════════════════════════════

function base64UrlDecode(str) {
  // Сначала заменяем URL-safe символы на стандартные
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  // Затем добавляем padding
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString();
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
  'activate_trial_timer_by_session',    // 🆕 v2.0: Старт таймера при первом логине

  // === TRIAL QUEUE (очередь на триал) ===
  'get_public_trial_capacity',          // Публичный виджет мест (без auth!)
  'request_trial',                      // Запрос триала: offer или очередь
  'get_trial_queue_status',             // Статус в очереди
  'claim_trial_offer',                  // Подтверждение offer → старт триала
  'cancel_trial_queue',                 // Отмена запроса на триал
  'assign_trials_from_queue',           // Воркер: раздача offers (cron)

  // ❌ TRIAL QUEUE ADMIN функции ПЕРЕМЕЩЕНЫ в CURATOR_ONLY_FUNCTIONS
  // (требуют JWT-авторизацию, см. ниже)

  // === KV STORAGE (🔐 P1: session-версии — IDOR fix!) ===
  'update_client_profile_by_session',     // 🔐 P1: Обновление профиля клиента (name)
  'get_client_data_by_session',           // 🔐 P1: session-версия (IDOR fix)
  'get_client_kv_by_session',             // 🔐 P1: чтение KV (session-safe)
  'upsert_client_kv_by_session',          // 🔐 P1: запись KV (session-safe)
  'batch_upsert_client_kv_by_session',    // 🔐 P1: пакетная запись (session-safe)
  'delete_client_kv_by_session',          // 🔐 P1: удаление KV (session-safe)

  // === EWS WEEKLY SNAPSHOTS (🔐 Wave 3.1: облачная синхронизация) ===
  'upsert_weekly_snapshot_by_session',    // 🔐 Сохранение weekly snapshot
  'get_weekly_snapshots_by_session',      // 🔐 Загрузка последних N недель
  'delete_old_weekly_snapshots_by_session', // 🔐 Cleanup старых snapshots

  // === GAMIFICATION AUDIT (client, session-based) ===
  'log_gamification_event_by_session',
  'get_gamification_events_by_session',

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
  'sync_shared_products_by_session',   // 🔐 Копирование всех shared_products в базу клиента
  'update_shared_product_portions',    // 🔐 Обновление порций продукта (direct UPDATE, не INSERT)
  'update_shared_product_portions_by_curator', // 🔐 Обновление порций куратором (JWT auth)

  // === CONSENTS ===
  'log_consents',                     // Логирование согласий с ПЭП
  'log_consents_by_session',          // 🔐 Session-safe: client_id из сессии (IDOR protection)
  'check_required_consents',          // Проверка обязательных согласий
  'check_payment_consent_by_session', // 🔐 Session-safe: проверка payment_oferta перед оплатой
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

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 CURATOR_ONLY_FUNCTIONS — требуют JWT токен куратора!
// ═══════════════════════════════════════════════════════════════════════════
const CURATOR_ONLY_FUNCTIONS = [
  // === CLIENT MANAGEMENT ===
  'create_client_with_pin',           // Создание клиента (только куратор!)
  'reset_client_pin',                 // Сброс PIN клиента
  'get_curator_clients',              // Список клиентов куратора
  'admin_get_all_clients',            // 🆕 Список всех клиентов (JWT-only v4.0)

  // === SUBSCRIPTION MANAGEMENT ===
  'admin_extend_subscription',        // Продление подписки клиента
  'admin_cancel_subscription',        // Сброс подписки клиента
  'admin_extend_trial',               // 🆕 Продление триала (JWT-only v2.0)

  // === TRIAL QUEUE ADMIN ===
  'admin_get_trial_queue_list',       // Список очереди с данными клиентов
  'admin_add_to_queue',               // Добавить клиента в очередь
  'admin_remove_from_queue',          // Удалить из очереди
  'admin_send_offer',                 // @deprecated — use admin_activate_trial
  'admin_activate_trial',             // 🆕 Активировать триал (JWT-only v4.0)
  'admin_reject_request',             // Отклонить заявку с причиной
  'admin_get_queue_stats',            // Статистика очереди
  'admin_update_queue_settings',      // Изменить настройки (is_accepting и т.д.)

  // === LEADS MANAGEMENT (v3.0) ===
  'admin_get_leads',                  // Список лидов с лендинга
  'admin_convert_lead',               // Конвертация лида в клиента
  'admin_update_lead_status',         // Обновление статуса лида (отклонение и т.д.)

  // === GAMIFICATION AUDIT ===
  'log_gamification_event_by_curator',
  'get_gamification_events_by_curator',
  'delete_gamification_events_by_curator', // Удаление дубликатов из audit log
];

// Маппинг параметров (если нужно)
// Клиент передаёт короткие имена → маппим на p_* для PostgreSQL функций
const PARAM_MAPPING = {
  // Маппинг клиентских параметров → параметры функций PostgreSQL
  'phone': 'p_phone',
  'pin': 'p_pin',
  'session_token': 'p_session_token',
  'client_id': 'p_client_id',
  // KV функции: клиент передаёт k/v, PostgreSQL ожидает p_key/p_value
  'k': 'p_key',
  'v': 'p_value',
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
  const isPublicFunction = ALLOWED_FUNCTIONS.includes(fnName);
  const isCuratorFunction = CURATOR_ONLY_FUNCTIONS.includes(fnName);

  if (!isPublicFunction && !isCuratorFunction) {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({ error: `Function "${fnName}" not allowed` })
    };
  }

  // 🔐 Для curator-only функций требуется JWT
  let curatorId = null;
  if (isCuratorFunction) {
    const authHeader = event.headers?.['authorization'] || event.headers?.['Authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Authorization required for curator functions' })
      };
    }

    // 🔐 JWT_SECRET: ОБЯЗАТЕЛЕН из env. Без fallback — чтобы не было silent mismatch!
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      console.error('[RPC] FATAL: JWT_SECRET not configured in env! Curator functions will NOT work.');
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Server configuration error: JWT_SECRET missing' })
      };
    }

    const token = authHeader.slice(7);
    console.info('[RPC] ℹ️ JWT token received, length:', token.length, 'first 20 chars:', token.substring(0, 20));
    const jwtResult = verifyJwt(token, JWT_SECRET);

    if (!jwtResult.valid) {
      console.error('[RPC] ❌ JWT verification FAILED:', jwtResult.error);
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid or expired token', details: jwtResult.error })
      };
    }

    curatorId = jwtResult.payload.sub;
    debugLog('[RPC] Curator authenticated:', curatorId);
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

  // 🔐 Для curator-only функций добавляем curator_id из JWT
  if (isCuratorFunction && curatorId) {
    params.p_curator_id = curatorId;
    // Remove old session token param — DB functions now use p_curator_id only
    delete params.p_curator_session_token;
    debugLog('[RPC Handler] Added p_curator_id for curator function');
  }

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

  // 🔐 Для log_consents: IP-адрес берём с сервера (надёжнее, чем от клиента)
  if (fnName === 'log_consents') {
    params.p_ip = clientIp || params.p_ip || null;
    if (!params.p_user_agent) {
      params.p_user_agent = event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null;
    }
    debugLog('[RPC Handler] Added server-side p_ip to log_consents');
  }

  // Подключаемся к PostgreSQL через connection pool
  // 🛟 Retry с health check — PgBouncer убивает idle-соединения
  const pool = getPool();
  let client;
  for (let _attempt = 0; _attempt < 3; _attempt++) {
    try {
      client = await pool.connect();
      await client.query('SELECT 1');
      break;
    } catch (connErr) {
      console.warn(`[RPC] Pool connection stale (attempt ${_attempt + 1}/3):`, connErr.message);
      try { client?.release(true); } catch (e) { /* ignore */ }
      client = null;
      if (_attempt === 2) {
        return {
          statusCode: 503,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Service temporarily unavailable', message: 'Database connection failed after 3 attempts' })
        };
      }
      await new Promise(r => setTimeout(r, 100));
    }
  }

  // Объявляем переменные перед try блоком, чтобы они были доступны в catch
  let query;
  let paramKeys = [];
  let values = [];

  try {
    // 🔐 P2: Устанавливаем ключ шифрования для health_data (если настроен)
    const encryptionKey = process.env.HEYS_ENCRYPTION_KEY;
    if (encryptionKey) {
      const normalizedKey = normalizeEncryptionKey(encryptionKey);
      if (normalizedKey) {
        // SET не поддерживает параметры, используем format с экранированием
        await client.query(`SET heys.encryption_key = '${normalizedKey.replace(/'/g, "''")}'`);
      }
    }

    // 🔐 TEMP: Возможность отключить шифрование на уровне сессии (plaintext mode)
    if (process.env.HEYS_ENCRYPTION_DISABLED === '1') {
      await client.query("SET heys.encryption_disabled = '1'");
    }

    // 🛟 SAFE FALLBACK: get_client_data_by_session
    // Причина: в некоторых прод-данных возможны дубликаты по ключу (k),
    // что ломает jsonb_object_agg внутри функции и даёт 500.
    // Здесь собираем данные с DISTINCT ON (k) по updated_at.
    if (fnName === 'get_client_data_by_session') {
      const sessionToken = params.p_session_token;
      const since = params.p_since || null; // 🚀 Delta Sync: ISO timestamp
      if (!sessionToken) {
        client.release();
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Missing p_session_token' })
        };
      }

      // 1) Валидируем сессию
      const sessionRes = await client.query(
        `select client_id
         from client_sessions
         where token_hash = digest($1, 'sha256')
           and expires_at > now()
           and revoked_at is null`,
        [sessionToken]
      );

      const clientId = sessionRes.rows?.[0]?.client_id;
      if (!clientId) {
        client.release();
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'invalid_session' })
        };
      }

      // 2) Собираем KV с защитой от дублей
      // 🚀 Delta Sync: если передан p_since — возвращаем только обновлённые ключи
      const queryParams = [clientId];
      const sinceFilter = since ? `and updated_at > $2::timestamptz` : '';
      if (since) queryParams.push(since);

      const dataRes = await client.query(
        `select jsonb_object_agg(
            k,
            case
              when key_version is not null and v_encrypted is not null
                then coalesce(decrypt_health_data(v_encrypted), v)
              else v
            end
          ) as payload
         from (
           select distinct on (k)
             k, v, v_encrypted, key_version, updated_at
           from client_kv_store
           where client_id = $1 ${sinceFilter}
           order by k, updated_at desc nulls last
         ) t`,
        queryParams
      );

      const payload = dataRes.rows?.[0]?.payload || {};
      const isDelta = !!since;

      client.release();

      console.info(`[RPC] get_client_data_by_session: ${Object.keys(payload).length} keys${isDelta ? ' (delta since ' + since + ')' : ' (full)'}`);

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          client_id: clientId,
          data: payload,
          delta: isDelta
        })
      };
    }

    // Формируем вызов RPC функции
    paramKeys = Object.keys(params);

    // 🔐 P2: Для некоторых функций нужны явные типы (pg передаёт unknown)
    const TYPE_HINTS = {
      'verify_client_pin_v3': {
        'p_phone': '::text',
        'p_pin': '::text',
        'p_ip': '::text',
        'p_user_agent': '::text'
      },
      // 🔐 P2: KV функции требуют явные типы
      'get_client_kv_by_session': {
        'p_session_token': '::text',
        'p_key': '::text'
      },
      'batch_upsert_client_kv_by_session': {
        'p_session_token': '::text',
        'p_items': '::jsonb'
      },
      'upsert_client_kv_by_session': {
        'p_session_token': '::text',
        'p_key': '::text',
        'p_value': '::jsonb'
      },
      'delete_client_kv_by_session': {
        'p_session_token': '::text',
        'p_key': '::text'
      },
      'update_client_profile_by_session': {
        'p_session_token': '::text',
        'p_name': '::text'
      },
      'get_client_data_by_session': {
        'p_session_token': '::text',
        'p_since': '::text'  // 🚀 Delta Sync: optional ISO timestamp
      },
      // 🔐 EWS Weekly Snapshots (Wave 3.1 cloud sync)
      'upsert_weekly_snapshot_by_session': {
        'p_session_token': '::text',
        'p_week_start': '::date',
        'p_week_end': '::date',
        'p_week_number': '::int',
        'p_year': '::int',
        'p_warnings_count': '::int',
        'p_global_score': '::int',
        'p_severity_breakdown': '::jsonb',
        'p_top_warnings': '::jsonb'
      },
      'get_weekly_snapshots_by_session': {
        'p_session_token': '::text',
        'p_weeks_count': '::int'
      },
      'delete_old_weekly_snapshots_by_session': {
        'p_session_token': '::text',
        'p_weeks_to_keep': '::int'
      },
      // 🔐 Curator-only функции
      'get_curator_clients': {
        'p_curator_id': '::uuid'
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
      },
      // 🔐 Получение shared products
      'get_shared_products': {
        'p_search': '::text',
        'p_limit': '::int',
        'p_offset': '::int'
      },
      // 🔐 Обновление порций продукта
      'update_shared_product_portions': {
        'p_session_token': '::text',
        'p_product_id': '::uuid',
        'p_portions': '::jsonb'
      },
      // 🔐 Обновление порций куратором (JWT auth)
      'update_shared_product_portions_by_curator': {
        'p_curator_id': '::uuid',
        'p_product_id': '::uuid',
        'p_portions': '::jsonb'
      },
      // === GAMIFICATION AUDIT ===
      'log_gamification_event_by_session': {
        'p_session_token': '::text',
        'p_action': '::text',
        'p_reason': '::text',
        'p_xp_before': '::int',
        'p_xp_after': '::int',
        'p_xp_delta': '::int',
        'p_level_before': '::int',
        'p_level_after': '::int',
        'p_achievements_before': '::int',
        'p_achievements_after': '::int',
        'p_metadata': '::jsonb'
      },
      'log_gamification_event_by_curator': {
        'p_curator_id': '::uuid',
        'p_client_id': '::uuid',
        'p_action': '::text',
        'p_reason': '::text',
        'p_xp_before': '::int',
        'p_xp_after': '::int',
        'p_xp_delta': '::int',
        'p_level_before': '::int',
        'p_level_after': '::int',
        'p_achievements_before': '::int',
        'p_achievements_after': '::int',
        'p_metadata': '::jsonb'
      },
      'get_gamification_events_by_session': {
        'p_session_token': '::text',
        'p_limit': '::int',
        'p_offset': '::int'
      },
      'get_gamification_events_by_curator': {
        'p_curator_id': '::uuid',
        'p_client_id': '::uuid',
        'p_limit': '::int',
        'p_offset': '::int'
      },
      'delete_gamification_events_by_curator': {
        'p_curator_id': '::uuid',
        'p_event_ids': '::uuid[]'
      },
      // === TRIAL QUEUE ADMIN ===
      'admin_get_trial_queue_list': {
        'p_curator_id': '::uuid',
        'p_status_filter': '::text',
        'p_search': '::text',
        'p_limit': '::int',
        'p_offset': '::int'
      },
      'admin_add_to_queue': {
        'p_client_id': '::uuid',
        'p_source': '::text',
        'p_priority': '::int',
        'p_curator_id': '::uuid'
      },
      'admin_remove_from_queue': {
        'p_client_id': '::uuid',
        'p_reason': '::text',
        'p_curator_id': '::uuid'
      },
      'admin_send_offer': {
        'p_client_id': '::uuid',
        'p_offer_window_minutes': '::int',
        'p_curator_id': '::uuid'
      },
      // 🆕 v3.0: Manual trial activation with start date
      'admin_activate_trial': {
        'p_client_id': '::uuid',
        'p_start_date': '::date',
        'p_trial_days': '::int',
        'p_curator_id': '::uuid'
      },
      'admin_reject_request': {
        'p_client_id': '::uuid',
        'p_rejection_reason': '::text',
        'p_curator_id': '::uuid'
      },
      'admin_get_queue_stats': {
        'p_curator_id': '::uuid'
      },
      'admin_update_queue_settings': {
        'p_is_accepting': '::boolean',
        'p_max_active': '::int',
        'p_offer_window_minutes': '::int',
        'p_trial_days': '::int',
        'p_curator_id': '::uuid'
      },
      // 🆕 v3.0: Leads management
      'admin_get_leads': {
        'p_status': '::text',
        'p_curator_id': '::uuid'
      },
      'admin_convert_lead': {
        'p_lead_id': '::uuid',
        'p_pin': '::text',
        'p_curator_id': '::uuid'
      },
      'admin_update_lead_status': {
        'p_lead_id': '::uuid',
        'p_status': '::text',
        'p_reason': '::text',
        'p_curator_id': '::uuid'  // JWT authenticated curator (unused in function but required)
      },
      // 🔐 JWT-only: functions that need p_curator_id type hint
      'admin_get_all_clients': {
        'p_curator_id': '::uuid'
      },
      'admin_extend_trial': {
        'p_client_id': '::uuid',
        'p_days': '::int',
        'p_curator_id': '::uuid'
      },
      'admin_extend_subscription': {
        'p_curator_id': '::uuid',
        'p_client_id': '::uuid',
        'p_months': '::int'
      },
      'admin_cancel_subscription': {
        'p_curator_id': '::uuid',
        'p_client_id': '::uuid'
      },
      'create_client_with_pin': {
        'p_name': '::text',
        'p_phone': '::text',
        'p_pin_salt': '::text',
        'p_pin_hash': '::text',
        'p_curator_id': '::uuid'
      },
      'reset_client_pin': {
        'p_client_id': '::uuid',
        'p_pin_salt': '::text',
        'p_pin_hash': '::text',
        'p_curator_id': '::uuid'
      }
    };

    const hints = TYPE_HINTS[fnName] || {};

    // PostgreSQL 14+ named parameters: p_phone => $1::text
    const paramNames = paramKeys.map((k, i) => {
      const hint = hints[k] || '';
      return `${k} => $${i + 1}${hint}`;
    }).join(', ');

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

    if (fnName === 'get_curator_clients') {
      const shortCuratorId = params?.p_curator_id ? String(params.p_curator_id).slice(0, 8) : 'unknown';
      infoLog('[RPC] get_curator_clients start', { curatorId: shortCuratorId, hasCuratorId: !!params?.p_curator_id });
      debugLog('[RPC] get_curator_clients SQL', query);
    }

    const result = await client.query(query, values);

    if (fnName === 'get_curator_clients') {
      infoLog('[RPC] get_curator_clients success', { rows: result.rows?.length || 0 });
    }

    // 🔐 P2 FIX: Освобождаем клиент в pool ДО return (serverless best practice)
    client.release();

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(result.rows.length === 1 ? result.rows[0] : result.rows)
    };

  } catch (error) {
    // Детальное логирование для admin функций и критичных функций
    const needsDetailedLog = fnName.startsWith('admin_') || fnName === 'get_curator_clients';

    if (needsDetailedLog) {
      console.error('[RPC Error]', fnName, {
        message: error.message,
        code: error.code,
        detail: error.detail,
        hint: error.hint,
        where: error.where,
        query: query || 'no query',
        params: paramKeys.length > 0 ? paramKeys.join(', ') : 'no params'
      });
    } else {
      console.error('[RPC Error]', fnName, error.message);
    }

    // Освобождаем клиент в pool даже при ошибке
    // 🛟 release(true) при connection errors — уничтожает мёртвое соединение
    const isConnectionError =
      error.message?.includes('Connection terminated') ||
      error.message?.includes('connection') ||
      error.code === 'ECONNRESET' ||
      error.code === 'EPIPE';
    try { client.release(isConnectionError); } catch (e) { /* ignore */ }

    // 🔐 P0001 = RAISE EXCEPTION (бизнес-ошибка, НЕ сбой БД)
    // Возвращаем 200 с error-объектом, чтобы фронтенд парсил корректно
    if (error.code === 'P0001') {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          error: error.message,
          code: error.code
        })
      };
    }

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
// deployed at 2026-02-05 01:25:37
