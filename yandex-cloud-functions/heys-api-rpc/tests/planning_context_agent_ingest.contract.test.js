const assert = require('assert');
const path = require('path');

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const AGENT_SECRET = 'test-planning-agent-secret-for-contract';

function createMockPool() {
  const kvByClient = new Map();

  function getClientStore(clientId) {
    if (!kvByClient.has(clientId)) kvByClient.set(clientId, new Map());
    return kvByClient.get(clientId);
  }

  return {
    seedClient(clientId, keyToValue) {
      const store = getClientStore(clientId);
      for (const [k, v] of Object.entries(keyToValue || {})) {
        store.set(k, v);
      }
    },
    connect: async () => ({
      query: async (sql, values = []) => {
        if (/BEGIN|ROLLBACK|COMMIT/.test(sql)) return { rows: [] };

        if (sql.includes('batch_get_client_kv_by_client_id')) {
          const clientId = values[0];
          const keys = values[1] || [];
          const store = getClientStore(clientId);
          return {
            rows: keys
              .filter((k) => store.has(k))
              .map((k) => ({ k, v: JSON.stringify(store.get(k)) })),
          };
        }

        if (sql.includes('batch_upsert_client_kv_by_client_id')) {
          const clientId = values[0];
          const items = JSON.parse(values[1] || '[]');
          const store = getClientStore(clientId);
          for (const item of items) store.set(item.k, item.v);
          return { rows: [{ ok: true }] };
        }

        throw new Error('Unexpected SQL in agent ingest mock: ' + sql);
      },
      release: () => {},
    }),
  };
}

async function run() {
  const prevSecret = process.env.PLANNING_AGENT_SECRET;
  process.env.PLANNING_AGENT_SECRET = AGENT_SECRET;

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

  const baseBody = {
    targetClientId: CLIENT_ID,
    source: 'heys_cursor_agent',
    applyNow: true,
    dryRun: false,
    idempotencyKey: 'agent-idem-00000001',
    policy: { antiDuplicateFirst: true, maxNowTasks: 3 },
    snapshotText: `== HEYS Context Snapshot ==
--- Контекст дня ---
Дата: 2026-04-13
Режим: Режим фокуса
--- Inbox ---
1. 📌 [Заметка] agent contract note
   agent contract note`,
    daysLast5Text: 'Нет данных',
    rawPromptText: '',
  };

  const noSecret = process.env.PLANNING_AGENT_SECRET;
  process.env.PLANNING_AGENT_SECRET = '';
  delete require.cache[handlerPath];
  const { handler: hDisabled } = require(handlerPath);
  const disabledRes = await hDisabled({
    httpMethod: 'POST',
    path: '/rpc',
    queryStringParameters: { fn: 'planning_context_agent_ingest' },
    headers: {
      origin: 'https://app.heyslab.ru',
      Authorization: 'Bearer x',
    },
    body: JSON.stringify(baseBody),
  });
  assert.strictEqual(disabledRes.statusCode, 503);
  process.env.PLANNING_AGENT_SECRET = noSecret;

  delete require.cache[handlerPath];
  const { handler: handler2 } = require(handlerPath);

  async function callAgent2(headers, body) {
    const res = await handler2({
      httpMethod: 'POST',
      path: '/rpc',
      queryStringParameters: { fn: 'planning_context_agent_ingest' },
      headers: { origin: 'https://app.heyslab.ru', ...headers },
      body: JSON.stringify(body),
    });
    return { status: res.statusCode, body: JSON.parse(res.body) };
  }

  const unauthorized = await callAgent2({}, baseBody);
  assert.strictEqual(unauthorized.status, 401);

  const badBearer = await callAgent2({ Authorization: 'Bearer wrong-secret' }, baseBody);
  assert.strictEqual(badBearer.status, 401);

  process.env.PLANNING_AGENT_ALLOWED_CLIENT_IDS = '22222222-2222-4222-8222-222222222222';
  delete require.cache[handlerPath];
  const { handler: handler3 } = require(handlerPath);
  const forbidden = await handler3({
    httpMethod: 'POST',
    path: '/rpc',
    queryStringParameters: { fn: 'planning_context_agent_ingest' },
    headers: {
      origin: 'https://app.heyslab.ru',
      Authorization: `Bearer ${AGENT_SECRET}`,
    },
    body: JSON.stringify(baseBody),
  });
  assert.strictEqual(forbidden.statusCode, 403);
  delete process.env.PLANNING_AGENT_ALLOWED_CLIENT_IDS;

  delete require.cache[handlerPath];
  const { handler: handler4 } = require(handlerPath);

  async function callAgent4(headers, body) {
    const res = await handler4({
      httpMethod: 'POST',
      path: '/rpc',
      queryStringParameters: { fn: 'planning_context_agent_ingest' },
      headers: { origin: 'https://app.heyslab.ru', ...headers },
      body: JSON.stringify(body),
    });
    return { status: res.statusCode, body: JSON.parse(res.body) };
  }

  const ok = await callAgent4({ Authorization: `Bearer ${AGENT_SECRET}` }, baseBody);
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.body.ok, true);
  assert.strictEqual(ok.body.audit.applyStatus, 'applied');

  if (prevSecret === undefined) delete process.env.PLANNING_AGENT_SECRET;
  else process.env.PLANNING_AGENT_SECRET = prevSecret;

  console.log('planning_context_agent_ingest contract tests: OK');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
