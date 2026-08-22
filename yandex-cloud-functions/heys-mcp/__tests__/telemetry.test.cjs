'use strict';

/** Телеметрия вызовов MCP: состав строки, приватность, невмешательство в вызов. */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RECORD_FIELDS,
  MAX_ARG_KEYS,
  MAX_TRACKED_SESSIONS,
  sessionAlias,
  createSeqCounter,
  extractArgKeys,
  buildRecord,
  emitRecord,
  createTelemetry,
} = require('../lib/telemetry');
const mcp = require('../lib/mcp');
const callContext = require('../lib/call-context');

test('строка лога — валидный JSON целиком, без текстового префикса', () => {
  // Logging разбирает jsonPayload только когда вся строка это JSON. Префикс
  // вида "[heys-mcp] tool_timing {...}" уводит запись в message, и фильтр
  // jsonPayload.t = "mcp_call" не находит ничего.
  const lines = [];
  const record = buildRecord({ tool: 'heys_log_meal', ok: true, durationMs: 120 });
  emitRecord(record, { logger: { log: (line) => lines.push(line) } });

  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.t, 'mcp_call');
  assert.equal(parsed.tool, 'heys_log_meal');
});

test('в записи нет ни одного значения аргумента — тест на утечку', () => {
  const secrets = {
    client: 'Александра Полтавская',
    transcript: 'запиши жене творог 5% 200 грамм',
    clientId: '11111111-2222-3333-4444-555555555555',
    productName: 'творог 5%',
    phone: '+79991234567',
  };

  const record = buildRecord({
    tool: 'heys_log_meal',
    ok: false,
    errorCode: 'client_not_found',
    durationMs: 340,
    argCount: Object.keys(secrets).length,
    // Ровно те поля, которые прикладной код мог бы передать по неосторожности:
    // белый список обязан выбросить их молча.
    args: secrets,
    client: secrets.client,
    clientId: secrets.clientId,
    curatorId: 'curator-uuid-here',
    errorMessage: `Продукт "${secrets.productName}" не найден у клиента ${secrets.client}`,
    responseBody: JSON.stringify(secrets),
  });

  const serialized = JSON.stringify(record);
  for (const value of Object.values(secrets)) {
    assert.ok(!serialized.includes(value), `в строку лога утекло значение: ${value}`);
  }
  assert.ok(!serialized.includes('curator-uuid-here'), 'в строку лога утёк идентификатор куратора');
  assert.ok(!serialized.includes('не найден'), 'в строку лога утёк текст исключения');

  // Утечь может только через новое поле, поэтому состав фиксируется целиком.
  assert.deepEqual(Object.keys(record).sort(), [...RECORD_FIELDS].sort());
  assert.equal(record.error_code, 'client_not_found');
  assert.equal(record.arg_count, 5);
  assert.deepEqual(record.arg_keys, []);
});

test('arg_keys — только верхний уровень, без значений и без вложенных ключей', () => {
  const args = {
    client: 'мне',
    copy_meal: { date: '2026-08-17', meal_id: 'meal-uuid' },
    preset_grams: { 'Молоко ультрапастеризованное 3.5': 200 },
    transcript: 'запиши как вчера',
  };
  const keys = extractArgKeys(args);
  assert.deepEqual(keys, ['client', 'copy_meal', 'preset_grams', 'transcript']);

  const record = buildRecord({
    tool: 'heys_log_meal',
    ok: true,
    durationMs: 120,
    argCount: keys.length,
    argKeys: keys,
  });
  const serialized = JSON.stringify(record);
  assert.ok(!serialized.includes('Молоко'), 'название продукта из вложенного объекта не должно попасть в лог');
  assert.ok(!serialized.includes('meal-uuid'), 'значение meal_id не должно попасть в лог');
  assert.deepEqual(record.arg_keys, keys);
});

