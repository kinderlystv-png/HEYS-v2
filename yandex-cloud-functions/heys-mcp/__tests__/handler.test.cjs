'use strict';

/** Проверка HTTP-слоя функции: маршруты, заголовки и OAuth-цикл без сети. */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.MCP_TOKEN_SECRET = 'unit-test-secret-'.repeat(3);
const { handler } = require('../index');

const HOST = 'api.heyslab.ru';
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';

function call(event) {
  return handler({ headers: { host: HOST }, ...event });
}

function body(res) {
  return JSON.parse(res.body);
}

test('метаданные защищённого ресурса указывают на свой authorization server', async () => {
  const res = await call({ httpMethod: 'GET', path: '/.well-known/oauth-protected-resource/mcp' });
  assert.equal(res.statusCode, 200);
  const meta = body(res);
  assert.equal(meta.resource, `https://${HOST}/mcp`);
  assert.deepEqual(meta.authorization_servers, [`https://${HOST}`]);
});

test('метаданные authorization server отдаются для корня и обоих MCP-ресурсов', async () => {
  for (const path of [
    '/.well-known/oauth-authorization-server',
    '/.well-known/oauth-authorization-server/mcp',
    '/.well-known/oauth-authorization-server/mcp/curator',
    '/.well-known/oauth-authorization-server/mcp/chatgpt/curator',
  ]) {
    const res = await call({ httpMethod: 'GET', path });
    assert.equal(res.statusCode, 200, path);
    assert.equal(body(res).registration_endpoint, `https://${HOST}/mcp/register`);
  }
});

test('MCP без токена отвечает 401 с указателем на метаданные ресурса', async () => {
  const res = await call({ httpMethod: 'POST', path: '/mcp', body: '{}' });
  assert.equal(res.statusCode, 401);
  assert.match(res.headers['WWW-Authenticate'], /resource_metadata="https:\/\/api\.heyslab\.ru\/\.well-known\/oauth-protected-resource\/mcp"/);
});

test('GET /mcp без токена рекламирует OAuth metadata', async () => {
  const res = await call({ httpMethod: 'GET', path: '/mcp' });
  assert.equal(res.statusCode, 401);
  assert.match(res.headers['WWW-Authenticate'], /resource_metadata="https:\/\/api\.heyslab\.ru\/\.well-known\/oauth-protected-resource\/mcp"/);
});

test('/mcp/curator — POST и GET без токена указывают на свои OAuth metadata', async () => {
  const post = await call({ httpMethod: 'POST', path: '/mcp/curator', body: '{}' });
  assert.equal(post.statusCode, 401);
  assert.equal(body(post).error, 'invalid_token');

  const get = await call({ httpMethod: 'GET', path: '/mcp/curator' });
  assert.equal(get.statusCode, 401);
  assert.match(get.headers['WWW-Authenticate'], /resource_metadata="https:\/\/api\.heyslab\.ru\/\.well-known\/oauth-protected-resource\/mcp\/curator"/);
});

test('/mcp/chatgpt/curator — отдельный OAuth resource для обхода discovery-cache ChatGPT', async () => {
  const resource = '/mcp/chatgpt/curator';
  const get = await call({ httpMethod: 'GET', path: resource });
  assert.equal(get.statusCode, 401);
  assert.match(get.headers['WWW-Authenticate'], /resource_metadata="https:\/\/api\.heyslab\.ru\/\.well-known\/oauth-protected-resource\/mcp\/chatgpt\/curator"/);

  const meta = await call({ httpMethod: 'GET', path: `/.well-known/oauth-protected-resource${resource}` });
  assert.equal(meta.statusCode, 200);
  assert.equal(body(meta).resource, `https://${HOST}${resource}`);
});

test('каждый адрес транспорта ведёт за метаданными к себе, а не к соседу', async () => {
  const res = await call({ httpMethod: 'POST', path: '/mcp/curator', body: '{}' });
  assert.match(
    res.headers['WWW-Authenticate'],
    /resource_metadata="https:\/\/api\.heyslab\.ru\/\.well-known\/oauth-protected-resource\/mcp\/curator"/,
  );

  const meta = await call({ httpMethod: 'GET', path: '/.well-known/oauth-protected-resource/mcp/curator' });
  assert.equal(meta.statusCode, 200);
  assert.equal(body(meta).resource, `https://${HOST}/mcp/curator`);
});

