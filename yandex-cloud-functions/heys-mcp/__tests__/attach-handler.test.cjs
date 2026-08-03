'use strict';

/**
 * Маршруты /mcp/attach* на уровне HTTP-функции: без cookie страница отдаёт
 * форму входа, JSON-эндпоинты без cookie отвечают 401, статика (манифест,
 * иконка) отдаётся без авторизации. Сам вход (curatorLogin) здесь не
 * проверяется — он идёт по сети через heys-api.js, как и у /mcp/authorize,
 * и в этом файле, как и в handler.test.cjs, сеть не поднимается.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.MCP_TOKEN_SECRET = 'unit-test-secret-'.repeat(3);
const { handler } = require('../index');

const HOST = 'api.heyslab.ru';

function call(event) {
  return handler({ headers: { host: HOST }, ...event });
}

function body(res) {
  return JSON.parse(res.body);
}

test('GET /mcp/attach без cookie отдаёт страницу входа, не приложение', async () => {
  const res = await call({ httpMethod: 'GET', path: '/mcp/attach' });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['Content-Type'], /text\/html/);
  assert.match(res.body, /Вход тем же кураторским аккаунтом/);
  assert.doesNotMatch(res.body, /id="results"/);
});

test('GET /mcp/attach с мусором вместо cookie тоже отдаёт вход, а не 500', async () => {
  const res = await call({ httpMethod: 'GET', path: '/mcp/attach', headers: { host: HOST, cookie: 'heys_attach_session=не-похоже-на-токен' } });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Вход тем же кураторским аккаунтом/);
});

test('страница входа не встраивается в iframe, кешируется как no-store, CSP пускает только nonce-скрипт', async () => {
  const res = await call({ httpMethod: 'GET', path: '/mcp/attach' });
  assert.equal(res.headers['X-Frame-Options'], 'DENY');
  assert.equal(res.headers['Cache-Control'], 'no-store');
  const csp = res.headers['Content-Security-Policy'];
  assert.match(csp, /script-src 'self' 'nonce-/);
  const scriptSrc = /script-src[^;]*/.exec(csp)[0];
  assert.equal(scriptSrc.includes('unsafe-inline'), false);
});

test('POST /mcp/attach/search и /upload без cookie отвечают 401, а не тянут задачник', async () => {
  const search = await call({ httpMethod: 'GET', path: '/mcp/attach/search', queryStringParameters: { q: 'что угодно' } });
  assert.equal(search.statusCode, 401);
  assert.equal(body(search).error, 'not_authenticated');

  const upload = await call({
    httpMethod: 'POST', path: '/mcp/attach/upload',
    body: JSON.stringify({ project: 'heys', hash: 'abcdef', filename: 'a.jpg', caption: 'x', content_base64: 'eA==' }),
  });
  assert.equal(upload.statusCode, 401);
  assert.equal(body(upload).error, 'not_authenticated');
});

test('POST /mcp/attach/login без email или пароля отклоняется до сетевого похода', async () => {
  const res = await call({ httpMethod: 'POST', path: '/mcp/attach/login', body: 'email=&password=' });
  assert.equal(res.statusCode, 400);
  assert.match(res.body, /Введите email и пароль/);
});

test('GET /mcp/attach/manifest.webmanifest отдаётся без авторизации', async () => {
  const res = await call({ httpMethod: 'GET', path: '/mcp/attach/manifest.webmanifest' });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['Content-Type'], /manifest\+json/);
  const manifest = body(res);
  assert.equal(manifest.start_url, '/mcp/attach');
  assert.equal(manifest.display, 'standalone');
});

test('GET /mcp/attach/icon.png отдаёт PNG-байты без авторизации', async () => {
  const res = await call({ httpMethod: 'GET', path: '/mcp/attach/icon.png' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Content-Type'], 'image/png');
  assert.equal(res.isBase64Encoded, true);
  const png = Buffer.from(res.body, 'base64');
  assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
});

test('неизвестный подпуть /mcp/attach/* — 404, а не страница входа', async () => {
  const res = await call({ httpMethod: 'GET', path: '/mcp/attach/whatever' });
  assert.equal(res.statusCode, 404);
});

test('logout снимает cookie независимо от того, была ли она валидной', async () => {
  const res = await call({ httpMethod: 'POST', path: '/mcp/attach/logout', headers: { host: HOST, cookie: 'heys_attach_session=мусор' } });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['Set-Cookie'], /heys_attach_session=;.*Max-Age=0/);
});
