/**
 * heys-bot-client — Telegram-бот для клиентов HEYS (P0.7)
 *
 * Endpoints:
 *   POST /bot/webhook  — webhook от Telegram Bot API (setWebhook на этот URL)
 *   POST /bot/send     — приватный endpoint для cron-drip скрипта (отправка
 *                        сообщения по chat_id с проверкой INTERNAL_CRON_TOKEN)
 *   GET  /bot/health   — health check
 *
 * Env:
 *   TELEGRAM_CLIENT_BOT_TOKEN — токен бота (отдельный от куратор-канала!)
 *   APP_URL                   — куда вести клиента (default: https://app.heyslab.ru)
 *   INTERNAL_CRON_TOKEN       — общий с heys-api-payments, для /bot/send
 *   PG_*                      — БД
 */

const { getPool } = require('./shared/db-pool');
const crypto = require('crypto');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_CLIENT_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.APP_URL || 'https://app.heyslab.ru';
const INTERNAL_CRON_TOKEN = process.env.INTERNAL_CRON_TOKEN;

const TELEGRAM_API = TELEGRAM_BOT_TOKEN
  ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`
  : null;

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

  // Узнаём PIN клиента — он не возвращается claim_pin_token_chat в открытом виде,
  // но в этот момент клиент уже создан и куратор передал PIN (это бот лишь для chat_id и drip).
  // Сообщаем общую инструкцию + кнопку «Открыть приложение».
  const name = dbResult.name || 'там';
  await sendMessage(
    chatId,
    `Привет, <b>${escapeHtml(name)}</b>! 👋\n\n` +
      'Я — бот HEYS. Буду напоминать о триале и важных событиях вашей подписки.\n\n' +
      '<b>Для входа в приложение:</b>\n' +
      '1. Откройте приложение по кнопке ниже\n' +
      '2. Введите PIN, который вам прислал куратор\n\n' +
      'Если PIN потерялся — напишите куратору, он перевыпустит.',
    {
      reply_markup: {
        inline_keyboard: [[{ text: '🚀 Открыть HEYS', url: APP_URL }]],
      },
    },
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
    return jsonResponse(200, { service: 'heys-bot-client', ok: true, hasToken: !!TELEGRAM_BOT_TOKEN });
  }

  if (method === 'POST' && path.includes('/webhook')) {
    return await handleTelegramWebhook(body);
  }

  if (method === 'POST' && path.includes('/send')) {
    return await handleInternalSend(body, event?.headers || {});
  }

  return jsonResponse(404, { error: 'not-found', path });
};
