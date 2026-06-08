/**
 * heys-bot-client — Telegram-бот для клиентов HEYS (P0.7)
 *
 * Endpoints:
 *   POST /bot/webhook  — webhook от Telegram Bot API (setWebhook на этот URL)
 *   POST /bot/send     — приватный endpoint для cron-drip скрипта (отправка
 *                        сообщения по chat_id с проверкой INTERNAL_CRON_TOKEN)
 *   GET  /bot/health   — health check
 *
 * Источник секретов — Lockbox (если задан LOCKBOX_APP_SECRET_ID и функции
 * привязан SA с lockbox.payloadViewer), с fallback на env-переменные:
 *   TELEGRAM_CLIENT_BOT_TOKEN — токен бота (отдельный от куратор-канала!)
 *   APP_URL                   — куда вести клиента (default: https://app.heyslab.ru)
 *   INTERNAL_CRON_TOKEN       — общий с heys-api-payments, для /bot/send
 *   PG_*                      — БД (пока только env, не в Lockbox)
 */

const { getPool } = require('./shared/db-pool');
const { initSecrets } = require('./shared/secrets');
const { getSecret } = require('./shared/lockbox-client');
const crypto = require('crypto');

// Конфиг загружается лениво в ensureConfig() — первый запрос дергает Lockbox
// (если задан LOCKBOX_APP_SECRET_ID), остальные используют кеш модуля.
let TELEGRAM_BOT_TOKEN = null;
let APP_URL = null;
let INTERNAL_CRON_TOKEN = null;
let TELEGRAM_API = null;
let configLoaded = false;
let configPromise = null;

