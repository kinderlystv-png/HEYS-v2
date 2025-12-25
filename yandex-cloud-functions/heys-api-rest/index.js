/**
 * HEYS API REST — Yandex Cloud Function
 * REST операции с таблицами PostgreSQL
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Загрузка CA сертификата Yandex Cloud
const CA_CERT_PATH = path.join(__dirname, 'certs', 'root.crt');
const CA_CERT = fs.existsSync(CA_CERT_PATH) ? fs.readFileSync(CA_CERT_PATH, 'utf8') : null;

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 P3: requireEnv — fail fast if env not set (no admin fallbacks!)
// ═══════════════════════════════════════════════════════════════════════════
function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(`[FATAL] ${name} is missing`);
  }
  return v;
}

// PG config loaded lazily inside handler (after OPTIONS check)
// This allows CORS preflight to work even if DB env is misconfigured
let PG_CONFIG = null;

function getPgConfig() {
  if (!PG_CONFIG) {
    PG_CONFIG = {
      host: requireEnv('PG_HOST'),
      port: Number(requireEnv('PG_PORT')),
      database: requireEnv('PG_DATABASE'),
      user: requireEnv('PG_USER'),
      password: requireEnv('PG_PASSWORD'),
      ssl: CA_CERT ? {
        rejectUnauthorized: true,
        ca: CA_CERT
      } : {
        rejectUnauthorized: false
      }
    };
  }
  return PG_CONFIG;
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

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 P3: Read-only tables whitelist (no PII, no KV — writes via RPC only)
// ═══════════════════════════════════════════════════════════════════════════
const ALLOWED_TABLES = [
  'shared_products',
  'shared_products_blocklist', // Blocklist куратора (read-only)
  // ❌ shared_products_public — REMOVED: VIEW uses auth.uid() which doesn't exist in YC
  // ❌ clients — removed (PII: phone_normalized)
  // ❌ client_kv_store — removed (writes via RPC by_session only)
  // ❌ kv_store — removed (writes via RPC only)
  // ❌ shared_products_pending — removed (writes via RPC only)
  // ❌ consents — removed (sensitive, use RPC by_session)
];

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 P1 SECURITY: Column whitelist per table (prevents SQL injection via select)
// ═══════════════════════════════════════════════════════════════════════════
// 🔐 P3: Column whitelist (matches reduced ALLOWED_TABLES + real DB schema)
// ⚠️  ВАЖНО: shared_products_public VIEW uses auth.uid() — NOT AVAILABLE in YC!
const ALLOWED_COLUMNS = {
  // shared_products (table) — публичные колонки (без created_by_* для "public view" логики)
  // Для "public API" клиенты запрашивают select=id,name,... БЕЗ авторства
  shared_products: [
    'id', 'name', 'name_norm', 'fingerprint',
    'simple100', 'complex100', 'protein100', 'badFat100', 'goodFat100', 'trans100', 'fiber100',
    'gi', 'harm', 'category', 'portions', 'description',
    'created_at', 'updated_at'
    // ❌ created_by_user_id, created_by_client_id — REMOVED: авторство скрыто от публичного API
  ],
  // shared_products_blocklist (table) — composite PK (curator_id, product_id)
  shared_products_blocklist: ['curator_id', 'product_id', 'created_at'],
  // ❌ shared_products_public — REMOVED: VIEW uses auth.uid() which doesn't exist in YC
  // ❌ clients, client_kv_store, kv_store, shared_products_pending, consents — removed
};

/**
 * 🔐 Валидация и санитизация списка колонок для SELECT
 * @param {string} selectParam - строка из query param (например "id,name,value")
 * @param {string} tableName - имя таблицы
 * @returns {string|null} - безопасный SQL список колонок или null если невалидно
 */
