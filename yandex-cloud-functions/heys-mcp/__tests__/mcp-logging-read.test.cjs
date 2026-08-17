'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CALL_FILTER,
  extractRecord,
  isRetryableNetworkError,
  readLoggingPage,
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

test('isRetryableNetworkError ловит socket hang up и ECONNRESET', () => {
  assert.equal(isRetryableNetworkError(new Error('socket hang up')), true);
  assert.equal(isRetryableNetworkError(Object.assign(new Error('reset'), { code: 'ECONNRESET' })), true);
  assert.equal(isRetryableNetworkError(new Error('Logging read failed: HTTP 403')), false);
});

test('readLoggingPage ретраит transient обрыв', async () => {
  let attempts = 0;
  const page = await readLoggingPage(
    { criteria: { since: 'x', until: 'y' } },
    { token: 'tok' },
    {
      timeoutMs: 1000,
      getToken: async () => 'fresh',
      postJsonImpl: async () => {
        attempts += 1;
        if (attempts === 1) {
          const err = new Error('socket hang up');
          err.code = 'ECONNRESET';
          throw err;
        }
        return { entries: [{ jsonPayload: rec({ tool: 'tasks_mcp_trace' }) }] };
      },
    },
  );
  assert.equal(attempts, 2);
  assert.equal(page.entries[0].jsonPayload.tool, 'tasks_mcp_trace');
});

test('readLoggingPage обновляет IAM при HTTP 401', async () => {
  let tokenFetch = 0;
  let attempts = 0;
  const iamRef = { token: 'stale' };
  const page = await readLoggingPage(
    { criteria: { since: 'x', until: 'y' } },
    iamRef,
    {
      timeoutMs: 1000,
      getToken: async () => {
        tokenFetch += 1;
        return `fresh-${tokenFetch}`;
      },
      postJsonImpl: async (_host, _path, _body, token) => {
        attempts += 1;
        if (token === 'stale') throw new Error('Logging read failed: HTTP 401 unauthorized');
        return { entries: [{ jsonPayload: rec({ tool: 'heys_add_water' }) }] };
      },
    },
  );
  assert.equal(tokenFetch, 1);
  assert.equal(iamRef.token, 'fresh-1');
  assert.equal(attempts, 2);
  assert.equal(page.entries[0].jsonPayload.tool, 'heys_add_water');
});
