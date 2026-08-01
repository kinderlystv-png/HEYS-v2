// SEC-028 (2026-08-02): запись в каталог общих продуктов через REST требует куратора.
//
// Регрессия, которую ловит этот тест: POST /rest/shared_products с валидным телом
// проходил без любой аутентификации. CORS-гейт пропускает origin === null (curl),
// generic INSERT для этой таблицы не имел проверки роли, а пул подключается под
// владельцем таблиц (PG_USER=heys_admin), поэтому RLS не применялся. Итог —
// произвольная строка в общем каталоге мимо очереди модерации.

const assert = require('assert');
const crypto = require('crypto');
const Module = require('module');
const test = require('node:test');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'rest-write-auth-contract-secret';

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === './secrets') {
    return { initSecrets: async () => {} };
  }
  if (request === './db-pool') {
    const client = {
      query: async () => ({ rows: [], rowCount: 0 }),
      release() {},
    };
    return {
      getPool: () => ({ connect: async () => client }),
      acquireHealthyClient: async () => client,
      withClient: async (fn) => fn(client),
      closePool: async () => {},
      getAllPools: () => [],
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

function base64Url(value) {
  return Buffer.from(JSON.stringify(value))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function signJwt(role) {
  const header = base64Url({ alg: 'HS256', typ: 'JWT' });
  const payload = base64Url({
    sub: '11111111-1111-4111-8111-111111111111',
    role,
    email: 'actor@example.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const signature = crypto
    .createHmac('sha256', process.env.JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return `${header}.${payload}.${signature}`;
}

function eventFor({ table, method = 'POST', token = null, origin = null }) {
  return {
    httpMethod: method,
    path: `/rest/${table}`,
    pathParameters: { table },
    headers: {
      ...(origin ? { origin } : {}),
      ...(token ? { cookie: `heys_curator_jwt=${encodeURIComponent(token)}` } : {}),
    },
    body: JSON.stringify([{ id: '22222222-2222-4222-8222-222222222222', name: 'contract probe' }]),
  };
}

const { handler } = require('../heys-api-rest/index.js');

for (const table of ['shared_products', 'shared_products_pending']) {
  test(`${table}: анонимная запись отклоняется (curl без Origin и без токена)`, async () => {
    const res = await handler(eventFor({ table }));
    assert.equal(res.statusCode, 401);
    assert.match(String(res.body), /curator_auth_required/);
  });

  test(`${table}: не-кураторский JWT отклоняется`, async () => {
    const res = await handler(eventFor({ table, token: signJwt('client') }));
    assert.equal(res.statusCode, 403);
    assert.match(String(res.body), /curator_role_required/);
  });

  test(`${table}: кураторский JWT проходит гейт`, async () => {
    const res = await handler(
      eventFor({ table, token: signJwt('curator'), origin: 'https://app.heyslab.ru' })
    );
    assert.ok(
      res.statusCode !== 401 && res.statusCode !== 403,
      `куратор не должен блокироваться, получено ${res.statusCode}: ${res.body}`
    );
  });
}

test('shared_products: чтение остаётся доступным без кураторского токена', async () => {
  const res = await handler(eventFor({ table: 'shared_products', method: 'GET' }));
  assert.ok(
    res.statusCode !== 401 && res.statusCode !== 403,
    `GET не должен требовать куратора, получено ${res.statusCode}: ${res.body}`
  );
});
