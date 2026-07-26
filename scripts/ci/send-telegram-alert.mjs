import { pathToFileURL } from 'node:url';

const TELEGRAM_API_BASE = 'https://api.telegram.org';

function required(value, name) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

export async function sendTelegramAlert({ token, chatId, text, fetchImpl = globalThis.fetch }) {
  const safeToken = required(token, 'TELEGRAM_BOT_TOKEN');
  const safeChatId = required(chatId, 'TELEGRAM_CHAT_ID');
  const safeText = required(text, 'TELEGRAM_MESSAGE');
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable');

  let response;
  try {
    response = await fetchImpl(`${TELEGRAM_API_BASE}/bot${safeToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        chat_id: safeChatId,
        text: safeText,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });
  } catch (error) {
    throw new Error(`Telegram request failed: ${error?.message || 'network error'}`);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    const description = String(payload.description || `HTTP ${response.status}`).slice(0, 200);
    throw new Error(`Telegram API rejected alert: ${description}`);
  }

  return { ok: true, messageId: payload.result?.message_id || null };
}

async function main() {
  await sendTelegramAlert({
    token: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
    text: process.env.TELEGRAM_MESSAGE,
  });
  console.log('✅ Telegram alert delivered');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  });
}
