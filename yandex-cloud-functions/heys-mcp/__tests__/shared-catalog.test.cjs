'use strict';

/**
 * Кеш общей базы продуктов. Появился после инцидента 2026-08-01: сбой загрузки
 * справочника молча оставлял клиента без личных продуктов, и следующим шагом
 * заводился дубликат существующего продукта.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const cache = require('../lib/shared-catalog');

const ROWS = [{ id: 's1', name: 'Овсяные хлопья' }, { id: 's2', name: 'Миндаль' }];

function apiWith(responses) {
  const queue = [...responses];
  const calls = { count: 0 };
  return {
    calls,
    async getSharedProducts() {
      calls.count += 1;
      const next = queue.length > 1 ? queue.shift() : queue[0];
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

test.beforeEach(() => cache.reset());

test('первый вызов идёт в сеть, повторный — из кеша', async () => {
  const api = apiWith([{ data: ROWS, error: null }]);
  const first = await cache.loadSharedProducts(api, { nowMs: 1000 });
  assert.equal(first.source, 'network');
  assert.equal(first.rows.length, 2);

  const second = await cache.loadSharedProducts(api, { nowMs: 2000 });
  assert.equal(second.source, 'cache');
  assert.equal(api.calls.count, 1, 'сеть дёрнута один раз');
});

test('после TTL справочник перечитывается', async () => {
  const api = apiWith([{ data: ROWS, error: null }]);
  await cache.loadSharedProducts(api, { nowMs: 0 });
  await cache.loadSharedProducts(api, { nowMs: cache.TTL_MS + 1 });
  assert.equal(api.calls.count, 2);
});

test('параллельные вызовы не тянут базу дважды', async () => {
  const api = apiWith([{ data: ROWS, error: null }]);
  const [a, b, c] = await Promise.all([
    cache.loadSharedProducts(api, { nowMs: 1 }),
    cache.loadSharedProducts(api, { nowMs: 1 }),
    cache.loadSharedProducts(api, { nowMs: 1 }),
  ]);
  assert.equal(api.calls.count, 1);
  assert.equal(a.rows.length, 2);
  assert.equal(b.rows.length, 2);
  assert.equal(c.rows.length, 2);
});

test('сбой сети при живом снимке отдаёт прошлый — работа не останавливается', async () => {
  const api = apiWith([{ data: ROWS, error: null }, { data: null, error: { message: 'rest_http_502' } }]);
  await cache.loadSharedProducts(api, { nowMs: 0 });
  const res = await cache.loadSharedProducts(api, { nowMs: cache.TTL_MS + 1 });
  assert.equal(res.source, 'stale');
  assert.equal(res.error, null);
  assert.equal(res.rows.length, 2);
});

test('сбой без снимка отдаёт ошибку, а не пустой каталог', async () => {
  const api = apiWith([{ data: null, error: { message: 'rest_http_502' } }]);
  const res = await cache.loadSharedProducts(api, { nowMs: 0 });
  assert.ok(res.error);
  assert.deepEqual(res.rows, []);
});

test('исключение сети обрабатывается как сбой, а не как падение', async () => {
  const api = apiWith([new Error('socket hang up')]);
  await assert.rejects(() => cache.loadSharedProducts(api, { nowMs: 0 }));
  // После сбоя кеш не «залипает»: следующий успешный вызов наполняет его.
  const ok = apiWith([{ data: ROWS, error: null }]);
  const res = await cache.loadSharedProducts(ok, { nowMs: 1 });
  assert.equal(res.source, 'network');
});

test('пустой ответ не затирает рабочий снимок', async () => {
  const api = apiWith([{ data: ROWS, error: null }, { data: [], error: null }]);
  await cache.loadSharedProducts(api, { nowMs: 0 });
  const res = await cache.loadSharedProducts(api, { nowMs: cache.TTL_MS + 1 });
  assert.equal(res.source, 'stale');
  assert.equal(res.rows.length, 2);
});

test('слишком старый снимок не выдаётся за живой', async () => {
  const api = apiWith([{ data: ROWS, error: null }, { data: null, error: { message: 'down' } }]);
  await cache.loadSharedProducts(api, { nowMs: 0 });
  const res = await cache.loadSharedProducts(api, { nowMs: cache.STALE_GRACE_MS + 1 });
  assert.ok(res.error, 'снимок старше часа уже не считается годным');
});
