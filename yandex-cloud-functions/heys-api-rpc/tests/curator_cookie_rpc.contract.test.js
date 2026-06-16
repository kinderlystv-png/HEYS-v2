const assert = require('assert');
const crypto = require('crypto');
const path = require('path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'rpc-curator-cookie-contract-secret';
process.env.ALLOW_LOCALHOST_ORIGINS = '1';

const CURATOR_ID = '11111111-1111-4111-8111-111111111111';

function base64Url(value) {
  return Buffer.from(JSON.stringify(value))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function signCuratorJwt() {
  const header = base64Url({ alg: 'HS256', typ: 'JWT' });
  const payload = base64Url({
    sub: CURATOR_ID,
    role: 'curator',
    email: 'curator@example.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const signature = crypto
    .createHmac('sha256', process.env.JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return `${header}.${payload}.${signature}`;
}

function createMockPool() {
  const api = {
    queries: [],
    connect: async () => ({
      query: async (sql, values = []) => {
        if (sql === 'SELECT 1') return { rows: [{ '?column?': 1 }] };
        api.queries.push({ sql, values });
        if (!sql.includes('admin_get_trial_queue_list')) {
          throw new Error('Unexpected SQL in curator cookie RPC mock: ' + sql);
        }
        return { rows: [{ admin_get_trial_queue_list: { success: true, items: [] } }] };
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

function rpcEvent(token) {
  return {
    httpMethod: 'POST',
    path: '/rpc',
    queryStringParameters: { fn: 'admin_get_trial_queue_list' },
    headers: {
      origin: 'https://app.heyslab.ru',
      ...(token ? { cookie: `heys_curator_jwt=${encodeURIComponent(token)}` } : {}),
    },
    body: JSON.stringify({ p_limit: 10, p_offset: 0 }),
  };
}

async function run() {
  const mockPool = createMockPool();
  const handler = await loadHandler(mockPool);
  const token = signCuratorJwt();

  const missing = await handler(rpcEvent(null));
  assert.strictEqual(missing.statusCode, 401);
  assert.match(String(missing.body), /Authorization required for curator functions/);
  assert.strictEqual(mockPool.queries.length, 0, 'missing cookie must fail before SQL');

  const accepted = await handler(rpcEvent(token));
  assert.strictEqual(accepted.statusCode, 200);
  assert.deepStrictEqual(JSON.parse(accepted.body), {
    admin_get_trial_queue_list: { success: true, items: [] },
  });

  const query = mockPool.queries.find((q) => q.sql.includes('admin_get_trial_queue_list'));
  assert.ok(query, 'admin_get_trial_queue_list SQL should run after curator cookie auth');
  assert.match(query.sql, /p_curator_id => \$\d+::uuid/);
  assert.ok(query.values.includes(CURATOR_ID), 'curator id should be injected from heys_curator_jwt cookie');

  console.log('curator_cookie_rpc contract tests: OK');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
