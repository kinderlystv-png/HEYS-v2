#!/usr/bin/env node

/**
 * HEYS Trial Expiration Notifier
 *
 * Cron script for expiring-trial SMS notifications.
 * Uses PostgREST-compatible HTTP (same contract as legacy Supabase project URL + service key).
 *
 * Run: node scripts/cron-trial-notifications.js
 * Cron: 0 10 * * * (daily 10:00)
 */

const POSTGREST_BASE =
  process.env.HEYS_POSTGREST_URL ||
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL;
const SERVICE_KEY =
  process.env.HEYS_POSTGREST_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;
const SMS_RU_API_KEY = process.env.SMS_RU_API_KEY;
const DRY_RUN = process.env.DRY_RUN === 'true';

if (!POSTGREST_BASE || !SERVICE_KEY) {
  console.error(
    '❌ Missing PostgREST credentials. Set HEYS_POSTGREST_URL + HEYS_POSTGREST_SERVICE_KEY (or legacy SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).',
  );
  process.exit(1);
}

const baseUrl = POSTGREST_BASE.replace(/\/$/, '');

async function postRpc(functionName, body) {
  const res = await fetch(`${baseUrl}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`RPC ${functionName} failed: ${res.status} ${text || res.statusText}`);
    err.cause = res;
    throw err;
  }
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Send SMS via SMS.ru
 */
async function sendSMS(phone, message) {
  if (!SMS_RU_API_KEY) {
    console.warn('⚠️  SMS_RU_API_KEY not set, skipping SMS');
    return { success: false, error: 'No API key' };
  }

  const url = 'https://sms.ru/sms/send';
  const params = new URLSearchParams({
    api_id: SMS_RU_API_KEY,
    to: phone,
    msg: message,
    json: '1',
  });

  try {
    const response = await fetch(`${url}?${params}`);
    const data = await response.json();

    if (data.status === 'OK') {
      return { success: true, sms_id: data.sms[phone]?.sms_id };
    }
    return { success: false, error: data.status_text };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * List trials expiring soon
 */
async function getExpiringTrials() {
  try {
    const data = await postRpc('get_expiring_trials', { hours_ahead: 24 });
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('❌ Error fetching expiring trials:', error);
    return [];
  }
}

/**
 * Mark expired subscriptions
 */
async function checkExpiredSubscriptions() {
  try {
    await postRpc('check_expired_subscriptions', {});
    console.log('✅ Checked and updated expired subscriptions');
    return true;
  } catch (error) {
    console.error('❌ Error checking expired subscriptions:', error);
    return false;
  }
}

/**
 * Main
 */
async function main() {
  console.log('🔔 HEYS Trial Expiration Notifier');
  console.log('📅 Running at:', new Date().toISOString());
  console.log('🧪 DRY RUN:', DRY_RUN);
  console.log('---');

  await checkExpiredSubscriptions();

  const expiringTrials = await getExpiringTrials();

  if (expiringTrials.length === 0) {
    console.log('✅ No expiring trials in the next 24 hours');
    return;
  }

  console.log(`📋 Found ${expiringTrials.length} expiring trial(s):`);
  console.log('---');

  for (const trial of expiringTrials) {
    const hoursLeft = Math.round(trial.hours_left);
    const message = `HEYS: Ваш триал-период заканчивается через ${hoursLeft} ч. Выберите тариф чтобы продолжить: https://heys-v2-web.vercel.app`;

    console.log(`📱 Client: ${trial.client_name}`);
    console.log(`   Phone: ${trial.phone}`);
    console.log(`   Trial ends: ${trial.trial_ends_at}`);
    console.log(`   Hours left: ${hoursLeft}`);

    if (DRY_RUN) {
      console.log(`   📧 [DRY RUN] Would send SMS: "${message}"`);
    } else {
      const result = await sendSMS(trial.phone, message);
      if (result.success) {
        console.log(`   ✅ SMS sent (ID: ${result.sms_id})`);
      } else {
        console.log(`   ❌ SMS failed: ${result.error}`);
      }
    }
    console.log('---');
  }

  console.log('✅ Notification run completed');
}

main().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
