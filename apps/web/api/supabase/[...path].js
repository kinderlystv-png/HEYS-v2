/**
 * Vercel Edge Function — Supabase Proxy
 * JavaScript version for better Vercel compatibility
 */

export const config = {
  runtime: 'edge',
}

const SUPABASE_URL = 'https://ukqolcziqcuplqfgrmsh.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrcW9sY3ppcWN1cGxxZmdybXNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzE2ODc0MjAsImV4cCI6MjA0NzI2MzQyMH0.OKwSzfNqQA7q_LdxkcmGRmA_J5OUPpzuUbDah8TLN64'

const ALLOWED_ORIGINS = [
  'https://heys-v2-web.vercel.app',
  'https://heys-v2.vercel.app',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://127.0.0.1:3001',
]

export default async function handler(request) {
  const url = new URL(request.url)
  
  // Извлекаем путь после /api/supabase/
  const pathMatch = url.pathname.match(/^\/api\/supabase\/(.*)$/)
  const supabasePath = pathMatch ? pathMatch[1] : ''
  
  // Строим URL для Supabase
  const targetUrl = `${SUPABASE_URL}/${supabasePath}${url.search}`
  
  // CORS
  const origin = request.headers.get('origin') || ''
  const isAllowedOrigin = ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed))
  const corsOrigin = isAllowedOrigin ? origin : ALLOWED_ORIGINS[0]
  
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
    })
  }
  
  // Копируем заголовки
  const headers = new Headers()
  headers.set('apikey', SUPABASE_ANON_KEY)
  headers.set('Content-Type', request.headers.get('Content-Type') || 'application/json')
  
  // Копируем Authorization если есть
  const auth = request.headers.get('Authorization')
  if (auth) {
    headers.set('Authorization', auth)
  } else {
    headers.set('Authorization', `Bearer ${SUPABASE_ANON_KEY}`)
  }
  
  // Prefer header для PostgREST
  const prefer = request.headers.get('Prefer')
  if (prefer) {
    headers.set('Prefer', prefer)
  }
  
  try {
    // Прокси запрос
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' 
        ? await request.text() 
        : undefined,
    })
    
    // Создаём новые headers для ответа
    const responseHeaders = new Headers(response.headers)
    responseHeaders.set('Access-Control-Allow-Origin', corsOrigin)
    responseHeaders.set('Access-Control-Allow-Credentials', 'true')
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Proxy error', message: error.message }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': corsOrigin,
        },
      }
    )
  }
}
