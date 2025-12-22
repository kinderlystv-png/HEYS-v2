/**
 * HEYS Health Check — Yandex Cloud Function
 * Простая проверка работоспособности API
 * Также обрабатывает stub для /auth/v1/user (Supabase SDK совместимость)
 */

// CORS headers (localhost для dev)
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization, x-client-info, prefer, x-supabase-api-version',
  'Access-Control-Max-Age': '86400'
};

module.exports.handler = async function (event, context) {
  const path = event.path || event.url || '';
  const method = (event.httpMethod || event.method || 'GET').toUpperCase();
  
  // CORS preflight
  if (method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: ''
    };
  }
  
  // Stub для /auth/v1/user — Supabase SDK запрашивает текущего пользователя
  // Возвращаем "нет пользователя" чтобы SDK не падал
  if (path.includes('/auth/v1/user')) {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS
      },
      // Supabase SDK ожидает такой формат при отсутствии пользователя
      body: JSON.stringify({ data: { user: null }, error: null })
    };
  }
  
  // Обычный health check
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
      timestamp: new Date().toISOString()
    })
  };
};
