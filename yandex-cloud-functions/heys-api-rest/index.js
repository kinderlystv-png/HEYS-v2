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
  }
};

const ALLOWED_ORIGINS = [
  'https://heyslab.ru',
  'https://www.heyslab.ru',
  'https://app.heyslab.ru',
  'https://heys-static.website.yandexcloud.net',
  'https://heys-v2-web.vercel.app',
  'http://localhost:3001',
  'http://localhost:5173',
];

// Разрешённые таблицы для REST операций
const ALLOWED_TABLES = [
  'clients',
  'client_kv_store',
  'kv_store',
  'shared_products',
  'shared_products_public', // VIEW для публичного доступа
  'shared_products_pending', // Заявки на модерацию продуктов
  'shared_products_blocklist', // Blocklist куратора
  'consents'
];

function getCorsHeaders(origin) {
  const isAllowed = ALLOWED_ORIGINS.some(allowed => origin?.startsWith(allowed));
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Prefer, apikey, x-supabase-api-version, x-client-info',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json'
  };
}

module.exports.handler = async function (event, context) {
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

  // Debug: логируем структуру event для диагностики
  console.log('[REST Debug] Event:', JSON.stringify({
    path: event.path,
    pathParameters: event.pathParameters,
    params: event.params,
    queryStringParameters: event.queryStringParameters,
    httpMethod: event.httpMethod
  }));

  // Получаем имя таблицы из разных источников:
  // 1. pathParameters.table (Yandex API Gateway path param {table})
  // 2. path /rest/TABLE_NAME или /rest/v1/TABLE_NAME (парсинг пути)
  // 3. queryStringParameters.table (legacy)
  // 4. params.table (legacy)
  let tableName = event.pathParameters?.table 
    || event.params?.table
    || event.queryStringParameters?.table;
  
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

  // Проверяем что таблица разрешена
  if (!ALLOWED_TABLES.includes(tableName)) {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({ error: `Table "${tableName}" not allowed` })
    };
  }

  const client = new Client(PG_CONFIG);

  try {
    await client.connect();

    const method = event.httpMethod;
    let result;

    switch (method) {
      case 'GET': {
        // Простой SELECT с фильтрами из query params
        const params = { ...event.queryStringParameters };
        delete params.table;
        
        // Поддержка select конкретных колонок
        const selectColumns = params.select || '*';
        delete params.select;
        
        let query = `SELECT ${selectColumns} FROM ${tableName}`;
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

      case 'POST': {
        // INSERT или UPSERT
        const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
        const params = { ...event.queryStringParameters };
        const isUpsert = params.upsert === 'true';
        const onConflict = params.on_conflict;
        const selectColumns = params.select || '*';
        
        // Поддержка массива записей (batch insert)
        const records = Array.isArray(body) ? body : [body];
        
        // Защита от пустого body
        if (records.length === 0 || (records.length === 1 && Object.keys(records[0]).length === 0)) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'POST requires at least one record with fields' })
          };
        }
        
        // Получаем ключи из первой записи
        const keys = Object.keys(records[0]);
        
        // Формируем ON CONFLICT колонки (может быть "user_id,k" → ["user_id", "k"])
        const conflictCols = onConflict ? onConflict.split(',').map(c => c.trim()) : [];
        const conflictClause = conflictCols.map(c => `"${c}"`).join(', ');
        
        // Колонки для UPDATE (все кроме conflict колонок)
        const updateCols = keys
          .filter(k => !conflictCols.includes(k))
          .map(k => `"${k}" = EXCLUDED."${k}"`)
          .join(', ');
        
        let allRows = [];
        
        // DEBUG: Логируем параметры upsert
        console.log('[REST Debug] POST params:', { table: tableName, isUpsert, onConflict, conflictCols, keys, updateCols: updateCols.substring(0, 100) });
        
        // Обрабатываем каждую запись
        for (const record of records) {
          const values = keys.map(key => {
            const val = record[key];
            // Для jsonb колонок ВСЕГДА сериализуем в JSON
            // Строка "abc" станет '"abc"' — валидный JSON
            // Объект {a:1} станет '{"a":1}' — валидный JSON
            // null останется null — PostgreSQL примет
            if (key === 'v') {
              // v может быть null — оставляем null
              if (val === null || val === undefined) {
                return null;
              }
              // Всё остальное сериализуем
              return JSON.stringify(val);
            }
            return val;
          });
          
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
          
          let query;
          if (isUpsert && onConflict && updateCols) {
            query = `INSERT INTO ${tableName} (${keys.map(k => `"${k}"`).join(', ')}) 
                     VALUES (${placeholders}) 
                     ON CONFLICT (${conflictClause}) DO UPDATE SET ${updateCols}
                     RETURNING ${selectColumns}`;
            console.log('[REST Debug] Upsert query:', query.replace(/\s+/g, ' ').substring(0, 300));
          } else if (isUpsert && onConflict) {
            // Если все колонки — конфликтные, то DO NOTHING
            query = `INSERT INTO ${tableName} (${keys.map(k => `"${k}"`).join(', ')}) 
                     VALUES (${placeholders}) 
                     ON CONFLICT (${conflictClause}) DO NOTHING
                     RETURNING ${selectColumns}`;
          } else {
            query = `INSERT INTO ${tableName} (${keys.map(k => `"${k}"`).join(', ')}) 
                     VALUES (${placeholders}) 
                     RETURNING ${selectColumns}`;
          }
          
          const result = await client.query(query, values);
          allRows.push(...result.rows);
        }
        
        return {
          statusCode: 201,
          headers: corsHeaders,
          body: JSON.stringify(allRows)
        };
      }

      case 'PATCH': {
        // UPDATE
        const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        const params = { ...event.queryStringParameters };
        delete params.table;
        
        const setKeys = Object.keys(body);
        // Для jsonb колонок (например, 'v' в client_kv_store) нужно сериализовать в JSON
        const setValues = Object.values(body).map((val, idx) => {
          const key = setKeys[idx];
          // Если значение объект/массив И колонка 'v' (jsonb) — сериализуем
          if (key === 'v' && typeof val === 'object' && val !== null) {
            return JSON.stringify(val);
          }
          return val;
        });
        const setClause = setKeys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
        
        const conditions = [];
        const whereValues = [];
        let i = setKeys.length + 1;
        
        for (const [key, value] of Object.entries(params)) {
          if (['select', 'order'].includes(key)) continue;
          
          // PostgREST style: field=eq.value
          if (typeof value === 'string' && value.startsWith('eq.')) {
            const actualValue = value.replace('eq.', '');
            conditions.push(`"${key}" = $${i++}`);
            whereValues.push(actualValue);
          } else {
            // Простое равенство без оператора
            conditions.push(`"${key}" = $${i++}`);
            whereValues.push(value);
          }
        }
        
        const query = `UPDATE ${tableName} SET ${setClause} WHERE ${conditions.join(' AND ')} RETURNING *`;
        result = await client.query(query, [...setValues, ...whereValues]);
        
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify(result.rows)
        };
      }

      case 'DELETE': {
        const params = { ...event.queryStringParameters };
        delete params.table;
        
        const conditions = [];
        const values = [];
        let i = 1;
        
        for (const [key, value] of Object.entries(params)) {
          if (['select', 'order', 'limit', 'offset', 'upsert', 'on_conflict'].includes(key)) continue;
          
          // PostgREST style: field=eq.value
          if (typeof value === 'string' && value.startsWith('eq.')) {
            const actualValue = value.replace('eq.', '');
            conditions.push(`"${key}" = $${i++}`);
            values.push(actualValue);
          } else if (typeof value === 'string' && value.startsWith('in.')) {
            // IN operator: in.(val1,val2,val3)
            const inValues = value.replace('in.', '').replace(/^\(|\)$/g, '').split(',');
            const placeholders = inValues.map(() => `$${i++}`).join(', ');
            conditions.push(`"${key}" IN (${placeholders})`);
            values.push(...inValues);
          } else {
            // Простое равенство без оператора
            conditions.push(`"${key}" = $${i++}`);
            values.push(value);
          }
        }
        
        if (conditions.length === 0) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'DELETE requires at least one filter' })
          };
        }
        
        const query = `DELETE FROM ${tableName} WHERE ${conditions.join(' AND ')} RETURNING *`;
        result = await client.query(query, values);
        
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify(result.rows)
        };
      }

      default:
        return {
          statusCode: 405,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Method not allowed' })
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
