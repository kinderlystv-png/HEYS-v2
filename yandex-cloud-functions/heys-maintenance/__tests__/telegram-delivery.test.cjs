'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  deliverRequiredTelegram,
  summarizeTelegramChecks,
} = require('../index.js').__test;

test('unknown Telegram state makes Ops health non-green', () => {
  const result = summarizeTelegramChecks([
    { label: 'support', status: 'ok', pending: 0, webhook: false, last_error: null },
    { label: 'client', status: 'error' },
    { label: 'start', status: 'error' },
  ]);

  assert.equal(result.hasProblem, true);
  assert.match(result.line, /unknown client, start/);
});

test('failed daily report delivery rejects and blocks success heartbeat path', async () => {
  await assert.rejects(
    deliverRequiredTelegram('report', 'daily report', async () => ({ ok: false, error: 'telegram-503' })),
    /daily report Telegram delivery failed: telegram-503/,
  );
});

test('successful required delivery returns receipt', async () => {
  const result = await deliverRequiredTelegram(
    'report',
    'daily report',
    async () => ({ ok: true, messageId: 77 }),
  );

  assert.deepEqual(result, { ok: true, messageId: 77 });
});
