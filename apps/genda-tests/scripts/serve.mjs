import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(appRoot, 'dist');
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };

createServer((request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(root, relative);
  if (!filePath.startsWith(`${root}${path.sep}`) || !statSafe(filePath)) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.setHeader('Content-Type', types[path.extname(filePath)] || 'application/octet-stream');
  response.setHeader('Cache-Control', relative === 'index.html' ? 'no-store' : 'public, max-age=31536000, immutable');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'none'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'");
  createReadStream(filePath).pipe(response);
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}`));

function statSafe(filePath) {
  try { return statSync(filePath).isFile(); } catch { return false; }
}
