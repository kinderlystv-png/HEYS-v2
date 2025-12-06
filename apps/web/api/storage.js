/**
 * Supabase Storage proxy
 * Handles /api/supabase/storage/v1/* requests (images, files)
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
  
  // Get storage path from multiple sources (in order of priority):
  // 1. Query param 'storagePath' (added by Vercel rewrite)
  // 2. x-invoke-path header (fallback)
  // 3. Extract from req.url directly
  let storagePath = url.searchParams.get('storagePath') || ''
  
  if (!storagePath) {
    // Fallback to x-invoke-path header
    const invokePath = req.headers['x-invoke-path'] || req.url
    const pathMatch = invokePath.match(/\/api\/supabase\/storage\/v1\/(.+?)(?:\?|$)/)
    storagePath = pathMatch ? pathMatch[1] : ''
  }
  
  // Remove storagePath from query params for target URL
  url.searchParams.delete('storagePath')
  const queryString = url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''
  
  if (!storagePath) {
    res.status(400)
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ 
      error: 'Missing storage path',
      debug: {
        reqUrl: req.url,
        invokePath: req.headers['x-invoke-path'],
        matchedPath: req.headers['x-matched-path']
      }
    }))
  }

  const targetUrl = `${SUPABASE_URL}/storage/v1/${storagePath}${queryString}`

  const origin = req.headers.origin || ''
  const isAllowedOrigin = ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed))
  const corsOrigin = isAllowedOrigin ? origin : ALLOWED_ORIGINS[0]

  if (req.method === 'OPTIONS') {
    res.status(204)
    res.setHeader('Access-Control-Allow-Origin', corsOrigin)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, apikey, x-client-info, Accept')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Max-Age', '86400')
    return res.end()
  }

  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: req.headers['authorization'] || `Bearer ${SUPABASE_ANON_KEY}`,
    'x-client-info': req.headers['x-client-info'] || 'heys-proxy',
  }

  // For uploads, pass content-type
  if (req.headers['content-type']) {
    headers['Content-Type'] = req.headers['content-type']
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
    
    // Cache public images
    if (storagePath.includes('/public/') && upstream.status === 200) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    }
    
    return res.end(buf)
  } catch (error) {
    res.status(500)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Access-Control-Allow-Origin', corsOrigin)
    return res.end(JSON.stringify({ error: 'Proxy error', message: error.message }))
  }
}
