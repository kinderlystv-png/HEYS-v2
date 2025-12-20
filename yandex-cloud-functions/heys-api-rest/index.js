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

  // Получаем имя таблицы
  const tableName = event.queryStringParameters?.table || event.params?.table;
  
  if (!tableName) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Missing table name' })
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
          if (key.startsWith('eq.')) {
            const field = key.replace('eq.', '');
            conditions.push(`"${field}" = $${i++}`);
            values.push(value);
          } else if (!['select', 'order', 'limit'].includes(key)) {
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
        const values = Object.values(body);
        
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
        const setValues = Object.values(body);
        const setClause = setKeys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
        
        const conditions = [];
        const whereValues = [];
        let i = setKeys.length + 1;
        
        for (const [key, value] of Object.entries(params)) {
          if (!['select', 'order'].includes(key)) {
            const field = key.replace('eq.', '');
            conditions.push(`"${field}" = $${i++}`);
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
          const field = key.replace('eq.', '');
          conditions.push(`"${field}" = $${i++}`);
          values.push(value);
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
