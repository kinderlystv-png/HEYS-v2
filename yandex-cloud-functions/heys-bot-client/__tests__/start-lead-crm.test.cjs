const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Module = require('node:module');
const path = require('node:path');

const MODULE_PATH = path.resolve(__dirname, '../index.js');

function loadHandlerWithDb(rowsByQuery) {
  delete require.cache[MODULE_PATH];

  const queries = [];
  const client = {
    async query(sql, params = []) {
      const text = String(sql);
      queries.push({ sql: text, params });
      for (const rule of rowsByQuery) {
        if (rule.match.test(text)) return { rows: rule.rows };
      }
      if (/INSERT INTO public\.funnel_events[\s\S]+'runtime_lock'/.test(text)) {
        return { rows: [{ id: '99999999-9999-9999-9999-999999999999' }] };
      }
      return { rows: [] };
    },
    release() {},
  };

  const pool = {
    async connect() {
      return client;
    },
  };

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === './shared/db-pool') return { getPool: () => pool };
    if (request === './shared/secrets') return { initSecrets: async () => {} };
    if (request === './shared/lockbox-client') return { getSecret: async () => null };
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return { handler: require(MODULE_PATH).handler, queries };
  } finally {
    Module._load = originalLoad;
  }
}

function startWebhookEvent(body) {
  return {
    path: '/start-bot/webhook',
    httpMethod: 'POST',
    headers: {
      'x-telegram-bot-api-secret-token': 'test-secret',
    },
    body: JSON.stringify(body),
  };
}

function clientBotWebhookEvent(body) {
  return {
    path: '/bot/webhook',
    httpMethod: 'POST',
    headers: {
      'x-telegram-bot-api-secret-token': 'test-secret',
    },
    body: JSON.stringify(body),
  };
}

async function waitFor(condition, timeoutMs = 200) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start >= timeoutMs) return false;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return true;
}

test('timer warmup primes runtime config without touching DB', async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', () => {});
  t.mock.method(global, 'fetch', async () => {
    throw new Error('fetch should not be called');
  });

  const oldEnv = { ...process.env };
  t.after(() => {
    process.env = oldEnv;
    delete require.cache[MODULE_PATH];
  });

  process.env.HEYS_START_BOT_TOKEN = 'start-token';
  process.env.TELEGRAM_CLIENT_BOT_TOKEN = 'client-token';

  const { handler, queries } = loadHandlerWithDb([]);
  const result = await handler({
    messages: [
      {
        details: {
          payload: JSON.stringify({ warmup: 'heys-bot-client' }),
        },
      },
    ],
  });

  assert.equal(result.statusCode, 200);
  assert.deepEqual(JSON.parse(result.body), {
    ok: true,
    warmup: true,
    service: 'heys-bot-client',
  });
  assert.equal(queries.length, 0);
});

test('client bot simple replies use webhook response without Telegram API roundtrip', async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', () => {});
  t.mock.method(global, 'fetch', async () => {
    throw new Error('fetch should not be called');
  });

  const oldEnv = { ...process.env };
  t.after(() => {
    process.env = oldEnv;
    delete require.cache[MODULE_PATH];
  });

  process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';
  process.env.TELEGRAM_CLIENT_BOT_TOKEN = 'client-token';

  const { handler, queries } = loadHandlerWithDb([]);
  const result = await handler(
    clientBotWebhookEvent({
      message: {
        chat: { id: 123456 },
        text: 'hello',
      },
    }),
  );

  assert.equal(result.statusCode, 200);
  const response = JSON.parse(result.body);
  assert.equal(response.method, 'sendMessage');
  assert.equal(response.chat_id, 123456);
  assert.match(response.text, /Используйте \/help/);
  assert.equal(queries.length, 0);
});

