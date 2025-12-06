/**
 * Supabase REST proxy — generic handler for all tables
 * Since [...path].js doesn't work reliably in Vercel nested folders,
 * this is a flat proxy that handles the path from query param
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
  
  // Vercel rewrite adds 'table' param from :table in source path
  const tableName = url.searchParams.get('table') || url.searchParams.get('_table') || ''
  
  if (!tableName) {
    res.status(400)
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'Missing table name' }))
  }

  // Remove table param, keep the rest for Supabase
  const queryParams = new URLSearchParams(url.search)
  queryParams.delete('table')
  queryParams.delete('_table')
  const queryString = queryParams.toString() ? `?${queryParams.toString()}` : ''
  
  const targetUrl = `${SUPABASE_URL}/rest/v1/${tableName}${queryString}`

  const origin = req.headers.origin || ''
  const isAllowedOrigin = ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed))
  const corsOrigin = isAllowedOrigin ? origin : ALLOWED_ORIGINS[0]

  if (req.method === 'OPTIONS') {
    res.status(204)
    res.setHeader('Access-Control-Allow-Origin', corsOrigin)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, apikey, x-client-info, Accept, Prefer, Range')
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
  if (req.headers['range']) {
    headers['Range'] = req.headers['range']
  }

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
    const skipHeaders = ['content-encoding', 'transfer-encoding', 'content-length']
    upstream.headers.forEach((value, key) => {
      if (!skipHeaders.includes(key.toLowerCase())) {
        res.setHeader(key, value)
      }
    })
    res.setHeader('Access-Control-Allow-Origin', corsOrigin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    
    return res.end(buf)
  } catch (error) {
    res.status(500)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Access-Control-Allow-Origin', corsOrigin)
    return res.end(JSON.stringify({ error: 'Proxy error', message: error.message }))
  }
}
