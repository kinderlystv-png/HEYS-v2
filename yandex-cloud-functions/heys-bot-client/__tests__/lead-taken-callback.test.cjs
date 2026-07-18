const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const MODULE_PATH = path.resolve(__dirname, '../index.js');
const LEAD_ID = '22222222-2222-2222-2222-222222222222';
const CONTACTED_AT = '2026-07-18T09:30:00.000Z';

function loadModuleWithDb(respond = async () => ({ rows: [] }), options = {}) {
  delete require.cache[MODULE_PATH];
  const queries = [];
  const client = {
    async query(sql, params = []) {
      const text = String(sql);
      queries.push({ sql: text, params });
      if (/INSERT INTO public\.funnel_events[\s\S]+'runtime_lock'/.test(text)) {
        return { rows: [{ id: '99999999-9999-9999-9999-999999999999' }] };
      }
      return respond(text, params);
    },
    release() {},
  };
  const pool = { connect: async () => client };

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === './shared/db-pool') return { getPool: () => pool, closePool: async () => {} };
    if (request === './shared/secrets') {
      return { initSecrets: options.initSecrets || (async () => {}) };
    }
    if (request === './shared/lockbox-client') return { getSecret: async () => null };
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const loaded = require(MODULE_PATH);
    return { handler: loaded.handler, subject: loaded.__test, queries };
  } finally {
    Module._load = originalLoad;
  }
}

function curatorQuery(overrides = {}) {
  return {
    id: 'callback-1',
    data: `lead_taken_${LEAD_ID}`,
    from: { id: 777, username: 'anton_curator', first_name: 'Anton' },
    message: {
      message_id: 42,
      chat: { id: 777, type: 'private' },
      text: `🆕 Новая заявка #${LEAD_ID}\n\n📋 Мессенджер: Telegram`,
    },
    ...overrides,
  };
}

function telegramOk(result = true) {
  return { ok: true, json: async () => ({ ok: true, result }) };
}

function setupTest(t, fetchImpl) {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', () => {});
  t.mock.method(global, 'fetch', fetchImpl);
  const oldEnv = { ...process.env };
  t.after(() => {
    process.env = oldEnv;
    delete require.cache[MODULE_PATH];
  });
  process.env.TELEGRAM_BOT_TOKEN = 'curator-token';
  process.env.TELEGRAM_CHAT_ID = '777';
  delete process.env.TELEGRAM_CURATOR_USER_IDS;
}

test('authorized lead callback claims once, answers and edits the source message', async (t) => {
  const fetchCalls = [];
  setupTest(t, async (url, init) => {
    fetchCalls.push({ url: String(url), body: JSON.parse(init.body) });
    return telegramOk({ message_id: 42 });
  });
  const { subject, queries } = loadModuleWithDb(async (sql) => {
    if (/UPDATE public\.leads/.test(sql)) {
      return { rows: [{ id: LEAD_ID, status: 'contacted', contacted_at: CONTACTED_AT }] };
    }
    throw new Error(`unexpected query: ${sql}`);
  });

  const result = await subject.handleCuratorLeadCallback(curatorQuery());

  assert.equal(result.outcome, 'claimed');
  assert.equal(queries.filter((query) => /UPDATE public\.leads/.test(query.sql)).length, 1);
  assert.equal(fetchCalls.filter((call) => /answerCallbackQuery$/.test(call.url)).length, 1);
  assert.equal(fetchCalls.filter((call) => /editMessageText$/.test(call.url)).length, 1);
  const answer = fetchCalls.find((call) => /answerCallbackQuery$/.test(call.url));
  assert.equal(answer.body.callback_query_id, 'callback-1');
  assert.match(answer.body.text, /взят в работу/i);
  const edit = fetchCalls.find((call) => /editMessageText$/.test(call.url));
  assert.match(edit.body.text, /В работе/);
  assert.match(edit.body.text, /@anton_curator/);
  assert.match(edit.body.text, /2026-07-18T09:30:00.000Z/);
  assert.deepEqual(edit.body.reply_markup, { inline_keyboard: [] });
});

