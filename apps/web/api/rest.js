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

  // Vercel rewrites change req.url, so we need the original path from headers
  const originalUrl = req.headers['x-vercel-proxy-signature-override'] 
    || req.headers['x-original-url']
    || req.headers['x-invoke-path']
    || req.url
  
  // Try to get table from Vercel's matched params first
  // Format: /api/supabase/rest/v1/TABLE_NAME?query...
  const fullUrl = originalUrl.startsWith('http') ? originalUrl : `http://localhost${originalUrl}`
  const url = new URL(fullUrl)
  
  // Get path from x-matched-path or parse from original URL
  let tableName = ''
  const matchedPath = req.headers['x-matched-path'] || ''
  
  if (matchedPath.includes(':table')) {
    // Vercel provides matched params - extract from original path
    const pathMatch = (req.headers['x-invoke-path'] || url.pathname).match(/\/api\/supabase\/rest\/v1\/([^/?]+)/)
    tableName = pathMatch ? pathMatch[1] : ''
  }
  
  // Fallback: check query param or try parsing URL
  if (!tableName) {
    tableName = url.searchParams.get('_table') || ''
  }
  
  // Last resort: try parsing the invoke query
  if (!tableName && req.headers['x-invoke-query']) {
    try {
      const invokeQuery = JSON.parse(decodeURIComponent(req.headers['x-invoke-query']))
      tableName = invokeQuery.table || ''
    } catch {}
  }

  if (!tableName) {
    res.status(400)
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ 
      error: 'Missing table name', 
      debug: { 
        url: req.url,
        invokeQuery: req.headers['x-invoke-query'],
        invokePath: req.headers['x-invoke-path'],
        matchedPath: req.headers['x-matched-path']
      }
    }))
  }

  // Reconstruct query string without _table param
  const queryParams = new URLSearchParams(url.search)
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
