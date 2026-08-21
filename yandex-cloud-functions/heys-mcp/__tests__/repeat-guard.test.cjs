'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mcp = require('../lib/mcp');
const {
  createRepeatGuard,
  CACHEABLE_READ_TOOLS,
  callKey,
} = require('../lib/repeat-guard');

/** Управляемое время: окно повтора проверяется без ожидания в реальных секундах. */
function clock(start = 1_000_000) {
  const state = { ms: start };
  return {
    now: () => state.ms,
    advance(ms) { state.ms += ms; },
  };
}

const RESULT = { text: 'Нашёл 3: ...', structured: { results: [1, 2, 3] } };

test('ключ вызова не зависит от порядка аргументов', () => {
  assert.equal(
    callKey('heys_get_day', { client: 'A', date: '2026-08-20' }),
    callKey('heys_get_day', { date: '2026-08-20', client: 'A' }),
  );
  assert.notEqual(
    callKey('heys_get_day', { date: '2026-08-20' }),
    callKey('heys_get_day', { date: '2026-08-19' }),
  );
});

test('первый вызов идёт к обработчику, второй с теми же аргументами — из памяти', () => {
  const time = clock();
  const guard = createRepeatGuard({ now: time.now });
  const args = { date: '2026-08-20' };

  assert.deepEqual(guard.before('s1', 'heys_get_day', args), { repeat: false, notice: null });
  guard.after('s1', 'heys_get_day', args, RESULT);

  time.advance(12_000);
  const second = guard.before('s1', 'heys_get_day', args);
  assert.equal(second.repeat, true);
  assert.equal(second.result, RESULT);
  assert.match(second.notice, /\[повтор\]/);
  assert.match(second.notice, /12 с/);
});

test('другие аргументы того же инструмента повтором не считаются', () => {
  const guard = createRepeatGuard();
  guard.after('s1', 'heys_get_day', { date: '2026-08-20' }, RESULT);
  assert.equal(guard.before('s1', 'heys_get_day', { date: '2026-08-19' }).repeat, false);
});

test('чужое подключение не читает память соседнего', () => {
  const guard = createRepeatGuard();
  const args = { date: '2026-08-20' };
  guard.after('s1', 'heys_get_day', args, RESULT);
  assert.equal(guard.before('s2', 'heys_get_day', args).repeat, false);
});

test('за окном повтора ответ перечитывается заново', () => {
  const time = clock();
  const guard = createRepeatGuard({ ttlMs: 90_000, now: time.now });
  const args = { date: '2026-08-20' };
  guard.after('s1', 'heys_get_day', args, RESULT);
  time.advance(90_001);
  assert.equal(guard.before('s1', 'heys_get_day', args).repeat, false);
});

test('любая запись стирает память подключения: после create поиск идёт заново', () => {
  const guard = createRepeatGuard();
  const args = { query: 'капучино' };
  guard.after('s1', 'heys_search_products', args, RESULT);
  assert.equal(guard.before('s1', 'heys_search_products', args).repeat, true);

  guard.before('s1', 'heys_create_product', { name: 'Капучино' });
  assert.equal(guard.before('s1', 'heys_search_products', args).repeat, false);
});

test('серия поисков подряд получает подсказку со второго, не отказ', () => {
  const guard = createRepeatGuard();
  const first = guard.before('s1', 'heys_search_products', { query: 'капучино' });
  assert.equal(first.repeat, false);
  assert.equal(first.notice, null);

  const second = guard.before('s1', 'heys_search_products', { query: 'кофе с сиропом' });
  assert.equal(second.repeat, false);
  assert.match(second.notice, /второй поиск подряд/);
  assert.match(second.notice, /heys_create_product/);

  const third = guard.before('s1', 'heys_search_products', { query: 'латте' });
  assert.match(third.notice, /3-й поиск подряд/);
});

test('запись между поисками обнуляет серию: три продукта подряд — не перебор', () => {
  const guard = createRepeatGuard();
  guard.before('s1', 'heys_search_products', { query: 'креветки' });
  guard.before('s1', 'heys_log_meal', { items: [] });
  const next = guard.before('s1', 'heys_search_products', { query: 'помидор' });
  assert.equal(next.notice, null);
});

