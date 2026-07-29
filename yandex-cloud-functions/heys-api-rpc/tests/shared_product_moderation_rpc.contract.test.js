const assert = require('assert');
const crypto = require('crypto');
const path = require('path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'shared-product-moderation-contract-secret';
process.env.ALLOW_LOCALHOST_ORIGINS = '1';

const CURATOR_ID = '11111111-1111-4111-8111-111111111111';
const ATTACKER_ID = '22222222-2222-4222-8222-222222222222';
const PENDING_ID = '33333333-3333-4333-8333-333333333333';

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
    forbiddenNext: false,
    raceNext: false,
    connect: async () => ({
      query: async (sql, values = []) => {
        if (sql === 'SELECT 1') return { rows: [{ '?column?': 1 }] };
        api.queries.push({ sql, values });
        if (api.forbiddenNext) {
          api.forbiddenNext = false;
          const error = new Error('pending_forbidden');
          error.code = '42501';
          throw error;
        }
        if (sql.includes('moderate_pending_shared_product_by_curator')) {
          if (api.raceNext) {
            api.raceNext = false;
            return {
              rows: [{
                moderate_pending_shared_product_by_curator: {
                  success: false,
                  status: 'race',
                  error: 'already_moderated',
                  current_status: 'approved',
                },
              }],
            };
          }
          return {
            rows: [{
              moderate_pending_shared_product_by_curator: {
                success: true,
                status: 'approved',
                product_id: '44444444-4444-4444-8444-444444444444',
              },
            }],
          };
        }
        if (sql.includes('approve_pending_products_bulk')) {
          return {
            rows: [{
              approve_pending_products_bulk: {
                success: true,
                approved: 1,
                failed: 0,
                total: 1,
              },
            }],
          };
        }
        throw new Error(`Unexpected SQL in shared moderation mock: ${sql}`);
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
  const clientToken = signJwt({ sub: CURATOR_ID, role: 'client' });

  const missing = await handler(rpcEvent('moderate_pending_shared_product_by_curator', null, {
    p_pending_id: PENDING_ID,
    p_action: 'approve',
  }));
  assert.strictEqual(missing.statusCode, 401);
  assert.strictEqual(mockPool.queries.length, 0, 'missing JWT must fail before SQL');

  const wrongRole = await handler(rpcEvent('moderate_pending_shared_product_by_curator', clientToken, {
    p_pending_id: PENDING_ID,
    p_action: 'approve',
  }));
  assert.strictEqual(wrongRole.statusCode, 403);
  assert.strictEqual(mockPool.queries.length, 0, 'wrong role must fail before SQL');

  const accepted = await handler(rpcEvent('moderate_pending_shared_product_by_curator', curatorToken, {
    p_curator_id: ATTACKER_ID,
    p_pending_id: PENDING_ID,
    p_action: 'approve',
  }));
  assert.strictEqual(accepted.statusCode, 200);
  const moderationQuery = mockPool.queries.find((entry) => entry.sql.includes('moderate_pending_shared_product_by_curator'));
  assert.ok(moderationQuery, 'moderation SQL must run after curator authentication');
  assert.ok(moderationQuery.values.includes(CURATOR_ID), 'curator id must come from verified JWT');
  assert.ok(!moderationQuery.values.includes(ATTACKER_ID), 'browser-supplied curator id must be ignored');

  mockPool.raceNext = true;
  const repeated = await handler(rpcEvent('moderate_pending_shared_product_by_curator', curatorToken, {
    p_pending_id: PENDING_ID,
    p_action: 'approve',
  }));
  assert.strictEqual(repeated.statusCode, 200);
  assert.deepStrictEqual(JSON.parse(repeated.body), {
    moderate_pending_shared_product_by_curator: {
      success: false,
      status: 'race',
      error: 'already_moderated',
      current_status: 'approved',
    },
  });

  mockPool.forbiddenNext = true;
  const foreignPending = await handler(rpcEvent('moderate_pending_shared_product_by_curator', curatorToken, {
    p_pending_id: PENDING_ID,
    p_action: 'approve',
  }));
  assert.strictEqual(foreignPending.statusCode, 403);
  assert.deepStrictEqual(JSON.parse(foreignPending.body), { error: 'Forbidden', code: 'FORBIDDEN' });

  const bulkMissing = await handler(rpcEvent('approve_pending_products_bulk', null, {
    p_pending_ids: [PENDING_ID],
  }));
  assert.strictEqual(bulkMissing.statusCode, 401);

  const bulkAccepted = await handler(rpcEvent('approve_pending_products_bulk', curatorToken, {
    p_curator_id: ATTACKER_ID,
    p_pending_ids: [PENDING_ID],
  }));
  assert.strictEqual(bulkAccepted.statusCode, 200);
  const bulkQuery = mockPool.queries.find((entry) => entry.sql.includes('approve_pending_products_bulk'));
  assert.ok(bulkQuery, 'bulk moderation SQL must run after curator authentication');
  assert.ok(bulkQuery.values.includes(CURATOR_ID), 'bulk curator id must come from verified JWT');
  assert.ok(!bulkQuery.values.includes(ATTACKER_ID), 'bulk must ignore browser-supplied curator id');

  console.log('shared product moderation RPC contract tests: OK');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
