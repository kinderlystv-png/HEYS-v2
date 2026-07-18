const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const MODULE_PATH = path.resolve(__dirname, '../index.js');
const LEAD_ID = '22222222-2222-2222-2222-222222222222';

function loadSubject(respond = async () => ({ rows: [] })) {
  delete require.cache[MODULE_PATH];
  const queries = [];
  let poolCalls = 0;
  let releases = 0;
  const client = {
    async query(sql, params = []) {
      const query = { sql: String(sql), params };
      queries.push(query);
      return respond(query.sql, params);
    },
    release() {
      releases += 1;
    },
  };
  const pool = { connect: async () => client };

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === './shared/db-pool') {
      return {
        getPool: () => {
          poolCalls += 1;
          return pool;
        },
      };
    }
    if (request === './shared/secrets') return { initSecrets: async () => {} };
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const loaded = require(MODULE_PATH);
    return {
      handler: loaded.handler,
      subject: loaded.__test,
      queries,
      getPoolCalls: () => poolCalls,
      getReleases: () => releases,
    };
  } finally {
    Module._load = originalLoad;
  }
}

function leadEvent(phone) {
  return {
    httpMethod: 'POST',
    headers: {
      origin: 'http://localhost:3003',
      'x-forwarded-for': '127.0.0.1',
    },
    body: JSON.stringify({
      name: 'Иван',
      phone,
      messenger: 'telegram',
      birth_year: 1990,
      consent: {
        privacy_version: '2026-07-01',
        method: 'checkbox',
        accepted_at: '2026-07-18T10:00:00.000Z',
      },
    }),
  };
}

function quietConsole(t) {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', () => {});
  t.after(() => delete require.cache[MODULE_PATH]);
}

test('normalizes supported phone variants at the valid boundaries', () => {
  const { subject } = loadSubject();
  const cases = [
    ['9991112233', '+79991112233'],
    ['79991112233', '+79991112233'],
    ['89991112233', '+79991112233'],
    ['  +7 (999) 111-22-33  ', '+79991112233'],
  ];

  for (const [input, expected] of cases) {
    assert.equal(subject.normalizePhone(input), expected, input);
  }
});

test('rejects empty, short, long, alphabetic and malformed phone values', () => {
  const { subject } = loadSubject();
  const invalid = [
    '',
    '999111223',
    '799911122334',
    '+7 (999) ABC-22-33',
    '7+9991112233',
    '+44 20 7946 0958',
  ];

  for (const input of invalid) {
    assert.equal(subject.normalizePhone(input), null, input);
  }
});

test('empty phone returns a clear phone error without opening the DB pool', async (t) => {
  quietConsole(t);
  const { handler, getPoolCalls } = loadSubject();

  const response = await handler(leadEvent(''));
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 400);
  assert.equal(body.error, 'Invalid phone format');
  assert.equal(body.message, 'Введите корректный номер телефона');
  assert.equal(getPoolCalls(), 0);
});

test('invalid phone returns a clear 400 before rate-limit and DB side effects', async (t) => {
  quietConsole(t);
  const { handler, queries, getPoolCalls } = loadSubject();

  for (const phone of ['999111223', '799911122334', '+7ABC9991112233']) {
    const response = await handler(leadEvent(phone));
    const body = JSON.parse(response.body);
    assert.equal(response.statusCode, 400, phone);
    assert.equal(body.error, 'Invalid phone format', phone);
    assert.equal(body.message, 'Введите корректный номер телефона', phone);
  }

  assert.equal(getPoolCalls(), 0);
  assert.equal(queries.length, 0);
});

test('formatted phone is normalized before duplicate lookup and INSERT', async (t) => {
  quietConsole(t);
  const { handler, queries, getReleases } = loadSubject(async (sql) => {
    if (/SELECT COUNT\(\*\)/.test(sql)) return { rows: [{ cnt: 0 }] };
    if (/SELECT id, created_at/.test(sql)) return { rows: [] };
    if (/INSERT INTO leads/.test(sql)) return { rows: [{ id: LEAD_ID }] };
    if (/record_funnel_event/.test(sql)) return { rows: [{ event: null }] };
    return { rows: [] };
  });

  const response = await handler(leadEvent('+7 (999) 111-22-33'));
  const duplicateLookup = queries.find((query) => /SELECT id, created_at/.test(query.sql));
  const insert = queries.find((query) => /INSERT INTO leads/.test(query.sql));

  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).duplicate, false);
  assert.equal(duplicateLookup.params[0], '+79991112233');
  assert.equal(insert.params[1], '+79991112233');
  assert.equal(getReleases(), 1);
});

test('deduplication still uses the canonical phone and skips a second INSERT', async (t) => {
  quietConsole(t);
  const { handler, queries, getReleases } = loadSubject(async (sql) => {
    if (/SELECT COUNT\(\*\)/.test(sql)) return { rows: [{ cnt: 0 }] };
    if (/SELECT id, created_at/.test(sql)) {
      return { rows: [{ id: LEAD_ID, created_at: '2026-07-18T10:00:00.000Z' }] };
    }
    return { rows: [] };
  });

  const response = await handler(leadEvent('8 (999) 111-22-33'));
  const body = JSON.parse(response.body);
  const duplicateLookup = queries.find((query) => /SELECT id, created_at/.test(query.sql));

  assert.equal(response.statusCode, 200);
  assert.equal(body.id, LEAD_ID);
  assert.equal(body.duplicate, true);
  assert.equal(duplicateLookup.params[0], '+79991112233');
  assert.equal(queries.some((query) => /INSERT INTO leads/.test(query.sql)), false);
  assert.equal(getReleases(), 1);
});
