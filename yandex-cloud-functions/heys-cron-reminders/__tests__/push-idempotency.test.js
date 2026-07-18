const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  CLAIM_LEASE_INTERVAL,
  deliverIdempotently,
  isInReminderDeliveryWindow,
} = require('../push-idempotency');

class FakeIdempotencyClient {
  constructor() {
    this.now = Date.parse('2026-07-18T00:00:00Z');
    this.rows = new Map();
  }

  async query(sql, params) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    const key = params[0];

    if (normalized.includes("VALUES ($1, 'delivered'")) {
      this.rows.set(key, { status: 'delivered', deliveredAt: this.now });
      return { rowCount: 1, rows: [{ key }] };
    }

    if (normalized.startsWith('INSERT INTO push_idempotency')) {
      const token = params[1];
      const current = this.rows.get(key);
      if (current?.status === 'delivered') return { rowCount: 0, rows: [] };
      if (current?.status === 'claimed' && current.leaseUntil > this.now) {
        return { rowCount: 0, rows: [] };
      }
      this.rows.set(key, {
        status: 'claimed',
        token,
        leaseUntil: this.now + 5 * 60 * 1000,
      });
      return { rowCount: 1, rows: [{ key }] };
    }

    if (normalized.startsWith('DELETE FROM push_idempotency')) {
      const current = this.rows.get(key);
      if (current?.status !== 'claimed' || current.token !== params[1]) {
        return { rowCount: 0, rows: [] };
      }
      this.rows.delete(key);
      return { rowCount: 1, rows: [{ key }] };
    }

    throw new Error(`Unexpected query: ${normalized}`);
  }
}

test('uses a bounded claim lease', () => {
  assert.equal(CLAIM_LEASE_INTERVAL, '5 minutes');
});

test('keeps scheduled reminders eligible for 15-minute retries within an hour', () => {
  const target = 10 * 60;
  assert.equal(isInReminderDeliveryWindow(target - 7, target), true);
  assert.equal(isInReminderDeliveryWindow(target + 15, target), true);
  assert.equal(isInReminderDeliveryWindow(target + 60, target), true);
  assert.equal(isInReminderDeliveryWindow(target - 8, target), false);
  assert.equal(isInReminderDeliveryWindow(target + 61, target), false);
});

test('releases a rejected push so the next cron can retry', async () => {
  const client = new FakeIdempotencyClient();
  let attempts = 0;
  const deliver = async () => {
    attempts += 1;
    return attempts === 1
      ? { sent: 0, total: 1, cleaned: 0 }
      : { sent: 1, total: 1, cleaned: 0 };
  };

  const first = await deliverIdempotently(client, 'rejected', deliver);
  const second = await deliverIdempotently(client, 'rejected', deliver);

  assert.equal(first.delivered, false);
  assert.equal(second.delivered, true);
  assert.equal(attempts, 2);
  assert.equal(client.rows.get('rejected').status, 'delivered');
});

test('does not mark zero subscriptions as delivered', async () => {
  const client = new FakeIdempotencyClient();
  const result = await deliverIdempotently(client, 'zero-subscriptions', async () => ({
    sent: 0,
    total: 0,
    cleaned: 0,
  }));

  assert.equal(result.delivered, false);
  assert.equal(client.rows.has('zero-subscriptions'), false);
});

test('treats partial delivery as delivered and suppresses a device-level retry', async () => {
  const client = new FakeIdempotencyClient();
  let calls = 0;
  const first = await deliverIdempotently(client, 'partial', async () => {
    calls += 1;
    return { sent: 1, total: 2, cleaned: 0 };
  });
  const repeated = await deliverIdempotently(client, 'partial', async () => {
    calls += 1;
    return { sent: 2, total: 2, cleaned: 0 };
  });

  assert.equal(first.delivered, true);
  assert.equal(repeated.claimed, false);
  assert.equal(calls, 1);
});

test('only one parallel cron invocation owns the active lease', async () => {
  const client = new FakeIdempotencyClient();
  let startFirst;
  let finishFirst;
  const started = new Promise((resolve) => { startFirst = resolve; });
  const finish = new Promise((resolve) => { finishFirst = resolve; });
  let calls = 0;

  const firstPromise = deliverIdempotently(client, 'parallel', async () => {
    calls += 1;
    startFirst();
    await finish;
    return { sent: 1, total: 1, cleaned: 0 };
  });
  await started;
  const second = await deliverIdempotently(client, 'parallel', async () => {
    calls += 1;
    return { sent: 1, total: 1, cleaned: 0 };
  });
  finishFirst();
  const first = await firstPromise;

  assert.equal(first.delivered, true);
  assert.equal(second.claimed, false);
  assert.equal(calls, 1);
});

test('reclaims an expired lease after a crashed worker', async () => {
  const client = new FakeIdempotencyClient();
  client.rows.set('expired', {
    status: 'claimed',
    token: 'old-worker',
    leaseUntil: client.now - 1,
  });

  const result = await deliverIdempotently(client, 'expired', async () => ({
    sent: 1,
    total: 1,
    cleaned: 0,
  }));

  assert.equal(result.delivered, true);
  assert.equal(client.rows.get('expired').status, 'delivered');
});

test('a late successful worker restores delivered state after a newer zero-send retry', async () => {
  const client = new FakeIdempotencyClient();
  let startFirst;
  let finishFirst;
  const started = new Promise((resolve) => { startFirst = resolve; });
  const finish = new Promise((resolve) => { finishFirst = resolve; });

  const firstPromise = deliverIdempotently(client, 'late-success', async () => {
    startFirst();
    await finish;
    return { sent: 1, total: 1, cleaned: 0 };
  });
  await started;
  client.now += 6 * 60 * 1000;

  const retry = await deliverIdempotently(client, 'late-success', async () => ({
    sent: 0,
    total: 1,
    cleaned: 0,
  }));
  finishFirst();
  const first = await firstPromise;
  const repeated = await deliverIdempotently(client, 'late-success', async () => ({
    sent: 1,
    total: 1,
    cleaned: 0,
  }));

  assert.equal(retry.delivered, false);
  assert.equal(first.delivered, true);
  assert.equal(client.rows.get('late-success').status, 'delivered');
  assert.equal(repeated.claimed, false);
});

test('releases the claim when delivery throws', async () => {
  const client = new FakeIdempotencyClient();

  await assert.rejects(
    deliverIdempotently(client, 'throws', async () => {
      throw new Error('push transport failed');
    }),
    /push transport failed/
  );
  assert.equal(client.rows.has('throws'), false);
});

test('all keyed reminder sends use the delivery state wrapper', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  assert.equal((source.match(/await deliverIdempotently\(/g) || []).length, 16);
  assert.equal((source.match(/isInReminderDeliveryWindow\(/g) || []).length, 7);
  assert.doesNotMatch(source, /await claimIdempotency\(/);
  assert.doesNotMatch(source, /Math\.abs\(cur - target\)/);
});

test('migration defines the claimed and delivered database states', () => {
  const migration = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      '..',
      '..',
      'scripts',
      'db',
      'migrations',
      '2026-07-18_push_idempotency_delivery_state.sql'
    ),
    'utf8'
  );
  assert.match(migration, /status = 'delivered'/);
  assert.match(migration, /status = 'claimed'/);
  assert.match(migration, /lease_until/);
  assert.match(migration, /claim_token/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE/);
});
