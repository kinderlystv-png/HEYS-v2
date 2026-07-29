const assert = require('assert');
const crypto = require('crypto');
const path = require('path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'curator-product-rpc-auth-contract-secret';
process.env.ALLOW_LOCALHOST_ORIGINS = '1';

const CURATOR_ID = '11111111-1111-4111-8111-111111111111';
const ATTACKER_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = '33333333-3333-4333-8333-333333333333';

const CASES = [
  {
    fn: 'publish_shared_product_by_curator',
    params: { p_curator_id: ATTACKER_ID, p_product_data: { name: 'Test product', fingerprint: 'test-fingerprint' } },
  },
  {
    fn: 'add_shared_product_barcode_by_curator',
    params: { p_curator_id: ATTACKER_ID, p_product_id: PRODUCT_ID, p_barcode: '4601234567890' },
  },
  {
    fn: 'update_shared_product_portions_by_curator',
    params: { p_curator_id: ATTACKER_ID, p_product_id: PRODUCT_ID, p_portions: [{ name: '1 шт', grams: 90 }] },
  },
];

function base64Url(value) {
  return Buffer.from(JSON.stringify(value))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function signJwt(payload) {
  const header = base64Url({ alg: 'HS256', typ: 'JWT' });
  const body = base64Url({ ...payload, exp: Math.floor(Date.now() / 1000) + 3600 });
  const signature = crypto
    .createHmac('sha256', process.env.JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return `${header}.${body}.${signature}`;
}

function createMockPool() {
  const api = {
    queries: [],
    connect: async () => ({
      query: async (sql, values = []) => {
        if (sql === 'SELECT 1') return { rows: [{ '?column?': 1 }] };
        api.queries.push({ sql, values });
        const testCase = CASES.find(({ fn }) => sql.includes(fn));
        if (!testCase) throw new Error(`Unexpected SQL in curator product RPC mock: ${sql}`);
        return {
          rows: [{
            [testCase.fn]: {
              success: true,
              status: 'updated',
              id: PRODUCT_ID,
            },
          }],
        };
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

function rpcEvent(fn, token, body) {
  return {
    httpMethod: 'POST',
    path: '/rpc',
    queryStringParameters: { fn },
    headers: {
      origin: 'https://app.heyslab.ru',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  };
}

async function run() {
  const mockPool = createMockPool();
  const handler = await loadHandler(mockPool);
  const curatorToken = signJwt({ sub: CURATOR_ID, role: 'curator' });
  const clientToken = signJwt({ sub: CURATOR_ID, role: 'client' });

  for (const testCase of CASES) {
    const queryCountBefore = mockPool.queries.length;

    const missing = await handler(rpcEvent(testCase.fn, null, testCase.params));
    assert.strictEqual(missing.statusCode, 401, `${testCase.fn}: missing JWT must return 401`);
    assert.strictEqual(mockPool.queries.length, queryCountBefore, `${testCase.fn}: missing JWT must fail before SQL`);

    const wrongRole = await handler(rpcEvent(testCase.fn, clientToken, testCase.params));
    assert.strictEqual(wrongRole.statusCode, 403, `${testCase.fn}: wrong role must return 403`);
    assert.strictEqual(mockPool.queries.length, queryCountBefore, `${testCase.fn}: wrong role must fail before SQL`);

    const accepted = await handler(rpcEvent(testCase.fn, curatorToken, testCase.params));
    assert.strictEqual(accepted.statusCode, 200, `${testCase.fn}: curator JWT must be accepted`);

    const query = mockPool.queries.at(-1);
    assert.ok(query.sql.includes(testCase.fn), `${testCase.fn}: expected SQL call`);
    assert.ok(query.values.includes(CURATOR_ID), `${testCase.fn}: curator id must come from JWT`);
    assert.ok(!query.values.includes(ATTACKER_ID), `${testCase.fn}: browser-supplied curator id must be ignored`);
  }

  console.log('curator product RPC auth contract tests: OK');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