async function ensureConfig() {
  if (configLoaded) return;
  if (!configPromise) {
    configPromise = (async () => {
      const lockboxSecretId = process.env.LOCKBOX_APP_SECRET_ID;
      const secrets = lockboxSecretId ? await getSecret(lockboxSecretId) : null;

      const pick = (key) => {
        const v = secrets && secrets[key];
        return v && String(v).length > 0 ? v : process.env[key];
      };

      // ⚠️ Только TELEGRAM_CLIENT_BOT_TOKEN — это отдельный клиент-бот,
      // куратор-бот (TELEGRAM_BOT_TOKEN) сюда не подставлять: уйдёт в чужой чат.
      TELEGRAM_BOT_TOKEN = pick('TELEGRAM_CLIENT_BOT_TOKEN');
      APP_URL = pick('APP_URL') || 'https://app.heyslab.ru';
      INTERNAL_CRON_TOKEN = pick('INTERNAL_CRON_TOKEN');

      TELEGRAM_API = TELEGRAM_BOT_TOKEN
        ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`
        : null;

      configLoaded = true;
      if (!TELEGRAM_BOT_TOKEN) {
        console.error('[heys-bot-client] TELEGRAM_CLIENT_BOT_TOKEN not configured — sendMessage will throw');
      }
      console.log('[heys-bot-client] config loaded',
        { from: secrets ? 'lockbox' : 'env', hasToken: !!TELEGRAM_BOT_TOKEN });
    })();
  }
  await configPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function isInternalCronCall(headers) {
  if (!INTERNAL_CRON_TOKEN) return false;
  const provided = headers?.['x-internal-cron-token'] || headers?.['X-Internal-Cron-Token'];
  if (!provided || typeof provided !== 'string') return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(INTERNAL_CRON_TOKEN, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function tgRequest(method, payload) {
  if (!TELEGRAM_API) {
    throw new Error('TELEGRAM_CLIENT_BOT_TOKEN not configured');
  }
  const res = await fetch(`${TELEGRAM_API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(`Telegram ${method} failed: ${data.description || res.status}`);
  }
  return data.result;
}

async function sendMessage(chatId, text, opts = {}) {
  return tgRequest('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...opts,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// /start <pin_token> — связывание клиента с chat_id
// ─────────────────────────────────────────────────────────────────────────────

async function handleStartCommand(chatId, payload) {
  const pinToken = (payload || '').trim();

  if (!pinToken) {
    await sendMessage(
      chatId,
      'Привет! Этот бот HEYS используется для получения PIN и уведомлений.\n\n' +
        'Чтобы войти, попросите вашего куратора прислать персональную ссылку.',
    );
    return;
  }

  // Простая проверка формата UUID
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pinToken)) {
    await sendMessage(chatId, '⚠️ Ссылка некорректна. Попросите куратора прислать новую.');
    return;
  }

  const pool = getPool();
  const client = await pool.connect();
  let dbResult;
  try {
    const res = await client.query(
      `SELECT claim_pin_token_chat($1::uuid, $2::bigint) AS payload`,
      [pinToken, chatId],
    );
    dbResult = res.rows?.[0]?.payload || {};
  } finally {
    client.release();
  }

  if (!dbResult.success) {
    if (dbResult.error === 'invalid_token') {
      await sendMessage(
        chatId,
        '❌ Ссылка не найдена или уже использована другим аккаунтом.\n' +
          'Попросите куратора прислать новую.',
      );
    } else if (dbResult.error === 'token_expired') {
      await sendMessage(
        chatId,
        '⏰ Ссылка истекла (срок действия — 7 дней).\n' +
          'Попросите куратора прислать новую.',
      );
    } else {
      await sendMessage(chatId, '❌ Не удалось обработать ссылку. Свяжитесь с куратором.');
    }
    return;
  }

  // Сообщение с PLAIN-ссылкой (без inline-keyboard кнопки).
  // На iOS Telegram при долгом тапе на ссылку даёт выбор «Открыть в Safari»,
  // что нужно для добавления PWA на главный экран. Inline-keyboard кнопки
  // открываются только во встроенном Telegram-браузере, откуда PWA не ставится.
  const name = dbResult.name || 'там';
  await sendMessage(
    chatId,
    `Привет, <b>${escapeHtml(name)}</b>! 👋\n\n` +
      'Я — бот HEYS. Буду напоминать о триале и важных событиях вашей подписки.\n\n' +
      '<b>Откройте приложение:</b>\n' +
      `<a href="${APP_URL}">${APP_URL}</a>\n\n` +
      '<i>iPhone:</i> зажмите ссылку → «Открыть в Safari» → меню «Поделиться» → «На экран «Домой»». Так HEYS поставится как иконка-приложение.\n\n' +
      '<i>Android:</i> зажмите ссылку → «Открыть в Chrome» → меню «⋮» → «Установить приложение».\n\n' +
      'Внутри введёте PIN, который вам прислал куратор. Если PIN потерялся — напишите куратору.',
  );
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook от Telegram
// ─────────────────────────────────────────────────────────────────────────────

async function handleTelegramWebhook(body) {
  // Telegram update structure: { update_id, message: { chat: { id }, text } }
  const message = body?.message;
  if (!message || !message.chat || !message.chat.id) {
    return jsonResponse(200, { ok: true, ignored: 'no-message' });
  }

  const chatId = message.chat.id;
  const text = (message.text || '').trim();

  try {
    if (text.startsWith('/start')) {
      const payload = text.replace(/^\/start\s*/, '');
      await handleStartCommand(chatId, payload);
    } else if (text === '/help' || text === '/menu') {
      await sendMessage(
        chatId,
        '<b>Доступные команды:</b>\n' +
          '/start &lt;ссылка&gt; — привязать аккаунт\n' +
          '/help — это сообщение\n\n' +
          'PIN и доступ к приложению выдаёт ваш куратор.',
      );
    } else {
      await sendMessage(
        chatId,
        'Я не понимаю это сообщение. Используйте /help для списка команд.',
      );
    }
  } catch (e) {
    console.error('[BOT] webhook handler error:', e.message);
    // Telegram перепошлёт при 5xx, поэтому проглатываем и возвращаем 200
  }

  return jsonResponse(200, { ok: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// /bot/send — внутренний endpoint для cron-drip
// ─────────────────────────────────────────────────────────────────────────────

async function handleInternalSend(body, headers) {
  if (!isInternalCronCall(headers)) {
    return jsonResponse(403, { error: 'forbidden' });
  }

  const { chat_id, text, reply_markup } = body || {};
  if (!chat_id || !text) {
    return jsonResponse(400, { error: 'chat_id and text required' });
  }

  try {
    const result = await sendMessage(chat_id, text, reply_markup ? { reply_markup } : {});
    return jsonResponse(200, { ok: true, message_id: result.message_id });
  } catch (e) {
    console.error('[BOT] internal-send error:', e.message);
    return jsonResponse(502, { error: e.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────

module.exports.handler = async function (event) {
  await initSecrets();
  await ensureConfig();

  const path = event?.path || event?.url || '';
  const method = event?.httpMethod || 'GET';

  let body = {};
  if (event?.body) {
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch (e) {
      console.warn('[BOT] body parse failed:', e.message);
    }
  }

  if (method === 'GET' && (path === '/bot/health' || path.endsWith('/health'))) {
    return jsonResponse(200, {
      service: 'heys-bot-client',
      ok: true,
      hasToken: !!TELEGRAM_BOT_TOKEN,
      configSource: process.env.LOCKBOX_APP_SECRET_ID ? 'lockbox' : 'env',
    });
  }

  if (method === 'POST' && path.includes('/webhook')) {
    // 🛡️ SEC-020 (2026-06-08): verify Telegram secret_token header.
    // Telegram setWebhook позволяет настроить `secret_token` — Telegram потом
    // шлёт его в каждом webhook'е через заголовок `X-Telegram-Bot-Api-Secret-Token`.
    // Без этой проверки любой может слать fake updates (spam users, race
    // claim_pin_token_chat утечённым UUID и т.д.).
    //
    // Graceful fallback: если TELEGRAM_WEBHOOK_SECRET не настроен в env — warn,
    // но не блокируем (чтобы не сломать прод до того как user вызовет setWebhook
    // с правильным secret_token). Когда env-var выставлен и Telegram шлёт
    // header — проверяем строго.
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (expected) {
      const headers = event?.headers || {};
      const provided =
        headers['x-telegram-bot-api-secret-token'] ||
        headers['X-Telegram-Bot-Api-Secret-Token'] ||
        '';
      if (!provided || typeof provided !== 'string') {
        console.warn('[BOT] webhook rejected: missing secret_token header');
        return jsonResponse(403, { error: 'forbidden' });
      }
      const a = Buffer.from(provided, 'utf8');
      const b = Buffer.from(expected, 'utf8');
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        console.warn('[BOT] webhook rejected: secret_token mismatch');
        return jsonResponse(403, { error: 'forbidden' });
      }
    } else {
      console.warn('[BOT] TELEGRAM_WEBHOOK_SECRET not set — webhook accepts ANY caller. ' +
        'Set env-var + setWebhook with secret_token=<same> to enable SEC-020 защиту.');
    }
    return await handleTelegramWebhook(body);
  }

  if (method === 'POST' && path.includes('/send')) {
    return await handleInternalSend(body, event?.headers || {});
  }

  return jsonResponse(404, { error: 'not-found', path });
};
