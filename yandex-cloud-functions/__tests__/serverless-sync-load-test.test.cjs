'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PROBE_KEYS,
  buildTargetWave,
  executeRequest,
  runLoadTest,
} = require('../serverless-sync-load-test.cjs');

function response(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function clients(count = 6) {
  return Array.from({ length: count }, (_, index) => ({
    name: `client-${index + 1}`,
    sessionToken: `session-${index + 1}`,
    contextId: `context-${index + 1}`,
  }));
}

test('target wave is Phase A + two uploads per client plus two canaries', () => {
  const wave = buildTargetWave({ clients: clients(), baseUrl: 'https://example.test', runId: 'run-1' });
  assert.equal(wave.length, 20);
  assert.equal(wave.filter((item) => item.kind === 'phase-a').length, 6);
  assert.equal(wave.filter((item) => item.kind.startsWith('upload-')).length, 12);
  assert.equal(wave.filter((item) => item.kind.startsWith('canary-')).length, 2);
});

test('request result preserves overload and Retry-After for exact-body recovery', async () => {
  const request = {
    client: 'one',
    kind: 'upload-1',
    url: 'https://example.test/rpc',
    options: { method: 'POST', body: '{"same":true}' },
  };
  const result = await executeRequest(request, async () => response(
    429,
    { error: 'server_busy' },
    { 'Retry-After': '2' },
  ));

  assert.equal(result.overload, true);
  assert.equal(result.retryAfterSeconds, 2);
  assert.equal(result.retryAfterValid, true);
  assert.equal(result.options.body, request.options.body);
});

test('HTTP 200 upload with explicit RPC failure is a hard failure', async () => {
  const request = {
    client: 'one',
    kind: 'upload-1',
    url: 'https://example.test/rpc?fn=batch_upsert_client_kv_by_session',
    options: { method: 'POST', body: '{"same":true}' },
  };
  const result = await executeRequest(request, async () => response(200, {
    batch_upsert_client_kv_by_session: {
      success: false,
      error: 'subscription_required',
      saved: 0,
    },
  }));

  assert.equal(result.ok, false);
  assert.equal(result.status, 200);
  assert.equal(result.error, 'subscription_required');
});

test('six-client target load reaches 20 in flight and verifies both uploads', async () => {
  const storedBySession = new Map();
  let activeFetches = 0;
  let observedMax = 0;
  const fetchImpl = async (url, options = {}) => {
    activeFetches += 1;
    observedMax = Math.max(observedMax, activeFetches);
    await new Promise((resolve) => setImmediate(resolve));
    try {
      const fnName = new URL(url).searchParams.get('fn');
      if (!fnName) return response(200, [{ id: 'rest-canary' }]);
      const body = JSON.parse(options.body || '{}');
      if (fnName === 'get_shared_products') return response(200, [{ id: 'rpc-canary' }]);
      if (fnName === 'batch_upsert_client_kv_by_session') {
        const current = storedBySession.get(body.p_session_token) || [];
        storedBySession.set(body.p_session_token, [...current, ...body.p_items]);
        return response(200, { success: true, saved: body.p_items.length });
      }
      if (fnName === 'batch_get_client_kv_by_session') {
        return response(200, { items: storedBySession.get(body.p_session_token) || [] });
      }
      return response(400, { error: 'unexpected' });
    } finally {
      activeFetches -= 1;
    }
  };

  const result = await runLoadTest({ scenario: { clients: clients() }, fetchImpl });

  assert.equal(result.ok, true);
  assert.equal(result.targetWaveSize, 20);
  assert.equal(result.maxInFlight, 20);
  assert.equal(observedMax, 20);
  assert.equal(result.initialOverloads, 0);
  assert.equal(result.verificationOk, true);
  assert.deepEqual(result.missingProbeWrites, []);
  assert.equal([...storedBySession.values()].every((items) => PROBE_KEYS.every(
    (key) => items.some((item) => item.k === key),
  )), true);
});

test('overload keeps the exact upload pending, honors Retry-After, and re-reads critical keys', async () => {
  const storedBySession = new Map();
  const uploadBodies = [];
  const recoveryKeys = [];
  const sleptFor = [];
  let overloadSent = false;

  const fetchImpl = async (url, options = {}) => {
    const fnName = new URL(url).searchParams.get('fn');
    if (!fnName) return response(200, [{ id: 'rest-canary' }]);
    const body = JSON.parse(options.body || '{}');
    if (fnName === 'get_shared_products') return response(200, [{ id: 'rpc-canary' }]);
    if (fnName === 'batch_upsert_client_kv_by_session') {
      if (body.p_session_token === 'session-1' && body.p_items[0].k === PROBE_KEYS[0]) {
        uploadBodies.push(options.body);
        if (!overloadSent) {
          overloadSent = true;
          return response(429, { error: 'server_busy' }, { 'Retry-After': '2' });
        }
      }
      const current = storedBySession.get(body.p_session_token) || [];
      storedBySession.set(body.p_session_token, [...current, ...body.p_items]);
      return response(200, { success: true, saved: body.p_items.length });
    }
    if (fnName === 'batch_get_client_kv_by_session') {
      if (body.p_keys.includes(PROBE_KEYS[0])) recoveryKeys.push(body.p_keys);
      return response(200, { items: storedBySession.get(body.p_session_token) || [] });
    }
    return response(400, { error: 'unexpected' });
  };

  const result = await runLoadTest({
    scenario: { clients: clients() },
    fetchImpl,
    sleepImpl: async (ms) => sleptFor.push(ms),
    expectOverload: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.initialOverloads, 1);
  assert.equal(result.retried, 1);
  assert.equal(result.unrecovered, 0);
  assert.deepEqual(sleptFor, [2000]);
  assert.equal(uploadBodies.length, 2);
  assert.equal(uploadBodies[0], uploadBodies[1]);
  assert.equal(recoveryKeys.length, 6);
  assert.equal(recoveryKeys.every((keys) => keys.includes('heys_profile')), true);
  assert.equal(recoveryKeys.every((keys) => PROBE_KEYS.every((key) => keys.includes(key))), true);
  assert.deepEqual(result.missingProbeWrites, []);
});
