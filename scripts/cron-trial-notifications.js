#!/usr/bin/env node

/**
 * HEYS Trial Drip Notifier (P0.7) — переписан с SMS на Telegram.
 *
 * Что делает:
 *   1. Запускает RPC `check_expired_subscriptions` — переводит истёкшие триалы
 *      в read_only.
 *   2. Запрашивает `get_trial_drip_targets` — список клиентов и стейджей
 *      drip-цепочки (welcome / mid / prepay / lastcall / expired), которые
 *      ещё не отправлены и подошёл срок.
 *   3. Шлёт сообщение через POST /bot/send (внутренний endpoint heys-bot-client
 *      с заголовком X-Internal-Cron-Token).
 *   4. Помечает стейдж как отправленный через RPC `mark_drip_sent`.
 *
 * ENV:
 *   PG_HOST, PG_PORT, PG_DATABASE, PG_USER, PG_PASSWORD — БД
 *   BOT_API_URL                 — base URL heys-bot-client (default https://api.heyslab.ru)
 *   INTERNAL_CRON_TOKEN         — общий с heys-bot-client
 *   APP_URL                     — куда вести клиента (default https://app.heyslab.ru)
 *   DRY_RUN=true                — режим без HTTP-вызовов
 *
 * Run: node scripts/cron-trial-notifications.js
 * Cron: 0 10 * * * (ежедневно 10:00 — настраивается через Yandex Cloud Scheduler)
 */

const { Client } = require('pg');

const PG_CONFIG = {
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT || '6432', 10),
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  ssl: process.env.PG_SSL === 'disable' ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000,
  query_timeout: 10000,
};

const BOT_API_URL = process.env.BOT_API_URL || 'https://api.heyslab.ru';
const INTERNAL_CRON_TOKEN = process.env.INTERNAL_CRON_TOKEN;
const APP_URL = process.env.APP_URL || 'https://app.heyslab.ru';
const DRY_RUN = process.env.DRY_RUN === 'true';

