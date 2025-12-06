/**
 * Debug endpoint to see what Vercel passes to the handler
 */
export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`)
  
  res.status(200)
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  
  return res.end(JSON.stringify({
    url: req.url,
    pathname: url.pathname,
    search: url.search,
    query: Object.fromEntries(url.searchParams),
    headers: {
      'x-invoke-path': req.headers['x-invoke-path'],
      'x-invoke-query': req.headers['x-invoke-query'],
      'x-matched-path': req.headers['x-matched-path'],
      'x-vercel-id': req.headers['x-vercel-id'],
    }
  }, null, 2))
}
