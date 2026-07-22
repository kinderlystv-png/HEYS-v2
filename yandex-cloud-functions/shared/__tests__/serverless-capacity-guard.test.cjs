'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createServerlessCapacityGuard } = require('../serverless-capacity-guard');

test('admits up to the admission limit and releases idempotently', () => {
  const guard = createServerlessCapacityGuard({ admissionLimit: 2 });
  const first = guard.tryEnter();
  const second = guard.tryEnter();

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(guard.debugState().active, 2);

  first.release();
  first.release();
  assert.equal(guard.debugState().active, 1);
  assert.equal(guard.tryEnter().ok, true);
});

test('rejects excess work with Retry-After and keeps capacity state intact', () => {
  const guard = createServerlessCapacityGuard({
    admissionLimit: 1,
    retryAfterSeconds: 4,
  });
  const permit = guard.tryEnter();
  const rejected = guard.tryEnter();

  assert.equal(rejected.ok, false);
  assert.equal(rejected.response.statusCode, 429);
  assert.equal(rejected.response.headers['Retry-After'], '4');
  assert.equal(rejected.response.headers['X-HEYS-Overload'], 'instance-soft-limit');
  assert.equal(JSON.parse(rejected.response.body).retry_after_seconds, 4);
  assert.equal(guard.debugState().active, 1);

  permit.release();
  assert.equal(guard.tryEnter().ok, true);
});

test('preserves CORS headers on overload response', () => {
  const guard = createServerlessCapacityGuard({ admissionLimit: 1 });
  guard.tryEnter();
  const rejected = guard.tryEnter();
  const response = guard.withCorsHeaders(rejected.response, {
    'Access-Control-Allow-Origin': 'https://app.heyslab.ru',
  });

  assert.equal(response.headers['Access-Control-Allow-Origin'], 'https://app.heyslab.ru');
  assert.equal(response.headers['Retry-After'], '2');
  assert.equal(response.headers['Cache-Control'], 'no-store');
});
