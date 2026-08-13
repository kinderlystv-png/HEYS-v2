const assert = require('assert');
const crypto = require('crypto');
const path = require('path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'shared-product-check-violation-secret';
process.env.ALLOW_LOCALHOST_ORIGINS = '1';

const CURATOR_ID = '11111111-1111-4111-8111-111111111111';
const ATTACKER_ID = '22222222-2222-4222-8222-222222222222';

const IMPOSSIBLE_PRODUCT = {
  name: 'Клетчатка яблочная MEDUTEUT',
  protein100: 5,
  simple100: 40,
  complex100: 0,
  badFat100: 2,
  goodFat100: 0,
  fiber100: 60,
  fingerprint: 'test-fingerprint',
};

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
        if (sql.includes('publish_shared_product_by_curator')) {
          const error = new Error(
            'new row for relation "shared_products" violates check constraint "shared_products_mass_within_100g"',
          );
          error.code = '23514';
          error.constraint = 'shared_products_mass_within_100g';
          throw error;
        }
        throw new Error(`Unexpected SQL in check-violation mock: ${sql}`);
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

function rpcEvent(fn, token, body = {}) {
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

  const rejected = await handler(rpcEvent('publish_shared_product_by_curator', curatorToken, {
    p_curator_id: ATTACKER_ID,
    p_product_data: IMPOSSIBLE_PRODUCT,
  }));

  assert.strictEqual(rejected.statusCode, 200, 'CHECK violation is a business error, not 500');
  const body = JSON.parse(rejected.body);
  assert.strictEqual(body.success, false);
  assert.strictEqual(body.code, 'CHECK_VIOLATION');
  assert.strictEqual(body.constraint, 'shared_products_mass_within_100g');
  assert.match(body.error, /107 г на 100 г/);
  assert.match(body.error, /лимит 105 г/);
  assert.doesNotMatch(body.error, /Database error/i);

  console.log('shared product check-violation RPC contract tests: OK');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
