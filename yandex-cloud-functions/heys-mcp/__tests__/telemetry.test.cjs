'use strict';

/** Телеметрия вызовов MCP: состав строки, приватность, невмешательство в вызов. */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RECORD_FIELDS,
  MAX_TRACKED_SESSIONS,
  sessionAlias,
  createSeqCounter,
  buildRecord,
  emitRecord,
  createTelemetry,
} = require('../lib/telemetry');
const mcp = require('../lib/mcp');

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

test('версия функции берётся из context обработчика, а не из окружения', () => {
  // Живая строка 17.08 приехала с fn_version: null — в рантайме YC переменной
  // FUNCTION_VERSION_ID нет, версия лежит во втором аргументе handler.
  const lines = [];
  const telemetry = createTelemetry({ instanceId: 'i', logger: { log: (l) => lines.push(l) } });

  telemetry.record({ tool: 'heys_add_water', ok: true, durationMs: 10 });
  assert.equal(JSON.parse(lines[0]).fn_version, null);

  telemetry.setFnVersion('d4egc9ia3uum2sfpbpe6');
  telemetry.record({ tool: 'heys_add_water', ok: true, durationMs: 10 });
  assert.equal(JSON.parse(lines[1]).fn_version, 'd4egc9ia3uum2sfpbpe6');

  // Пустое значение не должно затирать уже известную версию.
  telemetry.setFnVersion('');
  telemetry.record({ tool: 'heys_add_water', ok: true, durationMs: 10 });
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
  assert.doesNotThrow(() => telemetry.record({ tool: 'heys_get_day', ok: true, durationMs: 10 }));
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
    logMetric: (metric) => telemetry.record({
      tool: metric.tool, ok: metric.ok, errorCode: metric.error,
      durationMs: metric.ms, argCount: metric.arg_count, token: 'Bearer t',
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
    logMetric: (metric) => telemetry.record({
      tool: metric.tool, ok: metric.ok, errorCode: metric.error,
      durationMs: metric.ms, argCount: metric.arg_count, token: 'Bearer t',
    }),
  });

  assert.match(JSON.stringify(res), /product_not_found/);
  const rec = JSON.parse(lines[0]);
  assert.equal(rec.status, 'rejected');
  assert.equal(rec.error_code, 'product_not_found');
  assert.ok(!lines[0].includes('творог'), 'название продукта не должно попасть в лог');
});
