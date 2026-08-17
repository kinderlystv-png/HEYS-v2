'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CALL_FILTER,
  extractRecord,
} = require('../shared/mcp-logging-read');

function rec(over = {}) {
  return {
    t: 'mcp_call',
    ts: '2026-08-17T10:00:00.000Z',
    tool: 'heys_log_meal',
    session_id: 's1',
    seq: 1,
    duration_ms: 100,
    role: 'curator',
    ...over,
  };
}

test('extractRecord достаёт mcp_call из jsonPayload и message', () => {
  assert.equal(extractRecord({ jsonPayload: rec() }).tool, 'heys_log_meal');
  assert.equal(extractRecord({ message: JSON.stringify(rec()) }).tool, 'heys_log_meal');
  assert.equal(extractRecord({ message: 'шум mcp_call без json' }), null);
});

test('CALL_FILTER оставлен для офлайн correlate', () => {
  assert.match(CALL_FILTER, /json_payload\.t = "mcp_call"/);
  assert.match(CALL_FILTER, /OR message: "mcp_call"/);
});