test('curator auth sees chat configuration overlaid by Lockbox init', async (t) => {
  const fetchCalls = [];
  setupTest(t, async (url, init) => {
    fetchCalls.push({ url: String(url), body: JSON.parse(init.body) });
    return telegramOk({ message_id: 42 });
  });
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  process.env.LOCKBOX_APP_SECRET_ID = 'app-secret-id';
  const { subject } = loadModuleWithDb(
    async (sql) => {
      if (/UPDATE public\.leads/.test(sql)) {
        return { rows: [{ id: LEAD_ID, status: 'contacted', contacted_at: CONTACTED_AT }] };
      }
      throw new Error(`unexpected query: ${sql}`);
    },
    {
      initSecrets: async () => {
        process.env.TELEGRAM_BOT_TOKEN = 'curator-token';
        process.env.TELEGRAM_CHAT_ID = '777';
      },
    },
  );

  const result = await subject.handleCuratorLeadCallback(curatorQuery());

  assert.equal(result.outcome, 'claimed');
  assert.equal(fetchCalls.filter((call) => /answerCallbackQuery$/.test(call.url)).length, 1);
  assert.equal(fetchCalls.filter((call) => /editMessageText$/.test(call.url)).length, 1);
});

test('repeated lead callback is idempotent, answers and does not edit again', async (t) => {
  const fetchCalls = [];
  setupTest(t, async (url, init) => {
    fetchCalls.push({ url: String(url), body: JSON.parse(init.body) });
    return telegramOk();
  });
  const { subject, queries } = loadModuleWithDb(async (sql) => {
    if (/UPDATE public\.leads/.test(sql)) return { rows: [] };
    if (/SELECT id, status, contacted_at/.test(sql)) {
      return { rows: [{ id: LEAD_ID, status: 'contacted', contacted_at: CONTACTED_AT }] };
    }
    return { rows: [] };
  });

  const result = await subject.handleCuratorLeadCallback(curatorQuery());

  assert.equal(result.outcome, 'already_claimed');
  assert.equal(queries.filter((query) => /UPDATE public\.leads/.test(query.sql)).length, 1);
  assert.equal(fetchCalls.filter((call) => /answerCallbackQuery$/.test(call.url)).length, 1);
  assert.equal(fetchCalls.some((call) => /editMessageText$/.test(call.url)), false);
});

test('parallel callbacks produce one mutation and two acknowledged outcomes', async (t) => {
  const fetchCalls = [];
  setupTest(t, async (url, init) => {
    fetchCalls.push({ url: String(url), body: JSON.parse(init.body) });
    return telegramOk();
  });
  let status = 'new';
  const { subject, queries } = loadModuleWithDb(async (sql) => {
    if (/UPDATE public\.leads/.test(sql)) {
      if (status === 'new') {
        status = 'contacted';
        return { rows: [{ id: LEAD_ID, status, contacted_at: CONTACTED_AT }] };
      }
      return { rows: [] };
    }
    if (/SELECT id, status, contacted_at/.test(sql)) {
      return { rows: [{ id: LEAD_ID, status, contacted_at: CONTACTED_AT }] };
    }
    return { rows: [] };
  });

  const results = await Promise.all([
    subject.handleCuratorLeadCallback(curatorQuery({ id: 'callback-a' })),
    subject.handleCuratorLeadCallback(curatorQuery({ id: 'callback-b' })),
  ]);

  assert.deepEqual(results.map((result) => result.outcome).sort(), ['already_claimed', 'claimed']);
  assert.equal(queries.filter((query) => /UPDATE public\.leads/.test(query.sql)).length, 2);
  assert.equal(fetchCalls.filter((call) => /answerCallbackQuery$/.test(call.url)).length, 2);
  assert.equal(fetchCalls.filter((call) => /editMessageText$/.test(call.url)).length, 1);
});

test('malformed callback is acknowledged without DB mutation or message edit', async (t) => {
  const fetchCalls = [];
  setupTest(t, async (url, init) => {
    fetchCalls.push({ url: String(url), body: JSON.parse(init.body) });
    return telegramOk();
  });
  const { subject, queries } = loadModuleWithDb();

  const result = await subject.handleCuratorLeadCallback(curatorQuery({ data: 'lead_taken_bad' }));

  assert.equal(result.outcome, 'malformed');
  assert.equal(queries.length, 0);
  assert.equal(fetchCalls.filter((call) => /answerCallbackQuery$/.test(call.url)).length, 1);
  assert.equal(fetchCalls.some((call) => /editMessageText$/.test(call.url)), false);
});

