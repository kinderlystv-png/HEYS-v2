#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseRetryAfter } = require('./serverless-ops-canary.cjs');
const { POLICY } = require('./serverless-capacity-policy.cjs');

const DEFAULT_BASE_URL = 'https://api.heyslab.ru';
const CRITICAL_KEYS = Object.freeze([
  'heys_profile',
  'heys_norms',
  'heys_subscription_status',
  'heys_planning_projects',
  'heys_planning_tasks',
]);
const PROBE_KEYS = Object.freeze(['heys_ops_capacity_probe_a', 'heys_ops_capacity_probe_b']);

function assertScenarioFileSafe(filePath) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error('Scenario path must be a regular file');
  if ((stat.mode & 0o077) !== 0) {
    throw new Error('Scenario file contains session credentials and must have mode 0600');
  }
}

function readScenario(filePath) {
  const resolved = path.resolve(filePath);
  assertScenarioFileSafe(resolved);
  const scenario = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (!Array.isArray(scenario.clients)) throw new Error('Scenario must contain clients[]');
  for (const [index, client] of scenario.clients.entries()) {
    if (!client?.sessionToken || !client?.contextId) {
      throw new Error(`clients[${index}] requires sessionToken and contextId`);
    }
  }
  return scenario;
}

function rpcRequest(baseUrl, fnName, body, meta) {
  return {
    ...meta,
    url: `${baseUrl}/rpc?fn=${encodeURIComponent(fnName)}`,
    options: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://app.heyslab.ru' },
      body: JSON.stringify(body),
    },
  };
}

function buildClientRequests(client, clientIndex, baseUrl, runId) {
  const common = { client: client.name || `client-${clientIndex + 1}` };
  const phaseA = rpcRequest(baseUrl, 'batch_get_client_kv_by_session', {
    p_session_token: client.sessionToken,
    p_keys: CRITICAL_KEYS,
  }, { ...common, kind: 'phase-a' });
  const uploads = PROBE_KEYS.map((key, uploadIndex) => rpcRequest(
    baseUrl,
    'batch_upsert_client_kv_by_session',
    {
      p_session_token: client.sessionToken,
      p_context_id: client.contextId,
      p_items: [{
        k: key,
        v: { run_id: runId, client: common.client, upload: uploadIndex + 1 },
        updated_at: new Date().toISOString(),
      }],
    },
    { ...common, kind: `upload-${uploadIndex + 1}`, probeKey: key },
  ));
  return [phaseA, ...uploads];
}

function buildTargetWave({ clients, baseUrl = DEFAULT_BASE_URL, runId }) {
  const requests = clients.flatMap((client, index) => buildClientRequests(client, index, baseUrl, runId));
  requests.push({
    client: 'ops',
    kind: 'canary-rpc',
    url: `${baseUrl}/rpc?fn=get_shared_products`,
    options: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://app.heyslab.ru' },
      body: JSON.stringify({ p_limit: 1 }),
    },
  });
  requests.push({
    client: 'ops',
    kind: 'canary-rest',
    url: `${baseUrl}/rest/shared_products?limit=1`,
    options: { headers: { Origin: 'https://app.heyslab.ru' } },
  });
  return requests;
}

