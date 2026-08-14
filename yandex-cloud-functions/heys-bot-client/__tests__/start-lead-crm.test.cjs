const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const https = require('node:https');
const Module = require('node:module');
const path = require('node:path');
const { Readable } = require('node:stream');

const MODULE_PATH = path.resolve(__dirname, '../index.js');

function bridgeHttpsRequestToFetch(options, onResponse) {
  const request = new EventEmitter();
  const chunks = [];
  let destroyed = false;

  request.write = (chunk) => chunks.push(Buffer.from(chunk));
  request.destroy = (error) => {
    if (destroyed) return;
    destroyed = true;
    if (error) process.nextTick(() => request.emit('error', error));
  };
  request.end = async () => {
    if (destroyed) return;
    try {
      const response = await global.fetch(`https://${options.hostname}${options.path}`, {
        method: options.method,
        headers: options.headers,
        body: chunks.length > 0 ? Buffer.concat(chunks).toString('utf8') : undefined,
      });
      if (destroyed) return;
      const responseBody = await response.json();
      const stream = Readable.from([Buffer.from(JSON.stringify(responseBody))]);
      stream.statusCode = response.status ?? (response.ok ? 200 : 500);
      onResponse(stream);
    } catch (error) {
      request.emit('error', error);
    }
  };

  return request;
}

test.beforeEach((t) => {
  t.mock.method(https, 'request', bridgeHttpsRequestToFetch);
});

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
    if (request === './shared/db-pool') return { getPool: () => pool, closePool: async () => {} };
    if (request === './shared/secrets') return { initSecrets: async () => {} };
    if (request === './shared/lockbox-client') return { getSecret: async () => null };
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const botModule = require(MODULE_PATH);
    return { handler: botModule.handler, testApi: botModule.__test, queries };
  } finally {
    Module._load = originalLoad;
  }
}

test('Telegram API transport uses one TLS-verified request with DNS fallback', async (t) => {
  t.mock.method(console, 'warn', () => {});
  let primaryCalls = 0;
  t.mock.method(global, 'fetch', async () => {
    primaryCalls += 1;
    const error = new Error('This operation was aborted');
    error.name = 'AbortError';
    throw error;
  });

  const requestCalls = [];
  const requestBody = [];
  let selectedAddresses = [];
  const fakeRequest = (options, onResponse) => {
    requestCalls.push(options);
    const request = new EventEmitter();
    request.write = (chunk) => requestBody.push(String(chunk));
    request.destroy = (error) => request.emit('error', error);
    request.end = () => {
      options.lookup('api.telegram.org', { all: true }, (error, addresses) => {
        if (error) {
          request.emit('error', error);
          return;
        }
        selectedAddresses = addresses;
        const response = Readable.from([
          JSON.stringify({ ok: true, result: { message_id: 1 } }),
        ]);
        response.statusCode = 200;
        onResponse(response);
      });
    };
    return request;
  };
  const fakeLookup = (_hostname, options, callback) => {
    assert.deepEqual(options, { all: true, verbatim: true });
    callback(null, [{ address: '149.154.166.110', family: 4 }]);
  };

  const oldEnv = { ...process.env };
  t.after(() => {
    process.env = oldEnv;
    delete require.cache[MODULE_PATH];
  });

  const { testApi } = loadHandlerWithDb([]);
  const payload = JSON.stringify({ chat_id: 123456, text: 'hello' });
  const response = await testApi.fetchWithTimeout(
    'https://api.telegram.org/bottest-token/sendMessage',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    },
    100,
    fakeRequest,
    fakeLookup,
  );

  assert.equal(primaryCalls, 0);
  assert.equal(requestCalls.length, 1);
  assert.equal(requestCalls[0].hostname, 'api.telegram.org');
  assert.equal(requestCalls[0].servername, 'api.telegram.org');
  assert.equal(requestCalls[0].rejectUnauthorized, true);
  assert.equal(requestCalls[0].autoSelectFamily, true);
  assert.equal(requestCalls[0].autoSelectFamilyAttemptTimeout, 250);
  assert.equal(requestCalls[0].path, '/bottest-token/sendMessage');
  assert.equal(requestBody.join(''), payload);
  assert.deepEqual(selectedAddresses, [
    { address: '149.154.166.110', family: 4 },
    { address: '149.154.167.220', family: 4 },
  ]);
  assert.deepEqual(await response.json(), { ok: true, result: { message_id: 1 } });
});

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

