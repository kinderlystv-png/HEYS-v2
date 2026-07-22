#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');
const { POLICY, calculatePolicy, evaluateCapacity } = require('./serverless-capacity-policy.cjs');

function runJson(command, args) {
  const output = execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(output);
}

function runText(command, args) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function quotaMapFromResponse(response) {
  return Object.fromEntries(
    (response?.quota_limits || []).map((item) => [item.quota_id, Number(item.limit || 0)]),
  );
}

function latestFunctionConfig(versions) {
  const latest = Array.isArray(versions) ? versions[0] : null;
  return {
    versionId: latest?.id || null,
    status: latest?.status || null,
    concurrency: Number(latest?.concurrency || 0),
    memoryBytes: Number(latest?.resources?.memory || 0),
    executionTimeout: latest?.execution_timeout || null,
  };
}

function latestScalingConfig(policies) {
  const policy = (Array.isArray(policies) ? policies : []).find(
    (item) => item?.tag === '$latest',
  ) || (Array.isArray(policies) ? policies[0] : null);
  return {
    zoneInstancesLimit: Number(policy?.zone_instances_limit || 0),
    zoneRequestsLimit: Number(policy?.zone_requests_limit || 0),
    provisionedInstancesCount: Number(policy?.provisioned_instances_count || 0),
  };
}

function resolveCloudId({ readText = runText, readJson = runJson } = {}) {
  const configuredCloudId = readText('yc', ['config', 'get', 'cloud-id']);
  if (configuredCloudId) return configuredCloudId;

  const folderId = readText('yc', ['config', 'get', 'folder-id']);
  if (!folderId) throw new Error('Yandex Cloud cloud-id and folder-id are not configured');

  const folder = readJson('yc', [
    'resource-manager', 'folder', 'get', folderId,
    '--format', 'json',
  ]);
  if (!folder?.cloud_id) throw new Error(`Cannot resolve cloud-id from folder ${folderId}`);
  return folder.cloud_id;
}

function collectLiveSnapshot() {
  const cloudId = resolveCloudId();
  const quotaResponse = runJson('yc', [
    'quota-manager', 'quota-limit', 'list',
    '--service', 'serverless-functions',
    '--resource-id', cloudId,
    '--resource-type', 'resource-manager.cloud',
    '--format', 'json',
  ]);
  const functions = {};
  for (const functionName of Object.keys(POLICY.runtime.functions)) {
    const versions = runJson('yc', [
      'serverless', 'function', 'version', 'list',
      '--function-name', functionName,
      '--format', 'json',
    ]);
    const scalingPolicies = runJson('yc', [
      'serverless', 'function', 'list-scaling-policies',
      '--name', functionName,
      '--format', 'json',
    ]);
    functions[functionName] = {
      ...latestFunctionConfig(versions),
      ...latestScalingConfig(scalingPolicies),
    };
  }
  return {
    checkedAt: new Date().toISOString(),
    cloudId,
    quotas: quotaMapFromResponse(quotaResponse),
    functions,
  };
}

function printHuman(report) {
  const { calculated } = report;
  console.log(
    `Serverless capacity: target=${calculated.targetPeak}, required(2x)=${calculated.requiredConcurrentRequests}`,
  );
  for (const check of report.checks) {
    console.log(`${check.ok ? 'OK' : 'FAIL'} ${check.id}: actual=${check.actual} required=${check.required}`);
  }
}

function main(argv = process.argv.slice(2)) {
  const args = new Set(argv);
  const snapshot = collectLiveSnapshot();
  const evaluation = evaluateCapacity(snapshot);
  const checks = args.has('--quota-only')
    ? evaluation.checks.filter((check) => check.type === 'quota' || check.id === 'headroom')
    : evaluation.checks;
  const report = {
    ok: checks.every((check) => check.ok),
    policyVersion: POLICY.version,
    policy: POLICY,
    calculated: calculatePolicy(),
    snapshot,
    checks,
  };

  if (args.has('--json')) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
  if (args.has('--strict') && !report.ok) process.exitCode = 1;
  return report;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Capacity check failed: ${error.message}`);
    process.exitCode = 2;
  }
}

module.exports = {
  collectLiveSnapshot,
  latestFunctionConfig,
  latestScalingConfig,
  main,
  quotaMapFromResponse,
  resolveCloudId,
};
