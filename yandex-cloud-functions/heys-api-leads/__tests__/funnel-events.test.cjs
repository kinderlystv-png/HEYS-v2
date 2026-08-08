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

function leadEvent(overrides = {}) {
  return {
    httpMethod: 'POST',
    headers: {
      origin: 'http://localhost:3003',
      'x-forwarded-for': '127.0.0.1',
    },
    body: JSON.stringify({
      name: 'Иван',
      phone: '+7 (999) 111-22-33',
      messenger: 'telegram',
      birth_year: 1990,
      consent: {
        privacy_version: '1.7',
        method: 'checkbox',
      },
      ...overrides,
    }),
  };
}

function quietConsole(t) {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', () => {});
  t.after(() => delete require.cache[MODULE_PATH]);
}

// Ответ на все запросы стандартного "новый лид, без дубликата" сценария.
function newLeadRespond(extra) {
  return async (sql, params) => {
    if (/SELECT COUNT\(\*\)/.test(sql)) return { rows: [{ cnt: 0 }] };
    if (/SELECT id, created_at/.test(sql)) return { rows: [] };
    if (/INSERT INTO leads/.test(sql)) return { rows: [{ id: LEAD_ID }] };
    if (/record_funnel_event/.test(sql)) {
      if (extra) return extra(sql, params);
      return { rows: [{ event: null }] };
    }
    return { rows: [] };
  };
}

// Шаги воронки: p_event_type = params[0], p_lead_id = params[1],
// p_segment = params[5], p_metadata = params[8], p_dedupe_key = params[9].
function funnelStepQueries(queries) {
  const stepNames = new Set(['quiz_start', 'quiz_complete', 'week_request']);
  return queries.filter(
    (q) => /record_funnel_event/.test(q.sql) && stepNames.has(q.params[0]),
  );
}

test('cleanFunnelSteps: valid three-step trail keeps order and shape', async (t) => {
  quietConsole(t);
  const { handler, queries } = loadSubject(newLeadRespond());

  const event = leadEvent({
    funnel: [
      { name: 'quiz_start', offset_ms: 0 },
      { name: 'quiz_complete', offset_ms: 5000, segment: 'evening' },
      { name: 'week_request', offset_ms: 12000, quiz: true },
    ],
  });

  const response = await handler(event);
  assert.equal(response.statusCode, 200);

  const steps = funnelStepQueries(queries);
  assert.equal(steps.length, 3);
  assert.deepEqual(
    steps.map((q) => q.params[0]),
    ['quiz_start', 'quiz_complete', 'week_request'],
  );

  const complete = steps.find((q) => q.params[0] === 'quiz_complete');
  assert.equal(complete.params[5], 'evening');

  const week = steps.find((q) => q.params[0] === 'week_request');
  const metadata = JSON.parse(week.params[8]);
  assert.equal(metadata.entry, 'landing');
  assert.equal(metadata.quiz, true);
  assert.equal('name' in metadata, false);
  assert.equal('phone' in metadata, false);
});

test('cleanFunnelSteps: unknown name and out-of-range offset_ms are dropped', () => {
  const { subject } = loadSubject();
  const cleaned = subject.cleanFunnelSteps([
    { name: 'quiz_start', offset_ms: 0 },
    { name: 'bogus_event', offset_ms: 100 },
    { name: 'quiz_complete', offset_ms: -1 },
    { name: 'quiz_complete', offset_ms: Infinity },
    { name: 'week_request', offset_ms: 6 * 60 * 60 * 1000 + 1 },
    { name: 'week_request', offset_ms: 6 * 60 * 60 * 1000 },
  ]);

  assert.deepEqual(
    cleaned.map((s) => s.name),
    ['quiz_start', 'week_request'],
  );
});

test('cleanFunnelSteps: non-array or missing funnel yields empty list without throwing', () => {
  const { subject } = loadSubject();
  assert.deepEqual(subject.cleanFunnelSteps(undefined), []);
  assert.deepEqual(subject.cleanFunnelSteps(null), []);
  assert.deepEqual(subject.cleanFunnelSteps('not-an-array'), []);
  assert.deepEqual(subject.cleanFunnelSteps({}), []);
});

test('missing or malformed funnel field does not block lead save', async (t) => {
  quietConsole(t);
  {
    const { handler, queries } = loadSubject(newLeadRespond());
    const response = await handler(leadEvent());
    assert.equal(response.statusCode, 200);
    assert.equal(funnelStepQueries(queries).length, 0);
  }
  {
    const { handler, queries } = loadSubject(newLeadRespond());
    const response = await handler(leadEvent({ funnel: 'not-an-array' }));
    assert.equal(response.statusCode, 200);
    assert.equal(funnelStepQueries(queries).length, 0);
  }
});

test('a failing funnel step does not turn the response into a 500', async (t) => {
  quietConsole(t);
  const { handler, queries } = loadSubject(
    newLeadRespond((sql, params) => {
      if (params[0] === 'quiz_start') throw new Error('boom');
      return { rows: [{ event: null }] };
    }),
  );

  const event = leadEvent({
    funnel: [
      { name: 'quiz_start', offset_ms: 0 },
      { name: 'week_request', offset_ms: 1000 },
    ],
  });

  const response = await handler(event);
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(body.success, true);
  assert.equal(body.id, LEAD_ID);

  // Упавший шаг не должен остановить запись следующих.
  const steps = funnelStepQueries(queries);
  assert.deepEqual(
    steps.map((q) => q.params[0]),
    ['quiz_start', 'week_request'],
  );
});

test('dedupe_key is deterministic and carries the lead id, step name and offset', async (t) => {
  quietConsole(t);
  const { handler, queries } = loadSubject(newLeadRespond());

  const event = leadEvent({
    funnel: [{ name: 'week_request', offset_ms: 4200 }],
  });

  const response = await handler(event);
  assert.equal(response.statusCode, 200);

  const [step] = funnelStepQueries(queries);
  assert.equal(step.params[9], `landing_funnel:${LEAD_ID}:week_request:4200`);
});

test('duplicate lead (window match) does not record funnel steps again', async (t) => {
  quietConsole(t);
  const { handler, queries } = loadSubject(async (sql) => {
    if (/SELECT COUNT\(\*\)/.test(sql)) return { rows: [{ cnt: 0 }] };
    if (/SELECT id, created_at/.test(sql)) {
      return { rows: [{ id: LEAD_ID, created_at: '2026-07-18T10:00:00.000Z' }] };
    }
    return { rows: [] };
  });

  const event = leadEvent({
    funnel: [
      { name: 'quiz_start', offset_ms: 0 },
      { name: 'week_request', offset_ms: 1000 },
    ],
  });

  const response = await handler(event);
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(body.duplicate, true);
  assert.equal(funnelStepQueries(queries).length, 0);
  assert.equal(queries.some((q) => /record_funnel_event/.test(q.sql)), false);
});
