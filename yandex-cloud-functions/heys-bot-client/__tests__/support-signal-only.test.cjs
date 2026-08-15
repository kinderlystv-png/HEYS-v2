const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const https = require('node:https');
const Module = require('node:module');
const path = require('node:path');
const { Readable } = require('node:stream');

const MODULE_PATH = path.resolve(__dirname, '../index.js');
const PROBE_PHONE = '+79001234567';
const PROBE_AMOUNT = '1234.56';
const PROBE_PAYMENT = 'pay_secret_9f3a';
const PROBE_TEXT = `Хочу вернуть ${PROBE_AMOUNT} ₽, телефон ${PROBE_PHONE}, платёж ${PROBE_PAYMENT}`;

function flatten(value, output = []) {
  if (value == null) return output;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    output.push(String(value));
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => flatten(item, output));
    return output;
  }
  if (typeof value === 'object') {
    Object.values(value).forEach((item) => flatten(item, output));
  }
  return output;
}

function assertNoProbe(label, value) {
  const blob = flatten(value).join('\n');
  assert.doesNotMatch(blob, new RegExp(PROBE_PHONE.replace('+', '\\+')));
  assert.doesNotMatch(blob, new RegExp(PROBE_AMOUNT));
  assert.doesNotMatch(blob, new RegExp(PROBE_PAYMENT));
}

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

function loadModule() {
  delete require.cache[MODULE_PATH];
  const queries = [];
  const client = {
    async query(sql, params = []) {
      queries.push({ sql: String(sql), params });
      return { rows: [] };
    },
    release() {},
  };
  const pool = { connect: async () => client };
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === './shared/db-pool') return { getPool: () => pool, closePool: async () => {} };
    if (request === './shared/secrets') return { initSecrets: async () => {} };
    if (request === './shared/lockbox-client') return { getSecret: async () => null };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const loaded = require(MODULE_PATH);
    return { subject: loaded.__test, queries };
  } finally {
    Module._load = originalLoad;
  }
}

test.beforeEach((t) => {
  t.mock.method(https, 'request', bridgeHttpsRequestToFetch);
  process.env.TELEGRAM_BOT_TOKEN = 'curator-token';
  process.env.TELEGRAM_CHAT_ID = '999';
});

test.afterEach(() => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  delete require.cache[MODULE_PATH];
});

test('refund button is a signal and does not persist content', async () => {
  const logs = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = (...args) => { logs.push(args); originalLog.apply(console, args); };
  console.warn = (...args) => { logs.push(args); originalWarn.apply(console, args); };
  const telegramCalls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    telegramCalls.push({ url: String(url), body: options.body || '' });
    return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 1 } }) };
  };
  const { subject, queries } = loadModule();
  try {
    const result = await subject.handleCuratorBotUpdate({
      callback_query: {
        id: 'q1',
        data: 'refund_signal',
        message: { chat: { id: 42 }, message_id: 7 },
      },
    });
    assert.equal(result.kind, 'refund_signal');
    assert.match(subject.supportRefundReplyText(), /poplanton@mail\.ru/);
    assert.equal(queries.length, 0);
    assertNoProbe('logs', logs);
    assertNoProbe('telegram', telegramCalls);
    assert.equal(telegramCalls.some((call) => call.url.includes('/sendMessage')), true);
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    global.fetch = originalFetch;
  }
});

test('free text with phone and amount is not stored, forwarded, or logged', async () => {
  const logs = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  console.log = (...args) => { logs.push(args); originalLog.apply(console, args); };
  console.warn = (...args) => { logs.push(args); originalWarn.apply(console, args); };
  console.error = (...args) => { logs.push(args); originalError.apply(console, args); };
  const telegramCalls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    telegramCalls.push({ url: String(url), body: options.body || '' });
    return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 1 } }) };
  };
  const { subject, queries } = loadModule();
  try {
    assert.equal(subject.isSupportRefundSignal(PROBE_TEXT), false);
    assert.equal(subject.classifySupportInbound({ text: PROBE_TEXT }), 'free_text');
    const result = await subject.handleSupportBotMessage({
      chat: { id: 77 },
      text: PROBE_TEXT,
    });
    assert.equal(result.outcome, 'refund_redirect');
    assert.equal(result.kind, 'free_text');
    assert.equal(queries.length, 0);
    assertNoProbe('queries', queries);
    assertNoProbe('logs', logs);
    assertNoProbe('telegram', telegramCalls);
    const sentBodies = telegramCalls.map((call) => String(call.body));
    assert.equal(sentBodies.some((body) => body.includes('poplanton@mail.ru')), true);
    assert.equal(flatten(logs).join('\n').includes('"kind":"free_text"'), true);
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
    global.fetch = originalFetch;
  }
});

test('exact refund phrase is a signal and still stores nothing', async () => {
  const { subject, queries } = loadModule();
  assert.equal(subject.isSupportRefundSignal('Хочу вернуть деньги!'), true);
  assert.equal(subject.classifySupportInbound({ text: 'Хочу вернуть деньги' }), 'refund_signal');
  assert.equal(queries.length, 0);
});
