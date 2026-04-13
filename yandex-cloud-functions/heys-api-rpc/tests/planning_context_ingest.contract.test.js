const assert = require('assert');
const path = require('path');

function createMockPool() {
  const kvBySession = new Map();

  function getSessionStore(sessionToken) {
    if (!kvBySession.has(sessionToken)) kvBySession.set(sessionToken, new Map());
    return kvBySession.get(sessionToken);
  }

  const api = {
    lastUpsert: null,
    seed(sessionToken, keyToValue) {
      if (!kvBySession.has(sessionToken)) kvBySession.set(sessionToken, new Map());
      const store = kvBySession.get(sessionToken);
      for (const [k, v] of Object.entries(keyToValue || {})) {
        store.set(k, v);
      }
    },
    connect: async () => {
      let currentSessionToken = null;
      return {
        query: async (sql, values = []) => {
          if (/BEGIN|ROLLBACK|COMMIT/.test(sql)) return { rows: [] };

          if (sql.includes('batch_get_client_kv_by_session')) {
            const sessionToken = values[0];
            const keys = values[1] || [];
            currentSessionToken = sessionToken;
            const store = getSessionStore(sessionToken);
            return {
              rows: keys
                .filter((k) => store.has(k))
                .map((k) => ({ k, v: JSON.stringify(store.get(k)) })),
            };
          }

          if (sql.includes('batch_upsert_client_kv_by_session')) {
            const sessionToken = values[0] || currentSessionToken;
            const items = JSON.parse(values[1] || '[]');
            api.lastUpsert = { sessionToken, items };
            const store = getSessionStore(sessionToken);
            for (const item of items) store.set(item.k, item.v);
            return { rows: [{ ok: true }] };
          }

          throw new Error('Unexpected SQL in test mock: ' + sql);
        },
        release: () => {},
      };
    },
  };
  return api;
}

