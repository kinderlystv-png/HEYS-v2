const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const {
  FUNCTIONS,
  TRIGGERS,
  redact,
  findPlaintextSecretEnv,
  evaluateTrigger,
  evaluateWebhookInfo,
  evaluateHeartbeatRows,
  evaluateBackupRow,
  latestVersion,
  EXPECTED_HEARTBEAT_TASKS,
  collectDeadManStatus,
} = require('../check-heys-ops-status.cjs');

const ROOT = resolve(__dirname, '..');

test('ops status covers the complete automation inventory and production trigger contract', () => {
  assert.equal(FUNCTIONS.length, 9);
  assert.equal(TRIGGERS.length, 17);
  assert.equal(new Set(FUNCTIONS).size, FUNCTIONS.length);
  assert.equal(new Set(TRIGGERS.map((trigger) => trigger.name)).size, TRIGGERS.length);
  assert.ok(FUNCTIONS.includes('heys-cron-speechkit-transcribe'));
  assert.ok(FUNCTIONS.includes('heys-snapshot-demo'));
  assert.ok(TRIGGERS.some((trigger) => trigger.name === 'heys-maintenance-daily-cleanup'));
  assert.ok(TRIGGERS.some((trigger) => trigger.name === 'heys-cron-speechkit-transcribe-timer'));
  assert.ok(TRIGGERS.some((trigger) => trigger.name === 'heys-snapshot-demo-hourly'));
});

test('standalone scheduled workers stamp every expected runtime heartbeat', () => {
  const seedMigration = readFileSync(
    resolve(ROOT, '../database/2026-07-18_automation_worker_heartbeats.sql'),
    'utf8',
  );
  const heartbeatSources = new Map([
    ['cron_reminders', 'heys-cron-reminders/index.js'],
    ['cron_security_alerts', 'heys-cron-security-alerts/index.js'],
    ['cron_speechkit_transcribe', 'heys-cron-speechkit-transcribe/index.js'],
    ['cron_trial_drip', 'heys-cron-trial-drip/index.js'],
    ['cron_photo_cleanup', 'heys-cron-photo-cleanup/index.js'],
    ['snapshot_demo', 'heys-snapshot-demo/index.js'],
  ]);

  for (const [task, sourcePath] of heartbeatSources) {
    const source = readFileSync(resolve(ROOT, sourcePath), 'utf8');
    assert.match(source, new RegExp(`VALUES \\('${task}', now\\(\\), NULL, interval`));
    assert.match(source, /ON CONFLICT \(task\) DO UPDATE/);
    assert.ok(EXPECTED_HEARTBEAT_TASKS.includes(task));
    assert.match(seedMigration, new RegExp(`'${task}'`));
  }
});

test('redact keeps only short edges of sensitive values', () => {
  assert.equal(redact('1234567890abcdef'), '123...def');
  assert.equal(redact('short'), '<redacted>');
});

test('plaintext secret detector allows Lockbox placeholders and hashes only', () => {
  assert.deepEqual(findPlaintextSecretEnv({
    TELEGRAM_CLIENT_BOT_TOKEN: '123:plain-token',
    PG_PASSWORD: '__IN_LOCKBOX__heys-database__',
    HEYS_START_WEBHOOK_SECRET_SHA256: 'a'.repeat(64),
    HEYS_DEPLOY_COMMIT: 'abc123',
    APP_URL: 'https://app.heyslab.ru',
    VAPID_PRIVATE_KEY: 'raw-private-key',
  }), ['TELEGRAM_CLIENT_BOT_TOKEN', 'VAPID_PRIVATE_KEY']);
});

test('trigger evaluator flags inactive, wrong cron, wrong tag and payload mismatch', () => {
  const problems = evaluateTrigger(
    { name: 'x', cron: '0/1 * * * ? *', tag: '$latest', payloadIncludes: '"poll":"heys-client-bot"' },
    {
      status: 'PAUSED',
      rule: {
        timer: {
          cron_expression: '*/5 * * * ? *',
          payload: '{"poll":"other"}',
          invoke_function_with_retry: { function_tag: 'old' },
        },
      },
    },
  );
  assert.deepEqual(problems, ['status=PAUSED', 'cron=*/5 * * * ? *', 'tag=old', 'payload_mismatch']);
});

test('webhook evaluator treats pending updates and enabled webhook as failures', () => {
  assert.deepEqual(evaluateWebhookInfo({
    configured: true,
    webhookConfigured: true,
    pending_update_count: 2,
  }), ['webhook_on', 'pending=2']);
});

test('heartbeat evaluator reports only stale rows', () => {
  assert.deepEqual(evaluateHeartbeatRows([
    { task: 'telegram_client_poll', minutes_ago: 1, stale: false },
    { task: 'backup_chain', minutes_ago: 1900, stale: true },
  ]), ['backup_chain:1900m']);
});

test('heartbeat evaluator fails closed when an expected task is missing', () => {
  const rows = EXPECTED_HEARTBEAT_TASKS
    .filter((task) => task !== 'telegram_start_poll')
    .map((task) => ({ task, minutes_ago: 1, stale: false }));
  assert.deepEqual(
    evaluateHeartbeatRows(rows, EXPECTED_HEARTBEAT_TASKS),
    ['telegram_start_poll:missing'],
  );
});

test('dead-man passes fresh heartbeats and healthy backup without invoking a worker', async () => {
  const calls = [];
  const status = await collectDeadManStatus(async (sql) => {
    calls.push(sql);
    if (sql.includes('maintenance_heartbeat')) {
      return EXPECTED_HEARTBEAT_TASKS.map((task) => ({ task, minutes_ago: 1, stale: false }));
    }
    return [{ status: 'ok', hours_ago: 2, success_count: 10, error_count: 0 }];
  });

  assert.equal(status.ok, true);
  assert.deepEqual(status.issues, []);
  assert.equal(calls.length, 2);
  assert.equal(calls.some((sql) => /invoke|heys-maintenance/i.test(sql)), false);
});

test('dead-man fails on stale heartbeat and missing backup run', async () => {
  const status = await collectDeadManStatus(async (sql) => {
    if (sql.includes('maintenance_heartbeat')) {
      return EXPECTED_HEARTBEAT_TASKS.map((task) => ({
        task,
        minutes_ago: task === 'trial_queue' ? 45 : 1,
        stale: task === 'trial_queue',
      }));
    }
    return [];
  });

  assert.equal(status.ok, false);
  assert.deepEqual(status.issues, ['heartbeat:trial_queue:45m', 'backup:missing']);
});

test('backup evaluator fails missing, old, partial, or error runs', () => {
  assert.deepEqual(evaluateBackupRow(null), ['missing']);
  assert.deepEqual(evaluateBackupRow({ status: 'partial', hours_ago: 31, error_count: 1 }), [
    'status=partial',
    'age=31h',
    'errors=1',
  ]);
  assert.deepEqual(evaluateBackupRow({ status: 'ok', hours_ago: 2, error_count: 0 }), []);
});

test('latestVersion prefers $latest tag', () => {
  assert.equal(latestVersion([
    { id: 'old', tags: [] },
    { id: 'new', tags: ['$latest'] },
  ]).id, 'new');
});
