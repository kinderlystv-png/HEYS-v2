const assert = require('assert');
const path = require('path');

function createMockPool() {
  const api = {
    queries: [],
    connect: async () => ({
      query: async (sql, values = []) => {
        if (sql === 'SELECT 1') return { rows: [{ '?column?': 1 }] };
        api.queries.push({ sql, values });
        if (!sql.includes('request_trial')) {
          throw new Error('Unexpected SQL in legacy cookie RPC mock: ' + sql);
        }
        return { rows: [{ request_trial: { success: true, status: 'queued' } }] };
      },
      release: () => {},
    }),
  };
  return api;
}

async function loadHandler(mockPool) {
  const dbPoolPath = path.resolve(__dirname, '..', 'shared', 'db-pool.js');
  const handlerPath = path.resolve(__dirname, '..', 'index.js');
  require.cache[dbPoolPath] = {
    id: dbPoolPath,
    filename: dbPoolPath,
    loaded: true,
    exports: { getPool: () => mockPool },
  };
  delete require.cache[handlerPath];
  return require(handlerPath).handler;
}

async function run() {
  const mockPool = createMockPool();
  const handler = await loadHandler(mockPool);

  const ok = await handler({
    httpMethod: 'POST',
    path: '/rpc',
    queryStringParameters: { fn: 'request_trial' },
    headers: {
      origin: 'https://app.heyslab.ru',
      cookie: 'other=1; heys_session_token=cookie-session-legacy-1',
    },
    body: JSON.stringify({ p_source: 'app' }),
  });

  assert.strictEqual(ok.statusCode, 200);
  const requestTrial = mockPool.queries.find((q) => q.sql.includes('request_trial'));
  assert.ok(requestTrial, 'request_trial SQL should run');
  assert.match(requestTrial.sql, /request_trial\(/);
  assert.match(requestTrial.sql, /p_session_token => \$\d+::text/);
  assert.deepStrictEqual(requestTrial.values.sort(), ['app', 'cookie-session-legacy-1'].sort());
  assert.deepStrictEqual(JSON.parse(ok.body), {
    request_trial: { success: true, status: 'queued' },
  });

  const missing = await handler({
    httpMethod: 'POST',
    path: '/rpc',
    queryStringParameters: { fn: 'request_trial' },
    headers: { origin: 'https://app.heyslab.ru' },
    body: JSON.stringify({ p_source: 'app' }),
  });

  assert.strictEqual(missing.statusCode, 401);
  assert.deepStrictEqual(JSON.parse(missing.body), {
    ok: false,
    success: false,
    error: 'invalid_session',
    reason: 'missing_session_token',
  });

  console.log('session_cookie_legacy_rpc contract tests: OK');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
