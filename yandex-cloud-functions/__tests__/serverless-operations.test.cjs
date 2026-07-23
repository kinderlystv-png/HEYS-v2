'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  OVERLOAD_LOG_FILTER,
  buildLogReadArgs,
  parseOverloadEntries,
} = require('../check-serverless-error-logs.cjs');
const { parseRetryAfter, runCanary } = require('../serverless-ops-canary.cjs');

function response(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

test('log parser only captures exact platform 429/503 codes', () => {
  const incidents = parseOverloadEntries([
    { timestamp: '2026-07-22T20:15:31Z', message: 'ERROR RequestID: one Code: 429 Message: quota exceeded' },
    { timestamp: '2026-07-22T20:15:32Z', message: 'ERROR RequestID: two Code: 503 Message: unavailable' },
    { timestamp: '2026-07-22T20:15:33Z', message: 'REPORT RequestID: has-503-in-id Duration: 10ms' },
  ], 'heys-api-rpc');

  assert.deepEqual(incidents.map((item) => item.status), [429, 503]);
  assert.deepEqual(incidents.map((item) => item.requestId), ['one', 'two']);
});

test('log scan uses filtered Cloud Logging read for the watched function', () => {
  const args = buildLogReadArgs('function-id', '20m');

  assert.deepEqual(args.slice(0, 3), ['logging', 'read', 'default']);
  assert.deepEqual(args.slice(args.indexOf('--resource-ids'), args.indexOf('--resource-ids') + 2), [
    '--resource-ids',
    'function-id',
  ]);
  assert.equal(args[args.indexOf('--filter') + 1], OVERLOAD_LOG_FILTER);
});

test('Retry-After accepts positive delta seconds or a future HTTP date', () => {
  assert.equal(parseRetryAfter('2', 0), 2);
  assert.equal(parseRetryAfter('0', 0), null);
  assert.equal(parseRetryAfter('Thu, 01 Jan 1970 00:00:05 GMT', 0), 5);
  assert.equal(parseRetryAfter('invalid', 0), null);
});

test('operational canary checks rpc and rest in parallel', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return response(200, [{ id: 'ok' }]);
  };
  const result = await runCanary({ baseUrl: 'https://example.test', fetchImpl });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.ok(calls.some((url) => url.includes('/rpc?fn=get_shared_products')));
  assert.ok(calls.some((url) => url.includes('/rest/shared_products')));
});

test('operational canary fails overload without valid Retry-After', async () => {
  const fetchImpl = async (url) => (
    url.includes('/rpc')
      ? response(429, { error: 'server_busy' })
      : response(503, { error: 'unavailable' }, { 'Retry-After': '3' })
  );
  const result = await runCanary({ baseUrl: 'https://example.test', fetchImpl });

  assert.equal(result.ok, false);
  assert.equal(result.probes[0].retryAfterValid, false);
  assert.equal(result.probes[1].retryAfterValid, true);
});
