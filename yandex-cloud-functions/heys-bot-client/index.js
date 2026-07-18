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
 *   HEYS_START_BOT_TOKEN      — токен бота HEYS Старт (@heys_start_bot)
 *   TELEGRAM_BOT_TOKEN         — curator/support bot для lead callbacks
 *   TELEGRAM_CHAT_ID           — разрешённый curator chat
 *   TELEGRAM_CURATOR_USER_IDS  — optional allowlist Telegram user id для group chat
 *   APP_URL                   — куда вести клиента (default: https://app.heyslab.ru)
 *   INTERNAL_CRON_TOKEN       — общий с heys-api-payments, для /bot/send
 *   PG_*                      — БД (пока только env, не в Lockbox)
 */

const { getPool, closePool } = require('./shared/db-pool');
const { initSecrets } = require('./shared/secrets');
const { getSecret } = require('./shared/lockbox-client');
const crypto = require('crypto');

// Конфиг загружается лениво в ensureConfig() — первый запрос дергает Lockbox
// (если задан LOCKBOX_APP_SECRET_ID), остальные используют кеш модуля.
let TELEGRAM_BOT_TOKEN = null;
let HEYS_START_BOT_TOKEN = null;
let CURATOR_BOT_TOKEN = null;
let APP_URL = null;
let INTERNAL_CRON_TOKEN = null;
let TELEGRAM_API = null;
let HEYS_START_API = null;
let CURATOR_API = null;
let configLoaded = false;
let configPromise = null;

const DEFAULT_TELEGRAM_REQUEST_TIMEOUT_MS = 3000;
const DEFAULT_CALLBACK_ACK_TIMEOUT_MS = 700;
const DEFAULT_START_BOT_POLL_WINDOW_MS = 55000;
const POLL_LEASE_SAFETY_MS = 15000;
const BOT_GET_UPDATES_MAX_TIMEOUT_SEC = 3;

function isLockboxPlaceholder(value) {
  return typeof value === 'string' && /^__IN_LOCKBOX__/.test(value);
}

async function ensureRuntimeConfig() {
  await initSecrets();
  await ensureConfig();
}

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
      HEYS_START_BOT_TOKEN = pick('HEYS_START_BOT_TOKEN');
      CURATOR_BOT_TOKEN = pick('TELEGRAM_BOT_TOKEN');
      APP_URL = pick('APP_URL') || 'https://app.heyslab.ru';
      INTERNAL_CRON_TOKEN = pick('INTERNAL_CRON_TOKEN');

      TELEGRAM_API = TELEGRAM_BOT_TOKEN
        ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`
        : null;
      HEYS_START_API = HEYS_START_BOT_TOKEN
        ? `https://api.telegram.org/bot${HEYS_START_BOT_TOKEN}`
        : null;
      CURATOR_API = CURATOR_BOT_TOKEN
        ? `https://api.telegram.org/bot${CURATOR_BOT_TOKEN}`
        : null;

      configLoaded = true;
      if (!TELEGRAM_BOT_TOKEN) {
        console.error('[heys-bot-client] TELEGRAM_CLIENT_BOT_TOKEN not configured — sendMessage will throw');
      }
      if (!HEYS_START_BOT_TOKEN) {
        console.warn('[heys-bot-client] HEYS_START_BOT_TOKEN not configured — HEYS Start bot is disabled');
      }
      console.log('[heys-bot-client] config loaded',
        {
          from: secrets ? 'lockbox' : 'env',
          hasClientToken: !!TELEGRAM_BOT_TOKEN,
          hasStartToken: !!HEYS_START_BOT_TOKEN,
          hasCuratorToken: !!CURATOR_BOT_TOKEN,
        });
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

function telegramMethodResponse(method, payload) {
  return jsonResponse(200, { method, ...payload });
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

function getTelegramApi(bot = 'client') {
  if (bot === 'start') {
    return {
      api: HEYS_START_API,
      tokenName: 'HEYS_START_BOT_TOKEN',
    };
  }
  if (bot === 'curator') {
    return {
      api: CURATOR_API,
      tokenName: 'TELEGRAM_BOT_TOKEN',
    };
  }
  return {
    api: TELEGRAM_API,
    tokenName: 'TELEGRAM_CLIENT_BOT_TOKEN',
  };
}

function getTelegramRequestTimeoutMs() {
  const value = Number(process.env.TELEGRAM_REQUEST_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TELEGRAM_REQUEST_TIMEOUT_MS;
}

function getCallbackAckTimeoutMs() {
  const value = Number(process.env.TELEGRAM_CALLBACK_ACK_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_CALLBACK_ACK_TIMEOUT_MS;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = getTelegramRequestTimeoutMs()) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashSecret(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function safeEqualStrings(a, b) {
  if (!a || !b || typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function verifyWebhookSecret(headers, envKey, hashEnvKey, label) {
  const provided =
    headers?.['x-telegram-bot-api-secret-token'] ||
    headers?.['X-Telegram-Bot-Api-Secret-Token'] ||
    '';
  if (!provided || typeof provided !== 'string') {
    console.warn(`[${label}] webhook rejected: missing secret_token header`);
    return false;
  }

  const expected = process.env[envKey];
  if (expected && !isLockboxPlaceholder(expected)) {
    if (!safeEqualStrings(provided, expected)) {
      console.warn(`[${label}] webhook rejected: secret_token mismatch`);
      return false;
    }
    return true;
  }

  const expectedHash = process.env[hashEnvKey];
  if (expectedHash && !isLockboxPlaceholder(expectedHash)) {
    if (!safeEqualStrings(hashSecret(provided), expectedHash)) {
      console.warn(`[${label}] webhook rejected: secret_token hash mismatch`);
      return false;
    }
    return true;
  }

  console.warn(`[${label}] ${envKey}/${hashEnvKey} not set — webhook accepts ANY caller.`);
  return true;
}

function parseMaybeJson(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getWarmupPayload(event) {
  if (!event || typeof event !== 'object') return null;
  if (event.warmup || event.type === 'warmup') return event;
  const detailsPayload = event.messages?.[0]?.details?.payload;
  const parsedDetails = parseMaybeJson(detailsPayload);
  if (parsedDetails?.warmup || parsedDetails?.type === 'warmup') return parsedDetails;
  const bodyPayload = parseMaybeJson(event.body);
  if (bodyPayload?.warmup || bodyPayload?.type === 'warmup') return bodyPayload;
  return null;
}

function getStartBotPollPayload(event) {
  if (!event || typeof event !== 'object') return null;
  if (event.poll === 'heys-start-bot' || event.target === 'heys-start-bot-poll') return event;
  const detailsPayload = event.messages?.[0]?.details?.payload;
  const parsedDetails = parseMaybeJson(detailsPayload);
  if (parsedDetails?.poll === 'heys-start-bot' || parsedDetails?.target === 'heys-start-bot-poll') {
    return parsedDetails;
  }
  const bodyPayload = parseMaybeJson(event.body);
  if (bodyPayload?.poll === 'heys-start-bot' || bodyPayload?.target === 'heys-start-bot-poll') {
    return bodyPayload;
  }
  return null;
}

function getClientBotPollPayload(event) {
  if (!event || typeof event !== 'object') return null;
  if (event.poll === 'heys-client-bot' || event.target === 'heys-client-bot-poll') return event;
  const detailsPayload = event.messages?.[0]?.details?.payload;
  const parsedDetails = parseMaybeJson(detailsPayload);
  if (parsedDetails?.poll === 'heys-client-bot' || parsedDetails?.target === 'heys-client-bot-poll') {
    return parsedDetails;
  }
  const bodyPayload = parseMaybeJson(event.body);
  if (bodyPayload?.poll === 'heys-client-bot' || bodyPayload?.target === 'heys-client-bot-poll') {
    return bodyPayload;
  }
  return null;
}

async function tgRequest(method, payload, bot = 'client', timeoutMs = getTelegramRequestTimeoutMs()) {
  const { api, tokenName } = getTelegramApi(bot);
  if (!api) {
    throw new Error(`${tokenName} not configured`);
  }

  const res = await fetchWithTimeout(`${api}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, timeoutMs);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(`Telegram ${method} failed: ${data.description || res.status}`);
  }
  return data.result;
}

async function sendMessage(chatId, text, opts = {}, bot = 'client') {
  return tgRequest('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...opts,
  }, bot);
}

async function answerCallbackQueryFast(queryId, bot = 'start', options = {}) {
  if (!queryId) return;
  const { api } = getTelegramApi(bot);
  if (!api) return;

  try {
    const response = await fetchWithTimeout(
      `${api}/answerCallbackQuery`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: queryId, ...options }),
      },
      getCallbackAckTimeoutMs(),
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      console.warn('[BOT] answerCallbackQuery failed:', result.description || response.status);
    }
  } catch (e) {
    console.warn('[BOT] answerCallbackQuery timeout/error:', e.message);
  }
}

function getPollLeaseKey(lockName) {
  return `runtime_lock:telegram_poll:${lockName}`;
}

async function queryWithFreshClient(sql, params = []) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const client = await getPool().connect();
    let released = false;
    try {
      const result = await client.query(sql, params);
      client.release();
      released = true;
      return result;
    } catch (e) {
      lastError = e;
      client.release(true);
      released = true;
      if (attempt === 0) {
        console.warn('[DB-Pool] retrying query with fresh client:', e.message);
        continue;
      }
    } finally {
      if (!released) client.release();
      try {
        await closePool();
      } catch (closeErr) {
        console.warn('[DB-Pool] close after short query failed:', closeErr.message);
      }
    }
  }
  throw lastError;
}

async function acquirePollLease(lockName, leaseMs) {
  const owner = crypto.randomUUID();
  const leaseKey = getPollLeaseKey(lockName);
  const res = await queryWithFreshClient(
    `WITH acquired AS (
       INSERT INTO public.funnel_events (
         event_type, source, campaign, segment, metadata, dedupe_key, metrica_status, occurred_at
       )
       VALUES (
         'runtime_lock',
         'system',
         'telegram_poll',
         $1,
         jsonb_build_object(
           'owner', $2::text,
           'lease_until', (NOW() + ($3::text || ' milliseconds')::interval)::text,
           'acquired_at', NOW()::text
         ),
         $4,
         'skipped',
         NOW()
       )
       ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO UPDATE
       SET metadata = EXCLUDED.metadata,
           occurred_at = NOW()
       WHERE public.funnel_events.event_type = 'runtime_lock'
         AND COALESCE(
           (public.funnel_events.metadata->>'lease_until')::timestamptz,
           'epoch'::timestamptz
         ) < NOW()
       RETURNING id
     )
     SELECT id FROM acquired`,
    [lockName, owner, leaseMs, leaseKey],
  );
  return res.rows?.[0]?.id ? { acquired: true, owner, leaseKey } : { acquired: false };
}

async function releasePollLease(lockName, owner) {
  if (!owner) return;
  const leaseKey = getPollLeaseKey(lockName);
  await queryWithFreshClient(
    `UPDATE public.funnel_events
        SET metadata = jsonb_set(metadata, '{lease_until}', to_jsonb(NOW()::text), true)
      WHERE dedupe_key = $1
        AND event_type = 'runtime_lock'
        AND metadata->>'owner' = $2`,
    [leaseKey, owner],
  );
}

async function recordPollHeartbeat(lockName, summary = {}) {
  const task = lockName === 'heys-start-bot'
    ? 'telegram_start_poll'
    : lockName === 'heys-curator-bot'
      ? 'telegram_curator_poll'
      : 'telegram_client_poll';
  try {
    await queryWithFreshClient(
      `INSERT INTO public.maintenance_heartbeat (task, last_ok_at, stale_alerted_at, max_silence)
         VALUES ($1, now(), NULL, interval '3 minutes')
       ON CONFLICT (task) DO UPDATE
         SET last_ok_at = now(),
             stale_alerted_at = NULL,
             max_silence = interval '3 minutes'`,
      [task],
    );
    console.log(`[${lockName}] heartbeat ok`, JSON.stringify(summary));
  } catch (e) {
    console.warn(`[${lockName}] heartbeat failed:`, e.message);
  }
}

async function withPollLease(lockName, leaseMs, run) {
  let lease;
  try {
    lease = await acquirePollLease(lockName, leaseMs);
  } catch (e) {
    console.warn(`[${lockName}] poll lease acquire failed:`, e.message);
    return jsonResponse(200, {
      ok: false,
      poll: lockName,
      skipped: 'lease_unavailable',
      processed: 0,
      delivered: 0,
    });
  }

  if (!lease.acquired) {
    console.warn(`[${lockName}] poll skipped: previous poll lease is still active`);
    return jsonResponse(200, {
      ok: true,
      poll: lockName,
      skipped: 'poll_already_running',
      processed: 0,
      delivered: 0,
    });
  }

  try {
    return await run();
  } finally {
    await releasePollLease(lockName, lease.owner).catch((e) => {
      console.warn(`[${lockName}] poll lease release failed:`, e.message);
    });
  }
}

async function deliverTelegramMethodResponse(response, bot = 'start') {
  if (!response || response.statusCode !== 200 || !response.body) return false;
  let payload = null;
  try {
    payload = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
  } catch {
    return false;
  }
  const method = payload?.method;
  if (!method || typeof method !== 'string') return false;

  const { method: _method, ...body } = payload;
  try {
    await ensureRuntimeConfig();
    await tgRequest(method, body, bot);
    return true;
  } catch (e) {
    console.warn(`[${bot}] direct ${method} failed:`, e.message);
    return false;
  }
}

function clientBotMessageResponse(chatId, text, opts = {}) {
  return telegramMethodResponse('sendMessage', {
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
    return clientBotMessageResponse(
      chatId,
        'Здравствуйте. Это клиентский бот HEYS для привязки Telegram и важных уведомлений.\n\n' +
        'Для входа откройте персональную ссылку, которую прислал куратор.',
    );
  }

  // Простая проверка формата UUID
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pinToken)) {
    return clientBotMessageResponse(chatId, '⚠️ Ссылка некорректна. Попросите куратора прислать новую.');
  }

  await ensureRuntimeConfig();

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
      return clientBotMessageResponse(
        chatId,
        '❌ Ссылка не найдена или уже использована другим аккаунтом.\n' +
          'Попросите куратора прислать новую.',
      );
    } else if (dbResult.error === 'token_expired') {
      return clientBotMessageResponse(
        chatId,
        '⏰ Ссылка истекла (срок действия — 7 дней).\n' +
          'Попросите куратора прислать новую.',
      );
    }
    return clientBotMessageResponse(chatId, '❌ Не удалось обработать ссылку. Свяжитесь с куратором.');
  }

  // Сообщение с PLAIN-ссылкой (без inline-keyboard кнопки).
  // На iOS Telegram при долгом тапе на ссылку даёт выбор «Открыть в Safari»,
  // что нужно для добавления PWA на главный экран. Inline-keyboard кнопки
  // открываются только во встроенном Telegram-браузере, откуда PWA не ставится.
  const name = dbResult.name || 'там';
  return clientBotMessageResponse(
    chatId,
    `Здравствуйте, <b>${escapeHtml(name)}</b>.\n\n` +
      'Это клиентский бот HEYS. Он привязывает ваш Telegram к приложению и отправляет важные уведомления по триалу и подписке.\n\n' +
      '<b>Откройте приложение:</b>\n' +
      `<a href="${APP_URL}">${APP_URL}</a>\n\n` +
      '<i>iPhone:</i> зажмите ссылку → «Открыть в Safari» → меню «Поделиться» → «На экран «Домой»». Так HEYS поставится как иконка-приложение.\n\n' +
      '<i>Android:</i> зажмите ссылку → «Открыть в Chrome» → меню «⋮» → «Установить приложение».\n\n' +
      'В приложении войдите по телефону и PIN из сообщения куратора. Если PIN потерялся, напишите куратору.',
  );
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─────────────────────────────────────────────────────────────────────────────
// HEYS Старт — квиз «Твой тип срыва»
// Отдельный Telegram bot token: HEYS_START_BOT_TOKEN.
// Старый PIN/notification bot остаётся на TELEGRAM_CLIENT_BOT_TOKEN.
// ─────────────────────────────────────────────────────────────────────────────

const START_BOT = 'start';

const QUIZ_QUESTIONS = [
  {
    id: 'time',
    text: 'Когда чаще всего сложнее удержать режим?',
    answers: [
      ['m', 'Утром'],
      ['d', 'Днём'],
      ['e', 'Вечером'],
      ['n', 'Ночью'],
      ['x', 'По-разному'],
    ],
  },
  {
    id: 'trigger',
    text: 'Что чаще всего запускает срыв?',
    answers: [
      ['s', 'Стресс или эмоции'],
      ['f', 'Усталость или недосып'],
      ['c', 'Компания, кафе, праздник'],
      ['a', 'Один промах — и режим уже не важен'],
      ['u', 'Не понимаю'],
    ],
  },
  {
    id: 'frequency',
    text: 'Как часто это повторяется?',
    answers: [
      ['d', 'Почти каждый день'],
      ['w', 'Несколько раз в неделю'],
      ['e', 'В основном по выходным'],
      ['r', 'Редко, но сильно'],
    ],
  },
  {
    id: 'past_method',
    text: 'Что вы уже пробовали?',
    answers: [
      ['d', 'Диеты или марафоны'],
      ['t', 'Трекер калорий'],
      ['s', 'Самостоятельно, понемногу'],
      ['n', 'Ничего системного'],
    ],
  },
  {
    id: 'barrier',
    text: 'Что сложнее всего сейчас?',
    answers: [
      ['r', 'Вести рутину'],
      ['s', 'Оставаться без поддержки'],
      ['t', 'Найти время'],
      ['a', 'Знаю, что делать, но не удерживаю'],
    ],
  },
  {
    id: 'goal',
    text: 'Что важнее на ближайший месяц?',
    answers: [
      ['w', 'Снизить вес'],
      ['m', 'Удержать результат'],
      ['n', 'Разобраться в питании'],
      ['f', 'Снизить количество срывов'],
    ],
  },
];

const RESULT_COPY = {
  evening: {
    title: 'Вечерний паттерн',
    body:
      'К вечеру может накапливаться усталость и дневной недобор. Организм ищет быстрый способ восстановить энергию.',
    tip: 'Первый шаг: не урезать день в ноль. Ровный завтрак и обед часто снижают вечерние срывы.',
  },
  emotional: {
    title: 'Эмоциональный паттерн',
    body:
      'Еда становится быстрым способом снять напряжение. Важен не запрет, а момент, когда напряжение начинает расти.',
    tip: 'Первый шаг: за несколько минут до срыва сделать паузу и отметить, что именно стало триггером.',
  },
  social: {
    title: 'Социальный паттерн',
    body:
      'Срыв чаще запускает среда: компания, кафе, праздник или поездка. Здесь обычно помогает подготовка заранее.',
    tip: 'Первый шаг: выбирать блюдо до того, как вы сядете за стол.',
  },
  all_or_nothing: {
    title: 'Паттерн «всё или ничего»',
    body:
      'Один промах ощущается как провал всего режима. Но один приём пищи редко решает неделю; важнее следующий шаг.',
    tip: 'Первый шаг: возвращаться к режиму со следующего приёма, а не ждать понедельника.',
  },
  fatigue: {
    title: 'Уставший паттерн',
    body:
      'Недосып и перегруз могут усиливать голод и тягу к быстрым углеводам. Это вопрос режима, а не слабости.',
    tip: 'Первый шаг: проверить сон, воду и нагрузку перед тем, как ужесточать питание.',
  },
  mixed: {
    title: 'Смешанный паттерн',
    body:
      'Похоже, срыв запускает не один фактор, а сочетание режима, усталости и контекста.',
    tip: 'Первый шаг: заметить первый сигнал, что режим сейчас может сорваться.',
  },
};

function sanitizeSource(payload) {
  return String(payload || 'organic')
    .replace(/^src_/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 24) || 'organic';
}

function hashTelegramChatId(chatId) {
  return crypto
    .createHash('sha256')
    .update(`heys-start:${String(chatId)}`)
    .digest('hex')
    .slice(0, 32);
}

function normalizePhone(phone) {
  let digits = String(phone || '').replace(/[^\d+]/g, '').replace(/^\+/, '');
  if (digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (!digits.startsWith('7')) digits = `7${digits}`;
  return `+${digits}`;
}

function looksLikePhone(text) {
  return String(text || '').replace(/\D/g, '').length >= 10;
}

function cleanOptionalText(value, maxLength = 128) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
}

function encodeQuizData(step, answers, source) {
  return ['qs', step, answers.join(','), sanitizeSource(source)].join('|');
}

function decodeQuizData(data) {
  const [, stepRaw, answersRaw = '', sourceRaw = 'organic'] = String(data || '').split('|');
  return {
    step: Number(stepRaw),
    answers: answersRaw ? answersRaw.split(',').filter(Boolean) : [],
    source: sanitizeSource(sourceRaw),
  };
}

function buildInlineKeyboard(question, step, answers, source) {
  return {
    inline_keyboard: question.answers.map(([value, label]) => [
      {
        text: label,
        callback_data: encodeQuizData(step + 1, [...answers, value], source),
      },
    ]),
  };
}

function getAnswerMap(answers) {
  const map = {};
  QUIZ_QUESTIONS.forEach((q, i) => {
    map[q.id] = answers[i] || null;
  });
  return map;
}

function getQuizSegment(answers) {
  const a = getAnswerMap(answers);
  if (a.trigger === 's') return 'emotional';
  if (a.trigger === 'f') return 'fatigue';
  if (a.trigger === 'c') return 'social';
  if (a.trigger === 'a') return 'all_or_nothing';
  if (a.trigger === 'u' && (a.time === 'e' || a.time === 'n')) return 'evening';
  return 'mixed';
}

function getQuizSummary(answers) {
  const a = getAnswerMap(answers);
  const labelFor = (questionId) => {
    const question = QUIZ_QUESTIONS.find((q) => q.id === questionId);
    const answer = question?.answers.find(([value]) => value === a[questionId]);
    return answer ? answer[1] : null;
  };
  return {
    frequency_code: a.frequency,
    frequency: labelFor('frequency'),
    past_method_code: a.past_method,
    past_method: labelFor('past_method'),
    barrier_code: a.barrier,
    barrier: labelFor('barrier'),
    goal_code: a.goal,
    goal: labelFor('goal'),
  };
}

async function recordStartFunnelEvent(eventType, opts = {}) {
  let client = null;
  try {
    await initSecrets();
    const pool = getPool();
    client = await pool.connect();
    await client.query(
      `SELECT public.record_funnel_event(
         $1::text, $2::uuid, $3::uuid, $4::text, $5::text, $6::text, $7::text,
         $8::text, $9::jsonb, $10::text, $11::timestamptz
       )`,
      [
        eventType,
        null,
        null,
        opts.source || 'telegram',
        'heys_start',
        opts.segment || null,
        null,
        null,
        JSON.stringify(opts.metadata || {}),
        opts.dedupeKey || null,
        new Date().toISOString(),
      ],
    );
  } catch (e) {
    console.warn('[HEYS Start] funnel event failed:', eventType, e.message);
  } finally {
    if (client) client.release();
  }
}

async function sendStartLeadHandoff(lead) {
  await initSecrets();
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    console.log('[HEYS Start] curator handoff skipped: TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID not configured');
    return;
  }

  const lines = [
    '🆕 HEYS Старт: заявка на неделю',
    '',
    `lead_id: ${lead.id}`,
    `source: ${lead.source || 'unknown'}`,
    `segment: ${lead.segment || 'unknown'}`,
    `readiness: ${lead.readiness || 'unknown'}`,
  ];
  if (lead.frequency) lines.push(`frequency: ${lead.frequency}`);
  if (lead.barrier) lines.push(`barrier: ${lead.barrier}`);
  if (lead.goal) lines.push(`goal: ${lead.goal}`);
  lines.push('', 'ПДн не отправлены в Telegram. Полные данные — в PostgreSQL РФ.');

  try {
    const response = await fetchWithTimeout(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join('\n'),
        disable_web_page_preview: true,
      }),
    });
    const result = await response.json().catch(() => ({}));
    console.log('[HEYS Start] curator handoff sent:', !!result.ok);
  } catch (error) {
    console.warn('[HEYS Start] curator handoff failed:', error.message);
  }
}

const LEAD_TAKEN_CALLBACK_RE = /^lead_taken_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function getCuratorUserAllowlist() {
  return new Set(
    String(process.env.TELEGRAM_CURATOR_USER_IDS || '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => /^-?\d+$/.test(value)),
  );
}

function isAuthorizedCuratorCallback(query) {
  const configuredChatId = String(process.env.TELEGRAM_CHAT_ID || '').trim();
  const chatId = String(query?.message?.chat?.id || '').trim();
  const actorId = String(query?.from?.id || '').trim();
  if (!configuredChatId || !chatId || !actorId || chatId !== configuredChatId) return false;

  const allowlist = getCuratorUserAllowlist();
  if (allowlist.size > 0) return allowlist.has(actorId);

  return query?.message?.chat?.type === 'private' && actorId === chatId;
}

function getCuratorActorLabel(from) {
  const username = String(from?.username || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32);
  if (username) return `@${username}`;
  const firstName = String(from?.first_name || '').trim().slice(0, 64);
  return firstName ? escapeHtml(firstName) : 'куратор';
}

async function claimLeadForCurator(leadId) {
  const client = await getPool().connect();
  try {
    const updated = await client.query(
      `UPDATE public.leads
          SET status = 'contacted',
              contacted_at = COALESCE(contacted_at, NOW()),
              updated_at = NOW()
        WHERE id = $1::uuid
          AND status = 'new'
      RETURNING id, status, contacted_at`,
      [leadId],
    );
    if (updated.rows?.[0]) {
      return { outcome: 'claimed', ...updated.rows[0] };
    }

    const existing = await client.query(
      `SELECT id, status, contacted_at
         FROM public.leads
        WHERE id = $1::uuid`,
      [leadId],
    );
    const lead = existing.rows?.[0];
    if (!lead) return { outcome: 'not_found' };
    if (lead.status === 'contacted') return { outcome: 'already_claimed', ...lead };
    return { outcome: 'status_conflict', ...lead };
  } finally {
    client.release();
  }
}

async function editClaimedLeadMessage(query, claim) {
  const originalText = String(query?.message?.text || '').trim().slice(0, 3500);
  const actor = getCuratorActorLabel(query?.from);
  const contactedAt = new Date(claim?.contacted_at || Date.now()).toISOString();
  const text = `${escapeHtml(originalText)}\n\n✅ <b>В работе</b>\nКуратор: ${actor}\nВремя: ${contactedAt}`;
  await tgRequest('editMessageText', {
    chat_id: query.message.chat.id,
    message_id: query.message.message_id,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [] },
  }, 'curator');
}

async function handleCuratorLeadCallback(query) {
  await ensureRuntimeConfig();
  const acknowledge = (text, showAlert = false) => answerCallbackQueryFast(
    query?.id,
    'curator',
    { text: String(text).slice(0, 180), show_alert: showAlert },
  );

  if (!query?.id) return { outcome: 'missing_callback_id' };
  if (!isAuthorizedCuratorCallback(query)) {
    await acknowledge('Действие доступно только авторизованному куратору.', true);
    return { outcome: 'forbidden' };
  }

  const match = LEAD_TAKEN_CALLBACK_RE.exec(String(query?.data || ''));
  if (!match || !query?.message?.message_id) {
    await acknowledge('Кнопка некорректна или устарела.', true);
    return { outcome: 'malformed' };
  }

  try {
    const claim = await claimLeadForCurator(match[1]);
    if (claim.outcome === 'claimed') {
      await acknowledge('Лид взят в работу.');
      try {
        await editClaimedLeadMessage(query, claim);
      } catch (error) {
        console.warn('[Curator Bot] lead message edit failed:', error.message);
      }
      return claim;
    }
    if (claim.outcome === 'already_claimed') {
      await acknowledge('Лид уже взят в работу.');
      return claim;
    }
    if (claim.outcome === 'not_found') {
      await acknowledge('Лид не найден.', true);
      return claim;
    }

    await acknowledge('Статус лида уже изменён. Обновите очередь.', true);
    return claim;
  } catch (error) {
    console.warn('[Curator Bot] lead claim failed:', error.message);
    await acknowledge('Не удалось обновить лид. Попробуйте ещё раз.', true);
    return { outcome: 'error' };
  }
}

async function handleCuratorBotUpdate(update) {
  if (!update?.callback_query) return { outcome: 'ignored' };
  if (!String(update.callback_query.data || '').startsWith('lead_taken_')) {
    await ensureRuntimeConfig();
    await answerCallbackQueryFast(update.callback_query.id, 'curator', {
      text: 'Кнопка не поддерживается.',
      show_alert: true,
    });
    return { outcome: 'unsupported' };
  }
  return handleCuratorLeadCallback(update.callback_query);
}

function queueStartLeadHandoff(lead) {
  setTimeout(() => {
    sendStartLeadHandoff(lead).catch((e) => {
      console.warn('[HEYS Start] curator handoff async failed:', e.message);
    });
  }, 0);
}

async function createStartLeadFromContact(chatId, phone, displayName = 'Telegram lead') {
  await ensureRuntimeConfig();
  const pool = getPool();
  const client = await pool.connect();
  const normalizedPhone = normalizePhone(phone);
  const chatHash = hashTelegramChatId(chatId);
  const privacyVersion = process.env.PRIVACY_POLICY_VERSION || '1.5';

  try {
    await client.query('BEGIN');

    const stateRes = await client.query(
      `SELECT id, lead_id, source, campaign, segment, metadata
         FROM public.funnel_events
        WHERE event_type = 'week_request'
          AND metadata->>'chat_hash' = $1
        ORDER BY occurred_at DESC
        LIMIT 1`,
      [chatHash],
    );
    const state = stateRes.rows?.[0];
    if (!state) {
      await client.query('ROLLBACK');
      return { success: false, error: 'no_week_request' };
    }

    const metadata = state.metadata || {};
    const stateLeadId = state.lead_id || null;
    let leadId = stateLeadId;
    if (!leadId) {
      const existingRes = await client.query(
        `SELECT id
           FROM public.leads
          WHERE phone = $1
            AND status IN ('new', 'contacted', 'trial_started')
          ORDER BY created_at DESC
          LIMIT 1`,
        [normalizedPhone],
      );
      leadId = existingRes.rows?.[0]?.id;
    }

    if (!leadId) {
      const insertRes = await client.query(
        `INSERT INTO public.leads (
           name, phone, messenger,
           utm_source, utm_medium, utm_campaign,
           quiz_segment, readiness, how_heard,
           landing_page, consent_privacy_version, consent_accepted_at,
           consent_method, notes
         )
         VALUES (
           $1, $2, 'telegram',
           $3, 'bot', $4,
           $5, $6, 'telegram_bot',
           'https://t.me/heys_start_bot', $7, NOW(),
           'telegram_contact',
           $8
         )
         RETURNING id`,
        [
          cleanOptionalText(displayName, 120) || 'Telegram lead',
          normalizedPhone,
          state.source || 'telegram',
          state.campaign || 'heys_start',
          state.segment || null,
          metadata.readiness || null,
          privacyVersion,
          [
            'HEYS Start handoff',
            `segment=${state.segment || 'unknown'}`,
            `readiness=${metadata.readiness || 'unknown'}`,
            `frequency=${metadata.frequency || 'unknown'}`,
            `barrier=${metadata.barrier || 'unknown'}`,
            `goal=${metadata.goal || 'unknown'}`,
          ].join('; '),
        ],
      );
      leadId = insertRes.rows?.[0]?.id;
    }

    await client.query(
      `UPDATE public.funnel_events
          SET lead_id = $1
        WHERE id = $2
          AND lead_id IS NULL`,
      [leadId, state.id],
    );

    await client.query(
      `SELECT public.record_funnel_event(
         $1::text, $2::uuid, $3::uuid, $4::text, $5::text, $6::text, $7::text,
         $8::text, $9::jsonb, $10::text, $11::timestamptz
       )`,
      [
        'lead',
        leadId,
        null,
        state.source || 'telegram',
        state.campaign || 'heys_start',
        state.segment || null,
        null,
        null,
        JSON.stringify({
          bot: 'heys_start',
          handoff: true,
          readiness: metadata.readiness || null,
          frequency: metadata.frequency || null,
          barrier: metadata.barrier || null,
          goal: metadata.goal || null,
        }),
        `lead:start:${leadId}`,
        new Date().toISOString(),
      ],
    );

    await client.query('COMMIT');

    const lead = {
      id: leadId,
      source: state.source || 'telegram',
      segment: state.segment || null,
      readiness: metadata.readiness || null,
      frequency: metadata.frequency || null,
      barrier: metadata.barrier || null,
      goal: metadata.goal || null,
    };
    if (stateLeadId) {
      console.log('[HEYS Start] curator handoff skipped: week_request already linked to lead');
    } else {
      queueStartLeadHandoff(lead);
    }
    return { success: true, lead };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.warn('[HEYS Start] lead handoff failed:', e.message);
    return { success: false, error: 'handoff_failed' };
  } finally {
    client.release();
  }
}

function queueStartFunnelEvent(eventType, opts = {}) {
  recordStartFunnelEvent(eventType, opts).catch((e) => {
    console.warn('[HEYS Start] funnel event async failed:', eventType, e.message);
  });
}

function sendQuizQuestion(chatId, step, answers, source, editMessageId = null) {
  const question = QUIZ_QUESTIONS[step];
  const text = `<b>${step + 1}/${QUIZ_QUESTIONS.length}</b>\n${escapeHtml(question.text)}`;
  const reply_markup = buildInlineKeyboard(question, step, answers, source);

  if (editMessageId) {
    return telegramMethodResponse('editMessageText', {
      chat_id: chatId,
      message_id: editMessageId,
      text,
      parse_mode: 'HTML',
      reply_markup,
    });
  }

  return telegramMethodResponse('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup,
  });
}

function sendQuizResult(chatId, answers, source, editMessageId = null) {
  const segment = getQuizSegment(answers);
  const result = RESULT_COPY[segment] || RESULT_COPY.mixed;
  const summary = getQuizSummary(answers);
  const chatHash = hashTelegramChatId(chatId);
  const text =
    `<b>${escapeHtml(result.title)}</b>\n\n` +
    `${escapeHtml(result.body)}\n\n` +
    `${escapeHtml(result.tip)}\n\n` +
    'HEYS помогает собрать питание, режим и контекст в одну картину. ' +
    'Куратор видит паттерны недели и помогает выбрать первый устойчивый шаг.\n\n' +
    'Хотите разобрать ваш случай на бесплатной неделе?';

  const reply_markup = {
    inline_keyboard: [
      [{ text: 'Записаться на неделю', callback_data: `qa|week|${answers.join(',')}|${sanitizeSource(source)}` }],
      [{ text: 'Пока просто почитаю', callback_data: `qa|read|${answers.join(',')}|${sanitizeSource(source)}` }],
    ],
  };

  queueStartFunnelEvent('quiz_complete', {
    source,
    segment,
    metadata: {
      bot: 'heys_start',
      ...summary,
    },
    dedupeKey: `quiz_complete:start:${chatHash}:${answers.join('-')}`,
  });

  if (editMessageId) {
    return telegramMethodResponse('editMessageText', {
      chat_id: chatId,
      message_id: editMessageId,
      text,
      parse_mode: 'HTML',
      reply_markup,
    });
  }

  return telegramMethodResponse('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup,
  });
}

function handleStartBotStart(chatId, payload) {
  const source = sanitizeSource(payload);

  return telegramMethodResponse('sendMessage', {
    chat_id: chatId,
    text: 'Здравствуйте. За одну минуту покажем, какой паттерн чаще всего мешает удерживать режим, и что можно сделать первым шагом.',
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [[{ text: 'Начать', callback_data: encodeQuizData(0, [], source) }]],
    },
  });
}

async function handleStartBotCallback(query) {
  const chatId = query?.message?.chat?.id;
  const messageId = query?.message?.message_id;
  const data = query?.data || '';

  if (!chatId || !messageId) return jsonResponse(200, { ok: true });
  await ensureRuntimeConfig();
  await answerCallbackQueryFast(query.id, START_BOT);

  if (data.startsWith('qs|')) {
    const state = decodeQuizData(data);
    if (!Number.isFinite(state.step) || state.step < 0) return jsonResponse(200, { ok: true });
    if (state.step >= QUIZ_QUESTIONS.length) {
      return sendQuizResult(chatId, state.answers, state.source);
    }
    return sendQuizQuestion(chatId, state.step, state.answers, state.source);
  }

  if (data.startsWith('qa|')) {
    const [, action, answersRaw = '', sourceRaw = 'organic'] = data.split('|');
    const answers = answersRaw ? answersRaw.split(',').filter(Boolean) : [];
    const source = sanitizeSource(sourceRaw);

    if (action === 'week') {
      return telegramMethodResponse('sendMessage', {
        chat_id: chatId,
        text:
          'Спасибо. Первая неделя проходит без карты и по свободной ёмкости куратора.\n\n' +
          'Следующий шаг: отправьте, пожалуйста, контакт в этом чате или напишите, когда вам удобнее начать: на этой неделе или на следующей.',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'На этой неделе', callback_data: `qr|this_week|${answers.join(',')}|${source}` }],
            [{ text: 'На следующей', callback_data: `qr|next_week|${answers.join(',')}|${source}` }],
          ],
        },
      });
    }

    return telegramMethodResponse('sendMessage', {
      chat_id: chatId,
      text:
        'Хорошо. Можно вернуться к разбору позже: отправьте /start, когда будете готовы.',
    });
  }

  if (data.startsWith('qr|')) {
    const [, readiness, answersRaw = '', sourceRaw = 'organic'] = data.split('|');
    const answers = answersRaw ? answersRaw.split(',').filter(Boolean) : [];
    const source = sanitizeSource(sourceRaw);
    const segment = getQuizSegment(answers);
    const chatHash = hashTelegramChatId(chatId);
    queueStartFunnelEvent('week_request', {
      source,
      segment,
      metadata: {
        bot: 'heys_start',
        readiness,
        chat_hash: chatHash,
        ...getQuizSummary(answers),
      },
      dedupeKey: `week_request:start:${chatHash}:${readiness}:${answers.join('-')}`,
    });
    return telegramMethodResponse('sendMessage', {
      chat_id: chatId,
      text:
        'Принято. Чтобы куратор мог связаться с вами по заявке, отправьте номер телефона.\n\n' +
        'Нажимая кнопку или отправляя номер, вы соглашаетесь на обработку контактных данных для связи по бесплатной неделе HEYS.',
      reply_markup: {
        keyboard: [[{ text: 'Отправить телефон', request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  }

  return jsonResponse(200, { ok: true });
}

async function handleStartBotWebhook(body) {
  const directOk = async (response) => {
    const delivered = await deliverTelegramMethodResponse(response, START_BOT);
    return jsonResponse(200, { ok: true, delivered });
  };

  const callbackQuery = body?.callback_query;
  if (callbackQuery) {
    try {
      return directOk(await handleStartBotCallback(callbackQuery));
    } catch (e) {
      console.error('[HEYS Start] callback error:', e.message);
    }
    return jsonResponse(200, { ok: true });
  }

  const message = body?.message;
  if (!message || !message.chat || !message.chat.id) {
    return jsonResponse(200, { ok: true, ignored: 'no-message' });
  }

  const chatId = message.chat.id;
  const text = (message.text || '').trim();

  try {
    if (text.startsWith('/start')) {
      const payload = text.replace(/^\/start\s*/, '');
      return directOk(handleStartBotStart(chatId, payload));
    } else if (message.contact?.phone_number || looksLikePhone(text)) {
      const contact = message.contact;
      const phone = contact?.phone_number || text;
      const firstName = contact?.first_name || message.from?.first_name || '';
      const lastName = contact?.last_name || message.from?.last_name || '';
      const displayName = `${firstName} ${lastName}`.trim() || 'Telegram lead';
      const result = await createStartLeadFromContact(chatId, phone, displayName);
      if (!result.success && result.error === 'no_week_request') {
        return directOk(telegramMethodResponse('sendMessage', {
          chat_id: chatId,
          text: 'Сначала пройдите короткий разбор: отправьте /start.',
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }));
      }
      if (!result.success) {
        return directOk(telegramMethodResponse('sendMessage', {
          chat_id: chatId,
          text: 'Не удалось сохранить заявку. Попробуйте ещё раз или отправьте /start.',
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }));
      }
      return directOk(telegramMethodResponse('sendMessage', {
        chat_id: chatId,
        text:
          'Спасибо. Заявка сохранена: куратор знакомится с ней и связывается с вами, когда есть свободное место для старта.',
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: { remove_keyboard: true },
      }));
    } else if (text === '/help' || text === '/menu') {
      return directOk(telegramMethodResponse('sendMessage', {
        chat_id: chatId,
        text: 'HEYS Старт помогает пройти короткий разбор «Твой тип срыва». Отправьте /start, чтобы начать.',
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }));
    } else {
      return directOk(telegramMethodResponse('sendMessage', {
        chat_id: chatId,
        text: 'Чтобы пройти короткий разбор, отправьте /start.',
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }));
    }
  } catch (e) {
    console.error('[HEYS Start] webhook handler error:', e.message);
  }

  return jsonResponse(200, { ok: true });
}

function getTelegramPollWindowMs(payload = {}, envKey = 'HEYS_START_POLL_WINDOW_MS') {
  const value = Number(payload.window_ms || process.env[envKey]);
  if (Number.isFinite(value) && value > 0) return Math.min(value, 55000);
  return DEFAULT_START_BOT_POLL_WINDOW_MS;
}

async function handleStartBotPoll(payload = {}) {
  await ensureRuntimeConfig();
  const leaseMs = getTelegramPollWindowMs(payload, 'HEYS_START_POLL_WINDOW_MS') + POLL_LEASE_SAFETY_MS;
  return withPollLease('heys-start-bot', leaseMs, async () => {
    const curatorTask = CURATOR_API
      ? runCuratorBotPoll(payload)
      : Promise.resolve(jsonResponse(200, {
        ok: false,
        poll: 'heys-curator-bot',
        skipped: 'token_not_configured',
        processed: 0,
        delivered: 0,
        telegram_ok: false,
      }));
    const [startResponse, curatorResponse] = await Promise.all([
      runStartBotPoll(payload),
      curatorTask,
    ]);
    const startBody = parseMaybeJson(startResponse?.body) || {};
    const curatorBody = parseMaybeJson(curatorResponse?.body) || {};
    if (startBody.telegram_ok) {
      await recordPollHeartbeat('heys-start-bot', startBody);
    }
    if (curatorBody.telegram_ok) {
      await recordPollHeartbeat('heys-curator-bot', curatorBody);
    }
    return jsonResponse(startResponse?.statusCode || 200, {
      ...startBody,
      curator: curatorBody,
    });
  });
}

async function runStartBotPoll(payload = {}) {
  const startedAt = Date.now();
  const deadline = startedAt + getTelegramPollWindowMs(payload, 'HEYS_START_POLL_WINDOW_MS');
  let processed = 0;
  let delivered = 0;
  let lastUpdateId = null;
  let getUpdatesOk = false;

  while (Date.now() + 1500 < deadline) {
    const remainingMs = deadline - Date.now();
    const timeoutSec = Math.max(
      1,
      Math.min(BOT_GET_UPDATES_MAX_TIMEOUT_SEC, Math.floor((remainingMs - 1000) / 1000)),
    );
    let updates = [];
    try {
      updates = await tgRequest('getUpdates', {
        timeout: timeoutSec,
        limit: 20,
        allowed_updates: ['message', 'callback_query'],
      }, START_BOT, (timeoutSec + 3) * 1000);
      getUpdatesOk = true;
    } catch (e) {
      console.warn('[HEYS Start] poll getUpdates failed:', e.message);
      if (Date.now() + 1500 >= deadline) break;
      await sleep(750);
      continue;
    }

    if (!Array.isArray(updates) || updates.length === 0) continue;

    for (const update of updates) {
      if (Number.isFinite(update?.update_id)) {
        lastUpdateId = Math.max(lastUpdateId ?? update.update_id, update.update_id);
      }
      const result = await handleStartBotWebhook(update);
      const body = parseMaybeJson(result?.body);
      processed += 1;
      if (body?.delivered) delivered += 1;
    }

    if (lastUpdateId !== null) {
      try {
        await tgRequest('getUpdates', {
          offset: lastUpdateId + 1,
          timeout: 0,
          limit: 1,
          allowed_updates: ['message', 'callback_query'],
        }, START_BOT);
      } catch (e) {
        console.warn('[HEYS Start] poll offset commit failed:', e.message);
      }
    }
  }

  const durationMs = Date.now() - startedAt;
  return jsonResponse(200, {
    ok: true,
    poll: 'heys-start-bot',
    processed,
    delivered,
    duration_ms: durationMs,
    telegram_ok: getUpdatesOk,
  });
}

async function runCuratorBotPoll(payload = {}) {
  const startedAt = Date.now();
  const deadline = startedAt + getTelegramPollWindowMs(payload, 'TELEGRAM_CURATOR_POLL_WINDOW_MS');
  let processed = 0;
  let delivered = 0;
  let lastUpdateId = null;
  let getUpdatesOk = false;

  while (Date.now() + 1500 < deadline) {
    const remainingMs = deadline - Date.now();
    const timeoutSec = Math.max(
      1,
      Math.min(BOT_GET_UPDATES_MAX_TIMEOUT_SEC, Math.floor((remainingMs - 1000) / 1000)),
    );
    let updates = [];
    try {
      updates = await tgRequest('getUpdates', {
        timeout: timeoutSec,
        limit: 20,
        allowed_updates: ['callback_query'],
      }, 'curator', (timeoutSec + 3) * 1000);
      getUpdatesOk = true;
    } catch (e) {
      console.warn('[Curator Bot] poll getUpdates failed:', e.message);
      if (Date.now() + 1500 >= deadline) break;
      await sleep(750);
      continue;
    }

    if (!Array.isArray(updates) || updates.length === 0) continue;

    for (const update of updates) {
      if (Number.isFinite(update?.update_id)) {
        lastUpdateId = Math.max(lastUpdateId ?? update.update_id, update.update_id);
      }
      const outcome = await handleCuratorBotUpdate(update);
      processed += 1;
      if (outcome?.outcome !== 'ignored') delivered += 1;
    }

    if (lastUpdateId !== null) {
      try {
        await tgRequest('getUpdates', {
          offset: lastUpdateId + 1,
          timeout: 0,
          limit: 1,
          allowed_updates: ['callback_query'],
        }, 'curator');
      } catch (e) {
        console.warn('[Curator Bot] poll offset commit failed:', e.message);
      }
    }
  }

  const durationMs = Date.now() - startedAt;
  return jsonResponse(200, {
    ok: true,
    poll: 'heys-curator-bot',
    processed,
    delivered,
    duration_ms: durationMs,
    telegram_ok: getUpdatesOk,
  });
}

async function handleClientBotPoll(payload = {}) {
  await ensureRuntimeConfig();
  const leaseMs = getTelegramPollWindowMs(payload, 'TELEGRAM_CLIENT_POLL_WINDOW_MS') + POLL_LEASE_SAFETY_MS;
  return withPollLease('heys-client-bot', leaseMs, () => runClientBotPoll(payload));
}

async function runClientBotPoll(payload = {}) {
  const startedAt = Date.now();
  const deadline = startedAt + getTelegramPollWindowMs(payload, 'TELEGRAM_CLIENT_POLL_WINDOW_MS');
  let processed = 0;
  let delivered = 0;
  let lastUpdateId = null;
  let getUpdatesOk = false;

  while (Date.now() + 1500 < deadline) {
    const remainingMs = deadline - Date.now();
    const timeoutSec = Math.max(
      1,
      Math.min(BOT_GET_UPDATES_MAX_TIMEOUT_SEC, Math.floor((remainingMs - 1000) / 1000)),
    );
    let updates = [];
    try {
      updates = await tgRequest('getUpdates', {
        timeout: timeoutSec,
        limit: 20,
        allowed_updates: ['message'],
      }, 'client', (timeoutSec + 3) * 1000);
      getUpdatesOk = true;
    } catch (e) {
      console.warn('[BOT] client poll getUpdates failed:', e.message);
      if (Date.now() + 1500 >= deadline) break;
      await sleep(750);
      continue;
    }

    if (!Array.isArray(updates) || updates.length === 0) continue;

    for (const update of updates) {
      if (Number.isFinite(update?.update_id)) {
        lastUpdateId = Math.max(lastUpdateId ?? update.update_id, update.update_id);
      }
      const result = await handleTelegramWebhook(update);
      processed += 1;
      const body = parseMaybeJson(result?.body);
      if (body?.delivered || await deliverTelegramMethodResponse(result, 'client')) delivered += 1;
    }

    if (lastUpdateId !== null) {
      try {
        await tgRequest('getUpdates', {
          offset: lastUpdateId + 1,
          timeout: 0,
          limit: 1,
          allowed_updates: ['message'],
        }, 'client');
      } catch (e) {
        console.warn('[BOT] client poll offset commit failed:', e.message);
      }
    }
  }

  const durationMs = Date.now() - startedAt;
  if (getUpdatesOk) {
    await recordPollHeartbeat('heys-client-bot', { processed, delivered, duration_ms: durationMs });
  }

  return jsonResponse(200, {
    ok: true,
    poll: 'heys-client-bot',
    processed,
    delivered,
    duration_ms: durationMs,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook от Telegram
// ─────────────────────────────────────────────────────────────────────────────

async function handleTelegramWebhook(body) {
  const directOk = async (response) => {
    const delivered = await deliverTelegramMethodResponse(response, 'client');
    return jsonResponse(200, { ok: true, delivered });
  };

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
      const response = await handleStartCommand(chatId, payload);
      if (response) return directOk(response);
    } else if (text === '/help' || text === '/menu') {
      return directOk(clientBotMessageResponse(
        chatId,
          '<b>Доступные команды:</b>\n' +
          '/start &lt;ссылка&gt; — привязать аккаунт\n' +
          '/help — это сообщение\n\n' +
          'PIN и доступ к приложению выдаёт ваш куратор.',
      ));
    } else {
      return directOk(clientBotMessageResponse(chatId, 'Я не понимаю это сообщение. Используйте /help для списка команд.'));
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

  const warmup = getWarmupPayload(event);
  if (warmup?.warmup === 'heys-bot-client' || warmup?.target === 'heys-bot-client') {
    await ensureRuntimeConfig();
    return jsonResponse(200, {
      ok: true,
      warmup: true,
      service: 'heys-bot-client',
    });
  }

  const startBotPoll = getStartBotPollPayload(event);
  if (startBotPoll) {
    return await handleStartBotPoll(startBotPoll);
  }

  const clientBotPoll = getClientBotPollPayload(event);
  if (clientBotPoll) {
    return await handleClientBotPoll(clientBotPoll);
  }

  let body = {};
  if (event?.body) {
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch (e) {
      console.warn('[BOT] body parse failed:', e.message);
    }
  }

  if (method === 'GET' && (path === '/start-bot/health' || path.endsWith('/start-bot/health'))) {
    await ensureRuntimeConfig();
    return jsonResponse(200, {
      service: 'heys-start-bot',
      ok: true,
      hasToken: !!HEYS_START_BOT_TOKEN,
      hasCuratorToken: !!CURATOR_BOT_TOKEN,
      configSource: process.env.LOCKBOX_APP_SECRET_ID ? 'lockbox' : 'env',
    });
  }

  if (method === 'GET' && (path === '/bot/health' || path.endsWith('/bot/health'))) {
    await ensureRuntimeConfig();
    return jsonResponse(200, {
      service: 'heys-bot-client',
      ok: true,
      hasToken: !!TELEGRAM_BOT_TOKEN,
      hasStartToken: !!HEYS_START_BOT_TOKEN,
      hasCuratorToken: !!CURATOR_BOT_TOKEN,
      configSource: process.env.LOCKBOX_APP_SECRET_ID ? 'lockbox' : 'env',
    });
  }

  if (method === 'POST' && (!path || path.includes('/start-bot/webhook'))) {
    if (!verifyWebhookSecret(
      event?.headers || {},
      'HEYS_START_WEBHOOK_SECRET',
      'HEYS_START_WEBHOOK_SECRET_SHA256',
      'HEYS Start',
    )) {
      return jsonResponse(403, { error: 'forbidden' });
    }
    return await handleStartBotWebhook(body);
  }

  if (method === 'POST' && path.includes('/webhook')) {
    // 🛡️ SEC-020 (2026-06-08): verify Telegram secret_token header.
    // Telegram setWebhook позволяет настроить `secret_token` — Telegram потом
    // шлёт его в каждом webhook'е через заголовок `X-Telegram-Bot-Api-Secret-Token`.
    // Без этой проверки любой может слать fake updates (spam users, race
    // claim_pin_token_chat утечённым UUID и т.д.).
    //
    // Fast-path check: in prod we use TELEGRAM_WEBHOOK_SECRET_SHA256 so valid
    // webhook requests do not need Lockbox before the first response byte.
    if (!verifyWebhookSecret(
      event?.headers || {},
      'TELEGRAM_WEBHOOK_SECRET',
      'TELEGRAM_WEBHOOK_SECRET_SHA256',
      'BOT',
    )) {
      return jsonResponse(403, { error: 'forbidden' });
    }
    return await handleTelegramWebhook(body);
  }

  if (method === 'POST' && path.includes('/send')) {
    await ensureRuntimeConfig();
    return await handleInternalSend(body, event?.headers || {});
  }

  return jsonResponse(404, { error: 'not-found', path });
};

module.exports.__test = {
  claimLeadForCurator,
  handleCuratorLeadCallback,
  handleCuratorBotUpdate,
  isAuthorizedCuratorCallback,
};