test('unknown lead is acknowledged without message edit', async (t) => {
  const fetchCalls = [];
  setupTest(t, async (url, init) => {
    fetchCalls.push({ url: String(url), body: JSON.parse(init.body) });
    return telegramOk();
  });
  const { subject } = loadModuleWithDb(async () => ({ rows: [] }));

  const result = await subject.handleCuratorLeadCallback(curatorQuery());

  assert.equal(result.outcome, 'not_found');
  assert.equal(fetchCalls.filter((call) => /answerCallbackQuery$/.test(call.url)).length, 1);
  assert.equal(fetchCalls.some((call) => /editMessageText$/.test(call.url)), false);
});

test('unauthorized actor is acknowledged and cannot touch the DB', async (t) => {
  const fetchCalls = [];
  setupTest(t, async (url, init) => {
    fetchCalls.push({ url: String(url), body: JSON.parse(init.body) });
    return telegramOk();
  });
  const { subject, queries } = loadModuleWithDb();
  const query = curatorQuery({ from: { id: 999, username: 'outsider' } });

  const result = await subject.handleCuratorLeadCallback(query);

  assert.equal(result.outcome, 'forbidden');
  assert.equal(queries.length, 0);
  assert.equal(fetchCalls.filter((call) => /answerCallbackQuery$/.test(call.url)).length, 1);
  assert.equal(fetchCalls.some((call) => /editMessageText$/.test(call.url)), false);
});

test('DB error is acknowledged and never edits the source message', async (t) => {
  const fetchCalls = [];
  setupTest(t, async (url, init) => {
    fetchCalls.push({ url: String(url), body: JSON.parse(init.body) });
    return telegramOk();
  });
  const { subject } = loadModuleWithDb(async () => {
    throw new Error('db unavailable');
  });

  const result = await subject.handleCuratorLeadCallback(curatorQuery());

  assert.equal(result.outcome, 'error');
  assert.equal(fetchCalls.filter((call) => /answerCallbackQuery$/.test(call.url)).length, 1);
  assert.equal(fetchCalls.some((call) => /editMessageText$/.test(call.url)), false);
});

test('existing HEYS Start poll also receives curator callback and commits its offset', async (t) => {
  const fetchCalls = [];
  let curatorUpdateReturned = false;
  setupTest(t, async (url, init) => {
    const body = JSON.parse(init.body);
    const call = { url: String(url), body };
    fetchCalls.push(call);
    if (/botcurator-token\/getUpdates$/.test(call.url)) {
      if (body.offset) return telegramOk([]);
      if (!curatorUpdateReturned) {
        curatorUpdateReturned = true;
        return telegramOk([{ update_id: 100, callback_query: curatorQuery() }]);
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
      return telegramOk([]);
    }
    if (/botstart-token\/getUpdates$/.test(call.url)) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return telegramOk([]);
    }
    return telegramOk({ message_id: 42 });
  });
  process.env.HEYS_START_BOT_TOKEN = 'start-token';
  process.env.TELEGRAM_CLIENT_BOT_TOKEN = 'client-token';
  const { handler } = loadModuleWithDb(async (sql) => {
    if (/UPDATE public\.leads/.test(sql)) {
      return { rows: [{ id: LEAD_ID, status: 'contacted', contacted_at: CONTACTED_AT }] };
    }
    return { rows: [] };
  });

  const response = await handler({ poll: 'heys-start-bot', window_ms: 1800 });
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(body.poll, 'heys-start-bot');
  assert.equal(body.curator.poll, 'heys-curator-bot');
  assert.equal(body.curator.processed, 1);
  assert.equal(body.curator.delivered, 1);
  assert.equal(fetchCalls.some((call) => /botcurator-token\/getUpdates$/.test(call.url) && call.body.offset === 101), true);
  assert.equal(fetchCalls.some((call) => /botcurator-token\/answerCallbackQuery$/.test(call.url)), true);
  assert.equal(fetchCalls.some((call) => /botcurator-token\/editMessageText$/.test(call.url)), true);
});
