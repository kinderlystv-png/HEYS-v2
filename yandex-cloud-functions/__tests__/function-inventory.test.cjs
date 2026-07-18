const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const { FUNCTIONS, listFunctions, resolveChangedFiles, verifyInventory } = require('../function-inventory.cjs');

const ROOT = path.resolve(__dirname, '..');

test('inventory exactly covers every cloud function source directory', () => {
  const result = verifyInventory(ROOT);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.inventoryNames, result.sourceFunctions);
  assert.deepEqual(
    Object.fromEntries(['api', 'cron', 'polling', 'maintenance', 'backup', 'automation'].map((kind) => [
      kind,
      FUNCTIONS.filter((item) => item.kind === kind).length,
    ])),
    { api: 10, cron: 5, polling: 1, maintenance: 1, backup: 1, automation: 1 },
  );
});

test('API source change selects its exact deployment target', () => {
  assert.deepEqual(resolveChangedFiles(['yandex-cloud-functions/heys-api-leads/index.js']), {
    mode: 'selective',
    functions: ['heys-api-leads'],
    gatewaySpecChanged: false,
    reason: 'changed-function-directories',
  });
});

test('cron, maintenance, backup and polling changes select automation targets', () => {
  const result = resolveChangedFiles([
    'yandex-cloud-functions/heys-cron-reminders/index.js',
    'yandex-cloud-functions/heys-maintenance/index.js',
    'yandex-cloud-functions/heys-client-daily-backup/index.js',
    'yandex-cloud-functions/heys-bot-client/index.js',
  ]);
  assert.equal(result.mode, 'selective');
  assert.deepEqual(result.functions, [
    'heys-bot-client',
    'heys-client-daily-backup',
    'heys-cron-reminders',
    'heys-maintenance',
  ]);
});

test('shared runtime change selects every auto-deploy function', () => {
  const result = resolveChangedFiles(['yandex-cloud-functions/shared/db-pool.js']);
  assert.equal(result.mode, 'all');
  assert.deepEqual(result.functions, listFunctions({ autoOnly: true }));
  assert.equal(result.functions.includes('heys-api-sms'), false);
});

test('gateway-only change does not invent a runtime target', () => {
  assert.deepEqual(resolveChangedFiles(['yandex-cloud-functions/api-gateway-spec.yaml']), {
    mode: 'gateway-only',
    functions: [],
    gatewaySpecChanged: true,
    reason: 'gateway-spec-only',
  });
});

test('unknown function directory fails closed', () => {
  assert.throws(
    () => resolveChangedFiles(['yandex-cloud-functions/heys-cron-new-worker/index.js']),
    /Unknown cloud function directory/,
  );
});

test('production-disabled SMS source cannot silently auto-deploy', () => {
  assert.throws(
    () => resolveChangedFiles(['yandex-cloud-functions/heys-api-sms/index.js']),
    /Auto-deploy disabled.*explicit release decision/,
  );
});

test('deploy and test scripts consume the shared inventory instead of local lists', () => {
  const deployScript = readFileSync(path.join(ROOT, 'deploy-all.sh'), 'utf8');
  const testScript = readFileSync(path.join(ROOT, 'test-functions.sh'), 'utf8');
  assert.match(deployScript, /function-inventory\.cjs/);
  assert.match(testScript, /function-inventory\.cjs/);
  assert.doesNotMatch(deployScript, /API_FUNCTIONS=\(\s*heys-/);
  assert.doesNotMatch(testScript, /ALL_FUNCTIONS=\(\s*heys-/);
  assert.equal((deployScript.match(/ensure_speechkit_trigger/g) || []).length, 3);
  assert.equal((deployScript.match(/\[ "\$CI_MODE" != true \]/g) || []).length >= 2, true);
  assert.equal(FUNCTIONS.filter((item) => item.autoDeploy).length, 18);
});

test('deploy workflow routes API and automation changes through the shared classifier', () => {
  const workflow = readFileSync(path.resolve(ROOT, '../.github/workflows/cloud-functions-deploy.yml'), 'utf8');
  assert.match(workflow, /yandex-cloud-functions\/heys-\*\/\*\*/);
  assert.equal((workflow.match(/function-inventory\.cjs --resolve/g) || []).length, 2);
  assert.doesNotMatch(workflow, /sed -n .*heys-api-/);
  assert.match(workflow, /github\.event_name.*workflow_dispatch[\s\S]*deploy-all\.sh --ci --skip-health/);
});

test('health workflow schedules an independent strict dead-man check', () => {
  const workflow = readFileSync(path.resolve(ROOT, '../.github/workflows/api-health-monitor.yml'), 'utf8');
  assert.match(workflow, /cron: "\*\/15 \* \* \* \*"/);
  assert.match(workflow, /if: always\(\)[\s\S]*--dead-man --strict --json/);
  assert.match(workflow, /PGPASSWORD: \$\{\{ secrets\.PG_PASSWORD \}\}/);
  assert.match(workflow, /PGSSLROOTCERT: \$\{\{ github\.workspace \}\}\/yandex-cloud-functions\/certs\/root\.crt/);
  assert.doesNotMatch(workflow, /serverless function invoke heys-maintenance/);
});

test('health workflow debounces API recovery and never redeploys from push or manual runs', () => {
  const workflow = readFileSync(path.resolve(ROOT, '../.github/workflows/api-health-monitor.yml'), 'utf8');
  assert.equal((workflow.match(/for attempt in 1 2 3; do/g) || []).length, 2);
  assert.equal((workflow.match(/sleep 5/g) || []).length, 2);
  assert.match(
    workflow,
    /if: github\.event_name == 'schedule' && failure\(\) && \(steps\.rest\.outcome == 'failure' \|\| steps\.rpc\.outcome == 'failure'\)/,
  );
  assert.doesNotMatch(
    workflow,
    /if: failure\(\) && \(steps\.rest\.outcome == 'failure' \|\| steps\.rpc\.outcome == 'failure'\)/,
  );
});
