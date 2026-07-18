const { randomUUID } = require('node:crypto');

const CLAIM_LEASE_INTERVAL = '5 minutes';
const REMINDER_EARLY_WINDOW_MINUTES = 7;
const REMINDER_RETRY_WINDOW_MINUTES = 60;

function isInReminderDeliveryWindow(currentMinutes, targetMinutes) {
  const diff = currentMinutes - targetMinutes;
  return diff >= -REMINDER_EARLY_WINDOW_MINUTES && diff <= REMINDER_RETRY_WINDOW_MINUTES;
}

async function claimIdempotency(client, key, token = randomUUID()) {
  const result = await client.query(
    `INSERT INTO push_idempotency (
       key, status, lease_until, claim_token, sent_at, delivered_at
     ) VALUES ($1, 'claimed', NOW() + $3::interval, $2, NULL, NULL)
     ON CONFLICT (key) DO UPDATE
       SET status = 'claimed',
           lease_until = EXCLUDED.lease_until,
           claim_token = EXCLUDED.claim_token,
           sent_at = NULL,
           delivered_at = NULL
     WHERE push_idempotency.status = 'claimed'
       AND push_idempotency.lease_until <= NOW()
     RETURNING key`,
    [key, token, CLAIM_LEASE_INTERVAL]
  );
  return result.rowCount > 0 ? token : null;
}

async function markIdempotencyDelivered(client, key) {
  const result = await client.query(
    `INSERT INTO push_idempotency (
       key, status, sent_at, delivered_at, lease_until, claim_token
     ) VALUES ($1, 'delivered', NOW(), NOW(), NULL, NULL)
     ON CONFLICT (key) DO UPDATE
       SET status = 'delivered',
           sent_at = NOW(),
           delivered_at = NOW(),
           lease_until = NULL,
           claim_token = NULL
     RETURNING key`,
    [key]
  );
  return result.rowCount > 0;
}

async function releaseIdempotency(client, key, token) {
  const result = await client.query(
    `DELETE FROM push_idempotency
      WHERE key = $1
        AND status = 'claimed'
        AND claim_token = $2
      RETURNING key`,
    [key, token]
  );
  return result.rowCount > 0;
}

async function deliverIdempotently(client, key, deliver) {
  const token = await claimIdempotency(client, key);
  if (!token) {
    return { claimed: false, delivered: false, sent: 0, total: 0, cleaned: 0 };
  }

  let result;
  try {
    result = await deliver();
  } catch (error) {
    try {
      await releaseIdempotency(client, key, token);
    } catch (releaseError) {
      console.error('[cron-reminders] failed to release idempotency claim', {
        key,
        error: releaseError.message,
      });
    }
    throw error;
  }

  const sent = Number(result?.sent) || 0;
  if (sent < 1) {
    await releaseIdempotency(client, key, token);
    return { ...result, claimed: true, delivered: false, sent };
  }

  await markIdempotencyDelivered(client, key);
  return { ...result, claimed: true, delivered: true, sent };
}

module.exports = {
  CLAIM_LEASE_INTERVAL,
  REMINDER_EARLY_WINDOW_MINUTES,
  REMINDER_RETRY_WINDOW_MINUTES,
  isInReminderDeliveryWindow,
  claimIdempotency,
  markIdempotencyDelivered,
  releaseIdempotency,
  deliverIdempotently,
};
