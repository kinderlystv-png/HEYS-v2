import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { planDeployScope, verifyDeployScope } from './web-deploy-scope.mjs';

test('maps all changed source files into the deploy scope', () => {
  const plan = planDeployScope([
    'apps/web/heys_app_gate_flow_v1.js',
    'apps/web/heys_client_log_trace_v1.js',
    'apps/web/public/boot-app.bundle.old.js',
  ]);
  assert.deepEqual(plan.bundles, ['boot-app']);
  assert.deepEqual(plan.mutableFiles, [
    'apps/web/heys_app_gate_flow_v1.js',
    'apps/web/heys_client_log_trace_v1.js',
  ]);
});

test('verification fails when index does not reference the scoped hash bundle', () => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'heys-deploy-scope-'));
  fs.writeFileSync(path.join(dist, 'bundle-manifest.json'), JSON.stringify({ 'boot-app': { file: 'boot-app.bundle.12345678.js' } }));
  fs.writeFileSync(path.join(dist, 'boot-app.bundle.12345678.js'), 'ok');
  fs.writeFileSync(path.join(dist, 'heys_app_gate_flow_v1.js'), 'ok');
  fs.writeFileSync(path.join(dist, 'index.html'), '<html></html>');
  assert.throws(() => verifyDeployScope(planDeployScope(['apps/web/heys_app_gate_flow_v1.js']), dist), /does not reference/);
});

test('unsupported runtime assets require the canonical full build', () => {
  const plan = planDeployScope(['apps/web/styles/modules/example.css']);
  assert.equal(plan.fullRebuild, true);
  assert.deepEqual(plan.unsupportedFiles, ['apps/web/styles/modules/example.css']);
});
