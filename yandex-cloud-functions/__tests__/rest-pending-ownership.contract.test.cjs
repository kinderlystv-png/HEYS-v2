// SEC-032 (2026-08-02): куратор правит только свою очередь модерации.
//
// Регрессия, которую ловит этот тест: гейт SEC-028 требовал кураторский JWT,
// но не проверял владение строкой. Куратор A с валидным токеном мог через
// прямой REST-вызов изменить или удалить заявку куратора B — штатный путь
// (RPC moderate_pending_shared_product_by_curator) ownership проверяет, а REST
// шёл мимо.
//
// Инвариант: в SQL PATCH/DELETE по shared_products_pending всегда есть условие
// по curator_id из токена, даже если в запросе фильтра по нему не было.

const assert = require('assert');
const crypto = require('crypto');
const Module = require('module');
const test = require('node:test');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'rest-pending-ownership-contract-secret';

const CURATOR_A = '11111111-1111-4111-8111-111111111111';
const CURATOR_B = '22222222-2222-4222-8222-222222222222';
const PENDING_ID = '33333333-3333-4333-8333-333333333333';

const executed = [];

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === './secrets') {
    return { initSecrets: async () => {} };
  }
  if (request === './db-pool') {
    const client = {
      query: async (sql, values) => {
        executed.push({ sql: String(sql), values: values || [] });
        return { rows: [], rowCount: 0 };
      },
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

function curatorJwt(sub) {
  const header = base64Url({ alg: 'HS256', typ: 'JWT' });
  const payload = base64Url({
    sub,
    role: 'curator',
    email: 'curator@example.com',
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

function eventFor({ method, query, body = null, sub = CURATOR_A, table = 'shared_products_pending' }) {
  return {
    httpMethod: method,
    path: `/rest/${table}`,
    pathParameters: { table },
    queryStringParameters: { ...query },
    headers: { cookie: `heys_curator_jwt=${encodeURIComponent(curatorJwt(sub))}` },
    body: body === null ? undefined : JSON.stringify(body),
  };
}

const { handler } = require('../heys-api-rest/index.js');

test.beforeEach(() => {
  executed.length = 0;
});

test('PATCH только по id всё равно ограничен своим curator_id', async () => {
  const res = await handler(eventFor({
    method: 'PATCH',
    query: { 'eq.id': PENDING_ID },
    body: { status: 'approved' },
  }));
  assert.equal(res.statusCode, 200);
  const update = executed.find((q) => q.sql.startsWith('UPDATE'));
  assert.ok(update, 'UPDATE должен был выполниться');
  assert.match(update.sql, /"curator_id" = \$\d+/);
  assert.ok(update.values.includes(CURATOR_A), 'в параметрах должен быть curator_id из токена');
});

test('DELETE только по id всё равно ограничен своим curator_id', async () => {
  const res = await handler(eventFor({
    method: 'DELETE',
    query: { 'eq.id': PENDING_ID },
  }));
  assert.equal(res.statusCode, 200);
  const del = executed.find((q) => q.sql.startsWith('DELETE'));
  assert.ok(del, 'DELETE должен был выполниться');
  assert.match(del.sql, /"curator_id" = \$\d+/);
  assert.ok(del.values.includes(CURATOR_A));
});

test('PATCH с чужим curator_id в фильтре отклоняется', async () => {
  const res = await handler(eventFor({
    method: 'PATCH',
    query: { 'eq.id': PENDING_ID, 'eq.curator_id': CURATOR_B },
    body: { status: 'approved' },
  }));
  assert.equal(res.statusCode, 403);
  assert.match(String(res.body), /cross_curator_forbidden/);
  assert.equal(executed.filter((q) => q.sql.startsWith('UPDATE')).length, 0);
});

test('DELETE с чужим curator_id в фильтре отклоняется', async () => {
  const res = await handler(eventFor({
    method: 'DELETE',
    query: { 'eq.id': PENDING_ID, 'curator_id': `eq.${CURATOR_B}` },
  }));
  assert.equal(res.statusCode, 403);
  assert.match(String(res.body), /cross_curator_forbidden/);
  assert.equal(executed.filter((q) => q.sql.startsWith('DELETE')).length, 0);
});

test('свой curator_id в фильтре проходит и не дублирует условие некорректно', async () => {
  const res = await handler(eventFor({
    method: 'PATCH',
    query: { 'eq.id': PENDING_ID, 'eq.curator_id': CURATOR_A },
    body: { status: 'approved' },
  }));
  assert.equal(res.statusCode, 200);
  const update = executed.find((q) => q.sql.startsWith('UPDATE'));
  assert.ok(update.values.filter((v) => v === CURATOR_A).length >= 1);
});

test('shared_products под правило не попадает — у каталога нет владельца', async () => {
  const res = await handler(eventFor({
    method: 'PATCH',
    table: 'shared_products',
    query: { 'eq.id': PENDING_ID },
    body: { name: 'Творог 5%' },
  }));
  assert.equal(res.statusCode, 200);
  const update = executed.find((q) => q.sql.startsWith('UPDATE'));
  assert.ok(update, 'UPDATE должен был выполниться');
  assert.ok(!update.sql.includes('curator_id'), 'в общий каталог curator_id не подставляется');
});