test('метаданные неизвестного ресурса не выдумывают адрес, а отвечают за основной', async () => {
  for (const path of [
    '/.well-known/oauth-protected-resource',
    '/.well-known/oauth-protected-resource/mcp/чужое',
  ]) {
    const res = await call({ httpMethod: 'GET', path });
    assert.equal(res.statusCode, 200, path);
    assert.equal(body(res).resource, `https://${HOST}/mcp`, path);
  }
});

test('страница входа не встраивается в iframe и не кешируется', async () => {
  const reg = body(await call({
    httpMethod: 'POST', path: '/mcp/register',
    body: JSON.stringify({ client_name: 'Claude', redirect_uris: [REDIRECT] }),
  }));
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier, 'ascii').digest('base64url');
  const res = await call({
    httpMethod: 'GET',
    path: '/mcp/authorize',
    queryStringParameters: {
      client_id: reg.client_id, redirect_uri: REDIRECT, response_type: 'code',
      code_challenge: challenge, code_challenge_method: 'S256', state: 'abc',
    },
  });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['Content-Type'], /text\/html/);
  assert.equal(res.headers['X-Frame-Options'], 'DENY');
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.match(res.headers['Content-Security-Policy'], /base-uri 'none'/);
  assert.doesNotMatch(res.headers['Content-Security-Policy'], /form-action/);
  assert.match(res.body, /Разрешить доступ/);
  assert.match(res.body, /autocomplete="tel"/);
  assert.match(res.body, /autocomplete="current-password"/);
});

test('регистрация клиента отклоняет http-redirect и пустой список', async () => {
  const bad = await call({ httpMethod: 'POST', path: '/mcp/register', body: JSON.stringify({ redirect_uris: ['http://evil.example/cb'] }) });
  assert.equal(bad.statusCode, 400);
  const empty = await call({ httpMethod: 'POST', path: '/mcp/register', body: JSON.stringify({}) });
  assert.equal(empty.statusCode, 400);
});

test('authorize с чужим redirect_uri показывает ошибку, а не редиректит на него', async () => {
  const reg = body(await call({
    httpMethod: 'POST', path: '/mcp/register', body: JSON.stringify({ redirect_uris: [REDIRECT] }),
  }));
  const res = await call({
    httpMethod: 'GET', path: '/mcp/authorize',
    queryStringParameters: {
      client_id: reg.client_id, redirect_uri: 'https://attacker.example/cb',
      response_type: 'code', code_challenge: 'x', code_challenge_method: 'S256',
    },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.headers.Location, undefined);
});

test('token отклоняет неизвестный grant_type', async () => {
  const res = await call({ httpMethod: 'POST', path: '/mcp/token', body: 'grant_type=password&username=a' });
  assert.equal(res.statusCode, 400);
  assert.equal(body(res).error, 'unsupported_grant_type');
});

test('token с поддельным кодом не выдаёт доступ', async () => {
  const res = await call({
    httpMethod: 'POST', path: '/mcp/token',
    body: new URLSearchParams({
      grant_type: 'authorization_code', code: 'подделка',
      client_id: 'x', redirect_uri: REDIRECT, code_verifier: 'y'.repeat(64),
    }).toString(),
  });
  assert.equal(res.statusCode, 400);
  assert.equal(body(res).error, 'invalid_grant');
});

test('preflight отвечает без тела', async () => {
  const res = await call({ httpMethod: 'OPTIONS', path: '/mcp' });
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['Access-Control-Allow-Origin'], '*');
});

test('неизвестный путь — 404', async () => {
  const res = await call({ httpMethod: 'GET', path: '/mcp/whatever' });
  assert.equal(res.statusCode, 404);
});

test('битый JSON на /mcp не роняет функцию', async () => {
  const { authenticateAccessToken } = require('../lib/oauth');
  assert.equal(typeof authenticateAccessToken, 'function');
  const res = await call({ httpMethod: 'POST', path: '/mcp', body: '{невалидно', headers: { host: HOST, authorization: 'Bearer мусор' } });
  assert.equal(res.statusCode, 401);
});
