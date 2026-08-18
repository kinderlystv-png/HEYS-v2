'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mcp = require('../lib/mcp');
const { TOOL_SCHEMAS } = require('../lib/tools');

const ctx = {
  tools: {
    async heys_get_day() {
      return { text: 'ок', structured: { date: '2026-08-01' } };
    },
  },
};

test('initialize подтверждает версию клиента, если она поддерживается', async () => {
  const res = await mcp.handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, ctx);
  assert.equal(res.result.protocolVersion, '2025-06-18');
  assert.equal(res.result.serverInfo.name, 'heys-mcp');
  assert.ok(res.result.capabilities.tools);
});

test('initialize с незнакомой версией откатывается на последнюю поддерживаемую', async () => {
  const res = await mcp.handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-01-01' } }, ctx);
  assert.equal(res.result.protocolVersion, mcp.LATEST_PROTOCOL_VERSION);
});

test('instructions несут правила куратора, а не только описание сервера', async () => {
  const res = await mcp.handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, ctx);
  assert.match(res.result.instructions, /компонентами/);
  assert.match(res.result.instructions, /heys_list_meal_presets/);
});

test('уведомления не получают ответа', async () => {
  assert.equal(await mcp.handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx), null);
  assert.equal(await mcp.handleMessage({ jsonrpc: '2.0', method: 'notifications/cancelled', params: {} }, ctx), null);
});

test('tools/list отдаёт схемы со всеми обязательными полями', async () => {
  const res = await mcp.handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, ctx);
  assert.equal(res.result.tools.length, TOOL_SCHEMAS.length);
  for (const tool of res.result.tools) {
    assert.ok(tool.name, 'у инструмента есть имя');
    assert.ok(tool.description.length > 20, `${tool.name}: описание осмысленное`);
    assert.equal(tool.inputSchema.type, 'object');
  }
});

test('каждый объявленный инструмент реализован', () => {
  const { createTools } = require('../lib/tools');
  const { tools } = createTools({ api: {}, sessionToken: 's', clientId: 'c' });
  for (const schema of TOOL_SCHEMAS) {
    assert.equal(typeof tools[schema.name], 'function', `${schema.name} реализован`);
  }
  assert.equal(Object.keys(tools).length, TOOL_SCHEMAS.length, 'нет инструментов без схемы');
});

test('tools/call проксирует результат в content и structuredContent', async () => {
  const res = await mcp.handleMessage({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'heys_get_day', arguments: {} } }, ctx);
  assert.equal(res.result.content[0].text, 'ок');
  assert.equal(res.result.structuredContent.ok, true);
  assert.equal(res.result.isError, undefined);
});

test('неизвестный инструмент — ошибка протокола', async () => {
  const res = await mcp.handleMessage({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'heys_nope' } }, ctx);
  assert.equal(res.error.code, mcp.JSONRPC_ERRORS.INVALID_PARAMS);
});

test('внутренний сбой инструмента не роняет соединение и не течёт наружу', async () => {
  const boom = { tools: { async heys_get_day() { throw new Error('PG_PASSWORD=hunter2'); } }, logError() {} };
  const res = await mcp.handleMessage({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'heys_get_day', arguments: {} } }, boom);
  assert.equal(res.result.isError, true);
  assert.equal(res.result.structuredContent.error, 'internal_error');
  assert.equal(res.result.content[0].text.includes('hunter2'), false);
});

test('неизвестный метод получает method_not_found', async () => {
  const res = await mcp.handleMessage({ jsonrpc: '2.0', id: 6, method: 'resources/list' }, ctx);
  assert.equal(res.error.code, mcp.JSONRPC_ERRORS.METHOD_NOT_FOUND);
});

test('ping отвечает пустым результатом', async () => {
  const res = await mcp.handleMessage({ jsonrpc: '2.0', id: 8, method: 'ping' }, ctx);
  assert.deepEqual(res.result, {});
});

test('батч возвращает ответы только на запросы с id', async () => {
  const res = await mcp.handlePayload([
    { jsonrpc: '2.0', id: 1, method: 'ping' },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  ], ctx);
  assert.equal(res.length, 2);
  assert.deepEqual(res.map((r) => r.id), [1, 2]);
});

test('батч только из уведомлений не даёт тела ответа', async () => {
  assert.equal(await mcp.handlePayload([{ jsonrpc: '2.0', method: 'notifications/initialized' }], ctx), null);
});

test('мусорный payload отвергается как invalid request', async () => {
  const res = await mcp.handlePayload('строка', ctx);
  assert.equal(res.error.code, mcp.JSONRPC_ERRORS.INVALID_REQUEST);
  const empty = await mcp.handlePayload([], ctx);
  assert.equal(empty[0].error.code, mcp.JSONRPC_ERRORS.INVALID_REQUEST);
});

// ── mcp_list: что клиент получил в ответ на tools/list ────────────────────
// 18.08 агент сказал «инструмента нет», а проверить было нечем: сервер не
// писал ни сколько схем отдал, ни какому клиенту.

test('запись mcp_list собирается строго по своему белому списку', () => {
  const { LIST_RECORD_FIELDS, buildListRecord } = require('../lib/telemetry');
  const record = buildListRecord({
    nowMs: Date.UTC(2026, 7, 18, 20, 0, 0),
    sessionId: 'sess-1',
    toolsCount: 80,
    toolsBytes: 139264,
    clientName: 'claude-ai',
    clientVersion: '1.2.3',
    protocolVersion: '2025-06-18',
    role: 'curator',
    coldStart: true,
    uptimeMs: 1200,
    fnVersion: 'ver-1',
    // Мимо белого списка — не должно доехать ни при каких условиях.
    token: 'Bearer secret',
    tools: ['heys_log_meal'],
  });
  assert.deepEqual(Object.keys(record).sort(), [...LIST_RECORD_FIELDS].sort());
  assert.equal(record.t, 'mcp_list');
  assert.equal(record.tools_count, 80);
  assert.equal(record.tools_bytes, 139264);
  assert.equal(record.client_name, 'claude-ai');
  const raw = JSON.stringify(record);
  assert.ok(!raw.includes('secret'), 'токен в строку не попадает');
  assert.ok(!raw.includes('heys_log_meal'), 'сам список инструментов не логируется');
});

test('tools/list сообщает число и размер отданных схем', async () => {
  const listed = [];
  const res = await mcp.handlePayload(
    { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    {
      tools: {},
      toolSchemas: [
        { name: 'heys_get_day', description: 'd', inputSchema: { type: 'object' } },
        { name: 'heys_update_day', description: 'd', inputSchema: { type: 'object' } },
      ],
      logList: (info) => listed.push(info),
    },
  );
  assert.equal(res.result.tools.length, 2);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].toolsCount, 2);
  assert.ok(listed[0].toolsBytes > 0);
});

test('initialize запоминает, какой клиент подключился', async () => {
  const seen = [];
  await mcp.handlePayload(
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        clientInfo: { name: 'claude-ai', version: '1.2.3' },
      },
    },
    { tools: {}, toolSchemas: [], noteClient: (info) => seen.push(info) },
  );
  assert.deepEqual(seen, [{ name: 'claude-ai', version: '1.2.3', protocolVersion: '2025-06-18' }]);
});

test('падение логгера списка не ломает ответ на tools/list', async () => {
  const res = await mcp.handlePayload(
    { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    {
      tools: {},
      toolSchemas: [{ name: 'heys_get_day', description: 'd', inputSchema: { type: 'object' } }],
      logList: () => { throw new Error('logging is down'); },
    },
  );
  assert.equal(res.result.tools.length, 1);
});
