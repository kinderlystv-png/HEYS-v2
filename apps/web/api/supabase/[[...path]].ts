/**
 * Vercel Edge Function — Supabase Proxy
 * 
 * Полноценный proxy для Supabase API, который:
 * 1. Передаёт все headers (Authorization, Content-Type и т.д.)
 * 2. Работает как middleware, не redirect — обходит блокировки провайдеров
 * 3. Поддерживает все HTTP методы (GET, POST, PATCH, DELETE)
 * 4. Добавляет правильные CORS headers
 */

const SUPABASE_URL = 'https://ukqolcziqcuplqfgrmsh.supabase.co';

// Разрешённые origins для CORS
const ALLOWED_ORIGINS = [
  'https://heys-v2-web.vercel.app',
  'https://heys-v2.vercel.app',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://127.0.0.1:3001',
];

export const config = {
  runtime: 'edge',
};

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  
  // Получаем path после /api/supabase/
  const pathMatch = url.pathname.match(/^\/api\/supabase\/(.*)$/);
  const supabasePath = pathMatch ? pathMatch[1] : '';
  
  // Собираем целевой URL
  const targetUrl = `${SUPABASE_URL}/${supabasePath}${url.search}`;
  
  // CORS: проверяем origin
  const origin = request.headers.get('origin') || '';
  const isAllowedOrigin = ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed));
  const corsOrigin = isAllowedOrigin ? origin : ALLOWED_ORIGINS[0];
  
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey, x-client-info, Accept, Prefer',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  try {
    // Копируем headers из запроса, пробрасываем в Supabase
    const headers = new Headers();
    
    // Обязательные headers для Supabase
    const authHeader = request.headers.get('Authorization');
    if (authHeader) {
      headers.set('Authorization', authHeader);
    }
    
    const apiKey = request.headers.get('apikey');
    if (apiKey) {
      headers.set('apikey', apiKey);
    }
    
    const contentType = request.headers.get('Content-Type');
    if (contentType) {
      headers.set('Content-Type', contentType);
    }
    
    const accept = request.headers.get('Accept');
    if (accept) {
      headers.set('Accept', accept);
    }
    
    const prefer = request.headers.get('Prefer');
    if (prefer) {
      headers.set('Prefer', prefer);
    }
    
    const clientInfo = request.headers.get('x-client-info');
    if (clientInfo) {
      headers.set('x-client-info', clientInfo);
    }

    // Выполняем запрос к Supabase
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' 
        ? await request.text() 
        : undefined,
    });

    // Получаем тело ответа
    const responseBody = await response.text();

    // Возвращаем ответ с CORS headers
    const responseHeaders = new Headers();
    responseHeaders.set('Access-Control-Allow-Origin', corsOrigin);
    responseHeaders.set('Access-Control-Allow-Credentials', 'true');
    
    // Копируем важные headers из ответа Supabase
    const contentTypeResponse = response.headers.get('Content-Type');
    if (contentTypeResponse) {
      responseHeaders.set('Content-Type', contentTypeResponse);
    }
    
    const cacheControl = response.headers.get('Cache-Control');
    if (cacheControl) {
      responseHeaders.set('Cache-Control', cacheControl);
    }

    return new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    // Edge runtime logging - silent in production
    
    return new Response(
      JSON.stringify({ 
        error: 'Proxy error', 
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': corsOrigin,
        },
      }
    );
  }
}
