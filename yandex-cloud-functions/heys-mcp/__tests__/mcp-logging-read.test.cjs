'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CALL_FILTER,
  extractRecord,
  readMcpCalls,
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

test('readMcpCalls читает узкое окно и падает по timeout mock', async () => {
  let seenSince;
  const { records, truncated } = await readMcpCalls({
    logGroupId: 'grp',
    since: '2026-08-17T18:00:00.000Z',
    until: '2026-08-17T19:00:00.000Z',
    token: 'tok',
    fetchPage: async (body) => {
      seenSince = body.criteria.since;
      assert.equal(body.criteria.filter, CALL_FILTER);
      return { entries: [{ jsonPayload: rec({ tool: 'tasks_read' }) }] };
    },
  });
  assert.equal(seenSince, '2026-08-17T18:00:00.000Z');
  assert.equal(records[0].tool, 'tasks_read');
  assert.equal(truncated, false);
});

test('readMcpCalls truncated при лимите страниц', async () => {
  const { truncated } = await readMcpCalls({
    logGroupId: 'grp',
    since: '2026-08-17T18:00:00.000Z',
    until: '2026-08-17T19:00:00.000Z',
    token: 'tok',
    maxPages: 1,
    fetchPage: async () => ({ entries: [], nextPageToken: 'more' }),
  });
  assert.equal(truncated, true);
});
