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
  'https://heys-v2-web.vercel.app',
  'http://localhost:3001',
  'http://localhost:5173',
];

// Разрешённые таблицы для REST операций
const ALLOWED_TABLES = [
  'clients',
  'client_kv_store',
  'shared_products',
  'consents'
];

function getCorsHeaders(origin) {
  const isAllowed = ALLOWED_ORIGINS.some(allowed => origin?.startsWith(allowed));
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Prefer',
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
  // 2. path /rest/TABLE_NAME (парсинг пути)
  // 3. queryStringParameters.table (legacy)
  // 4. params.table (legacy)
  let tableName = event.pathParameters?.table 
    || event.params?.table
    || event.queryStringParameters?.table;
  
  // Если не нашли в параметрах, парсим из path
  if (!tableName && event.path) {
    const pathMatch = event.path.match(/\/rest\/([a-zA-Z_]+)/);
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
        
        let query = `SELECT * FROM ${tableName}`;
        const conditions = [];
        const values = [];
        let i = 1;
        
        for (const [key, value] of Object.entries(params)) {
          // PostgREST style: field=eq.value, field=gt.value, etc.
          if (typeof value === 'string' && value.startsWith('eq.')) {
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
          } else if (typeof value === 'string' && value.startsWith('is.')) {
            const actualValue = value.replace('is.', '');
            if (actualValue === 'null') {
              conditions.push(`"${key}" IS NULL`);
            } else if (actualValue === 'true') {
              conditions.push(`"${key}" = true`);
            } else if (actualValue === 'false') {
              conditions.push(`"${key}" = false`);
            }
          } else if (!['select', 'order', 'limit'].includes(key)) {
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
        
        result = await client.query(query, values);
        
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify(result.rows)
        };
      }

      case 'POST': {
        // INSERT
        const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
        const keys = Object.keys(body);
        // Для jsonb колонок (например, 'v' в client_kv_store) нужно сериализовать в JSON
        const values = Object.values(body).map((val, idx) => {
          const key = keys[idx];
          if (key === 'v' && typeof val === 'object' && val !== null) {
            return JSON.stringify(val);
          }
          return val;
        });
        
        // Защита от пустого body
        if (keys.length === 0) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'POST requires at least one field in body' })
          };
        }
        
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        
        const query = `INSERT INTO ${tableName} (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${placeholders}) RETURNING *`;
        result = await client.query(query, values);
        
        return {
          statusCode: 201,
          headers: corsHeaders,
          body: JSON.stringify(result.rows[0])
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
          // PostgREST style: field=eq.value
          if (typeof value === 'string' && value.startsWith('eq.')) {
            const actualValue = value.replace('eq.', '');
            conditions.push(`"${key}" = $${i++}`);
            values.push(actualValue);
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
