'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMcpTraceTools, TRACE_TOOL } = require('../lib/mcp-trace-tools');
const correlate = require('../lib/mcp-correlate');
const callContext = require('../lib/call-context');

class ToolError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const transcript = `# 2026-08-17

## ~21:33

**Кин:** Вода
**Claude:** ок
[mcp session=aaaaaaaaaaaa seq=1 ts=2026-08-17T18:33:00.000Z]

## 22:04

**Кин:** smoke
**Claude:** ок
[mcp session=5bfb1cbe3be8 seq=2 ts=2026-08-17T19:04:26.885Z]
`;

function makeTools({ transcriptText = transcript, logs = [], nowMs = Date.parse('2026-08-17T20:00:00Z') } = {}) {
  const api = {
    async getKVByCurator() {
      return { data: { text: transcriptText, rev: 1, updatedAt: nowMs } };
    },
  };
  return createMcpTraceTools({
    api,
    curatorJwt: 'jwt',
    clientId: 'client',
    ToolError,
    nowMs,
    env: { MCP_LOG_GROUP_ID: 'grp' },
    readMcpCallsImpl: async () => ({ records: logs, truncated: false }),
  }).tools;
}

test('heading фильтрует один обмен и отделяет confirmed от probable', async () => {
  const tools = makeTools({
    logs: [
      { t: 'mcp_call', ts: '2026-08-17T19:04:18.000Z', tool: 'heys_get_day', session_id: '6c7a0025159a', seq: 3, duration_ms: 299, role: 'curator' },
      { t: 'mcp_call', ts: '2026-08-17T19:04:28.000Z', tool: 'heys_add_water', session_id: '5bfb1cbe3be8', seq: 2, duration_ms: 1407, role: 'curator' },
      { t: 'mcp_call', ts: '2026-08-17T19:04:39.000Z', tool: 'tasks_read', session_id: '6c7a0025159a', seq: 4, duration_ms: 90, role: 'curator' },
      { t: 'mcp_call', ts: '2026-08-17T19:04:39.500Z', tool: 'heys_get_day', session_id: 'clientonly', seq: 1, duration_ms: 50, role: 'client' },
    ],
  });

  const result = await tools.tasks_mcp_trace({ date: '2026-08-17', heading: '22:04' });
  const row = result.structured.rows[0];
  assert.equal(row.heading, '22:04');
  assert.deepEqual(row.confirmed_tools, ['heys_add_water']);
  assert.deepEqual(row.probable_tools, ['heys_get_day', 'tasks_read']);
  assert.equal(row.confirmed_ms, 1407);
  assert.equal(row.probable_ms, 389);
  assert.match(result.text, /подтверждённые 1 вызовов, 1407 мс/);
});

test('exclude self: tasks_mcp_trace и текущий session/seq не попадают в цепочку', async () => {
  const tools = makeTools({
    logs: [
      { t: 'mcp_call', tool: TRACE_TOOL, session_id: 'cur', seq: 9, duration_ms: 10, role: 'curator', ts: '2026-08-17T19:04:20.000Z' },
      { t: 'mcp_call', tool: 'heys_add_water', session_id: 'cur', seq: 9, duration_ms: 100, role: 'curator', ts: '2026-08-17T19:04:28.000Z' },
      { t: 'mcp_call', tool: 'tasks_read', session_id: 'other', seq: 1, duration_ms: 50, role: 'curator', ts: '2026-08-17T19:04:30.000Z' },
    ],
  });
  await callContext.run({ sessionId: 'cur', seq: 9 }, async () => {
    const result = await tools.tasks_mcp_trace({ date: '2026-08-17', heading: '22:04' });
    const toolsList = [...result.structured.rows[0].confirmed_tools, ...result.structured.rows[0].probable_tools];
    assert.ok(!toolsList.includes(TRACE_TOOL));
    assert.ok(!toolsList.includes('heys_add_water'));
    assert.ok(toolsList.includes('tasks_read'));
  });
});

test('heading фильтрует схлопнутый обмен одного хода', async () => {
  const multiBlockTranscript = `# 2026-08-17

## 22:03

**Кин:** Добавь мне воды 200 мл
**Claude:** чек-ин
[mcp session=aaaaaaaaaaaa seq=1 ts=2026-08-17T19:03:10.000Z]

## 22:03

**Кин:** Добавь мне воды 200 мл
**Claude:** вода
[mcp session=bbbbbbbbbbbb seq=2 ts=2026-08-17T19:03:12.000Z]
`;
  const tools = makeTools({
    transcriptText: multiBlockTranscript,
    logs: [
      { t: 'mcp_call', ts: '2026-08-17T19:03:11.000Z', tool: 'heys_get_period', session_id: 'bbbbbbbbbbbb', seq: 1, duration_ms: 400, role: 'curator' },
      { t: 'mcp_call', ts: '2026-08-17T19:03:12.000Z', tool: 'heys_checkin', session_id: 'bbbbbbbbbbbb', seq: 2, duration_ms: 715, role: 'curator' },
      { t: 'mcp_call', ts: '2026-08-17T19:03:13.000Z', tool: 'heys_add_water', session_id: 'bbbbbbbbbbbb', seq: 3, duration_ms: 881, role: 'curator' },
    ],
  });

  const result = await tools.tasks_mcp_trace({ date: '2026-08-17', heading: '22:03' });
  assert.equal(result.structured.rows.length, 1);
  assert.deepEqual(result.structured.rows[0].confirmed_tools, ['heys_get_period', 'heys_checkin', 'heys_add_water']);
});

test('дата старше retention — ошибка без вызова Logging', async () => {
  let called = false;
  const tools = makeTools({
    nowMs: Date.parse('2026-08-20T12:00:00+03:00'),
    readMcpCallsImpl: async () => { called = true; return { records: [], truncated: false }; },
  });
  await assert.rejects(
    () => tools.tasks_mcp_trace({ date: '2026-08-16' }),
    (err) => err.code === 'logs_retention_exceeded',
  );
  assert.equal(called, false);
});

test('заголовок ~21:33 парсится', () => {
  const { exchanges } = correlate.parseExchanges(transcript, { date: '2026-08-17' });
  assert.equal(exchanges[0].heading, '21:33');
});
