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

/**
 * Счётчик серии на сервере. Память инстанса на редком трафике пуста — YC
 * разводит даже последовательные вызовы по холодным инстансам, — поэтому
 * подсказка про лишний круг считается по уже пишущейся телеметрии.
 */
function probeContext({ probe, handler, calls = [] }) {
  return {
    tools: {
      async heys_search_products(args) {
        calls.push(args);
        if (handler) return handler(args);
        return { text: `По запросу "${args.query}" ничего не нашлось.`, structured: { results: [] } };
      },
      async heys_get_day() {
        return { text: 'День пустой', structured: {} };
      },
      async heys_log_meal(args) {
        calls.push(args);
        return { text: 'Записал приём.', structured: {} };
      },
    },
    beginTrace: () => ({ sessionId: `s${calls.length}`, seq: 1, connId: 'conn-1', ts: new Date().toISOString() }),
    repeatGuard: createRepeatGuard(),
    seriesProbe: probe,
    metrics: [],
  };
}

function callTool(ctx, name, args) {
  return mcp.handleMessage({
    jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args },
  }, ctx);
}

test('серия, посчитанная сервером, доходит до ответа даже на холодном инстансе', async () => {
  const metrics = [];
  const ctx = probeContext({ probe: async () => 1 });
  ctx.logMetric = (m) => { metrics.push(m); };

  const res = await callTool(ctx, 'heys_search_products', { query: 'капучино' });
  assert.match(res.result.content[0].text, /второй поиск подряд/);
  assert.match(res.result.content[0].text, /ничего не нашлось/);
  assert.equal(metrics[0].hint, 'streak', 'подсказка отмечена в телеметрии');
});

test('первый вызов серии подсказки не получает', async () => {
  const metrics = [];
  const ctx = probeContext({ probe: async () => 0 });
  ctx.logMetric = (m) => { metrics.push(m); };

  const res = await callTool(ctx, 'heys_search_products', { query: 'капучино' });
  assert.doesNotMatch(res.result.content[0].text, /поиск подряд/);
  assert.equal(metrics[0].hint, null);
});

test('счётчик спрашивается только про инструменты серии', async () => {
  const asked = [];
  const ctx = probeContext({ probe: async (tool) => { asked.push(tool); return 5; } });
  await callTool(ctx, 'heys_get_day', { date: '2026-08-21' });
  assert.deepEqual(asked, [], 'про get_day серию не спрашиваем — там повтор ловится аргументами');
  await callTool(ctx, 'heys_search_products', { query: 'кофе' });
  assert.deepEqual(asked, ['heys_search_products']);
});

test('упавший счётчик не ломает вызов и не выдумывает подсказку', async () => {
  const ctx = probeContext({ probe: async () => { throw new Error('БД недоступна'); } });
  const res = await callTool(ctx, 'heys_search_products', { query: 'кофе' });
  assert.equal(res.result.structuredContent.ok, true);
  assert.doesNotMatch(res.result.content[0].text, /поиск подряд/);
});

test('счётчик идёт параллельно инструменту, а не после него', async () => {
  const order = [];
  const ctx = probeContext({
    probe: async () => { order.push('probe-start'); return 1; },
    handler: async () => {
      order.push('handler-start');
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push('handler-end');
      return { text: 'ок', structured: {} };
    },
  });
  await callTool(ctx, 'heys_search_products', { query: 'кофе' });
  // Счётчик стартует до того, как инструмент закончил: иначе он добавлял бы
  // своё время к ожиданию куратора.
  assert.ok(order.indexOf('probe-start') < order.indexOf('handler-end'), order.join(' → '));
});

test('память инстанса счётчик не дублирует: подсказка не двоится', async () => {
  const asked = [];
  const guard = createRepeatGuard();
  const ctx = probeContext({ probe: async (tool) => { asked.push(tool); return 3; } });
  ctx.repeatGuard = guard;
  ctx.beginTrace = () => ({ sessionId: 'same', seq: 1, connId: 'conn-1', ts: new Date().toISOString() });

  await callTool(ctx, 'heys_search_products', { query: 'кофе' });
  const second = await callTool(ctx, 'heys_search_products', { query: 'латте' });
  // Второй вызов уже поймал локальный счётчик — сервер не спрашиваем.
  assert.equal(asked.length, 1);
  assert.match(second.result.content[0].text, /второй поиск подряд/);
  assert.doesNotMatch(second.result.content[0].text, /второй поиск подряд[\s\S]*поиск подряд/);
});

// ── Разорванная запись ───────────────────────────────────────────────────────
//
// Трейс 25.08, обмен 22:34: два heys_log_meal подряд на одну реплику про
// сырники со сгущёнкой — в чате, который заведомо получил правило «ОДИН ВЫЗОВ
// НА РЕПЛИКУ» в голове инструкции. Слово не сработало, подсказку в момент
// ошибки даёт сервер.

test('вторая запись подряд получает подсказку про один вызов', async () => {
  const ctx = probeContext({ probe: async () => 1 });
  const res = await callTool(ctx, 'heys_log_meal', { client: 'мне', items: [], transcript: 'x' });
  const text = res.result.content[0].text;
  assert.match(text, /запись подряд/);
  assert.match(text, /items\[\]/);
  assert.match(text, /meals\[\]/);
  // Текст поиска сюда попадать не должен: перебор формулировок тут ни при чём.
  assert.doesNotMatch(text, /поиск подряд/);
});

test('первая запись подсказку не получает', async () => {
  const ctx = probeContext({ probe: async () => 0 });
  const res = await callTool(ctx, 'heys_log_meal', { client: 'мне', items: [], transcript: 'x' });
  assert.doesNotMatch(res.result.content[0].text, /запись подряд/);
});

test('серия поиска по-прежнему говорит про формулировки, а не про запись', () => {
  const { seriesNotice } = require('../lib/repeat-guard');
  assert.match(seriesNotice('heys_search_products', 2), /поиск подряд/);
  assert.match(seriesNotice('heys_log_meal', 2), /запись подряд/);
});