test('arg_keys обрезается по MAX_ARG_KEYS', () => {
  const args = {};
  for (let i = 0; i < MAX_ARG_KEYS + 5; i += 1) args[`k${i}`] = `secret-${i}`;
  const keys = extractArgKeys(args);
  assert.equal(keys.length, MAX_ARG_KEYS);
  assert.ok(!keys.some((k) => k.includes('secret')), 'значения не попадают в arg_keys');
});

test('в записи остались поля, на которых держится разбор таймингов', () => {
  // Переход на белый список однажды уже потерял uptime_ms, а без него строка
  // неинтерпретируема: та же запись стоит секунду на прогретом инстансе и
  // втрое дороже на поднятом с нуля. cold_start это не заменяет — он булев.
  // TIMING_LOG.md опирается на оба поля, поэтому набор фиксируется тестом.
  const record = buildRecord({
    tool: 'heys_log_meal',
    ok: true,
    durationMs: 800,
    upstreamCalls: 3,
    upstreamMs: 500,
    responseBytes: 1200,
    coldStart: false,
    uptimeMs: 42_000,
  });

  assert.equal(record.uptime_ms, 42_000);
  assert.equal(record.cold_start, false);
  assert.equal(record.upstream_calls, 3);
  assert.equal(record.upstream_ms, 500);
  assert.equal(record.resp_bytes, 1200);
  assert.equal(record.duration_ms, 800);
});

test('версия функции берётся из context обработчика, а не из окружения', async () => {
  // Живая строка 17.08 приехала с fn_version: null — в рантайме YC переменной
  // FUNCTION_VERSION_ID нет, версия лежит во втором аргументе handler.
  const lines = [];
  const telemetry = createTelemetry({ instanceId: 'i', logger: { log: (l) => lines.push(l) } });

  await telemetry.record({ tool: 'heys_add_water', ok: true, durationMs: 10, sessionId: 's', seq: 1 });
  assert.equal(JSON.parse(lines[0]).fn_version, null);

  telemetry.setFnVersion('d4egc9ia3uum2sfpbpe6');
  await telemetry.record({ tool: 'heys_add_water', ok: true, durationMs: 10, sessionId: 's', seq: 2 });
  assert.equal(JSON.parse(lines[1]).fn_version, 'd4egc9ia3uum2sfpbpe6');

  // Пустое значение не должно затирать уже известную версию.
  telemetry.setFnVersion('');
  await telemetry.record({ tool: 'heys_add_water', ok: true, durationMs: 10, sessionId: 's', seq: 3 });
  assert.equal(JSON.parse(lines[2]).fn_version, 'd4egc9ia3uum2sfpbpe6');
});

test('статус различает отказ по правилу и настоящую ошибку', () => {
  assert.equal(buildRecord({ tool: 't', ok: true }).status, 'ok');
  assert.equal(buildRecord({ tool: 't', ok: false, errorCode: 'push_consent_missing' }).status, 'rejected');
  assert.equal(buildRecord({ tool: 't', ok: false, errorCode: 'internal_error' }).status, 'error');
  // Без кода вообще — тоже поломка, а не отказ.
  assert.equal(buildRecord({ tool: 't', ok: false }).status, 'error');
  assert.equal(buildRecord({ tool: 't', ok: false }).error_code, 'internal_error');
});

test('псевдоним подключения различает клиентов и не содержит токена', () => {
  const a = sessionAlias('Bearer token-aaa', 'instance-1');
  const b = sessionAlias('Bearer token-bbb', 'instance-1');
  const sameAgain = sessionAlias('Bearer token-aaa', 'instance-1');
  const otherInstance = sessionAlias('Bearer token-aaa', 'instance-2');

  assert.notEqual(a, b, 'разные подключения обязаны различаться, иначе склеятся последовательности');
  assert.equal(a, sameAgain, 'внутри подключения псевдоним обязан быть стабильным');
  assert.notEqual(a, otherInstance);
  assert.ok(!a.includes('token-aaa'));
  assert.match(a, /^[0-9a-f]{12}$/);
});

