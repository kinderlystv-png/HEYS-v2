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
let HEYS_START_BOT_TOKEN = null;
let APP_URL = null;
let INTERNAL_CRON_TOKEN = null;
let TELEGRAM_API = null;
let HEYS_START_API = null;
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
      HEYS_START_BOT_TOKEN = pick('HEYS_START_BOT_TOKEN');
      APP_URL = pick('APP_URL') || 'https://app.heyslab.ru';
      INTERNAL_CRON_TOKEN = pick('INTERNAL_CRON_TOKEN');

      TELEGRAM_API = TELEGRAM_BOT_TOKEN
        ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`
        : null;
      HEYS_START_API = HEYS_START_BOT_TOKEN
        ? `https://api.telegram.org/bot${HEYS_START_BOT_TOKEN}`
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
  return {
    api: TELEGRAM_API,
    tokenName: 'TELEGRAM_CLIENT_BOT_TOKEN',
  };
}

async function tgRequest(method, payload, bot = 'client') {
  const { api, tokenName } = getTelegramApi(bot);
  if (!api) {
    throw new Error(`${tokenName} not configured`);
  }

  const res = await fetch(`${api}/${method}`, {
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

async function sendMessage(chatId, text, opts = {}, bot = 'client') {
  return tgRequest('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...opts,
  }, bot);
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
    dedupeKey: `quiz_complete:start:${chatId}:${answers.join('-')}`,
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
  queueStartFunnelEvent('quiz_start', {
    source,
    metadata: { bot: 'heys_start', start_payload: payload || null },
    dedupeKey: `quiz_start:start:${chatId}:${source}`,
  });

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

function handleStartBotCallback(query) {
  const chatId = query?.message?.chat?.id;
  const messageId = query?.message?.message_id;
  const data = query?.data || '';

  if (!chatId || !messageId) return jsonResponse(200, { ok: true });

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
    queueStartFunnelEvent('week_request', {
      source,
      segment,
      metadata: { bot: 'heys_start', readiness, ...getQuizSummary(answers) },
      dedupeKey: `week_request:start:${chatId}:${readiness}:${answers.join('-')}`,
    });
    return telegramMethodResponse('sendMessage', {
      chat_id: chatId,
      text:
        'Принято. Куратор знакомится с заявкой и связывается с вами, когда есть свободное место для старта.\n\n' +
        'Если хотите ускорить контакт, отправьте номер телефона сообщением в этот чат.',
    });
  }

  return jsonResponse(200, { ok: true });
}

async function handleStartBotWebhook(body) {
  const callbackQuery = body?.callback_query;
  if (callbackQuery) {
    try {
      return handleStartBotCallback(callbackQuery);
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
      return handleStartBotStart(chatId, payload);
    } else if (text === '/help' || text === '/menu') {
      return telegramMethodResponse('sendMessage', {
        chat_id: chatId,
        text: 'HEYS Старт помогает пройти короткий разбор «Твой тип срыва». Отправьте /start, чтобы начать.',
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
    } else {
      return telegramMethodResponse('sendMessage', {
        chat_id: chatId,
        text: 'Чтобы пройти короткий разбор, отправьте /start.',
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
    }
  } catch (e) {
    console.error('[HEYS Start] webhook handler error:', e.message);
  }

  return jsonResponse(200, { ok: true });
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

  if (method === 'GET' && (path === '/start-bot/health' || path.endsWith('/start-bot/health'))) {
    return jsonResponse(200, {
      service: 'heys-start-bot',
      ok: true,
      hasToken: !!HEYS_START_BOT_TOKEN,
      configSource: process.env.LOCKBOX_APP_SECRET_ID ? 'lockbox' : 'env',
    });
  }

  if (method === 'GET' && (path === '/bot/health' || path.endsWith('/bot/health'))) {
    return jsonResponse(200, {
      service: 'heys-bot-client',
      ok: true,
      hasToken: !!TELEGRAM_BOT_TOKEN,
      hasStartToken: !!HEYS_START_BOT_TOKEN,
      configSource: process.env.LOCKBOX_APP_SECRET_ID ? 'lockbox' : 'env',
    });
  }

  if (method === 'POST' && (!path || path.includes('/start-bot/webhook'))) {
    const expected = process.env.HEYS_START_WEBHOOK_SECRET;
    if (expected) {
      const headers = event?.headers || {};
      const provided =
        headers['x-telegram-bot-api-secret-token'] ||
        headers['X-Telegram-Bot-Api-Secret-Token'] ||
        '';
      if (!provided || typeof provided !== 'string') {
        console.warn('[HEYS Start] webhook rejected: missing secret_token header');
        return jsonResponse(403, { error: 'forbidden' });
      }
      const a = Buffer.from(provided, 'utf8');
      const b = Buffer.from(expected, 'utf8');
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        console.warn('[HEYS Start] webhook rejected: secret_token mismatch');
        return jsonResponse(403, { error: 'forbidden' });
      }
    } else {
      console.warn('[HEYS Start] HEYS_START_WEBHOOK_SECRET not set — webhook accepts ANY caller.');
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