async function run() {
  const dbPoolPath = path.resolve(__dirname, '..', 'shared', 'db-pool.js');
  const handlerPath = path.resolve(__dirname, '..', 'index.js');
  const mockPool = createMockPool();

  require.cache[dbPoolPath] = {
    id: dbPoolPath,
    filename: dbPoolPath,
    loaded: true,
    exports: { getPool: () => mockPool },
  };
  delete require.cache[handlerPath];
  const { handler } = require(handlerPath);

  const baseBody = {
    source: 'heys_context_all_button',
    applyNow: true,
    dryRun: false,
    idempotencyKey: 'idem-00000001',
    policy: { antiDuplicateFirst: true, maxNowTasks: 3 },
    input: {
      sessionToken: 'test-session',
      snapshotText: `== HEYS Context Snapshot ==
--- Контекст дня ---
Дата: 2026-04-13
Режим: Режим фокуса
Просроченные: 3
Дедлайны сегодня: 1
Inbox: 1 записей
--- Inbox ---
1. ❓ [Вопрос] Ждёт решения: что приоритетнее сегодня?
   Ждёт решения: что приоритетнее сегодня?`,
      daysLast5Text: 'Нет данных',
      rawPromptText: '',
    },
  };

  async function call(body) {
    const res = await handler({
      httpMethod: 'POST',
      path: '/planning/context-ingest',
      headers: { origin: 'https://app.heyslab.ru' },
      body: JSON.stringify(body),
    });
    return { status: res.statusCode, body: JSON.parse(res.body) };
  }

  // 1) applyNow
  const applyRes = await call(baseBody);
  assert.strictEqual(applyRes.status, 200);
  assert.strictEqual(applyRes.body.ok, true);
  assert.strictEqual(applyRes.body.audit.applyStatus, 'applied');
  assert.ok(Array.isArray(applyRes.body.unresolved));

  // 2) idempotent replay
  const replayRes = await call(baseBody);
  assert.strictEqual(replayRes.status, 200);
  assert.strictEqual(replayRes.body.audit.idempotencyKey, baseBody.idempotencyKey);

  // 3) idempotency conflict
  const conflictRes = await call({
    ...baseBody,
    input: { ...baseBody.input, snapshotText: baseBody.input.snapshotText + '\nextra' },
  });
  assert.strictEqual(conflictRes.status, 409);
  assert.strictEqual(conflictRes.body.ok, false);

  // 4) dryRun
  const dryRunRes = await call({
    ...baseBody,
    idempotencyKey: 'idem-00000002',
    dryRun: true,
  });
  assert.strictEqual(dryRunRes.status, 200);
  assert.strictEqual(dryRunRes.body.audit.applyStatus, 'analyzed_only');

  // 5) semantic neighbor link to pre-existing inbox (moderate Jaccard, dry-run)
  const EXISTING_INBOX_ID = 'ex-inbox-semantic-neighbor-1';
  const KV_INBOX = 'heys_planning_inbox_v1';
  const KV_TASKS = 'heys_planning_tasks';
  const KV_LINKS = 'heys_planning_links_v1';
  mockPool.seed('test-session-semantic', {
    [KV_INBOX]: [
      {
        id: EXISTING_INBOX_ID,
        type: 'capture',
        status: 'new',
        source: 'fixture',
        privacy: 'standard',
        title: 'alpha beta gamma delta epsilon zeta',
        preview: '',
        body: 'alpha beta gamma delta epsilon zeta',
        linkedTaskIds: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    [KV_TASKS]: [],
    [KV_LINKS]: [],
  });
  delete require.cache[handlerPath];
  const { handler: handler2 } = require(handlerPath);
  async function callSemantic(body) {
    const res = await handler2({
      httpMethod: 'POST',
      path: '/planning/context-ingest',
      headers: { origin: 'https://app.heyslab.ru' },
      body: JSON.stringify(body),
    });
    return { status: res.statusCode, body: JSON.parse(res.body) };
  }
  const semanticSnapshot = `== HEYS Context Snapshot ==
--- Контекст дня ---
Дата: 2026-04-13
--- Inbox ---
1. 📌 [Заметка] alpha beta gamma delta other
   alpha beta gamma delta other`;
  const semRes = await callSemantic({
    source: 'heys_context_all_button',
    applyNow: true,
    dryRun: true,
    idempotencyKey: 'idem-semantic-neighbor-01',
    policy: { antiDuplicateFirst: true, maxNowTasks: 3 },
    input: {
      sessionToken: 'test-session-semantic',
      snapshotText: semanticSnapshot,
      daysLast5Text: 'Нет данных',
      rawPromptText: '',
      clientTs: '2026-04-13T12:00:00.000Z',
      timezone: 'Europe/Moscow',
    },
  });
  assert.strictEqual(semRes.status, 200);
  assert.strictEqual(semRes.body.ok, true);
  const neighborLinks = (semRes.body.links?.created || []).filter(
    (l) => l.label === 'ingest_semantic_neighbor',
  );
  assert.ok(
    neighborLinks.some((l) => l.toId === EXISTING_INBOX_ID && l.relation === 'related'),
    'expected ingest_semantic_neighbor link to pre-existing inbox',
  );
  assert.ok(
    (semRes.body.metrics?.semanticNeighborLinksAdded || 0) >= 1,
    'expected semanticNeighborLinksAdded >= 1',
  );

  // 6) schedule hints on task → dueDate + calendar slot (dry-run)
  const KV_SLOTS = 'heys_planning_slots';
  mockPool.seed('test-session-schedule', {
    [KV_INBOX]: [],
    [KV_TASKS]: [],
    [KV_LINKS]: [],
    [KV_SLOTS]: [],
  });
  delete require.cache[handlerPath];
  const { handler: handler3 } = require(handlerPath);
  async function callSchedule(body) {
    const res = await handler3({
      httpMethod: 'POST',
      path: '/planning/context-ingest',
      headers: { origin: 'https://app.heyslab.ru' },
      body: JSON.stringify(body),
    });
    return { status: res.statusCode, body: JSON.parse(res.body) };
  }
  const scheduleSnapshot = `== HEYS Context Snapshot ==
--- Контекст дня ---
Дата: 2026-04-14
--- Inbox ---
1. ☑️ [Задача] Вайбкодить Kinderly
   Сделать до 2026-04-20, блок 2ч с 10:00`;
  const schedRes = await callSchedule({
    source: 'heys_context_apply_button',
    applyNow: true,
    dryRun: true,
    idempotencyKey: 'idem-schedule-hints-01',
    policy: { antiDuplicateFirst: true, maxNowTasks: 3 },
    input: {
      sessionToken: 'test-session-schedule',
      snapshotText: scheduleSnapshot,
      daysLast5Text: 'Нет данных',
      rawPromptText: '',
      clientTs: '2026-04-14T12:00:00.000Z',
      timezone: 'Europe/Moscow',
    },
  });
  assert.strictEqual(schedRes.status, 200);
  assert.strictEqual(schedRes.body.ok, true);
  assert.ok(
    (schedRes.body.metrics?.scheduleFieldsApplied || 0) >= 1,
    'expected scheduleFieldsApplied >= 1',
  );
  assert.ok(
    (schedRes.body.metrics?.ingestSlotsAdded || 0) >= 1,
    'expected ingestSlotsAdded >= 1',
  );
  const createdTasks = (schedRes.body.nodes?.created || []).filter((n) => n.type === 'task');
  assert.ok(createdTasks.length >= 1, 'expected at least one created task');

  // 7) Compact "2ч" (no space before ч) must parse duration; JS \\b breaks after Cyrillic "ч".
  mockPool.lastUpsert = null;
  mockPool.seed('test-session-2ch-compact', {
    [KV_INBOX]: [],
    [KV_TASKS]: [],
    [KV_LINKS]: [],
    [KV_SLOTS]: [],
  });
  delete require.cache[handlerPath];
  const { handler: handler4 } = require(handlerPath);
  const twoHourSnapshot = `== HEYS Context Snapshot ==
--- Контекст дня ---
Дата: 2026-04-13
--- Inbox ---
1. ☑️ [Задача] Вайбкодинг вечером
   Сделать до 2026-04-13, блок 2ч с 19:00`;
  const twoChRes = await (async () => {
    const res = await handler4({
      httpMethod: 'POST',
      path: '/planning/context-ingest',
      headers: { origin: 'https://app.heyslab.ru' },
      body: JSON.stringify({
        source: 'heys_context_apply_button',
        applyNow: true,
        dryRun: false,
        idempotencyKey: 'idem-2ch-compact-01',
        policy: { antiDuplicateFirst: true, maxNowTasks: 3 },
        input: {
          sessionToken: 'test-session-2ch-compact',
          snapshotText: twoHourSnapshot,
          daysLast5Text: 'Нет данных',
          rawPromptText: '',
          clientTs: '2026-04-13T12:00:00.000Z',
          timezone: 'Europe/Moscow',
        },
      }),
    });
    return { status: res.statusCode, body: JSON.parse(res.body) };
  })();
  assert.strictEqual(twoChRes.status, 200);
  assert.strictEqual(twoChRes.body.ok, true);
  assert.strictEqual(twoChRes.body.audit.applyStatus, 'applied');
  const upsertItems = mockPool.lastUpsert && mockPool.lastUpsert.items;
  assert.ok(Array.isArray(upsertItems), 'expected KV upsert during apply');
  const slotsPayload = upsertItems.find((i) => i.k === KV_SLOTS);
  assert.ok(Array.isArray(slotsPayload.v) && slotsPayload.v.length >= 1, 'expected slots in upsert');
  const slot19 = slotsPayload.v.find((s) => s && s.startTime === '19:00');
  assert.ok(slot19, 'expected 19:00 slot');
  assert.strictEqual(
    slot19.endTime,
    '21:00',
    'compact 2ч must yield 120 min (19:00–21:00), not default 60 min',
  );

  console.log('planning_context_ingest contract tests: OK');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
