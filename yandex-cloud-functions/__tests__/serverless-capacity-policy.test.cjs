'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { POLICY, calculatePolicy, evaluateCapacity } = require('../serverless-capacity-policy.cjs');
const {
  latestFunctionConfig,
  latestScalingConfig,
  quotaMapFromResponse,
} = require('../check-serverless-capacity.cjs');

function healthySnapshot() {
  return {
    quotas: { ...POLICY.requiredQuotas },
    functions: {
      'heys-api-rpc': {
        concurrency: 4,
        memoryBytes: 512 * 1024 * 1024,
        zoneInstancesLimit: 40,
        zoneRequestsLimit: 40,
      },
      'heys-api-rest': {
        concurrency: 4,
        memoryBytes: 512 * 1024 * 1024,
        zoneInstancesLimit: 40,
        zoneRequestsLimit: 40,
      },
    },
  };
}

test('capacity target reserves at least 2x for six clients plus canary', () => {
  const result = calculatePolicy();

  assert.equal(result.clientRequests, 18);
  assert.equal(result.targetPeak, 20);
  assert.equal(result.requiredConcurrentRequests, 40);
  assert.equal(result.minimumWorkersAtRuntimeConcurrency, 10);
  assert.equal(result.requiredWorkers, 40);
  assert.equal(result.requiredMemory, 20 * 1024 * 1024 * 1024);
  assert.equal(POLICY.requiredQuotas['serverless.request.count'], 40);
  assert.equal(POLICY.requiredQuotas['serverless.workers.count'], 40);
});

test('fails the confirmed quota=10 incident configuration', () => {
  const snapshot = healthySnapshot();
  snapshot.quotas['serverless.request.count'] = 10;
  snapshot.quotas['serverless.workers.count'] = 10;
  const result = evaluateCapacity(snapshot);

  assert.equal(result.ok, false);
  assert.equal(result.checks.find((check) => check.id === 'serverless.request.count').ok, false);
  assert.equal(result.checks.find((check) => check.id === 'headroom').ok, false);
});

test('accepts the target quota and exact rpc/rest version settings', () => {
  const result = evaluateCapacity(healthySnapshot());
  assert.equal(result.ok, true);
});

test('fails when rpc/rest scaling policy is absent or below the capacity policy', () => {
  const snapshot = healthySnapshot();
  snapshot.functions['heys-api-rpc'].zoneRequestsLimit = 10;
  const result = evaluateCapacity(snapshot);

  assert.equal(result.ok, false);
  assert.equal(
    result.checks.find((check) => check.id === 'heys-api-rpc.zoneRequestsLimit').ok,
    false,
  );
});

test('normalizes live quota and function version responses', () => {
  assert.deepEqual(quotaMapFromResponse({
    quota_limits: [{ quota_id: 'serverless.request.count', limit: 40 }],
  }), { 'serverless.request.count': 40 });
  assert.deepEqual(latestFunctionConfig([{
    id: 'version-1',
    status: 'ACTIVE',
    concurrency: '4',
    resources: { memory: '536870912' },
    execution_timeout: '30s',
  }]), {
    versionId: 'version-1',
    status: 'ACTIVE',
    concurrency: 4,
    memoryBytes: 536870912,
    executionTimeout: '30s',
  });
  assert.deepEqual(latestScalingConfig([{
    tag: '$latest',
    zone_instances_limit: '40',
    zone_requests_limit: '40',
    provisioned_instances_count: '0',
  }]), {
    zoneInstancesLimit: 40,
    zoneRequestsLimit: 40,
    provisionedInstancesCount: 0,
  });
});