test('client bot accepts webhook secret hash without Lockbox on simple replies', async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', () => {});
  t.mock.method(global, 'fetch', async () => {
    throw new Error('fetch should not be called');
  });

  const oldEnv = { ...process.env };
  t.after(() => {
    process.env = oldEnv;
    delete require.cache[MODULE_PATH];
  });

  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  process.env.TELEGRAM_WEBHOOK_SECRET_SHA256 = crypto
    .createHash('sha256')
    .update('test-secret')
    .digest('hex');
  process.env.TELEGRAM_CLIENT_BOT_TOKEN = 'client-token';

  const { handler, queries } = loadHandlerWithDb([]);
  const result = await handler(
    clientBotWebhookEvent({
      message: {
        chat: { id: 123456 },
        text: 'hello',
      },
    }),
  );

  assert.equal(result.statusCode, 200);
  const response = JSON.parse(result.body);
  assert.equal(response.method, 'sendMessage');
  assert.equal(queries.length, 0);
});

test('HEYS Start accepts webhook secret hash without Lockbox on simple replies', async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', () => {});
  const fetchCalls = [];
  t.mock.method(global, 'fetch', async (url, init) => {
    fetchCalls.push({ url: String(url), body: JSON.parse(init.body) });
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 1 } }) };
  });

  const oldEnv = { ...process.env };
  t.after(() => {
    process.env = oldEnv;
    delete require.cache[MODULE_PATH];
  });

  delete process.env.HEYS_START_WEBHOOK_SECRET;
  process.env.HEYS_START_WEBHOOK_SECRET_SHA256 = crypto
    .createHash('sha256')
    .update('test-secret')
    .digest('hex');
  process.env.HEYS_START_BOT_TOKEN = 'start-token';

  const { handler, queries } = loadHandlerWithDb([]);
  const result = await handler(
    startWebhookEvent({
      message: {
        chat: { id: 123456 },
        text: 'hello',
      },
    }),
  );

  assert.equal(result.statusCode, 200);
  const response = JSON.parse(result.body);
  assert.deepEqual(response, { ok: true, delivered: true });
  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0].url, /sendMessage$/);
  assert.equal(fetchCalls[0].body.chat_id, 123456);
  assert.equal(queries.length, 0);
});

test('HEYS Start /start returns quiz entry without touching DB', async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', () => {});
  const fetchCalls = [];
  t.mock.method(global, 'fetch', async (url, init) => {
    fetchCalls.push({ url: String(url), body: JSON.parse(init.body) });
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 1 } }) };
  });

  const oldEnv = { ...process.env };
  t.after(() => {
    process.env = oldEnv;
    delete require.cache[MODULE_PATH];
  });

  process.env.HEYS_START_WEBHOOK_SECRET = 'test-secret';
  process.env.HEYS_START_BOT_TOKEN = 'start-token';

  const { handler, queries } = loadHandlerWithDb([]);
  const result = await handler(
    startWebhookEvent({
      message: {
        chat: { id: 123456 },
        text: '/start',
      },
    }),
  );

  assert.equal(result.statusCode, 200);
  const response = JSON.parse(result.body);
  assert.deepEqual(response, { ok: true, delivered: true });
  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0].url, /sendMessage$/);
  assert.match(fetchCalls[0].body.text, /За одну минуту/);
  assert.equal(fetchCalls[0].body.reply_markup.inline_keyboard[0][0].text, 'Начать');
  assert.equal(queries.length, 0);
});

