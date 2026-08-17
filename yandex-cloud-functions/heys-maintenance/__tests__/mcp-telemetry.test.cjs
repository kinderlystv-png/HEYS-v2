'use strict';

/** Суточная агрегация телеметрии MCP: свёртка, пары вызовов, идемпотентность. */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  aggregateRecords,
  extractRecord,
  percentile,
  dayBounds,
  previousDay,
  readDay,
  pruneOldEvents,
  upsertAggregates,
  runMcpTelemetryAggregation,
} = require('../mcp-telemetry');

const DAY = '2026-08-17';

function rec(over = {}) {
  return {
    t: 'mcp_call',
    ts: `${DAY}T10:00:00.000Z`,
    tool: 'heys_log_meal',
    session_id: 's1',
    seq: 1,
    duration_ms: 100,
    status: 'ok',
    error_code: null,
    resp_bytes: 500,
    upstream_calls: 2,
    cold_start: false,
    ...over,
  };
}

test('свёртка считает вызовы, ошибки и перцентили по инструментам', () => {
  const records = [
    rec({ seq: 1, duration_ms: 100 }),
    rec({ seq: 2, duration_ms: 300 }),
    rec({ seq: 3, duration_ms: 200, status: 'error', error_code: 'internal_error' }),
    rec({ seq: 4, tool: 'heys_get_day', duration_ms: 50, cold_start: true }),
    rec({ seq: 5, tool: 'heys_get_day', duration_ms: 70, status: 'rejected', error_code: 'client_not_found' }),
  ];

  const { daily } = aggregateRecords(records, { day: DAY });
  const meal = daily.find((r) => r.tool === 'heys_log_meal');
  const getDay = daily.find((r) => r.tool === 'heys_get_day');

  assert.equal(meal.calls, 3);
  assert.equal(meal.err_count, 1);
  assert.equal(meal.rejected_count, 0);
  assert.equal(meal.total_ms, 600);
  assert.equal(meal.max_ms, 300);
  assert.equal(meal.avg_resp_bytes, 500);
  assert.equal(meal.avg_upstream_calls, 2);

  assert.equal(getDay.calls, 2);
  assert.equal(getDay.rejected_count, 1);
  assert.equal(getDay.err_count, 0, 'отказ по правилу — не ошибка сервиса');
  assert.equal(getDay.cold_starts, 1);
});

test('сортировка по суммарному времени, а не по среднему', () => {
  const records = [
    rec({ tool: 'slow_rare', seq: 1, duration_ms: 3000 }),
    ...Array.from({ length: 100 }, (_, i) => rec({ tool: 'fast_hot', seq: i + 2, duration_ms: 100 })),
  ];
  const { daily } = aggregateRecords(records, { day: DAY });
  assert.equal(daily[0].tool, 'fast_hot');
  assert.equal(daily[0].total_ms, 10_000);
  assert.equal(daily[1].tool, 'slow_rare');
});

test('пары считаются внутри подключения и не склеиваются между ними', () => {
  const records = [
    rec({ session_id: 'a', seq: 1, tool: 'tasks_context' }),
    rec({ session_id: 'a', seq: 2, tool: 'heys_list_clients' }),
    rec({ session_id: 'a', seq: 3, tool: 'heys_log_meal' }),
    rec({ session_id: 'b', seq: 1, tool: 'heys_get_day' }),
    rec({ session_id: 'b', seq: 2, tool: 'heys_log_meal' }),
  ];

  const { seq } = aggregateRecords(records, { day: DAY });
  const pair = (prev, next) => seq.find((p) => p.tool_prev === prev && p.tool_next === next);

  assert.equal(pair('tasks_context', 'heys_list_clients').count, 1);
  assert.equal(pair('heys_list_clients', 'heys_log_meal').count, 1);
  assert.equal(pair('heys_get_day', 'heys_log_meal').count, 1);
  assert.equal(pair('heys_log_meal', 'heys_get_day'), undefined);
});

test('разрыв в нумерации не выдумывает пару', () => {
  const records = [
    rec({ session_id: 'a', seq: 1, tool: 'first' }),
    rec({ session_id: 'a', seq: 5, tool: 'later' }),
  ];
  const { seq } = aggregateRecords(records, { day: DAY });
  assert.equal(seq.length, 0, 'между seq 1 и 5 потеряны строки — пары там нет');
});

