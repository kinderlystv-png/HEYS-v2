/**
 * HEYS API RPC — Yandex Cloud Function
 * PostgreSQL RPC вызовы напрямую к Yandex.Cloud PostgreSQL
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

// Разрешённые RPC функции
const ALLOWED_FUNCTIONS = [
  'get_client_salt',
  'verify_client_pin',
  'client_pin_auth',
  'create_client_with_pin',
  'reset_client_pin',
  'get_client_data',
  'save_client_kv',
  'get_client_kv',
  'delete_client_kv',
  'get_shared_products',
  'save_consent',
  'get_consents',
  'upsert_client_kv',
  'get_curator_clients'
];

// Маппинг параметров (если нужно)
// Сейчас не используем, т.к. функции ожидают те же имена что и фронтенд
const PARAM_MAPPING = {
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

  // Подключаемся к PostgreSQL
  const client = new Client(PG_CONFIG);

  try {
    await client.connect();

    // Формируем вызов RPC функции
    const paramKeys = Object.keys(params);
    const paramPlaceholders = paramKeys.map((_, i) => `$${i + 1}`).join(', ');
    const paramNames = paramKeys.map(k => `"${k}" := $${paramKeys.indexOf(k) + 1}`).join(', ');
    
    let query;
    let values;
    
    if (paramKeys.length > 0) {
      // Вызов функции с именованными параметрами
      query = `SELECT * FROM ${fnName}(${paramNames})`;
      values = paramKeys.map(k => params[k]);
    } else {
      query = `SELECT * FROM ${fnName}()`;
      values = [];
    }

    const result = await client.query(query, values);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(result.rows.length === 1 ? result.rows[0] : result.rows)
    };

  } catch (error) {
    console.error('[RPC Error]', fnName, error.message);
    
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
