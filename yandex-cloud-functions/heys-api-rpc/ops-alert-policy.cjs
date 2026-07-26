'use strict';

const IMMEDIATE_DEDUP_MS = 5 * 60 * 1000;
const DURABLE_CROSS_CLIENT_ALERTS = new Set([
  'cross_client_dayv2_content_dup',
  'cross_client_profile_blocked',
  'cross_client_blob_blocked',
]);
const lastImmediateAlertAt = new Map();

function shouldSendImmediateTelegramAlert(clientId, action, now = Date.now()) {
  if (DURABLE_CROSS_CLIENT_ALERTS.has(action)) return false;
  const key = `${clientId}:${action}`;
  const last = lastImmediateAlertAt.get(key) || 0;
  if (now - last < IMMEDIATE_DEDUP_MS) return false;
  lastImmediateAlertAt.set(key, now);
  return true;
}

module.exports = {
  shouldSendImmediateTelegramAlert,
};