test('HEYS Start poller processes /start update and commits offset', async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', () => {});
  const fetchCalls = [];
  let updateReturned = false;
  t.mock.method(global, 'fetch', async (url, init) => {
    const body = JSON.parse(init.body);
    fetchCalls.push({ url: String(url), body });
    if (String(url).endsWith('/getUpdates') && body.offset) {
      return { ok: true, json: async () => ({ ok: true, result: [] }) };
    }
    if (String(url).endsWith('/getUpdates')) {
      if (updateReturned) {
        return { ok: true, json: async () => ({ ok: true, result: [] }) };
      }
      updateReturned = true;
      return {
        ok: true,
        json: async () => ({
          ok: true,
          result: [
            {
              update_id: 777,
              message: {
                chat: { id: 123456 },
                text: '/start',
              },
            },
          ],
        }),
      };
    }
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 1 } }) };
  });

  const oldEnv = { ...process.env };
  t.after(() => {
    process.env = oldEnv;
    delete require.cache[MODULE_PATH];
  });

  process.env.HEYS_START_BOT_TOKEN = 'start-token';
  process.env.TELEGRAM_CLIENT_BOT_TOKEN = 'client-token';

  const { handler, queries } = loadHandlerWithDb([]);
  const result = await handler({
    messages: [
      {
        details: {
          payload: JSON.stringify({ poll: 'heys-start-bot', window_ms: 2500 }),
        },
      },
    ],
  });

  assert.equal(result.statusCode, 200);
  const response = JSON.parse(result.body);
  assert.equal(response.poll, 'heys-start-bot');
  assert.equal(response.processed, 1);
  assert.equal(response.delivered, 1);
  assert.equal(fetchCalls.some((call) => /sendMessage$/.test(call.url)), true);
  assert.equal(fetchCalls.some((call) => /getUpdates$/.test(call.url) && call.body.offset === 778), true);
  assert.equal(queries.some((q) => /INSERT INTO public\.funnel_events[\s\S]+'runtime_lock'/.test(q.sql)), true);
  assert.equal(queries.some((q) => /UPDATE public\.funnel_events[\s\S]+event_type = 'runtime_lock'/.test(q.sql)), true);
});

test('HEYS Start poller skips getUpdates when another poll holds the lease', async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', () => {});
  const fetchCalls = [];
  t.mock.method(global, 'fetch', async (url, init) => {
    fetchCalls.push({ url: String(url), body: JSON.parse(init.body) });
    return { ok: true, json: async () => ({ ok: true, result: [] }) };
  });

  const oldEnv = { ...process.env };
  t.after(() => {
    process.env = oldEnv;
    delete require.cache[MODULE_PATH];
  });

  process.env.HEYS_START_BOT_TOKEN = 'start-token';
  process.env.TELEGRAM_CLIENT_BOT_TOKEN = 'client-token';

  const { handler, queries } = loadHandlerWithDb([
    { match: /INSERT INTO public\.funnel_events[\s\S]+'runtime_lock'/, rows: [] },
  ]);
  const result = await handler({
    messages: [
      {
        details: {
          payload: JSON.stringify({ poll: 'heys-start-bot', window_ms: 2500 }),
        },
      },
    ],
  });

  assert.equal(result.statusCode, 200);
  const response = JSON.parse(result.body);
  assert.equal(response.poll, 'heys-start-bot');
  assert.equal(response.skipped, 'poll_already_running');
  assert.equal(fetchCalls.some((call) => /getUpdates$/.test(call.url)), false);
  assert.equal(queries.some((q) => /UPDATE public\.funnel_events[\s\S]+event_type = 'runtime_lock'/.test(q.sql)), false);
});

test('client bot poller processes simple update, delivers reply and commits offset', async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', () => {});
  const fetchCalls = [];
  let updateReturned = false;
  t.mock.method(global, 'fetch', async (url, init) => {
    const body = JSON.parse(init.body);
    fetchCalls.push({ url: String(url), body });
    if (String(url).endsWith('/getUpdates') && body.offset) {
      return { ok: true, json: async () => ({ ok: true, result: [] }) };
    }
    if (String(url).endsWith('/getUpdates')) {
      if (updateReturned) {
        return { ok: true, json: async () => ({ ok: true, result: [] }) };
      }
      updateReturned = true;
      return {
        ok: true,
        json: async () => ({
          ok: true,
          result: [
            {
              update_id: 778,
              message: {
                chat: { id: 123456 },
                text: 'hello',
              },
            },
          ],
        }),
      };
    }
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 2 } }) };
  });

  const oldEnv = { ...process.env };
  t.after(() => {
    process.env = oldEnv;
    delete require.cache[MODULE_PATH];
  });

  process.env.HEYS_START_BOT_TOKEN = 'start-token';
  process.env.TELEGRAM_CLIENT_BOT_TOKEN = 'client-token';

  const { handler, queries } = loadHandlerWithDb([]);
  const result = await handler({
    messages: [
      {
        details: {
          payload: JSON.stringify({ poll: 'heys-client-bot', window_ms: 2500 }),
        },
      },
    ],
  });

  assert.equal(result.statusCode, 200);
  const response = JSON.parse(result.body);
  assert.equal(response.poll, 'heys-client-bot');
  assert.equal(response.processed, 1);
  assert.equal(response.delivered, 1);
  assert.equal(fetchCalls.some((call) => /sendMessage$/.test(call.url)), true);
  assert.equal(fetchCalls.some((call) => /getUpdates$/.test(call.url) && call.body.offset === 779), true);
  assert.equal(queries.some((q) => /INSERT INTO public\.funnel_events[\s\S]+'runtime_lock'/.test(q.sql)), true);
  assert.equal(queries.some((q) => /UPDATE public\.funnel_events[\s\S]+event_type = 'runtime_lock'/.test(q.sql)), true);
});

