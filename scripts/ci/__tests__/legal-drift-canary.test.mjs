import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { REGISTRY_SQL, runLegalDriftCanary } from '../../check-live-legal-drift.mjs';
import { createLegalDriftFixture, CURRENT_VERSIONS } from '../__fixtures__/legal-drift.mjs';

test('aligned live bundle, landing, registry and ledger pass', async () => {
  const fixture = createLegalDriftFixture();
  const result = await runLegalDriftCanary({ ...fixture, attempts: 1 });

  assert.equal(result.buildHash, 'aaaaaaaa');
  assert.deepEqual(result.versions, CURRENT_VERSIONS);
});

test('registry and live bundle version skew fails with a concise diff', async () => {
  const fixture = createLegalDriftFixture({
    registryVersions: { ...CURRENT_VERSIONS, personal_data: '1.8' },
  });

  await assert.rejects(
    runLegalDriftCanary({ ...fixture, attempts: 1 }),
    /personal_data: bundle=1\.0, registry=1\.8/,
  );
});

test('stale CDN boot-core 1.6/1.6 is blocked', async () => {
  const fixture = createLegalDriftFixture({
    bundleVersions: {
      ...CURRENT_VERSIONS,
      user_agreement: '1.6',
      personal_data: '1.6',
    },
  });

  await assert.rejects(runLegalDriftCanary({ ...fixture, attempts: 1 }), (error) => {
    assert.match(error.message, /user_agreement: bundle=1\.6, registry=1\.11/);
    assert.match(error.message, /personal_data: bundle=1\.6, registry=1\.0/);
    return true;
  });
});

test('push registry and live bundle version skew fails without landing fetch', async () => {
  const fixture = createLegalDriftFixture({
    registryVersions: { ...CURRENT_VERSIONS, push_notifications: '1.1' },
  });

  await assert.rejects(
    runLegalDriftCanary({ ...fixture, attempts: 1 }),
    /push_notifications: bundle=1\.2, registry=1\.1/,
  );
});

test('missing push type in live boot-core fails closed', async () => {
  const fixture = createLegalDriftFixture({
    bundleVersions: {
      user_agreement: CURRENT_VERSIONS.user_agreement,
      personal_data: CURRENT_VERSIONS.personal_data,
      push_notifications: CURRENT_VERSIONS.push_notifications,
      // curator_push_notifications omitted from bundle string below via override
    },
  });
  const baseFetch = fixture.fetchImpl;
  fixture.fetchImpl = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes('boot-core.bundle')) {
      return new Response(
        `const versions={user_agreement:"${CURRENT_VERSIONS.user_agreement}",personal_data:"${CURRENT_VERSIONS.personal_data}",push_notifications:"${CURRENT_VERSIONS.push_notifications}"};`,
        { status: 200 },
      );
    }
    return baseFetch(input);
  };

  await assert.rejects(
    runLegalDriftCanary({ ...fixture, attempts: 1 }),
    /live boot-core is missing curator_push_notifications/,
  );
});

test('unavailable registry fails closed without HTTP or document payloads', async () => {
  const fixture = createLegalDriftFixture();
  const registryProvider = async () => {
    throw new Error('production legal registry unavailable');
  };

  await assert.rejects(
    runLegalDriftCanary({ ...fixture, registryProvider, attempts: 1 }),
    /^Error: production legal registry unavailable$/,
  );
});

test('unavailable live legal document fails closed by label and status only', async () => {
  const fixture = createLegalDriftFixture({ unavailablePath: '/legal/health-data-consent/' });

  await assert.rejects(
    runLegalDriftCanary({ ...fixture, attempts: 1 }),
    /landing health_data returned HTTP 503/,
  );
});

test('production database contract is read-only', async () => {
  const canarySource = await readFile(
    new URL('../../check-live-legal-drift.mjs', import.meta.url),
    'utf8',
  );

  assert.match(REGISTRY_SQL, /^\s*SELECT\b/i);
  assert.doesNotMatch(REGISTRY_SQL, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE)\b/i);
  assert.match(REGISTRY_SQL, /push_notifications/);
  assert.match(REGISTRY_SQL, /curator_push_notifications/);
  assert.match(canarySource, /PUSH_CONSENT_TYPES/);
  assert.match(canarySource, /MIGRATION_RUNNER, '--status', '--require-current'/);
  assert.doesNotMatch(canarySource, /MIGRATION_RUNNER, '--apply'/);
});

test('scheduled and post-deploy workflows use the fail-closed Telegram sender', async () => {
  const scheduledWorkflow = await readFile(
    new URL('../../../.github/workflows/legal-drift-canary.yml', import.meta.url),
    'utf8',
  );
  const deployWorkflow = await readFile(
    new URL('../../../.github/workflows/deploy-yandex.yml', import.meta.url),
    'utf8',
  );

  assert.match(scheduledWorkflow, /cron: "17 \*\/6 \* \* \*"/);
  assert.match(scheduledWorkflow, /test_failure_alert:/);
  assert.match(scheduledWorkflow, /Intentional legal canary failure-alert delivery test/);
  assert.match(
    scheduledWorkflow,
    /failure\(\) && \(github\.event_name == 'schedule' \|\| inputs\.test_failure_alert\)/,
  );
  assert.match(scheduledWorkflow, /node scripts\/check-live-legal-drift\.mjs/);
  assert.match(scheduledWorkflow, /node scripts\/ci\/send-telegram-alert\.mjs/);
  assert.doesNotMatch(scheduledWorkflow, /api\.telegram\.org/);
  assert.match(deployWorkflow, /name: Verify live legal drift/);
  assert.match(deployWorkflow, /node scripts\/check-live-legal-drift\.mjs/);
  assert.match(deployWorkflow, /Legal Drift Detected After Deploy/);
});