test('seq растёт внутри подключения и не течёт по памяти', () => {
  const nextSeq = createSeqCounter();
  assert.equal(nextSeq('s1'), 1);
  assert.equal(nextSeq('s1'), 2);
  assert.equal(nextSeq('s2'), 1);
  assert.equal(nextSeq('s1'), 3);

  for (let i = 0; i < MAX_TRACKED_SESSIONS + 50; i += 1) nextSeq(`bulk-${i}`);
  // Счётчик давно вытесненной сессии начинается заново — это ожидаемая
  // деградация, важно что памяти он не занимает бесконечно.
  assert.equal(nextSeq('s2'), 1);
});

test('падение логгера не ломает вызов инструмента', async () => {
  const telemetry = createTelemetry({
    instanceId: 'test-instance',
    logger: { log() { throw new Error('stdout is gone'); } },
  });
  await assert.doesNotReject(async () => telemetry.record({ tool: 'heys_get_day', ok: true, durationMs: 10 }));
});

test('запись телеметрии не меняет ответ инструмента', async () => {
  const tools = { heys_get_day: async () => ({ text: 'день собран', structured: { kcal: 1700 } }) };
  const call = (ctx) => mcp.handlePayload({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'heys_get_day', arguments: { client: 'Александра', date: '2026-08-17' } },
  }, { tools, ...ctx });

  const withoutMetric = await call({});
  const lines = [];
  const telemetry = createTelemetry({ instanceId: 'i', logger: { log: (l) => lines.push(l) } });
  const withMetric = await call({
    logMetric: async (metric) => telemetry.record({
      tool: metric.tool, ok: metric.ok, errorCode: metric.error,
      durationMs: metric.ms, argCount: metric.arg_count, argKeys: metric.arg_keys, token: 'Bearer t',
      sessionId: metric.trace ? metric.trace.sessionId : null,
      seq: metric.trace ? metric.trace.seq : null,
    }),
  });

  // duration_ms в ответе — живое время, сравниваем всё остальное.
  const strip = (res) => {
    const clone = JSON.parse(JSON.stringify(res));
    delete clone.result.structuredContent.duration_ms;
    return clone;
  };
  assert.deepEqual(strip(withMetric), strip(withoutMetric));

  assert.equal(lines.length, 1);
  const rec = JSON.parse(lines[0]);
  assert.equal(rec.tool, 'heys_get_day');
  assert.equal(rec.status, 'ok');
  assert.equal(rec.arg_count, 2, 'считаем количество аргументов, а не сами аргументы');
  assert.deepEqual(rec.arg_keys, ['client', 'date']);
  assert.ok(!lines[0].includes('Александра'), 'значение аргумента не должно попасть в лог');
});

test('исключение инструмента логируется кодом, а ответ остаётся прежним', async () => {
  const failing = { heys_log_meal: async () => { const e = new Error('Продукт "творог 5%" не найден'); e.code = 'product_not_found'; throw e; } };
  const lines = [];
  const telemetry = createTelemetry({ instanceId: 'i', logger: { log: (l) => lines.push(l) } });
  const res = await mcp.handlePayload({
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name: 'heys_log_meal', arguments: { client: 'мне', name: 'творог 5%' } },
  }, {
    tools: failing,
    logMetric: async (metric) => telemetry.record({
      tool: metric.tool, ok: metric.ok, errorCode: metric.error,
      durationMs: metric.ms, argCount: metric.arg_count, token: 'Bearer t',
      sessionId: metric.trace ? metric.trace.sessionId : null,
      seq: metric.trace ? metric.trace.seq : null,
    }),
  });

  assert.match(JSON.stringify(res), /product_not_found/);
  const rec = JSON.parse(lines[0]);
  assert.equal(rec.status, 'rejected');
  assert.equal(rec.error_code, 'product_not_found');
  assert.ok(!lines[0].includes('творог'), 'название продукта не должно попасть в лог');
});

