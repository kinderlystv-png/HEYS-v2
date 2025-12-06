/**
 * Vercel Serverless Function — Supabase Proxy
 * Node runtime (без Edge), т.к. Edge-функции не подхватываются в этом проекте.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ukqolcziqcuplqfgrmsh.supabase.co'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

const ALLOWED_ORIGINS = [
  'https://heys-v2-web.vercel.app',
  'https://heys-v2.vercel.app',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://127.0.0.1:3001',
]

export default async function handler(req, res) {
  if (!SUPABASE_ANON_KEY) {
    res.status(500)
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'Missing SUPABASE_ANON_KEY env' }))
  }
  const url = new URL(req.url, `http://${req.headers.host}`)
  
  // Извлекаем путь после /api/supabase/
  const pathMatch = url.pathname.match(/^\/api\/supabase\/(.*)$/)
  const supabasePath = pathMatch ? pathMatch[1] : ''
  
  // Строим URL для Supabase
  const targetUrl = `${SUPABASE_URL}/${supabasePath}${url.search}`
  
  // CORS
  const origin = req.headers.origin || ''
  const isAllowedOrigin = ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed))
  const corsOrigin = isAllowedOrigin ? origin : ALLOWED_ORIGINS[0]
  
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(204)
    res.setHeader('Access-Control-Allow-Origin', corsOrigin)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, apikey, x-client-info, Accept, Prefer')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Max-Age', '86400')
    return res.end()
  }
  
  // Копируем заголовки
  const headers = new Headers()
  headers.set('apikey', SUPABASE_ANON_KEY)
  headers.set('Content-Type', req.headers['content-type'] || 'application/json')
  headers.set('Accept', 'application/json')
  
  // Копируем Authorization если есть
  const auth = req.headers['authorization']
  if (auth) {
    headers.set('Authorization', auth)
  } else {
    headers.set('Authorization', `Bearer ${SUPABASE_ANON_KEY}`)
  }
  headers.set('x-client-info', req.headers['x-client-info'] || 'heys-proxy')
  
  // Prefer header для PostgREST
  const prefer = req.headers['prefer']
  if (prefer) {
    headers.set('Prefer', prefer)
  }
  
  try {
    // Прокси запрос
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' 
        ? req.body && typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {})
        : undefined,
    })
    
    // Прокидываем тело и статус в ответ
    res.status(response.status)
    res.setHeader('Access-Control-Allow-Origin', corsOrigin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    // Копируем все заголовки ответа
    response.headers.forEach((value, key) => {
      res.setHeader(key, value)
    })
    const buf = Buffer.from(await response.arrayBuffer())
    return res.end(buf)
  } catch (error) {
    res.status(500)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Access-Control-Allow-Origin', corsOrigin)
    return res.end(JSON.stringify({ error: 'Proxy error', message: error.message }))
  }
}
