'use strict';

const assert = require('assert');
const {
  normalizeInsertRecord,
  verifyMcpTelemetryAuthorization,
  rowToRecord,
} = require('../mcp-telemetry-rpc');

function run() {
  const prev = process.env.MCP_TELEMETRY_SECRET;
  process.env.MCP_TELEMETRY_SECRET = 'test-secret';

  const auth = verifyMcpTelemetryAuthorization('Bearer test-secret');
  assert.equal(auth.ok, true, 'valid secret');

  const bad = verifyMcpTelemetryAuthorization('Bearer wrong');
  assert.equal(bad.ok, false);
  assert.equal(bad.status, 401);

  const normalized = normalizeInsertRecord({
    t: 'mcp_call',
    ts: '2026-08-17T10:00:00.000Z',
    tool: 'heys_get_day',
    session_id: 'abc123',
    seq: 1,
    duration_ms: 100,
    status: 'ok',
    role: 'curator',
    extra_field: 'drop me',
  });
  assert.equal(normalized.ok, true);
  assert.equal(normalized.record.extra_field, undefined);

  const missing = normalizeInsertRecord({ t: 'mcp_call', ts: '2026-08-17T10:00:00.000Z', tool: 'x' });
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, 'missing_session_or_seq');

  const row = rowToRecord({
    t: 'mcp_call',
    ts: new Date('2026-08-17T10:00:00.000Z'),
    tool: 'tasks_read',
    session_id: 's',
    seq: 2,
    cold_start: true,
  });
  assert.equal(row.ts, '2026-08-17T10:00:00.000Z');
  assert.equal(row.cold_start, true);

  if (prev === undefined) delete process.env.MCP_TELEMETRY_SECRET;
  else process.env.MCP_TELEMETRY_SECRET = prev;

  console.log('mcp-telemetry-rpc unit: ok');
}

run();
