/**
 * Supabase Auth Logout proxy
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ukqolcziqcuplqfgrmsh.supabase.co'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

export default async function handler(req, res) {
  if (!SUPABASE_ANON_KEY) {
    res.status(500)
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'Missing SUPABASE_ANON_KEY env' }))
  }

  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
  const targetUrl = `${SUPABASE_URL}/auth/v1/logout${query}`

  if (req.method === 'OPTIONS') {
    res.status(204)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, apikey, x-client-info, Accept')
    return res.end()
  }

  const headers = {
    apikey: SUPABASE_ANON_KEY,
    'Content-Type': req.headers['content-type'] || 'application/json',
    Accept: 'application/json',
    Authorization: req.headers['authorization'] || `Bearer ${SUPABASE_ANON_KEY}`,
    'x-client-info': req.headers['x-client-info'] || 'heys-proxy',
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
    })

    const buf = Buffer.from(await upstream.arrayBuffer())

    res.status(upstream.status)
    const skipHeaders = ['content-encoding', 'transfer-encoding', 'content-length']
    upstream.headers.forEach((value, key) => {
      if (!skipHeaders.includes(key.toLowerCase())) {
        res.setHeader(key, value)
      }
    })
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