test('client bot pin claim success uses webhook response without Telegram API roundtrip', async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', () => {});
  t.mock.method(global, 'fetch', async () => {
    throw new Error('fetch should not be called');
  });

  const oldEnv = { ...process.env };
  t.after(() => {
    process.env = oldEnv;
    delete require.cache[MODULE_PATH];
  });

  process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';
  process.env.TELEGRAM_CLIENT_BOT_TOKEN = 'client-token';
  process.env.APP_URL = 'https://app.heyslab.ru';

  const { handler, queries } = loadHandlerWithDb([
    {
      match: /claim_pin_token_chat/,
      rows: [{ payload: { success: true, name: 'Ivan' } }],
    },
  ]);

  const result = await handler(
    clientBotWebhookEvent({
      message: {
        chat: { id: 123456 },
        text: '/start 11111111-1111-1111-1111-111111111111',
      },
    }),
  );

  assert.equal(result.statusCode, 200);
  const response = JSON.parse(result.body);
  assert.equal(response.method, 'sendMessage');
  assert.equal(response.chat_id, 123456);
  assert.match(response.text, /Привет, <b>Ivan<\/b>/);
  assert.match(response.text, /https:\/\/app\.heyslab\.ru/);
  assert.equal(queries.filter((q) => /claim_pin_token_chat/.test(q.sql)).length, 1);
});

test('client bot pin claim failure uses webhook response without Telegram API roundtrip', async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', () => {});
  t.mock.method(global, 'fetch', async () => {
    throw new Error('fetch should not be called');
  });

  const oldEnv = { ...process.env };
  t.after(() => {
    process.env = oldEnv;
    delete require.cache[MODULE_PATH];
  });

  process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';
  process.env.TELEGRAM_CLIENT_BOT_TOKEN = 'client-token';

  const { handler, queries } = loadHandlerWithDb([
    {
      match: /claim_pin_token_chat/,
      rows: [{ payload: { success: false, error: 'invalid_token' } }],
    },
  ]);

  const result = await handler(
    clientBotWebhookEvent({
      message: {
        chat: { id: 123456 },
        text: '/start 11111111-1111-1111-1111-111111111111',
      },
    }),
  );

  assert.equal(result.statusCode, 200);
  const response = JSON.parse(result.body);
  assert.equal(response.method, 'sendMessage');
  assert.equal(response.chat_id, 123456);
  assert.match(response.text, /Ссылка не найдена/);
  assert.equal(queries.filter((q) => /claim_pin_token_chat/.test(q.sql)).length, 1);
});

