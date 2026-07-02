/**
 * HEYS SMS API — Yandex Cloud Function
 * Отправка SMS через SMS.ru
 */

const { initSecrets } = require('./secrets');

// SMS_API_KEY читается лениво внутри handler (после initSecrets() Lockbox-overlay).
// Module-level чтение в const сломается когда значение будет жить только в Lockbox.
function getSmsApiKey() { return process.env.SMS_API_KEY; }

const ALLOW_LOCALHOST_ORIGINS = process.env.ALLOW_LOCALHOST_ORIGINS === '1';
const ALLOWED_ORIGINS = [
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
];

function getCorsHeaders(origin) {
  const isAllowed = isAllowedOrigin(origin);
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
    // 🔒 Security headers
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // SEC-005 (2026-06-08): CSP на JSON-ответ — defense-in-depth.
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'"
  };

  if (isAllowed) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

function isAllowedOrigin(origin) {
  return !!origin && ALLOWED_ORIGINS.includes(origin);
}

module.exports.handler = async function (event, context) {
  await initSecrets();
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

  if (origin && !isAllowedOrigin(origin)) {
    return {
      statusCode: 403,
      headers: corsHeaders,
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

  const smsApiKey = getSmsApiKey();
  if (!smsApiKey) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'SMS_API_KEY not configured' })
    };
  }

  try {
    // Парсим тело запроса
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { to, msg, ip } = body;

    if (!to || !msg) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing required fields: to, msg' })
      };
    }

    // Получаем IP клиента (из тела запроса или заголовков)
    const clientIP = ip ||
      event.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
      event.headers?.['x-real-ip'] ||
      event.requestContext?.identity?.sourceIp ||
      '127.0.0.1';

    // Формируем URL для SMS.ru
    const params = new URLSearchParams({
      api_id: smsApiKey,
      to: to,
      msg: msg,
      ip: clientIP,  // IP пользователя для защиты от спама
      json: '1'
      // from: 'HEYS' — не используем, т.к. не подключен к операторам
    });

    const response = await fetch(`https://sms.ru/sms/send?${params.toString()}`);
    const result = await response.json();

    // Логируем (без чувствительных данных)
    console.log('[SMS]', {
      to: to.slice(0, 4) + '***',
      status: result.status,
      status_code: result.status_code
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error('[SMS Error]', error.message);

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'SMS sending error',
        message: error.message
      })
    };
  }
};