function sanitizeSelectColumns(selectParam, tableName) {
  const allowedForTable = ALLOWED_COLUMNS[tableName];
  
  // 🔐 Таблица должна быть в whitelist колонок (не разрешаем * для unknown таблиц)
  if (!allowedForTable) {
    console.error(`[REST] No column whitelist for table: "${tableName}"`);
    return null;
  }
  
  // '*' → возвращаем все разрешённые колонки (а не SQL *)
  if (!selectParam || selectParam === '*') {
    return allowedForTable.map(c => `"${c}"`).join(', ');
  }
  
  // Парсим список колонок
  const requestedColumns = selectParam.split(',').map(c => c.trim()).filter(c => c.length > 0);
  
  // 🔐 Пустой список после фильтрации — ошибка (select= без колонок)
  if (requestedColumns.length === 0) {
    console.error(`[REST] Empty column list after parsing: "${selectParam}"`);
    return null;
  }
  
  // Валидируем каждую колонку
  const validColumns = [];
  for (const col of requestedColumns) {
    // Базовая regex проверка: только буквы, цифры, underscore
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) {
      console.error(`[REST] Invalid column name rejected: "${col}"`);
      return null; // Подозрительный символ — отклоняем весь запрос
    }
    
    // Проверяем whitelist
    if (!allowedForTable.includes(col)) {
      console.error(`[REST] Column not in whitelist: "${col}" for table "${tableName}"`);
      return null; // Колонка не в whitelist — отклоняем
    }
    
    validColumns.push(`"${col}"`);
  }
  
  // Все колонки провалидированы
  return validColumns.join(', ');
}

function getCorsHeaders(origin) {
  const headers = {
    // 🔐 P3: Read-only — only GET/OPTIONS allowed
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Prefer, apikey',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
    'Vary': 'Origin'  // 🔐 Важно для кэширования
  };
  
  // 🔐 Только разрешённые origin получают ACAO
  const isAllowed = origin && ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed));
  if (isAllowed) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  // Без Origin (серверный запрос) — не блокируем
  // С неразрешённым Origin — браузер заблокирует
  
  return headers;
}

