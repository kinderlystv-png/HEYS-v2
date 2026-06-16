const test = require('node:test');
const assert = require('node:assert/strict');
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

test('HEYS Start contact creates CRM lead and sends PII-free curator handoff', async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', () => {});
  t.mock.method(global, 'fetch', async (_url, init) => {
    fetchCalls.push({ body: JSON.parse(init.body) });
    return { json: async () => ({ ok: true, result: { message_id: 42 } }) };
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
  assert.equal(response.method, 'sendMessage');
  assert.match(response.text, /Спасибо\. Заявка сохранена/);

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

  assert.equal(fetchCalls.length, 1);
  const handoff = fetchCalls[0].body;
  assert.equal(handoff.chat_id, '777');
  assert.match(handoff.text, /lead_id: 22222222-2222-2222-2222-222222222222/);
  assert.match(handoff.text, /ПДн не отправлены в Telegram/);
  assert.doesNotMatch(handoff.text, /79991112233|\+7|Ivan|Private|phone|email|name/i);
});

test('HEYS Start contact without week_request does not create CRM lead', async (t) => {
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
  assert.equal(response.method, 'sendMessage');
  assert.match(response.text, /Сначала пройдите короткий разбор/);
  assert.equal(queries.some((q) => /INSERT INTO public\.leads/.test(q.sql)), false);
  assert.equal(queries.some((q) => /record_funnel_event/.test(q.sql)), false);
});
