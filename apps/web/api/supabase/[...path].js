/**
 * Vercel Edge Function - Supabase Proxy
 * Проксирует запросы к Supabase через Vercel для обхода блокировок
 */

export const config = {
  runtime: 'edge',
};

// Supabase URL из env или hardcoded
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://ukqolcziqcuplqfgrmsh.supabase.co';

export default async function handler(request) {
  const url = new URL(request.url);
  
  // Извлекаем путь после /api/supabase/
  const pathMatch = url.pathname.match(/\/api\/supabase\/(.*)/);
  const supabasePath = pathMatch ? pathMatch[1] : '';
  
  // Формируем URL к Supabase
  const targetUrl = `${SUPABASE_URL}/${supabasePath}${url.search}`;
  
  // Копируем заголовки, убирая host
  const headers = new Headers();
  for (const [key, value] of request.headers.entries()) {
    if (key.toLowerCase() !== 'host') {
      headers.set(key, value);
    }
  }
  
  try {
    // Проксируем запрос
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' 
        ? await request.text() 
        : undefined,
    });
    
    // Копируем ответ с CORS заголовками
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', '*');
    
    // Для OPTIONS запросов
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: responseHeaders,
      });
    }
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
