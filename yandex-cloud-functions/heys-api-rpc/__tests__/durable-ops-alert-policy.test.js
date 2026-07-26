'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { shouldSendImmediateTelegramAlert } = require('../ops-alert-policy.cjs');

test('cross-client alerts use durable audit worker instead of fire-and-forget', () => {
  assert.equal(shouldSendImmediateTelegramAlert('client-a', 'cross_client_dayv2_content_dup'), false);
  assert.equal(shouldSendImmediateTelegramAlert('client-a', 'cross_client_profile_blocked'), false);
  assert.equal(shouldSendImmediateTelegramAlert('client-a', 'cross_client_blob_blocked'), false);
});

test('non-durable diagnostic alerts keep the existing best-effort fast path', () => {
  assert.equal(shouldSendImmediateTelegramAlert('client-a', 'invalid_profile_field'), true);
  assert.equal(shouldSendImmediateTelegramAlert('client-a', 'invalid_profile_field'), false);
});