if (!PG_CONFIG.host || !PG_CONFIG.user || !PG_CONFIG.password) {
  console.error('❌ PG_HOST/PG_USER/PG_PASSWORD не заданы');
  process.exit(1);
}
if (!INTERNAL_CRON_TOKEN && !DRY_RUN) {
  console.error('❌ INTERNAL_CRON_TOKEN не задан (нужен для /bot/send)');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Тексты drip-сообщений
// ─────────────────────────────────────────────────────────────────────────────

function dripText(stage, name, daysLeft) {
  const safeName = name || 'там';
  switch (stage) {
    case 'welcome':
      return (
        `<b>${safeName}</b>, добро пожаловать в HEYS! 🎉\n\n` +
        'Триал активирован на 7 дней. За это время вы успеете:\n' +
        '• Завести дневник питания\n' +
        '• Получить первые рекомендации алгоритма\n' +
        '• Понять, подходит ли HEYS лично вам\n\n' +
        'В конце триала откроется выбор тарифа, чтобы продолжить.'
      );
    case 'mid':
      return (
        `<b>${safeName}</b>, прошло половина триала.\n\n` +
        `До конца — ${daysLeft} дн.\n\n` +
        'Если есть вопросы по работе с приложением — напишите вашему куратору, ' +
        'мы поможем разобраться.'
      );
    case 'prepay':
      return (
        `<b>${safeName}</b>, до конца триала ${daysLeft} дн.\n\n` +
        'Чтобы продолжить пользоваться HEYS, выберите тариф в приложении. ' +
        'Без оформления подписки доступ перейдёт в режим «только чтение».'
      );
    case 'lastcall':
      return (
        `<b>${safeName}</b>, последний день триала ⏰\n\n` +
        'Завтра доступ к редактированию будет ограничен. ' +
        'Если хотите продолжить — оформите подписку прямо сейчас.'
      );
    case 'expired':
      return (
        `<b>${safeName}</b>, триал-период завершён.\n\n` +
        'Доступ к редактированию данных временно ограничен. ' +
        'Чтобы вернуться к полному функционалу — выберите тариф и оплатите подписку.'
      );
    default:
      return null;
  }
}

function dripButtons(stage) {
  if (['prepay', 'lastcall', 'expired'].includes(stage)) {
    return {
      inline_keyboard: [[{ text: '💳 Выбрать тариф', url: `${APP_URL}/?paywall=1` }]],
    };
  }
  return {
    inline_keyboard: [[{ text: '🚀 Открыть HEYS', url: APP_URL }]],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP к /bot/send
// ─────────────────────────────────────────────────────────────────────────────

async function sendBotMessage(chatId, text, replyMarkup, botKind = 'client') {
  if (DRY_RUN) {
    console.log(`[DRY_RUN] Would POST /bot/send chat_id=${chatId} bot=${botKind}`);
    return { ok: true };
  }
  const res = await fetch(`${BOT_API_URL}/bot/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Cron-Token': INTERNAL_CRON_TOKEN,
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: replyMarkup,
      bot: botKind === 'start' ? 'start' : 'client',
      cron_token: INTERNAL_CRON_TOKEN,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`bot/send ${res.status}: ${data.error || 'unknown'}`);
  }
  return data;
}

function purgeWarnText(daysUntilPurge) {
  const days =
    Number.isFinite(Number(daysUntilPurge)) && Number(daysUntilPurge) > 0
      ? Math.max(1, Math.min(3, Number(daysUntilPurge)))
      : 2;
  return (
    '<b>Черновик анкеты HEYS скоро будет удалён</b>\n\n' +
    `Из‑за неактивности ответы удалятся примерно через ${days} дн.\n\n` +
    'Чтобы сохранить черновик — откройте анкету по ссылке из сообщения куратора ' +
    'и продолжите заполнение. Код из того сообщения по‑прежнему действует.\n\n' +
    'Если анкета больше не нужна — ничего делать не требуется.'
  );
}

async function processCandidatePurgeWarnings(client) {
  let processed = 0;
  let sent = 0;
  let skipped = 0;
  let errors = 0;
  let targets;
  try {
    targets = await client.query(`SELECT * FROM get_trial_candidate_purge_warn_targets()`);
  } catch (e) {
    console.warn('[CRON-DRIP] purge-warn targets unavailable:', e.message);
    return { processed, sent, skipped, errors, error: e.message };
  }
  console.log(`[CRON-DRIP] purge-warn candidates: ${targets.rows.length}`);
  for (const row of targets.rows) {
    processed += 1;
    const chatId = row.telegram_chat_id != null ? Number(row.telegram_chat_id) : null;
    const botKind = row.bot_kind === 'start' ? 'start' : 'client';
    if (!chatId) {
      try {
        await client.query(`SELECT mark_trial_candidate_purge_warn_sent($1::uuid)`, [row.candidate_id]);
        skipped += 1;
      } catch (e) {
        errors += 1;
        console.error(`[CRON-DRIP] purge-warn mark skip failed:`, e.message);
      }
      continue;
    }
    try {
      await sendBotMessage(
        chatId,
        purgeWarnText(row.days_until_purge),
        {
          inline_keyboard: [[{ text: 'Открыть анкету', url: `${APP_URL.replace(/\/$/, '')}/?intake=1` }]],
        },
        botKind,
      );
      await client.query(`SELECT mark_trial_candidate_purge_warn_sent($1::uuid)`, [row.candidate_id]);
      sent += 1;
    } catch (e) {
      errors += 1;
      console.error(`[CRON-DRIP] purge-warn error candidate=${row.candidate_id}:`, e.message);
    }
  }
  return { processed, sent, skipped, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const started = Date.now();
  console.log(`[CRON-DRIP] started at ${new Date().toISOString()} (DRY_RUN=${DRY_RUN})`);

  const client = new Client(PG_CONFIG);
  await client.connect();

  let processed = 0;
  let sent = 0;
  let skipped = 0;
  let errors = 0;
  let purgeWarn = null;

  try {
    // 1. Переводим истёкшие триалы в read_only
    try {
      await client.query(`SELECT check_expired_subscriptions()`);
      console.log('[CRON-DRIP] check_expired_subscriptions OK');
    } catch (e) {
      console.warn('[CRON-DRIP] check_expired_subscriptions failed:', e.message);
    }

    // 2. Получаем drip-таргеты
    const targets = await client.query(`SELECT * FROM get_trial_drip_targets()`);
    console.log(`[CRON-DRIP] candidates: ${targets.rows.length}`);

    for (const row of targets.rows) {
      processed += 1;
      const stage = row.drip_stage;
      const text = dripText(stage, row.name, row.days_left);
      if (!text) {
        skipped += 1;
        continue;
      }

      try {
        await sendBotMessage(
          Number(row.telegram_chat_id),
          text,
          dripButtons(stage),
        );

        // Помечаем как отправленный
        await client.query(`SELECT mark_drip_sent($1::uuid, $2::text)`, [row.client_id, stage]);
        sent += 1;
        console.log(`[CRON-DRIP] sent stage=${stage} client=${row.client_id} name="${row.name}"`);
      } catch (e) {
        errors += 1;
        console.error(`[CRON-DRIP] error stage=${stage} client=${row.client_id}:`, e.message);
      }
    }

    purgeWarn = await processCandidatePurgeWarnings(client);
  } finally {
    await client.end();
  }

  const duration = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `[CRON-DRIP] done in ${duration}s — processed=${processed}, sent=${sent}, skipped=${skipped}, errors=${errors}, purge_warn=${JSON.stringify(purgeWarn)}`,
  );

  if (errors > 0 || (purgeWarn && purgeWarn.errors > 0)) process.exit(2);
}

main().catch((err) => {
  console.error('[CRON-DRIP] fatal:', err);
  process.exit(1);
});
