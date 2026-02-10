/**
 * HEYS Health Check — Yandex Cloud Function (Lightweight)
 * Проверка работоспособности API (без реального подключения к БД)
 * Также обрабатывает stub для /auth/v1/user (Supabase SDK совместимость)
 * 
 * Примечание: Реальная проверка БД происходит через другие эндпоинты 
 * (RPC, REST, Auth), которые вызываются каждые 5 минут в GitHub Actions.
 */

// CORS headers
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization, x-client-info, prefer, x-supabase-api-version',
  'Access-Control-Max-Age': '86400'
};

module.exports.handler = async function (event, context) {
  const urlPath = event.path || event.url || '';
  const method = (event.httpMethod || event.method || 'GET').toUpperCase();

  // CORS preflight
  if (method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: ''
    };
  }

  // Stub для /auth/v1/user — Supabase SDK совместимость
  if (urlPath.includes('/auth/v1/user')) {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS
      },
      body: JSON.stringify({ data: { user: null }, error: null })
    };
  }

  // Health check — просто подтверждение что функция работает
  // Реальная проверка БД происходит через RPC/REST/Auth эндпоинты
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS
    },
    body: JSON.stringify({
      status: 'ok',
      service: 'HEYS API',
      region: 'ru-central1',
      timestamp: new Date().toISOString(),
      note: 'Database health verified via RPC/REST/Auth endpoints'
    })
  };
};
