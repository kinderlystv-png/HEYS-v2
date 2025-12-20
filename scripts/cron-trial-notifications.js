#!/usr/bin/env node

/**
 * HEYS Trial Expiration Notifier
 * 
 * Cron-скрипт для отправки уведомлений о истекающих триалах
 * Запуск: node cron-trial-notifications.js
 * Cron: 0 10 * * * (каждый день в 10:00)
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SMS_RU_API_KEY = process.env.SMS_RU_API_KEY;
const DRY_RUN = process.env.DRY_RUN === 'true';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Отправка SMS через SMS.ru
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
    json: '1'
  });

  try {
    const response = await fetch(`${url}?${params}`);
    const data = await response.json();
    
    if (data.status === 'OK') {
      return { success: true, sms_id: data.sms[phone]?.sms_id };
    } else {
      return { success: false, error: data.status_text };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Получить список истекающих триалов
 */
async function getExpiringTrials() {
  const { data, error } = await supabase.rpc('get_expiring_trials', {
    hours_ahead: 24
  });

  if (error) {
    console.error('❌ Error fetching expiring trials:', error);
    return [];
  }

  return data || [];
}

/**
 * Проверить и обновить истекшие подписки
 */
async function checkExpiredSubscriptions() {
  const { error } = await supabase.rpc('check_expired_subscriptions');
  
  if (error) {
    console.error('❌ Error checking expired subscriptions:', error);
    return false;
  }
  
  console.log('✅ Checked and updated expired subscriptions');
  return true;
}

/**
 * Основная логика
 */
async function main() {
  console.log('🔔 HEYS Trial Expiration Notifier');
  console.log('📅 Running at:', new Date().toISOString());
  console.log('🧪 DRY RUN:', DRY_RUN);
  console.log('---');

  // 1. Проверяем истекшие подписки
  await checkExpiredSubscriptions();

  // 2. Получаем список истекающих триалов
  const expiringTrials = await getExpiringTrials();
  
  if (expiringTrials.length === 0) {
    console.log('✅ No expiring trials in the next 24 hours');
    return;
  }

  console.log(`📋 Found ${expiringTrials.length} expiring trial(s):`);
  console.log('---');

  // 3. Отправляем уведомления
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

// Запуск
main().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