/** Обвязка «как в index.js»: beginTrace выдаёт номер, logMetric его же пишет. */
function tracedContext(tools, lines, { persistCall = null } = {}) {
  const telemetry = createTelemetry({ instanceId: 'i', logger: { log: (l) => lines.push(l) } });
  return {
    tools,
    beginTrace: () => telemetry.begin('Bearer curator-token'),
    logMetric: async (metric) => telemetry.record({
      tool: metric.tool, ok: metric.ok, errorCode: metric.error, durationMs: metric.ms,
      argCount: metric.arg_count, argKeys: metric.arg_keys,
      sessionId: metric.trace ? metric.trace.sessionId : null,
      seq: metric.trace ? metric.trace.seq : null,
    }, { persistCall }),
  };
}

const callTool = (ctx, name, id) => mcp.handlePayload({
  jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: {} },
}, ctx);

test('session_id и seq возвращаются клиенту и совпадают со строкой лога', async () => {
  // Без этого совпадения связать реплику куратора со строкой телеметрии нечем:
  // текста запроса в логе нет и не будет (ПДн).
  const lines = [];
  const ctx = tracedContext({ heys_get_day: async () => ({ text: 'день собран' }) }, lines);

  const first = await callTool(ctx, 'heys_get_day', 1);
  const second = await callTool(ctx, 'heys_get_day', 2);

  const rec = JSON.parse(lines[0]);
  assert.equal(first.result.structuredContent.session_id, rec.session_id);
  assert.equal(first.result.structuredContent.seq, rec.seq);
  assert.equal(first.result.structuredContent.seq, 1);
  assert.equal(second.result.structuredContent.seq, 2, 'номер растёт внутри подключения');
  assert.equal(JSON.parse(lines[1]).seq, 2);
  assert.equal(rec.session_id.length, 12, 'в ответ уходит срез хэша, не сам токен');
  assert.ok(!JSON.stringify(first).includes('curator-token'), 'токен наружу не идёт');
});

test('seq считает порядок начала вызовов, а не завершения', async () => {
  // На одном инстансе вызовы идут параллельно. Нумерация по завершению
  // переставила бы местами быстрый и медленный — то есть соврала бы именно
  // про лишние круги, ради которых поле и заведено.
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const lines = [];
  const ctx = tracedContext({
    slow: async () => { await gate; return { text: 'долгий' }; },
    fast: async () => ({ text: 'быстрый' }),
  }, lines);

  const slowCall = callTool(ctx, 'slow', 1);
  const fastCall = callTool(ctx, 'fast', 2);
  const fast = await fastCall;
  release();
  const slow = await slowCall;

  assert.equal(slow.result.structuredContent.seq, 1, 'начался первым — номер первый');
  assert.equal(fast.result.structuredContent.seq, 2);
});

test('вложенный вызов видит метку внешнего инструмента', async () => {
  // Дневниковая запись зовёт tasks_checkpoint не снаружи, а из общей обёртки.
  // Метка в блоке стенограммы должна быть от ВНЕШНЕГО инструмента — того
  // обмена, который блок и записывает.
  const seen = [];
  const lines = [];
  const ctx = tracedContext({
    heys_add_water: async () => {
      // так же, как обёртка вызывает вложенный tasks_checkpoint
      seen.push(callContext.transcriptMark(callContext.current()));
      return { text: 'записал' };
    },
  }, lines);

  const res = await callTool(ctx, 'heys_add_water', 1);

  const { session_id: sessionId, seq } = res.result.structuredContent;
  assert.match(seen[0], new RegExp(`^\\[mcp session=${sessionId} seq=${seq} conn=[0-9a-f]{12} ts=\\d{4}-`));
  assert.equal(JSON.parse(lines[0]).session_id, sessionId, 'та же метка ушла в лог');
});

