const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const canonicalSpec = fs.readFileSync(path.join(root, 'api-gateway-spec.yaml'), 'utf8').replace(/\r\n/g, '\n');
const historicalSpec = fs.readFileSync(path.join(root, 'api-gateway-spec-v2.yaml'), 'utf8').replace(/\r\n/g, '\n');
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

test('/messages/day-checklist exposes GET and OPTIONS through heys-api-messages', () => {
  // Пути в спеке перечислены явно: без записи маршрут отдаёт 404 на шлюзе,
  // сколько бы действий ни знал сам код функции.
  const block = routeBlock('/messages/day-checklist');
  assert.notEqual(block, '', 'missing /messages/day-checklist in canonical gateway spec');
  assert.match(block, /^    get:/m);
  assert.match(block, /^    options:/m);
  assert.equal((block.match(new RegExp(`function_id: ${messageFunctionId}`, 'g')) || []).length, 2);
});

test('/messages/set-applied exposes POST and OPTIONS through heys-api-messages', () => {
  const block = routeBlock('/messages/set-applied');
  assert.notEqual(block, '', 'missing /messages/set-applied in canonical gateway spec');
  assert.match(block, /^    post:/m);
  assert.match(block, /^    options:/m);
  assert.equal((block.match(new RegExp(`function_id: ${messageFunctionId}`, 'g')) || []).length, 2);
});

test('deploy workflow verifies desired-state routes and current DB migrations', () => {
  assert.match(workflow, /migrate\.mjs --status --require-current/);
  assert.match(workflow, /Messenger set-acked route/);
  assert.match(workflow, /Messenger set-done route/);
  assert.match(workflow, /Messenger day-checklist route/);
  assert.match(workflow, /Messenger day-checklist preflight/);
  assert.equal((workflow.match(/^      - name: Update API Gateway$/gm) || []).length, 1);
  assert.equal((workflow.match(/^        if: steps\.deployment-target\.outputs\.gateway_spec_changed/gm) || []).length, 1);
});

test('the duplicate v2 spec is explicitly historical', () => {
  assert.match(historicalSpec.slice(0, 240), /HISTORICAL SNAPSHOT ONLY/);
  assert.match(historicalSpec.slice(0, 240), /Production deploys use api-gateway-spec\.yaml/);
});
