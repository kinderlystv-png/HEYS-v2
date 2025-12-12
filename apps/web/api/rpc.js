/**
 * Supabase RPC proxy — handler for PostgreSQL functions
 * Route: /api/supabase/rest/v1/rpc/:fn → /api/rpc?fn=:fn
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ukqolcziqcuplqfgrmsh.supabase.co'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

const ALLOWED_ORIGINS = [
  'https://heys-v2-web.vercel.app',
  'https://heys-v2.vercel.app',
  'http://localhost:3001',
  'http://localhost:5173',
]

export default async function handler(req, res) {
  if (!SUPABASE_ANON_KEY) {
    res.status(500)
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'Missing SUPABASE_ANON_KEY env' }))
  }

  const url = new URL(req.url, `http://${req.headers.host}`)
  
  // Vercel rewrite adds 'fn' param from :fn in source path
  const fnName = url.searchParams.get('fn') || ''
  
  if (!fnName) {
    res.status(400)
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'Missing function name' }))
  }

  const targetUrl = `${SUPABASE_URL}/rest/v1/rpc/${fnName}`

  const origin = req.headers.origin || ''
  const isAllowedOrigin = ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed))
  const corsOrigin = isAllowedOrigin ? origin : ALLOWED_ORIGINS[0]

  if (req.method === 'OPTIONS') {
    res.status(204)
    res.setHeader('Access-Control-Allow-Origin', corsOrigin)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, apikey, x-client-info, Accept, Prefer')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Max-Age', '86400')
    return res.end()
  }

  const headers = {
    apikey: SUPABASE_ANON_KEY,
    'Content-Type': req.headers['content-type'] || 'application/json',
    Accept: req.headers['accept'] || 'application/json',
    Authorization: req.headers['authorization'] || `Bearer ${SUPABASE_ANON_KEY}`,
    'x-client-info': req.headers['x-client-info'] || 'heys-proxy',
  }

  if (req.headers['prefer']) {
    headers['Prefer'] = req.headers['prefer']
  }

  let body
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      const chunks = []
      for await (const chunk of req) {
        chunks.push(chunk)
      }
      body = Buffer.concat(chunks).toString()
    } catch (e) {
      body = undefined
    }
  }

  try {
    const fetchRes = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: body || undefined,
    })

    // Get response as buffer to avoid encoding issues
    const data = await fetchRes.arrayBuffer()

    res.status(fetchRes.status)
    res.setHeader('Access-Control-Allow-Origin', corsOrigin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')

    // Forward headers except problematic ones
    const skipHeaders = ['content-encoding', 'transfer-encoding', 'content-length']
    for (const [key, value] of fetchRes.headers.entries()) {
      if (!skipHeaders.includes(key.toLowerCase())) {
        res.setHeader(key, value)
      }
    }

    return res.end(Buffer.from(data))
  } catch (err) {
    res.status(500)
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'Proxy error', message: err.message }))
  }
}