test('метка чата разводит два параллельных чата одного коннектора', () => {
  const { createTelemetry } = require('../lib/telemetry');
  const telemetry = createTelemetry({ instanceId: 'inst-1' });
  const token = 'Bearer один-и-тот-же-токен';

  const chatA = telemetry.begin(token, '11111111-1111-4111-8111-111111111111');
  const chatB = telemetry.begin(token, '22222222-2222-4222-8222-222222222222');
  assert.notEqual(chatA.connId, chatB.connId, 'разные чаты — разные псевдонимы подключения');

  // Тот же чат на другом инстансе — тот же псевдоним: ради этого всё и делалось.
  const other = createTelemetry({ instanceId: 'inst-2' });
  const chatAAgain = other.begin(token, '11111111-1111-4111-8111-111111111111');
  assert.equal(chatAAgain.connId, chatA.connId);
  assert.notEqual(chatAAgain.sessionId, chatA.sessionId, 'session_id по-прежнему привязан к инстансу');

  // Клиент без поддержки сессии — прежнее поведение, псевдоним от токена.
  const noChat = telemetry.begin(token);
  const noChatElsewhere = other.begin(token);
  assert.equal(noChat.connId, noChatElsewhere.connId);
  assert.notEqual(noChat.connId, chatA.connId);
});

test('вне вызова инструмента метки нет', () => {
  assert.equal(callContext.current(), null);
  assert.equal(callContext.transcriptMark(null), null);
});

test('отказ инструмента тоже несёт session_id и seq', async () => {
  const lines = [];
  const ctx = tracedContext({
    heys_log_meal: async () => { const e = new Error('нет такого'); e.code = 'product_not_found'; throw e; },
  }, lines);

  const res = await callTool(ctx, 'heys_log_meal', 1);
  const rec = JSON.parse(lines[0]);

  assert.equal(res.result.structuredContent.error, 'product_not_found');
  assert.equal(res.result.structuredContent.session_id, rec.session_id);
  assert.equal(res.result.structuredContent.seq, rec.seq);
});

test('persistCall await до возврата record и не роняет при ошибке', async () => {
  const lines = [];
  const telemetry = createTelemetry({ instanceId: 'i', logger: { log: (l) => lines.push(l) } });
  let finished = false;
  const persistCall = async () => {
    await new Promise((r) => setTimeout(r, 20));
    finished = true;
  };
  const rec = await telemetry.record({
    tool: 'heys_get_day', ok: true, durationMs: 10, sessionId: 'abc', seq: 1,
  }, { persistCall });
  assert.ok(finished, 'persist должен завершиться до return record');
  assert.equal(rec.tool, 'heys_get_day');

  const broken = createTelemetry({ instanceId: 'i2', logger: { log: (l) => lines.push(l) } });
  await assert.doesNotReject(async () => broken.record({
    tool: 'heys_get_day', ok: true, durationMs: 10, sessionId: 'abc', seq: 2,
  }, { persistCall: async () => { throw new Error('db down'); } }));
});


test('mcp_list несёт conn_id — иначе не ответить, забрал ли чат новые схемы', () => {
  // 22.08.2026: на вопрос «была ли у этого чата схема с meals[]» ответа не
  // нашлось — session_id у tools/list свой на каждый запрос, а conn_id не
  // писался вовсе. Теперь список и вызовы сходятся по одному ключу.
  const record = require('../lib/telemetry').buildListRecord({
    nowMs: Date.UTC(2026, 7, 22, 12, 55),
    sessionId: 'sess1234abcd',
    connId: '34f5528e62c5',
    toolsCount: 84,
    toolsBytes: 149508,
    clientName: 'claude-code',
  });

  assert.equal(record.conn_id, '34f5528e62c5');
  assert.equal(record.session_id, 'sess1234abcd');
  assert.equal(record.tools_bytes, 149508);
});