test('HEYS Start callback acknowledges button press and returns next question', async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', () => {});

  const fetchCalls = [];
  t.mock.method(global, 'fetch', async (url, init) => {
    fetchCalls.push({ url: String(url), body: JSON.parse(init.body) });
    return { ok: true, json: async () => ({ ok: true, result: true }) };
  });

  const oldEnv = { ...process.env };
  t.after(() => {
    process.env = oldEnv;
    delete require.cache[MODULE_PATH];
  });

  process.env.HEYS_START_WEBHOOK_SECRET = 'test-secret';
  process.env.HEYS_START_BOT_TOKEN = 'start-token';

  const { handler, queries } = loadHandlerWithDb([]);
  const result = await handler(
    startWebhookEvent({
      callback_query: {
        id: 'callback-1',
        data: 'qs|0||organic',
        message: {
          message_id: 42,
          chat: { id: 123456 },
        },
      },
    }),
  );

  assert.equal(result.statusCode, 200);
  const response = JSON.parse(result.body);
  assert.deepEqual(response, { ok: true, delivered: true });
  assert.equal(fetchCalls.length, 2);
  assert.match(fetchCalls[0].url, /answerCallbackQuery$/);
  assert.deepEqual(fetchCalls[0].body, { callback_query_id: 'callback-1' });
  assert.match(fetchCalls[1].url, /sendMessage$/);
  assert.match(fetchCalls[1].body.text, /1\/6/);
  assert.equal(queries.length, 0);
});

test('HEYS Start contact creates CRM lead and sends PII-free curator handoff', async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', () => {});
  t.mock.method(global, 'fetch', async (url, init) => {
    fetchCalls.push({ url: String(url), body: JSON.parse(init.body) });
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 42 } }) };
  });

  const fetchCalls = [];
  const oldEnv = { ...process.env };
  t.after(() => {
    process.env = oldEnv;
    delete require.cache[MODULE_PATH];
  });

  process.env.HEYS_START_WEBHOOK_SECRET = 'test-secret';
  process.env.HEYS_START_BOT_TOKEN = 'start-token';
  process.env.TELEGRAM_CLIENT_BOT_TOKEN = 'client-token';
  process.env.TELEGRAM_BOT_TOKEN = 'curator-token';
  process.env.TELEGRAM_CHAT_ID = '777';

  const { handler, queries } = loadHandlerWithDb([
    {
      match: /FROM public\.funnel_events[\s\S]+event_type = 'week_request'/,
      rows: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          lead_id: null,
          source: 'telegram',
          campaign: 'heys_start',
          segment: 'evening',
          metadata: {
            readiness: 'now',
            frequency: '2_3_week',
            barrier: 'stress',
            goal: 'less_breakdowns',
          },
        },
      ],
    },
    { match: /FROM public\.leads[\s\S]+WHERE phone = \$1/, rows: [] },
    { match: /INSERT INTO public\.leads/, rows: [{ id: '22222222-2222-2222-2222-222222222222' }] },
  ]);

  const result = await handler(
    startWebhookEvent({
      message: {
        chat: { id: 123456 },
        from: { first_name: 'Ivan', last_name: 'Private' },
        contact: { phone_number: '+7 (999) 111-22-33', first_name: 'Ivan', last_name: 'Private' },
      },
    }),
  );

  assert.equal(result.statusCode, 200);
  const response = JSON.parse(result.body);
  assert.deepEqual(response, { ok: true, delivered: true });
  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0].url, /sendMessage$/);
  assert.equal(fetchCalls[0].body.chat_id, 123456);
  assert.match(fetchCalls[0].body.text, /Спасибо\. Заявка сохранена/);

  const insertLead = queries.find((q) => /INSERT INTO public\.leads/.test(q.sql));
  assert.ok(insertLead, 'lead insert query should run');
  assert.equal(insertLead.params[0], 'Ivan Private');
  assert.equal(insertLead.params[1], '+79991112233');

  const recordLead = queries.find(
    (q) => /record_funnel_event/.test(q.sql) && q.params[0] === 'lead',
  );
  assert.ok(recordLead, 'lead funnel event should be recorded');
  assert.deepEqual(JSON.parse(recordLead.params[8]), {
    bot: 'heys_start',
    handoff: true,
    readiness: 'now',
    frequency: '2_3_week',
    barrier: 'stress',
    goal: 'less_breakdowns',
  });

  assert.equal(await waitFor(() => fetchCalls.length === 2), true);
  const handoff = fetchCalls.find((call) => call.body.chat_id === '777').body;
  assert.equal(handoff.chat_id, '777');
  assert.match(handoff.text, /lead_id: 22222222-2222-2222-2222-222222222222/);
  assert.match(handoff.text, /ПДн не отправлены в Telegram/);
  assert.doesNotMatch(handoff.text, /79991112233|\+7|Ivan|Private|phone|email|name/i);
});