test('серия считается только для поиска: два подряд get_day не получают подсказку', () => {
  const guard = createRepeatGuard();
  guard.before('s1', 'heys_get_day', { date: '2026-08-20' });
  assert.equal(guard.before('s1', 'heys_get_day', { date: '2026-08-19' }).notice, null);
});

test('пишущие инструменты в памяти не оседают', () => {
  const guard = createRepeatGuard();
  const args = { client: 'A', ml: 200 };
  guard.after('s1', 'heys_add_water', args, RESULT);
  assert.equal(guard.before('s1', 'heys_add_water', args).repeat, false);
});

test('в список читающих не попал ни один пишущий инструмент', () => {
  for (const tool of CACHEABLE_READ_TOOLS) {
    assert.match(
      tool,
      /^(heys_(get|list|search)_|tasks_(read|list|search|context)$)/,
      `${tool} — читающий по имени`,
    );
  }
});

test('транспорт отдаёт повтор из памяти, не трогая обработчик', async () => {
  let calls = 0;
  const guard = createRepeatGuard();
  const ctx = {
    tools: {
      async heys_get_day() {
        calls += 1;
        return { text: 'День 2026-08-20: 1500 ккал', structured: { date: '2026-08-20' } };
      },
    },
    beginTrace: () => ({ sessionId: 'sess1', seq: calls + 1, ts: new Date().toISOString() }),
    repeatGuard: guard,
  };
  const call = () => mcp.handleMessage({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'heys_get_day', arguments: { date: '2026-08-20' } },
  }, ctx);

  const first = await call();
  assert.equal(calls, 1);
  assert.equal(first.result.content[0].text, 'День 2026-08-20: 1500 ккал');
  assert.equal(first.result.structuredContent.repeat, undefined);

  const second = await call();
  assert.equal(calls, 1, 'второй раз обработчик не звали');
  assert.match(second.result.content[0].text, /^\[повтор\]/);
  assert.match(second.result.content[0].text, /День 2026-08-20: 1500 ккал/);
  assert.equal(second.result.structuredContent.repeat, true);
  assert.equal(second.result.structuredContent.date, '2026-08-20');
});

test('подсказка про серию поисков доходит до ответа транспорта', async () => {
  const ctx = {
    tools: {
      async heys_search_products(args) {
        return { text: `По запросу "${args.query}" ничего не нашлось.`, structured: { results: [] } };
      },
    },
    beginTrace: () => ({ sessionId: 'sess2', seq: 1, ts: new Date().toISOString() }),
    repeatGuard: createRepeatGuard(),
  };
  const search = (query) => mcp.handleMessage({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'heys_search_products', arguments: { query } },
  }, ctx);

  const first = await search('капучино');
  assert.doesNotMatch(first.result.content[0].text, /поиск подряд/);
  const second = await search('кофе с сиропом');
  assert.match(second.result.content[0].text, /второй поиск подряд/);
  assert.match(second.result.content[0].text, /ничего не нашлось/);
});

test('без трассировки транспорт работает как раньше', async () => {
  let calls = 0;
  const ctx = {
    tools: {
      async heys_get_day() {
        calls += 1;
        return { text: 'ок', structured: {} };
      },
    },
    repeatGuard: createRepeatGuard(),
  };
  const call = () => mcp.handleMessage({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'heys_get_day', arguments: { date: '2026-08-20' } },
  }, ctx);
  await call();
  await call();
  assert.equal(calls, 2);
});

test('ошибка обработчика в память не попадает', async () => {
  let calls = 0;
  const guard = createRepeatGuard();
  const ctx = {
    tools: {
      async heys_get_day() {
        calls += 1;
        const err = new Error('нет клиента');
        err.code = 'client_not_found';
        throw err;
      },
    },
    beginTrace: () => ({ sessionId: 'sess3', seq: 1, ts: new Date().toISOString() }),
    repeatGuard: guard,
  };
  const call = () => mcp.handleMessage({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'heys_get_day', arguments: { date: '2026-08-20' } },
  }, ctx);
  await call();
  await call();
  assert.equal(calls, 2, 'отказ перечитывается, а не отдаётся из памяти');
});
