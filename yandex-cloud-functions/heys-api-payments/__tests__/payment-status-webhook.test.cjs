const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const MODULE_PATH = path.resolve(__dirname, '../index.js');
const CLIENT_ID = '33333333-3333-3333-3333-333333333333';
const PAYMENT_ID = '44444444-4444-4444-4444-444444444444';
const EXTERNAL_ID = '2f45f7d0-000f-5000-9000-1b8e7b15f042';

function loadPaymentsModule() {
  delete require.cache[MODULE_PATH];
  return require(MODULE_PATH);
}

function createClient({ duplicate = false, previousCount = 0 } = {}) {
  const queries = [];
  const client = {
    async query(sql, params = []) {
      const text = String(sql);
      queries.push({ sql: text, params });

      if (/SELECT id, client_id, plan, status FROM payments/.test(text)) {
        return {
          rows: [
            {
              id: PAYMENT_ID,
              client_id: CLIENT_ID,
              plan: 'base',
              status: 'pending',
            },
          ],
        };
      }

      if (/INSERT INTO payment_events/.test(text)) {
        return { rows: duplicate ? [] : [{ id: '55555555-5555-5555-5555-555555555555' }] };
      }

      if (/UPDATE clients[\s\S]+RETURNING subscription_ends_at/.test(text)) {
        return { rows: [{ subscription_ends_at: new Date('2026-07-15T00:00:00.000Z') }] };
      }

      if (/SELECT COUNT\(\*\)::int AS previous_count/.test(text)) {
        return {
          rows: [
            {
              previous_count: previousCount,
              previous_period_end: previousCount ? new Date('2026-06-01T00:00:00.000Z') : null,
            },
          ],
        };
      }

      if (/record_funnel_event/.test(text)) {
        return { rows: [{ event: { id: '66666666-6666-6666-6666-666666666666' } }] };
      }

      return { rows: [] };
    },
  };
  return { client, queries };
}

test('applyPaymentStatus activates first payment and records PII-free funnel metadata', async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', () => {});

  const { applyPaymentStatus } = loadPaymentsModule();
  const { client, queries } = createClient({ duplicate: false, previousCount: 0 });
  const rawPayload = {
    event: 'payment.succeeded',
    object: {
      id: EXTERNAL_ID,
      status: 'succeeded',
      metadata: {
        client_id: CLIENT_ID,
        plan: 'base',
      },
    },
  };

  const result = await applyPaymentStatus(client, {
    externalPaymentId: EXTERNAL_ID,
    eventType: 'payment.succeeded',
    externalStatus: 'succeeded',
    rawPayload,
    sourceIp: '185.71.76.10',
  });

  assert.equal(result.applied, true);
  assert.equal(result.payment.id, PAYMENT_ID);

  const insertEvent = queries.find((q) => /INSERT INTO payment_events/.test(q.sql));
  assert.ok(insertEvent, 'payment event insert should run');
  assert.equal(insertEvent.params[0], PAYMENT_ID);
  assert.equal(insertEvent.params[1], EXTERNAL_ID);
  assert.equal(insertEvent.params[2], 'payment.succeeded');
  assert.equal(insertEvent.params[3], 'succeeded');
  assert.equal(insertEvent.params[5], '185.71.76.10');

  const updatePayment = queries.find((q) => /UPDATE payments[\s\S]+SET external_status/.test(q.sql));
  assert.ok(updatePayment, 'payment status update should run');
  assert.equal(updatePayment.params[0], PAYMENT_ID);
  assert.equal(updatePayment.params[1], 'succeeded');
  assert.equal(updatePayment.params[2], 'completed');

  const updateClient = queries.find((q) => /UPDATE clients[\s\S]+subscription_status = 'active'/.test(q.sql));
  assert.ok(updateClient, 'client subscription activation should run');
  assert.deepEqual(updateClient.params, [CLIENT_ID, 'base']);

  const funnelEvent = queries.find((q) => /record_funnel_event/.test(q.sql));
  assert.ok(funnelEvent, 'payment funnel event should be recorded');
  assert.equal(funnelEvent.params[0], 'payment');
  assert.equal(funnelEvent.params[2], CLIENT_ID);
  assert.equal(funnelEvent.params[6], 'base');
  assert.equal(funnelEvent.params[9], `payment:payment:${PAYMENT_ID}`);

  const metadata = JSON.parse(funnelEvent.params[8]);
  assert.deepEqual(Object.keys(metadata).sort(), [
    'external_payment_id',
    'gap_days',
    'internal_payment_id',
    'previous_period_end',
    'previous_successful_payments',
    'source',
  ]);
  assert.equal(metadata.internal_payment_id, PAYMENT_ID);
  assert.equal(metadata.external_payment_id, EXTERNAL_ID);
  assert.equal(metadata.previous_successful_payments, 0);
  assert.equal(metadata.source, 'yukassa_webhook');
  assert.equal(/phone|email|name|health|profile|meal|weight|bmi/i.test(JSON.stringify(metadata)), false);

  assert.equal(queries.some((q) => q.sql === 'COMMIT'), true);
  assert.equal(queries.some((q) => q.sql === 'ROLLBACK'), false);
});

test('applyPaymentStatus skips duplicate webhook without mutating payment/client', async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', () => {});

  const { applyPaymentStatus } = loadPaymentsModule();
  const { client, queries } = createClient({ duplicate: true, previousCount: 0 });

  const result = await applyPaymentStatus(client, {
    externalPaymentId: EXTERNAL_ID,
    eventType: 'payment.succeeded',
    externalStatus: 'succeeded',
    rawPayload: { event: 'payment.succeeded', object: { id: EXTERNAL_ID, status: 'succeeded' } },
    sourceIp: '185.71.76.10',
  });

  assert.deepEqual(result, { applied: false, reason: 'duplicate' });
  assert.equal(queries.some((q) => /UPDATE payments[\s\S]+SET external_status/.test(q.sql)), false);
  assert.equal(queries.some((q) => /UPDATE clients[\s\S]+subscription_status = 'active'/.test(q.sql)), false);
  assert.equal(queries.some((q) => /record_funnel_event/.test(q.sql)), false);
  assert.equal(queries.some((q) => q.sql === 'COMMIT'), true);
  assert.equal(queries.some((q) => q.sql === 'ROLLBACK'), false);
});