test('HEYS Start contact without week_request does not create CRM lead', async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', () => {});
  const fetchCalls = [];
  t.mock.method(global, 'fetch', async (url, init) => {
    fetchCalls.push({ url: String(url), body: JSON.parse(init.body) });
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 42 } }) };
  });

  const oldEnv = { ...process.env };
  t.after(() => {
    process.env = oldEnv;
    delete require.cache[MODULE_PATH];
  });

  process.env.HEYS_START_WEBHOOK_SECRET = 'test-secret';
  process.env.HEYS_START_BOT_TOKEN = 'start-token';
  process.env.TELEGRAM_CLIENT_BOT_TOKEN = 'client-token';
  process.env.TELEGRAM_BOT_TOKEN = 'curator-token';
  process.env.TELEGRAM_CHAT_ID = '777';

  const { handler, queries } = loadHandlerWithDb([
    { match: /FROM public\.funnel_events[\s\S]+event_type = 'week_request'/, rows: [] },
  ]);

  const result = await handler(
    startWebhookEvent({
      message: {
        chat: { id: 123456 },
        from: { first_name: 'Ivan', last_name: 'Private' },
        text: '+79991112233',
      },
    }),
  );

  assert.equal(result.statusCode, 200);
  const response = JSON.parse(result.body);
  assert.deepEqual(response, { ok: true, delivered: true });
  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0].body.text, /Сначала пройдите короткий разбор/);
  assert.equal(queries.some((q) => /INSERT INTO public\.leads/.test(q.sql)), false);
  assert.equal(queries.some((q) => /record_funnel_event/.test(q.sql)), false);
});

test('HEYS Start contact replay reuses linked week_request lead without duplicate curator handoff', async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', () => {});
  const fetchCalls = [];
  t.mock.method(global, 'fetch', async (url, init) => {
    fetchCalls.push({ url: String(url), body: JSON.parse(init.body) });
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 42 } }) };
  });

  const oldEnv = { ...process.env };
  t.after(() => {
    process.env = oldEnv;
    delete require.cache[MODULE_PATH];
  });

  process.env.HEYS_START_WEBHOOK_SECRET = 'test-secret';
  process.env.HEYS_START_BOT_TOKEN = 'start-token';
  process.env.TELEGRAM_CLIENT_BOT_TOKEN = 'client-token';
  process.env.TELEGRAM_BOT_TOKEN = 'curator-token';
  process.env.TELEGRAM_CHAT_ID = '777';

  const { handler, queries } = loadHandlerWithDb([
    {
      match: /FROM public\.funnel_events[\s\S]+event_type = 'week_request'/,
      rows: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          lead_id: '22222222-2222-2222-2222-222222222222',
          source: 'telegram',
          campaign: 'heys_start',
          segment: 'evening',
          metadata: {
            readiness: 'this_week',
            frequency: '2_3_week',
            barrier: 'stress',
            goal: 'less_breakdowns',
          },
        },
      ],
    },
  ]);

  const result = await handler(
    startWebhookEvent({
      message: {
        chat: { id: 123456 },
        from: { first_name: 'Ivan', last_name: 'Private' },
        contact: { phone_number: '+7 (999) 111-22-33', first_name: 'Ivan', last_name: 'Private' },
      },
    }),
  );

  assert.equal(result.statusCode, 200);
  assert.deepEqual(JSON.parse(result.body), { ok: true, delivered: true });
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].body.chat_id, 123456);
  assert.match(fetchCalls[0].body.text, /Спасибо\. Заявка сохранена/);
  assert.equal(queries.some((q) => /INSERT INTO public\.leads/.test(q.sql)), false);
  assert.equal(queries.some((q) => /FROM public\.leads[\s\S]+WHERE phone = \$1/.test(q.sql)), false);
  assert.equal(
    queries.some((q) => /record_funnel_event/.test(q.sql) && q.params[0] === 'lead'),
    true,
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(fetchCalls.length, 1, 'curator handoff should not be sent again on replay');
});
