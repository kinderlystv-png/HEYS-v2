// Supabase password grant proxy

const SUPABASE_URL = 'https://ukqolcziqcuplqfgrmsh.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrcW9sY3ppcWN1cGxxZmdybXNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzE2ODc0MjAsImV4cCI6MjA0NzI2MzQyMH0.OKwSzfNqQA7q_LdxkcmGRmA_J5OUPpzuUbDah8TLN64'

export default async function handler(req, res) {
  const targetUrl = `${SUPABASE_URL}/auth/v1/token${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`

  if (req.method === 'OPTIONS') {
    res.status(204)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, apikey, x-client-info, Accept, Prefer')
    return res.end()
  }

  const headers = {
    apikey: SUPABASE_ANON_KEY,
    'Content-Type': req.headers['content-type'] || 'application/json',
    authorization: req.headers['authorization'] || `Bearer ${SUPABASE_ANON_KEY}`,
  }

  // Читаем тело запроса вручную (для Node serverless)
  let body
  if (req.method !== 'GET' && req.method !== 'HEAD') {
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
    upstream.headers.forEach((value, key) => res.setHeader(key, value))
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Credentials', 'true')

    return res.end(buf)
  } catch (error) {
    res.status(500)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Access-Control-Allow-Origin', '*')
    return res.end(JSON.stringify({ error: 'Proxy error', message: error.message }))
  }
}