async function executeRequest(request, fetchImpl = fetch) {
  const startedAt = Date.now();
  try {
    const response = await fetchImpl(request.url, {
      ...request.options,
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
    const overload = response.status === 429 || response.status === 503;
    const retryAfterSeconds = parseRetryAfter(response.headers.get('retry-after'));
    const rpcFailure = request.kind?.startsWith('upload-')
      ? findExplicitRpcFailure(body)
      : null;
    return {
      ...request,
      ok: response.ok && !overload && !rpcFailure,
      status: response.status,
      overload,
      retryAfterSeconds,
      retryAfterValid: !overload || retryAfterSeconds !== null,
      latencyMs: Date.now() - startedAt,
      body,
      error: rpcFailure,
    };
  } catch (error) {
    return {
      ...request,
      ok: false,
      status: 0,
      overload: false,
      retryAfterSeconds: null,
      retryAfterValid: true,
      latencyMs: Date.now() - startedAt,
      error: error.message,
    };
  }
}

function findExplicitRpcFailure(value) {
  if (!value || typeof value !== 'object') return null;
  if (!Array.isArray(value) && value.success === false) {
    return typeof value.error === 'string' && value.error
      ? value.error
      : 'rpc_success_false';
  }
  for (const nested of Object.values(value)) {
    const failure = findExplicitRpcFailure(nested);
    if (failure) return failure;
  }
  return null;
}

function extractItems(body) {
  if (Array.isArray(body?.items)) return body.items;
  if (!body || typeof body !== 'object') return [];
  for (const value of Object.values(body)) {
    if (Array.isArray(value?.items)) return value.items;
  }
  return [];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runLoadTest({
  scenario,
  clientsCount = POLICY.target.simultaneousClients,
  baseUrl = scenario.baseUrl || DEFAULT_BASE_URL,
  fetchImpl = fetch,
  sleepImpl = sleep,
  expectOverload = false,
} = {}) {
  if (!scenario || !Array.isArray(scenario.clients)) throw new Error('scenario.clients[] is required');
  if (scenario.clients.length < clientsCount) {
    throw new Error(`Need ${clientsCount} clients, got ${scenario.clients.length}`);
  }
  const clients = scenario.clients.slice(0, clientsCount);
  const runId = `capacity-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const wave = buildTargetWave({ clients, baseUrl: String(baseUrl).replace(/\/$/, ''), runId });
  let inFlight = 0;
  let maxInFlight = 0;

  const trackedExecute = async (request) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try { return await executeRequest(request, fetchImpl); }
    finally { inFlight -= 1; }
  };

  const initial = await Promise.all(wave.map(trackedExecute));
  const overloads = initial.filter((result) => result.overload);
  const invalidRetryAfter = overloads.filter((result) => !result.retryAfterValid);
  const pending = overloads.filter((result) => result.retryAfterValid);
  const retried = await Promise.all(pending.map(async (result) => {
    await sleepImpl(result.retryAfterSeconds * 1000);
    return trackedExecute(result);
  }));

  const verificationRequests = clients.map((client, index) => rpcRequest(
    String(baseUrl).replace(/\/$/, ''),
    'batch_get_client_kv_by_session',
    {
      p_session_token: client.sessionToken,
      p_keys: [...CRITICAL_KEYS, ...PROBE_KEYS],
    },
    { client: client.name || `client-${index + 1}`, kind: 'critical-recovery' },
  ));
  const verification = await Promise.all(verificationRequests.map(trackedExecute));
  const missingProbeWrites = verification.flatMap((result) => {
    const items = extractItems(result.body);
    const valuesByKey = new Map(items.map((item) => [item?.k, item?.v]));
    return PROBE_KEYS
      .filter((key) => valuesByKey.get(key)?.run_id !== runId)
      .map((key) => ({ client: result.client, key }));
  });

  const hardFailures = [...initial, ...retried, ...verification]
    .filter((result) => !result.ok && !result.overload);
  const unrecovered = retried.filter((result) => !result.ok);
  const targetWaveSize = clientsCount * POLICY.target.maxRequestsPerClient
    + POLICY.target.operationalCanaryRequests;
  const targetShapeMatches = wave.length === targetWaveSize;
  const overloadOutcomeOk = expectOverload
    ? overloads.length > 0 && invalidRetryAfter.length === 0 && unrecovered.length === 0
    : overloads.length === 0;

  return {
    ok: targetShapeMatches
      && maxInFlight >= targetWaveSize
      && overloadOutcomeOk
      && hardFailures.length === 0
      && missingProbeWrites.length === 0,
    runId,
    baseUrl,
    clientsCount,
    targetWaveSize,
    maxInFlight,
    initialOverloads: overloads.length,
    invalidRetryAfter: invalidRetryAfter.length,
    retried: retried.length,
    unrecovered: unrecovered.length,
    hardFailures: hardFailures.map((result) => ({
      client: result.client,
      kind: result.kind,
      status: result.status,
      error: result.error || null,
    })),
    missingProbeWrites,
    verificationOk: verification.every((result) => result.ok),
  };
}

function valueAfter(argv, flag, fallback) {
  const index = argv.indexOf(flag);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

async function main(argv = process.argv.slice(2)) {
  const scenarioPath = valueAfter(argv, '--scenario', null);
  if (!scenarioPath) throw new Error('Use --scenario /absolute/path/to/clients.json (mode 0600)');
  const scenario = readScenario(scenarioPath);
  const clientsCount = Number(valueAfter(argv, '--clients', POLICY.target.simultaneousClients));
  const report = await runLoadTest({
    scenario,
    clientsCount,
    baseUrl: valueAfter(argv, '--base-url', scenario.baseUrl || DEFAULT_BASE_URL),
    expectOverload: argv.includes('--expect-overload'),
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
  return report;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Sync load test failed: ${error.message}`);
    process.exitCode = 2;
  });
}

module.exports = {
  CRITICAL_KEYS,
  PROBE_KEYS,
  assertScenarioFileSafe,
  buildTargetWave,
  executeRequest,
  extractItems,
  findExplicitRpcFailure,
  readScenario,
  runLoadTest,
};
