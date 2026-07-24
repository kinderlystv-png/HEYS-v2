'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('rpc and rest wrap non-OPTIONS handlers with the shared capacity guard', () => {
  for (const functionName of ['heys-api-rpc', 'heys-api-rest']) {
    const source = read(`${functionName}/index.js`);
    assert.match(source, /createServerlessCapacityGuard/);
    assert.match(source, /event\?\.httpMethod === 'OPTIONS'/);
    assert.match(source, /requestCapacityGuard\.tryEnter\(\)/);
    assert.match(source, /requestCapacityGuard\.withCorsHeaders/);
    assert.match(source, /finally\s*{\s*permit\.release\(\);\s*}/);
  }
});

test('capacity guard mirrors are byte-identical to the deploy source of truth', () => {
  const canonical = read('shared/serverless-capacity-guard.js');
  assert.equal(read('heys-api-rpc/shared/serverless-capacity-guard.js'), canonical);
  assert.equal(read('heys-api-rest/shared/serverless-capacity-guard.js'), canonical);
});

test('deploy gate syncs the guard and refuses rpc/rest deploy below capacity policy', () => {
  const source = read('deploy-all.sh');
  assert.match(source, /serverless-capacity-policy\.cjs/);
  assert.match(source, /HEYS_INSTANCE_ADMISSION_LIMIT/);
  assert.match(source, /HEYS_OVERLOAD_RETRY_AFTER_SECONDS/);
  assert.match(source, /serverless-capacity-guard\.js/);
  assert.match(source, /check-serverless-capacity\.cjs/);
  assert.match(source, /node "\$CAPACITY_CHECK" --strict --quota-only/);
  assert.match(source, /set-scaling-policy/);
  assert.match(source, /--zone-instances-limit/);
  assert.match(source, /--zone-requests-limit/);
});

test('deploy passes database and JWT secrets through Lockbox placeholders only', () => {
  const source = read('deploy-all.sh');
  assert.match(source, /PG_PASSWORD=__IN_LOCKBOX__heys-database__/);
  assert.match(source, /JWT_SECRET=__IN_LOCKBOX__heys-app-secrets__/);
  assert.doesNotMatch(source, /for k in PG_HOST PG_PORT PG_DATABASE PG_USER PG_PASSWORD PG_SSL/);
  assert.doesNotMatch(source, /_add_required JWT_SECRET/);
});

test('scheduled monitoring runs no-retry canary and exact 429\/503 log scan', () => {
  const workflow = fs.readFileSync(
    path.resolve(ROOT, '..', '.github/workflows/api-health-monitor.yml'),
    'utf8',
  );
  assert.match(workflow, /serverless-ops-canary\.cjs --strict/);
  assert.match(workflow, /check-serverless-error-logs\.cjs --since 20m --strict/);
  assert.match(workflow, /Capacity canary/);
  assert.match(workflow, /429\/503 log scan/);
});

test('health monitor follows the flat production health contract', () => {
  const workflow = fs.readFileSync(
    path.resolve(ROOT, '..', '.github/workflows/api-health-monitor.yml'),
    'utf8',
  );
  assert.match(workflow, /jq -r '\.status \/\/ "unknown"'/);
  assert.match(workflow, /Health payload status:/);
  assert.doesNotMatch(workflow, /\.checks\.database\.status/);
  assert.doesNotMatch(workflow, /Database status: unknown/);
});
