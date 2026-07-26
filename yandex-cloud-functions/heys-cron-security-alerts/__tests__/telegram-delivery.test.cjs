'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildAlertPayload,
  crossClientRule,
  evaluateMonitorResults,
  sendTelegram,
  syncTelegramDeliveryIncident,
} = require('../index.js').__test;

test('logged_only is unhealthy and blocks worker heartbeat', () => {
  const state = evaluateMonitorResults([
    { rule: 'cross_client_write_blocked', status: 'logged_only' },
    { rule: 'backup_chain_gap', status: 'clean' },
  ]);

  assert.equal(state.healthy, false);
  assert.deepEqual(state.errors.map((item) => item.status), ['logged_only']);
});

test('successful rule results remain healthy', () => {
  assert.equal(evaluateMonitorResults([{ rule: 'backup_chain_gap', status: 'clean' }]).healthy, true);
});

test('cross-client payload advances only through the highest persisted audit id', () => {
  const payload = buildAlertPayload(
    [{ audit_id: '41' }, { audit_id: '44' }, { audit_id: '43' }],
    'telegram-503',
  );

  assert.equal(payload.max_audit_id, 44);
  assert.equal(payload.telegram_reason, 'telegram-503');
});

test('cross-client rule retries after failed delivery and dedupes after success', () => {
  assert.equal(crossClientRule.cooldownMinutes, 0);
  assert.match(crossClientRule.sql, /\$1::text AS _window_unused/);
  assert.match(crossClientRule.sql, /telegram_sent_at IS NOT NULL/);
  assert.match(crossClientRule.sql, /audit\.id > delivered\.max_audit_id/);
  assert.match(crossClientRule.sql, /cross_client_dayv2_content_dup/);
});

test('logged_only records an operational incident', async () => {
  const calls = [];
  const client = { query: async (...args) => calls.push(args) };
  await syncTelegramDeliveryIncident(client, [
    { rule: 'cross_client_write_blocked', status: 'logged_only' },
  ]);

  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /record_ops_incident/);
  assert.match(calls[0][1][0], /cross_client_write_blocked/);
});

test('Markdown rejection retries once as plain text', async () => {
  const originalFetch = global.fetch;
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalChat = process.env.TELEGRAM_CHAT_ID;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return {
        ok: false,
        status: 400,
        json: async () => ({ ok: false, description: 'Bad Request: parse error' }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { message_id: 91 } }),
    };
  };
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_CHAT_ID = 'test-chat';

  try {
    const result = await sendTelegram(
      { label: 'Alert', description: 'Description', key: 'test-rule' },
      [{ id: 1 }],
    );
    assert.equal(calls, 2);
    assert.deepEqual(result, { sent: true, messageId: '91', reason: null });
  } finally {
    global.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = originalToken;
    if (originalChat === undefined) delete process.env.TELEGRAM_CHAT_ID;
    else process.env.TELEGRAM_CHAT_ID = originalChat;
  }
});