module.exports.handler = async function (event, context) {
  const origin = event.headers?.origin || event.headers?.Origin || null;
  const corsHeaders = getCorsHeaders(origin);

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: ''
    };
  }
  
  // 🔐 P0: Explicit 403 for disallowed browser origins
  // Server-to-server (origin === null) is allowed
  if (origin && !ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed))) {
    return {
      statusCode: 403,
      headers: {
        'Content-Type': 'application/json',
        'Vary': 'Origin',
        // 🔐 Минимальные CORS headers для диагностики (браузер покажет 403 вместо "CORS error")
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      },
      body: JSON.stringify({ error: 'cors_denied' })
    };
  }

  // Debug: логируем структуру event для диагностики
  console.log('[REST Debug] Event:', JSON.stringify({
    path: event.path,
    pathParameters: event.pathParameters,
    params: event.params,
    queryStringParameters: event.queryStringParameters,
    httpMethod: event.httpMethod
  }));

  // Получаем имя таблицы из path (единственный поддерживаемый способ)
  // 1. pathParameters.table (Yandex API Gateway path param {table})
  // 2. path /rest/TABLE_NAME или /rest/v1/TABLE_NAME (парсинг пути)
  // ❌ queryStringParameters.table — REMOVED (legacy, security risk)
  // ✅ params.table — YC API Gateway format (path parameters)
  // ✅ pathParameters.table — AWS/Supabase format (fallback)
  let tableName = event.params?.table || event.pathParameters?.table;
  
  // Если не нашли в параметрах, парсим из path
  // Поддерживаем оба формата: /rest/table и /rest/v1/table (Supabase SDK)
  if (!tableName && event.path) {
    const pathMatch = event.path.match(/\/rest(?:\/v1)?\/([a-zA-Z_]+)/);
    if (pathMatch) {
      tableName = pathMatch[1];
    }
  }
  
  if (!tableName) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Missing table name', debug: { path: event.path, pathParameters: event.pathParameters } })
    };
  }

  // 🔐 Проверяем что таблица разрешена
  // Возвращаем 404 (не 403) — security through obscurity, не раскрываем структуру БД
  if (!ALLOWED_TABLES.includes(tableName)) {
    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Not found' })
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔐 P1.1 + P3: EARLY VALIDATION — все проверки входа ДО подключения к БД
  // Fail fast: не тратим ресурсы на connect если input невалидный
  // ═══════════════════════════════════════════════════════════════════════════
  
  const method = event.httpMethod;
  
  // 🔐 P3: Read-only mode — reject writes BEFORE connecting to DB
  if (method !== 'GET') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed. REST API is read-only. Use RPC for writes.' })
    };
  }
  
  // Для GET: валидируем select columns ДО подключения к БД
  let selectColumns = null;
  if (method === 'GET') {
    const rawSelect = event.queryStringParameters?.select || '*';
    selectColumns = sanitizeSelectColumns(rawSelect, tableName);
    if (selectColumns === null) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid select columns — contains forbidden characters or unknown columns' })
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Только теперь подключаемся к БД (все валидации пройдены)
  // PG config loaded lazily — fails here if env not set (not at module load)
  // ═══════════════════════════════════════════════════════════════════════════
  const client = new Client(getPgConfig());

  try {
    await client.connect();

    let result;

    switch (method) {
      case 'GET': {
        // Простой SELECT с фильтрами из query params
        const params = { ...event.queryStringParameters };
        delete params.table;
        delete params.select; // Уже обработано выше
        
        // selectColumns уже валидированы и санитизированы выше (early validation)
        let query = `SELECT ${selectColumns} FROM "${tableName}"`;
        const conditions = [];
        const values = [];
        let i = 1;
        
        for (const [key, value] of Object.entries(params)) {
          // Поддержка ДВУХ форматов:
          // 1. PostgREST style: field=eq.value (value начинается с оператора)
          // 2. Supabase-like: eq.field=value (key начинается с оператора)
          
          // Формат 2: eq.field=value, gt.field=value, etc.
          if (key.startsWith('eq.')) {
            const fieldName = key.replace('eq.', '');
            conditions.push(`"${fieldName}" = $${i++}`);
            values.push(value);
          } else if (key.startsWith('neq.')) {
            const fieldName = key.replace('neq.', '');
            conditions.push(`"${fieldName}" != $${i++}`);
            values.push(value);
          } else if (key.startsWith('gt.')) {
            const fieldName = key.replace('gt.', '');
            conditions.push(`"${fieldName}" > $${i++}`);
            values.push(value);
          } else if (key.startsWith('lt.')) {
            const fieldName = key.replace('lt.', '');
            conditions.push(`"${fieldName}" < $${i++}`);
            values.push(value);
          } else if (key.startsWith('gte.')) {
            const fieldName = key.replace('gte.', '');
            conditions.push(`"${fieldName}" >= $${i++}`);
            values.push(value);
          } else if (key.startsWith('lte.')) {
            const fieldName = key.replace('lte.', '');
            conditions.push(`"${fieldName}" <= $${i++}`);
            values.push(value);
          } else if (key.startsWith('like.')) {
            const fieldName = key.replace('like.', '');
            const actualValue = value.replace(/\*/g, '%');
            conditions.push(`"${fieldName}" ILIKE $${i++}`);
            values.push(actualValue);
          } else if (key.startsWith('ilike.')) {
            // Support ilike.field=value format (case-insensitive search)
            const fieldName = key.replace('ilike.', '');
            const actualValue = value.replace(/\*/g, '%');
            conditions.push(`"${fieldName}" ILIKE $${i++}`);
            values.push(actualValue);
          } else if (key.startsWith('in.')) {
            const fieldName = key.replace('in.', '');
            const inValues = value.replace(/^\(|\)$/g, '').split(',');
            const placeholders = inValues.map(() => `$${i++}`).join(', ');
            conditions.push(`"${fieldName}" IN (${placeholders})`);
            values.push(...inValues);
          } else if (key.startsWith('is.')) {
            const fieldName = key.replace('is.', '');
            if (value === 'null') {
              conditions.push(`"${fieldName}" IS NULL`);
            } else if (value === 'true') {
              conditions.push(`"${fieldName}" = true`);
            } else if (value === 'false') {
              conditions.push(`"${fieldName}" = false`);
            }
          }
          // Формат 1: field=eq.value (value начинается с оператора)
          else if (typeof value === 'string' && value.startsWith('eq.')) {
            const actualValue = value.replace('eq.', '');
            conditions.push(`"${key}" = $${i++}`);
            values.push(actualValue);
          } else if (typeof value === 'string' && value.startsWith('neq.')) {
            const actualValue = value.replace('neq.', '');
            conditions.push(`"${key}" != $${i++}`);
            values.push(actualValue);
          } else if (typeof value === 'string' && value.startsWith('gt.')) {
            const actualValue = value.replace('gt.', '');
            conditions.push(`"${key}" > $${i++}`);
            values.push(actualValue);
          } else if (typeof value === 'string' && value.startsWith('lt.')) {
            const actualValue = value.replace('lt.', '');
            conditions.push(`"${key}" < $${i++}`);
            values.push(actualValue);
          } else if (typeof value === 'string' && value.startsWith('gte.')) {
            const actualValue = value.replace('gte.', '');
            conditions.push(`"${key}" >= $${i++}`);
            values.push(actualValue);
          } else if (typeof value === 'string' && value.startsWith('lte.')) {
            const actualValue = value.replace('lte.', '');
            conditions.push(`"${key}" <= $${i++}`);
            values.push(actualValue);
          } else if (typeof value === 'string' && value.startsWith('like.')) {
            const actualValue = value.replace('like.', '').replace(/\*/g, '%');
            conditions.push(`"${key}" ILIKE $${i++}`);
            values.push(actualValue);
          } else if (typeof value === 'string' && value.startsWith('in.')) {
            // IN operator: in.(val1,val2,val3)
            const inValues = value.replace('in.', '').replace(/^\(|\)$/g, '').split(',');
            const placeholders = inValues.map(() => `$${i++}`).join(', ');
            conditions.push(`"${key}" IN (${placeholders})`);
            values.push(...inValues);
          } else if (typeof value === 'string' && value.startsWith('is.')) {
            const actualValue = value.replace('is.', '');
            if (actualValue === 'null') {
              conditions.push(`"${key}" IS NULL`);
            } else if (actualValue === 'true') {
              conditions.push(`"${key}" = true`);
            } else if (actualValue === 'false') {
              conditions.push(`"${key}" = false`);
            }
          } else if (!['order', 'limit', 'offset'].includes(key)) {
            // Простое равенство без оператора
            conditions.push(`"${key}" = $${i++}`);
            values.push(value);
          }
        }
        
        if (conditions.length > 0) {
          query += ` WHERE ${conditions.join(' AND ')}`;
        }
        
        if (params.order) {
          query += ` ORDER BY ${params.order.replace('.desc', ' DESC').replace('.asc', ' ASC')}`;
        }
        
        if (params.limit) {
          query += ` LIMIT ${parseInt(params.limit)}`;
        }
        
        if (params.offset) {
          query += ` OFFSET ${parseInt(params.offset)}`;
        }
        
        result = await client.query(query, values);
        
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify(result.rows)
        };
      }

      // 🔐 P3: POST/PATCH/DELETE removed — REST is read-only
      // All writes go through RPC (session-based, subscription-checked)
      
      default:
        // This should never be reached (early 405 above), but defensive
        return {
          statusCode: 405,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Method not allowed. REST API is read-only.' })
        };
    }

  } catch (error) {
    console.error('[REST Error]', error.message);
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Database error',
        message: error.message,
        code: error.code
      })
    };

  } finally {
    await client.end();
  }
};
