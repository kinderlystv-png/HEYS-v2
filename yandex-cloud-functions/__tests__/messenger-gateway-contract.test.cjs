const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const canonicalSpec = fs.readFileSync(path.join(root, 'api-gateway-spec.yaml'), 'utf8');
const historicalSpec = fs.readFileSync(path.join(root, 'api-gateway-spec-v2.yaml'), 'utf8');
const workflow = fs.readFileSync(path.resolve(root, '../.github/workflows/cloud-functions-deploy.yml'), 'utf8');
const messageFunctionId = 'd4ep21a89307vs93b0ns';

function routeBlock(route) {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = canonicalSpec.match(new RegExp(`^  ${escaped}:\\n([\\s\\S]*?)(?=^  \/|\\Z)`, 'm'));
  return match?.[1] || '';
}

for (const route of ['/messages/set-acked', '/messages/set-done']) {
  test(`${route} exposes POST and OPTIONS through heys-api-messages`, () => {
    const block = routeBlock(route);
    assert.notEqual(block, '', `missing ${route} in canonical gateway spec`);
    assert.match(block, /^    post:/m);
    assert.match(block, /^    options:/m);
    assert.equal((block.match(new RegExp(`function_id: ${messageFunctionId}`, 'g')) || []).length, 2);
  });
}

test('deploy workflow verifies desired-state routes and current DB migrations', () => {
  assert.match(workflow, /migrate\.mjs --status --require-current/);
  assert.match(workflow, /Messenger set-acked route/);
  assert.match(workflow, /Messenger set-done route/);
  assert.equal((workflow.match(/^      - name: Update API Gateway$/gm) || []).length, 1);
  assert.equal((workflow.match(/^        if: steps\.deployment-target\.outputs\.gateway_spec_changed/gm) || []).length, 1);
});

test('the duplicate v2 spec is explicitly historical', () => {
  assert.match(historicalSpec.slice(0, 240), /HISTORICAL SNAPSHOT ONLY/);
  assert.match(historicalSpec.slice(0, 240), /Production deploys use api-gateway-spec\.yaml/);
});
