// Simple health check endpoint — быстрый ответ для cold start warm-up
// Не делает запросы к Supabase, просто возвращает ok
export const config = {
  runtime: 'edge',
};

const APP_VERSION = '12.5.0'; // Синхронизировать с package.json

export default function handler(request: Request): Response {
  // CORS headers для кросс-доменных запросов
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  };
  
  // Handle preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }
  
  return new Response(
    JSON.stringify({ 
      status: 'ok',
      version: APP_VERSION,
      timestamp: Date.now(),
      edge: true // Индикация что это edge function (быстрая)
    }),
    { status: 200, headers }
  );
}