test('чужие строки в логе игнорируются', () => {
  const { daily } = aggregateRecords([
    rec(),
    { t: 'other_event', tool: 'heys_log_meal' },
    { message: 'обычный текстовый лог' },
    null,
  ], { day: DAY });
  assert.equal(daily.length, 1);
  assert.equal(daily[0].calls, 1);
});

test('запись достаётся и из jsonPayload, и из текстовой строки', () => {
  assert.equal(extractRecord({ jsonPayload: rec() }).tool, 'heys_log_meal');
  assert.equal(extractRecord({ json_payload: rec() }).tool, 'heys_log_meal');
  assert.equal(extractRecord({ message: JSON.stringify(rec()) }).tool, 'heys_log_meal');
  assert.equal(extractRecord({ message: 'не наша строка' }), null);
  assert.equal(extractRecord({ message: '{"t":"mcp_call" оборвано' }), null, 'битый JSON не должен ронять разбор');
});

test('перцентиль берёт реальный элемент выборки', () => {
  const sorted = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  assert.equal(percentile(sorted, 50), 50);
  assert.equal(percentile(sorted, 95), 100);
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([42], 95), 42);
});

test('сутки считаются по МСК', () => {
  const { since, until } = dayBounds('2026-08-17');
  assert.equal(since, '2026-08-16T21:00:00.000Z');
  assert.equal(until, '2026-08-17T20:59:59.999Z');
  assert.equal(previousDay(Date.parse('2026-08-17T05:00:00Z')), '2026-08-16');
});

test('readDay читает сутки из Postgres', async () => {
  const client = {
    async query(sql, params) {
      assert.match(sql, /FROM mcp_call_events/);
      assert.equal(params[0], '2026-08-16T21:00:00.000Z');
      return {
        rows: [{
          t: 'mcp_call',
          ts: new Date('2026-08-17T10:00:00.000Z'),
          tool: 'parsed',
          session_id: 's1',
          seq: 1,
          duration_ms: 100,
          status: 'ok',
        }],
      };
    },
  };
  const { records } = await readDay(client, { day: DAY });
  assert.equal(records.length, 1);
  assert.equal(records[0].tool, 'parsed');
});

test('pruneOldEvents удаляет старые строки', async () => {
  let sql = '';
  const client = {
    async query(q) {
      sql = q;
      return { rowCount: 42 };
    },
  };
  const pruned = await pruneOldEvents(client);
  assert.match(sql, /DELETE FROM mcp_call_events/);
  assert.equal(pruned, 42);
});

/** Заглушка Postgres: держит строки так же, как таблица с PK. */
function fakeClient() {
  const daily = new Map();
  const seq = new Map();
  return {
    daily,
    seq,
    async query(sql, params) {
      if (sql.includes('INSERT INTO mcp_call_daily')) {
        daily.set(`${params[0]}|${params[1]}`, params);
      } else if (sql.includes('DELETE FROM mcp_seq_daily')) {
        for (const key of [...seq.keys()]) if (key.startsWith(`${params[0]}|`)) seq.delete(key);
      } else if (sql.includes('INSERT INTO mcp_seq_daily')) {
        seq.set(`${params[0]}|${params[1]}|${params[2]}`, params);
      } else if (sql.includes('DELETE FROM mcp_call_events')) {
        return { rowCount: 0 };
      } else if (sql.includes('FROM mcp_call_events')) {
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
}

test('повторный прогон за ту же дату не задваивает', async () => {
  const records = [
    rec({ session_id: 'a', seq: 1, tool: 'tasks_context' }),
    rec({ session_id: 'a', seq: 2, tool: 'heys_log_meal' }),
  ];
  const agg = aggregateRecords(records, { day: DAY });
  const client = fakeClient();

  const first = await upsertAggregates(client, { day: DAY, ...agg });
  const snapshot = JSON.stringify([...client.daily.values(), ...client.seq.values()]);

  const second = await upsertAggregates(client, { day: DAY, ...agg });
  assert.deepEqual(second, first);
  assert.equal(JSON.stringify([...client.daily.values(), ...client.seq.values()]), snapshot);
  assert.equal(client.daily.size, 2);
  assert.equal(client.seq.size, 1);
});

test('runMcpTelemetryAggregation без log group не skip', async () => {
  const client = fakeClient();
  const result = await runMcpTelemetryAggregation(client, {
    day: DAY,
    deps: {
      readDay: async () => ({ records: [rec()], truncated: false }),
      pruneOldEvents: async () => 0,
    },
  });
  assert.equal(result.skipped, undefined);
  assert.equal(result.records, 1);
});
