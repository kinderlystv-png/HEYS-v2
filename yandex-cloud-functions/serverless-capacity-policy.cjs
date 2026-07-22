'use strict';

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

const POLICY = Object.freeze({
  version: 1,
  target: Object.freeze({
    simultaneousClients: 6,
    maxRequestsPerClient: 3,
    operationalCanaryRequests: 2,
    headroomFactor: 2,
  }),
  runtime: Object.freeze({
    instanceConcurrency: 4,
    instanceAdmissionLimit: 4,
    overloadRetryAfterSeconds: 2,
    scaling: Object.freeze({
      zoneInstancesLimit: 40,
      zoneRequestsLimit: 40,
    }),
    functions: Object.freeze({
      'heys-api-rpc': Object.freeze({ memoryBytes: 512 * MIB }),
      'heys-api-rest': Object.freeze({ memoryBytes: 512 * MIB }),
    }),
  }),
  requiredQuotas: Object.freeze({
    'serverless.request.count': 40,
    'serverless.workers.count': 40,
    'serverless.memory.size': 20 * GIB,
  }),
});

function calculatePolicy(policy = POLICY) {
  const clientRequests = policy.target.simultaneousClients * policy.target.maxRequestsPerClient;
  const targetPeak = clientRequests + policy.target.operationalCanaryRequests;
  const requiredConcurrentRequests = Math.ceil(targetPeak * policy.target.headroomFactor);
  const minimumWorkersAtRuntimeConcurrency = Math.ceil(
    requiredConcurrentRequests / policy.runtime.instanceConcurrency,
  );
  const requiredWorkers = requiredConcurrentRequests;
  const requiredMemory = requiredWorkers
    * Math.max(...Object.values(policy.runtime.functions).map((item) => item.memoryBytes));

  return {
    clientRequests,
    targetPeak,
    requiredConcurrentRequests,
    minimumWorkersAtRuntimeConcurrency,
    requiredWorkers,
    requiredMemory,
  };
}

function evaluateCapacity(snapshot, policy = POLICY) {
  const calculated = calculatePolicy(policy);
  const checks = [];
  const quotas = snapshot?.quotas || {};
  const functions = snapshot?.functions || {};

  for (const [quotaId, required] of Object.entries(policy.requiredQuotas)) {
    const actual = Number(quotas[quotaId] ?? 0);
    checks.push({
      type: 'quota',
      id: quotaId,
      required,
      actual,
      ok: actual >= required,
    });
  }

  for (const [functionName, requiredConfig] of Object.entries(policy.runtime.functions)) {
    const actual = functions[functionName] || {};
    checks.push({
      type: 'function',
      id: `${functionName}.concurrency`,
      required: policy.runtime.instanceConcurrency,
      actual: Number(actual.concurrency ?? 0),
      ok: Number(actual.concurrency ?? 0) === policy.runtime.instanceConcurrency,
    });
    checks.push({
      type: 'function',
      id: `${functionName}.memoryBytes`,
      required: requiredConfig.memoryBytes,
      actual: Number(actual.memoryBytes ?? 0),
      ok: Number(actual.memoryBytes ?? 0) >= requiredConfig.memoryBytes,
    });
  }

  checks.push({
    type: 'policy',
    id: 'headroom',
    required: calculated.requiredConcurrentRequests,
    actual: Number(quotas['serverless.request.count'] ?? 0),
    ok: Number(quotas['serverless.request.count'] ?? 0) >= calculated.requiredConcurrentRequests,
  });
  checks.push({
    type: 'policy',
    id: 'admissionLimitWithinRuntimeConcurrency',
    required: `<=${policy.runtime.instanceConcurrency}`,
    actual: policy.runtime.instanceAdmissionLimit,
    ok: policy.runtime.instanceAdmissionLimit <= policy.runtime.instanceConcurrency,
  });

  for (const [functionName] of Object.entries(policy.runtime.functions)) {
    const actual = functions[functionName] || {};
    checks.push({
      type: 'scaling',
      id: `${functionName}.zoneInstancesLimit`,
      required: policy.runtime.scaling.zoneInstancesLimit,
      actual: Number(actual.zoneInstancesLimit ?? 0),
      ok: Number(actual.zoneInstancesLimit ?? 0) === policy.runtime.scaling.zoneInstancesLimit,
    });
    checks.push({
      type: 'scaling',
      id: `${functionName}.zoneRequestsLimit`,
      required: policy.runtime.scaling.zoneRequestsLimit,
      actual: Number(actual.zoneRequestsLimit ?? 0),
      ok: Number(actual.zoneRequestsLimit ?? 0) === policy.runtime.scaling.zoneRequestsLimit,
    });
  }

  return {
    ok: checks.every((check) => check.ok),
    calculated,
    checks,
  };
}

module.exports = {
  MIB,
  GIB,
  POLICY,
  calculatePolicy,
  evaluateCapacity,
};