test('client bot simple replies send direct Telegram reply', async (t) => {
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
  assert.deepEqual(response, { ok: true, delivered: true });
  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0].url, /sendMessage$/);
  assert.equal(fetchCalls[0].body.chat_id, 123456);
  assert.match(fetchCalls[0].body.text, /Используйте \/help/);
  assert.equal(queries.length, 0);
});

test('client bot accepts webhook secret hash without Lockbox on simple replies', async (t) => {
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
  assert.deepEqual(response, { ok: true, delivered: true });
  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0].url, /sendMessage$/);
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

test('HEYS Start poller stops after failed offset commit without redelivering update', async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', () => {});
  let nowCalls = 0;
  t.mock.method(Date, 'now', () => {
    nowCalls += 1;
    return nowCalls >= 5 ? 3000 : 0;
  });

  const fetchCalls = [];
  t.mock.method(global, 'fetch', async (url, init) => {
    const body = JSON.parse(init.body);
    fetchCalls.push({ url: String(url), body });
    if (String(url).endsWith('/getUpdates') && body.offset) {
      return {
        ok: false,
        status: 500,
        json: async () => ({ ok: false, description: 'offset commit failed' }),
      };
    }
    if (String(url).endsWith('/getUpdates')) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          result: [
            {
              update_id: 779,
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
  delete process.env.TELEGRAM_BOT_TOKEN;

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
  const getUpdatesCalls = fetchCalls.filter((call) => /getUpdates$/.test(call.url));
  const sendMessageCalls = fetchCalls.filter((call) => /sendMessage$/.test(call.url));
  assert.equal(response.processed, 1);
  assert.equal(response.delivered, 1);
  assert.equal(response.telegram_ok, false);
  assert.equal(getUpdatesCalls.length, 2);
  assert.equal(getUpdatesCalls[1].body.offset, 780);
  assert.equal(sendMessageCalls.length, 1);
  assert.equal(queries.some((q) => /INSERT INTO public\.maintenance_heartbeat/.test(q.sql)), false);
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

test('client bot pin claim success sends direct Telegram reply', async (t) => {
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
  assert.deepEqual(response, { ok: true, delivered: true });
  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0].url, /sendMessage$/);
  assert.equal(fetchCalls[0].body.chat_id, 123456);
  assert.match(fetchCalls[0].body.text, /Здравствуйте, <b>Ivan<\/b>\./);
  assert.match(fetchCalls[0].body.text, /привязывает ваш Telegram к приложению/);
  assert.match(fetchCalls[0].body.text, /PIN из сообщения куратора/);
  assert.match(fetchCalls[0].body.text, /https:\/\/app\.heyslab\.ru/);
  assert.equal(queries.filter((q) => /claim_pin_token_chat/.test(q.sql)).length, 1);
});

test('client bot pin claim failure sends direct Telegram reply', async (t) => {
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
  assert.deepEqual(response, { ok: true, delivered: true });
  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0].url, /sendMessage$/);
  assert.equal(fetchCalls[0].body.chat_id, 123456);
  assert.match(fetchCalls[0].body.text, /Ссылка не найдена/);
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

test('HEYS Start asks for contact only after showing the active privacy policy', async (t) => {
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
        id: 'callback-contact-consent',
        data: 'qr|this_week|morning,stress,daily,diets,routine,less_breakdowns|organic',
        message: {
          message_id: 42,
          chat: { id: 123456 },
        },
      },
    }),
  );

  assert.equal(result.statusCode, 200);
  assert.deepEqual(JSON.parse(result.body), { ok: true, delivered: true });
  assert.equal(fetchCalls.length, 2);
  assert.match(fetchCalls[0].url, /answerCallbackQuery$/);
  assert.match(fetchCalls[1].url, /sendMessage$/);
  assert.match(fetchCalls[1].body.text, /https:\/\/heyslab\.ru\/legal\/privacy-policy/);
  assert.deepEqual(fetchCalls[1].body.reply_markup.keyboard, [[{
    text: 'Отправить телефон',
    request_contact: true,
  }]]);
  assert.equal(queries.some((q) => /INSERT INTO public\.leads/.test(q.sql)), false);
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
  assert.match(insertLead.sql, /consent_privacy_version, consent_method/);
  assert.match(insertLead.sql, /telegram_chat_id/);
  assert.match(insertLead.sql, /\$9, 'telegram_contact'/);
  assert.equal(insertLead.params[0], 'Ivan Private');
  assert.equal(insertLead.params[1], '+79991112233');
  assert.equal(insertLead.params[2], 123456);
  assert.equal(insertLead.params[8], '1.8');

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
  assert.deepEqual(handoff.reply_markup, {
    inline_keyboard: [[{
      text: '✅ Взял в работу',
      callback_data: 'lead_taken_22222222-2222-2222-2222-222222222222',
    }]],
  });
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

test('HEYS Start contact replay reuses active phone lead without duplicate curator handoff', async (t) => {
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
          lead_id: null,
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
    {
      match: /FROM public\.leads[\s\S]+WHERE phone = \$1/,
      rows: [{ id: '22222222-2222-2222-2222-222222222222' }],
    },
    {
      match: /UPDATE public\.leads AS lead[\s\S]+legal_consent_registry/,
      rows: [{ id: '22222222-2222-2222-2222-222222222222' }],
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
  assert.equal(queries.some((q) => /FROM public\.leads[\s\S]+WHERE phone = \$1/.test(q.sql)), true);
  const consentUpdate = queries.find(
    (q) => /UPDATE public\.leads AS lead[\s\S]+legal_consent_registry/.test(q.sql),
  );
  assert.ok(consentUpdate, 'replayed contact should record fresh privacy proof');
  assert.deepEqual(consentUpdate.params, [
    '22222222-2222-2222-2222-222222222222',
    '1.8',
    123456,
  ]);
  assert.equal(
    queries.some((q) => /record_funnel_event/.test(q.sql) && q.params[0] === 'lead'),
    true,
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(fetchCalls.length, 1, 'curator handoff should not be sent again on replay');
});

test('HEYS Start fails closed when privacy proof cannot be recorded for an existing lead', async (t) => {
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
      rows: [{
        id: '11111111-1111-1111-1111-111111111111',
        lead_id: '22222222-2222-2222-2222-222222222222',
        source: 'telegram',
        campaign: 'heys_start',
        segment: 'evening',
        metadata: { readiness: 'this_week' },
      }],
    },
  ]);

  const result = await handler(
    startWebhookEvent({
      message: {
        chat: { id: 123456 },
        from: { first_name: 'Ivan' },
        contact: { phone_number: '+7 (999) 111-22-33', first_name: 'Ivan' },
      },
    }),
  );

  assert.equal(result.statusCode, 200);
  assert.deepEqual(JSON.parse(result.body), { ok: true, delivered: true });
  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0].body.text, /Не удалось сохранить заявку/);
  assert.equal(queries.some((q) => /\bROLLBACK\b/.test(q.sql)), true);
  assert.equal(
    queries.some((q) => /record_funnel_event/.test(q.sql) && q.params[0] === 'lead'),
    false,
  );
});
