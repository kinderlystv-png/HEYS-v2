// SEC-029 (2026-08-02): имя колонки в REST-запросе не может быть произвольным.
//
// Регрессия, которую ловит этот тест: имя колонки бралось из ключа
// query-параметра (фильтры) или из ключа JSON-тела (INSERT) и подставлялось в
// SQL как идентификатор без экранирования — `"${fieldName}" = $1`. Двойная
// кавычка внутри имени закрывала идентификатор и позволяла дописать своё
// условие. В ветке `is.` плейсхолдер не добавляется вовсе, поэтому нумерация
// параметров не ломалась и запрос оставался синтаксически валидным: слепая
// инъекция на публичном GET-пути каталога.
//
// Инвариант: любое имя колонки проходит whitelist таблицы. Не прошло — 400 и
// ни одного SQL-запроса с чужим текстом.

const assert = require('assert');
const crypto = require('crypto');
const Module = require('module');
const test = require('node:test');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'rest-filter-column-contract-secret';

// Все SQL-запросы, которые функция попыталась выполнить в текущем тесте.
const executedQueries = [];

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === './secrets') {
    return { initSecrets: async () => {} };
  }
  if (request === './db-pool') {
    const client = {
      query: async (sql) => {
        executedQueries.push(String(sql));
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

function curatorJwt() {
  const header = base64Url({ alg: 'HS256', typ: 'JWT' });
  const payload = base64Url({
    sub: '11111111-1111-4111-8111-111111111111',
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

function eventFor({ table = 'shared_products', method = 'GET', query = {}, body = null, withCurator = false }) {
  return {
    httpMethod: method,
    path: `/rest/${table}`,
    pathParameters: { table },
    queryStringParameters: { ...query },
    headers: withCurator ? { cookie: `heys_curator_jwt=${encodeURIComponent(curatorJwt())}` } : {},
    body: body === null ? undefined : JSON.stringify(body),
  };
}

const { handler } = require('../heys-api-rest/index.js');

/** Ни один выполненный запрос не должен содержать текст инъекции. */
function assertNoInjectedSql(marker) {
  for (const sql of executedQueries) {
    assert.ok(
      !sql.includes(marker),
      `инъекция долетела до SQL: ${sql}`
    );
  }
}

test.beforeEach(() => {
  executedQueries.length = 0;
});

// ── GET: обе формы записи фильтра ────────────────────────────────────────────

test('GET: инъекция через ключ с оператором (is.) отклоняется', async () => {
  const res = await handler(eventFor({
    query: { 'is.x" IS NULL OR (SELECT 1) IS NULL --': 'null' },
  }));
  assert.equal(res.statusCode, 400);
  assert.match(String(res.body), /invalid_filter_column/);
  assertNoInjectedSql('SELECT 1');
});

test('GET: инъекция через ключ с оператором (eq.) отклоняется', async () => {
  const res = await handler(eventFor({
    query: { 'eq.name" = name OR "1': 'x' },
  }));
  assert.equal(res.statusCode, 400);
  assert.match(String(res.body), /invalid_filter_column/);
  assertNoInjectedSql('OR "1');
});

test('GET: инъекция через голый ключ (формат field=eq.value) отклоняется', async () => {
  const res = await handler(eventFor({
    query: { 'name" = name OR "1': 'eq.x' },
  }));
  assert.equal(res.statusCode, 400);
  assert.match(String(res.body), /invalid_filter_column/);
  assertNoInjectedSql('OR "1');
});

test('GET: колонка не из whitelist таблицы отклоняется', async () => {
  const res = await handler(eventFor({ query: { created_by_user_id: 'eq.x' } }));
  assert.equal(res.statusCode, 400);
  assert.match(String(res.body), /invalid_filter_column/);
});

test('GET: легальный фильтр по-прежнему работает', async () => {
  const res = await handler(eventFor({ query: { name: 'eq.Творог' } }));
  assert.equal(res.statusCode, 200);
  const select = executedQueries.find((q) => q.startsWith('SELECT'));
  assert.ok(select, 'SELECT должен был выполниться');
  assert.match(select, /WHERE "name" = \$1/);
});

test('GET: служебные параметры не считаются колонками', async () => {
  const res = await handler(eventFor({
    query: { select: 'id,name', order: 'name.asc', limit: '5', offset: '0' },
  }));
  assert.equal(res.statusCode, 200);
  const select = executedQueries.find((q) => q.startsWith('SELECT'));
  assert.ok(select && !select.includes('WHERE'), `служебные ключи не должны стать фильтрами: ${select}`);
});

// ── PATCH / DELETE ───────────────────────────────────────────────────────────

test('PATCH: инъекция в фильтре отклоняется', async () => {
  const res = await handler(eventFor({
    table: 'shared_products_pending',
    method: 'PATCH',
    withCurator: true,
    query: { 'eq.id" = id OR "1': 'x' },
    body: { status: 'approved' },
  }));
  assert.equal(res.statusCode, 400);
  assert.match(String(res.body), /invalid_filter_column/);
  assertNoInjectedSql('OR "1');
});

test('DELETE: инъекция в фильтре отклоняется', async () => {
  const res = await handler(eventFor({
    table: 'shared_products',
    method: 'DELETE',
    withCurator: true,
    query: { 'eq.id" = id OR "1': 'x' },
  }));
  assert.equal(res.statusCode, 400);
  assert.match(String(res.body), /invalid_filter_column/);
  assertNoInjectedSql('OR "1');
});

// ── POST: имена колонок из тела и on_conflict ────────────────────────────────

test('POST: инъекция через ключ JSON-тела отклоняется', async () => {
  const res = await handler(eventFor({
    table: 'shared_products',
    method: 'POST',
    withCurator: true,
    body: [{ 'name") VALUES ((SELECT 1)) --': 'x' }],
  }));
  assert.equal(res.statusCode, 400);
  assert.match(String(res.body), /invalid_insert_column/);
  assertNoInjectedSql('SELECT 1');
});

test('POST: инъекция через on_conflict отклоняется', async () => {
  const res = await handler(eventFor({
    table: 'shared_products',
    method: 'POST',
    withCurator: true,
    query: { upsert: 'true', on_conflict: 'id") DO UPDATE SET "name" = (SELECT 1) --' },
    body: [{ id: '22222222-2222-4222-8222-222222222222', name: 'probe' }],
  }));
  assert.equal(res.statusCode, 400);
  assert.match(String(res.body), /invalid_on_conflict_column/);
  assertNoInjectedSql('SELECT 1');
});

test('POST: легальный upsert по-прежнему работает', async () => {
  const res = await handler(eventFor({
    table: 'shared_products',
    method: 'POST',
    withCurator: true,
    query: { upsert: 'true', on_conflict: 'id' },
    body: [{ id: '22222222-2222-4222-8222-222222222222', name: 'probe' }],
  }));
  assert.ok(res.statusCode < 400, `легальный upsert не должен отбиваться: ${res.statusCode} ${res.body}`);
  const insert = executedQueries.find((q) => q.startsWith('INSERT'));
  assert.ok(insert, 'INSERT должен был выполниться');
  assert.match(insert, /ON CONFLICT \("id"\)/);
});
