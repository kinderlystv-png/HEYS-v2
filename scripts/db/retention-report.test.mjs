import assert from 'node:assert/strict';
import test from 'node:test';

import { RETENTION_POLICIES, buildPolicySql, formatBytes } from './retention-report.mjs';

test('retention matrix matches the documented draft candidates', () => {
  assert.deepEqual(
    RETENTION_POLICIES.slice(0, 4).map(({ table, timestamp, days }) => ({ table, timestamp, days })),
    [
      { table: 'client_log_trace', timestamp: 'captured_at', days: 30 },
      { table: 'security_events', timestamp: 'created_at', days: 365 },
      { table: 'data_loss_audit', timestamp: 'created_at', days: 365 },
      { table: 'data_access_audit_log', timestamp: 'created_at', days: 1095 },
    ]
  );
});

test('generated retention SQL is strictly read-only', () => {
  for (const policy of RETENTION_POLICIES) {
    const sql = buildPolicySql(policy);
    assert.match(sql, /^\s*SELECT\b/i);
    assert.doesNotMatch(sql, /\b(DELETE|UPDATE|INSERT|TRUNCATE|DROP|ALTER)\b/i);
  }
});

test('report-only messages inventory has zero deletion candidates', () => {
  const policy = RETENTION_POLICIES.find((item) => item.id === 'messages_inventory');
  assert.match(buildPolicySql(policy), /FILTER \(WHERE FALSE\)/);
});

test('byte formatter stays compact', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(2 * 1024 * 1024), '2.0 MB');
});
