import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { planDeployScope, verifyBundleAvailability, verifyDeployScope } from './web-deploy-scope.mjs';

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
  fs.writeFileSync(path.join(dist, 'lazy-manifest.json'), '{}');
  fs.writeFileSync(path.join(dist, 'boot-app.bundle.12345678.js'), 'ok');
  fs.writeFileSync(path.join(dist, 'boot-app.bundle.12345678.js.gz'), 'ok');
  fs.writeFileSync(path.join(dist, 'heys_app_gate_flow_v1.js'), 'ok');
  fs.writeFileSync(path.join(dist, 'index.html'), '<html></html>');
  assert.throws(() => verifyDeployScope(planDeployScope(['apps/web/heys_app_gate_flow_v1.js']), dist), /does not reference/);
});

test('scoped deploy requires every unselected referenced bundle in both target buckets', () => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'heys-deploy-scope-'));
  const bootApp = 'boot-app.bundle.12345678.js';
  const bootCore = 'boot-core.bundle.abcdef12.js';
  fs.writeFileSync(path.join(dist, 'bundle-manifest.json'), JSON.stringify({
    'boot-app': { file: bootApp },
    'boot-core': { file: bootCore },
  }));
  fs.writeFileSync(path.join(dist, 'lazy-manifest.json'), JSON.stringify({ core: bootCore }));
  fs.writeFileSync(path.join(dist, 'index.html'), `<script src="${bootCore}"></script><script src="${bootApp}"></script>`);
  fs.writeFileSync(path.join(dist, bootApp), 'app');
  fs.writeFileSync(path.join(dist, `${bootApp}.gz`), 'app-gzip');
  fs.writeFileSync(path.join(dist, bootCore), 'core');
  fs.writeFileSync(path.join(dist, 'heys_app_gate_flow_v1.js'), 'ok');

  const verified = verifyDeployScope(planDeployScope(['apps/web/heys_app_gate_flow_v1.js']), dist);
  assert.deepEqual(verified.verifiedBundles, [bootApp]);
  assert.deepEqual(verified.requiredBundles, [bootApp, bootCore]);

  const availability = {
    'heys-app': new Set([bootCore]),
    'try-heyslab-ru': new Set(),
  };
  assert.throws(() => verifyBundleAvailability({
    requiredBundles: verified.requiredBundles,
    verifiedBundles: verified.verifiedBundles,
    buckets: Object.keys(availability),
    hasRemoteBundle: (bucket, file) => availability[bucket].has(file),
  }), /try-heyslab-ru\/boot-core\.bundle\.abcdef12\.js/);

  availability['try-heyslab-ru'].add(bootCore);
  assert.doesNotThrow(() => verifyBundleAvailability({
    requiredBundles: verified.requiredBundles,
    verifiedBundles: verified.verifiedBundles,
    buckets: Object.keys(availability),
    hasRemoteBundle: (bucket, file) => availability[bucket].has(file),
  }));
});

test('unsupported runtime assets require the canonical full build', () => {
  const plan = planDeployScope(['apps/web/styles/modules/example.css']);
  assert.equal(plan.fullRebuild, true);
  assert.deepEqual(plan.unsupportedFiles, ['apps/web/styles/modules/example.css']);
});
