const test = require('node:test');
const assert = require('node:assert/strict');

const {
  redact,
  findPlaintextSecretEnv,
  evaluateTrigger,
  evaluateWebhookInfo,
  evaluateHeartbeatRows,
  evaluateBackupRow,
  latestVersion,
} = require('../check-heys-ops-status.cjs');

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
