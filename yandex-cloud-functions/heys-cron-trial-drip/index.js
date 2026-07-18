/**
 * heys-cron-trial-drip — daily Telegram drip notifications (P0.7, Phase 1)
 *
 * Запускается timer-trigger'ом ежедневно (10:00 МСК = 07:00 UTC).
 * Логика идентична scripts/cron-trial-notifications.js, но обёрнута в
 * cloud-function handler.
 *
 * 1. SELECT check_expired_subscriptions() — переводит истёкшие триалы в read_only
 * 2. SELECT * FROM get_trial_drip_targets() — список (client_id, name, telegram_chat_id, drip_stage, days_left)
 * 3. Для каждого: POST https://api.heyslab.ru/bot/send (с X-Internal-Cron-Token)
 * 4. SELECT mark_drip_sent(client_id, stage) — помечаем как отправленное
 *
 * ENV:
 *   PG_HOST, PG_PORT, PG_DATABASE, PG_USER, PG_PASSWORD — БД (передаются deploy-all.sh)
 *   BOT_API_URL                 — base URL (default https://api.heyslab.ru)
 *   INTERNAL_CRON_TOKEN         — общий с heys-bot-client (из Lockbox)
 *   APP_URL                     — куда вести клиента (default https://app.heyslab.ru)
 */

const { getPool } = require('./shared/db-pool');
const { initSecrets } = require('./shared/secrets');

function getBotApiUrl() {
  return process.env.BOT_API_URL || 'https://api.heyslab.ru';
}

function getInternalCronToken() {
  return process.env.INTERNAL_CRON_TOKEN;
}

function getAppUrl() {
  return process.env.APP_URL || 'https://app.heyslab.ru';
}

async function recordWorkerHeartbeat(client) {
  await client.query(
    `INSERT INTO public.maintenance_heartbeat (task, last_ok_at, stale_alerted_at, max_silence)
     VALUES ('cron_trial_drip', now(), NULL, interval '30 hours')
     ON CONFLICT (task) DO UPDATE
       SET last_ok_at = now(), stale_alerted_at = NULL, max_silence = EXCLUDED.max_silence`,
  );
}

// ⚠️ 152-ФЗ: имя клиента (ПДн) НЕ передаём через Telegram API
// (серверы api.telegram.org за пределами РФ). Текст обезличен, поэтому
// исходящий трафик в Telegram содержит только статус подписки и chat_id —
// не считается передачей ПДн оператором.
function dripText(stage, daysLeft) {
  switch (stage) {
    case 'welcome':
      return (
        '<b>Добро пожаловать в HEYS!</b> 🎉\n\n' +
        'Триал активирован на 7 дней. За это время вы успеете:\n' +
        '• Завести дневник питания\n' +
        '• Получить первые рекомендации алгоритма\n' +
        '• Понять, подходит ли HEYS лично вам\n\n' +
        'В конце триала ваш куратор расскажет о тарифах для продолжения.'
      );
    case 'mid':
      return (
        '<b>Половина триала позади.</b>\n\n' +
        `До конца — ${daysLeft} дн.\n\n` +
        'Если есть вопросы по работе с приложением — напишите вашему куратору, ' +
        'мы поможем разобраться.'
      );
    case 'prepay':
      return (
        `<b>До конца триала ${daysLeft} дн.</b>\n\n` +
        'Чтобы продолжить пользоваться HEYS, свяжитесь с вашим куратором — ' +
        'он подберёт тариф и оформит подписку.'
      );
    case 'lastcall':
      return (
        '<b>Сегодня последний день триала</b> ⏰\n\n' +
        'Завтра доступ к редактированию будет ограничен. ' +
        'Если хотите продолжить — напишите куратору сегодня.'
      );
    case 'expired':
      return (
        '<b>Триал-период завершён.</b>\n\n' +
        'Доступ к редактированию данных временно ограничен. ' +
        'Чтобы вернуться к полному функционалу — свяжитесь с куратором, ' +
        'он оформит подписку индивидуально.'
      );
    default:
      return null;
  }
}

function dripButtons(stage) {
  return {
    inline_keyboard: [[{ text: '🚀 Открыть HEYS', url: getAppUrl() }]],
  };
}

async function sendBotMessage(chatId, text, replyMarkup) {
  const res = await fetch(`${getBotApiUrl()}/bot/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Cron-Token': getInternalCronToken(),
    },
    body: JSON.stringify({ chat_id: chatId, text, reply_markup: replyMarkup }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`bot/send ${res.status}: ${data.error || 'unknown'}`);
  }
  return data;
}

module.exports.handler = async function (event, context) {
  await initSecrets();
  const started = Date.now();
  console.log(`[CRON-DRIP] started at ${new Date().toISOString()}`);

  if (!getInternalCronToken()) {
    console.error('[CRON-DRIP] INTERNAL_CRON_TOKEN not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'missing token' }) };
  }

  const pool = getPool();
  const client = await pool.connect();

  let processed = 0;
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  try {
    try {
      await client.query(`SELECT check_expired_subscriptions()`);
      console.log('[CRON-DRIP] check_expired_subscriptions OK');
    } catch (e) {
      console.warn('[CRON-DRIP] check_expired_subscriptions failed:', e.message);
    }

    const targets = await client.query(`SELECT * FROM get_trial_drip_targets()`);
    console.log(`[CRON-DRIP] candidates: ${targets.rows.length}`);

    for (const row of targets.rows) {
      processed += 1;
      const stage = row.drip_stage;
      const text = dripText(stage, row.days_left);
      if (!text) {
        skipped += 1;
        continue;
      }

      try {
        await sendBotMessage(Number(row.telegram_chat_id), text, dripButtons(stage));
        await client.query(`SELECT mark_drip_sent($1::uuid, $2::text)`, [row.client_id, stage]);
        sent += 1;
        console.log(`[CRON-DRIP] sent stage=${stage} client=${row.client_id}`);
      } catch (e) {
        errors += 1;
        console.error(`[CRON-DRIP] error stage=${stage} client=${row.client_id}:`, e.message);
      }
    }
    await recordWorkerHeartbeat(client);
  } finally {
    client.release();
  }

  const duration = ((Date.now() - started) / 1000).toFixed(1);
  const summary = { duration_s: duration, processed, sent, skipped, errors };
  console.log(`[CRON-DRIP] done`, summary);

  return { statusCode: 200, body: JSON.stringify(summary) };
};
