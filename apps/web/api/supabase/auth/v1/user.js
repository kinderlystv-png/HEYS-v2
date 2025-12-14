// Supabase /auth/v1/user proxy — получение текущего пользователя по токену

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ukqolcziqcuplqfgrmsh.supabase.co'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

export default async function handler(req, res) {
  if (!SUPABASE_ANON_KEY) {
    res.status(500)
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'Missing SUPABASE_ANON_KEY env' }))
  }

  const targetUrl = `${SUPABASE_URL}/auth/v1/user`

  if (req.method === 'OPTIONS') {
    res.status(204)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, apikey, x-client-info, Accept')
    return res.end()
  }

  // Authorization header ОБЯЗАТЕЛЕН — содержит Bearer токен пользователя
  const authHeader = req.headers['authorization']
  if (!authHeader) {
    res.status(401)
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'Missing Authorization header' }))
  }

  const headers = {
    apikey: SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: authHeader,
    'x-client-info': req.headers['x-client-info'] || 'heys-proxy',
  }

  // Для PUT (обновление профиля) читаем тело
  let body
  if (req.method === 'PUT') {
    body = await new Promise((resolve, reject) => {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => resolve(Buffer.concat(chunks)))
      req.on('error', reject)
    })
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    })

    const buf = Buffer.from(await upstream.arrayBuffer())

    res.status(upstream.status)
    // Копируем заголовки, кроме проблемных
    const skipHeaders = ['content-encoding', 'transfer-encoding', 'content-length']
    upstream.headers.forEach((value, key) => {
      if (!skipHeaders.includes(key.toLowerCase())) {
        res.setHeader(key, value)
      }
    })
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Length', buf.length)
    return res.end(buf)
  } catch (err) {
    res.status(502)
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'Proxy error', message: err.message }))
  }
}
