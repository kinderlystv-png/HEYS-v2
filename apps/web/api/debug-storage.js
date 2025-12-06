/**
 * Debug endpoint to see what Vercel passes to storage handler
 */
export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`)
  
  // Get storage path from multiple sources
  let storagePath = url.searchParams.get('storagePath') || ''
  
  if (!storagePath) {
    const invokePath = req.headers['x-invoke-path'] || req.url
    const pathMatch = invokePath.match(/\/api\/supabase\/storage\/v1\/(.+?)(?:\?|$)/)
    storagePath = pathMatch ? pathMatch[1] : ''
  }
  
  res.status(200)
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  
  return res.end(JSON.stringify({
    reqUrl: req.url,
    urlPathname: url.pathname,
    urlSearch: url.search,
    storagePathFromQuery: url.searchParams.get('storagePath'),
    invokePath: req.headers['x-invoke-path'],
    matchedPath: req.headers['x-matched-path'],
    extractedStoragePath: storagePath,
    method: req.method,
    queryParams: Object.fromEntries(url.searchParams)
  }, null, 2))
}
