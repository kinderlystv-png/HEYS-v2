const assert = require('assert');
const crypto = require('crypto');
const path = require('path');

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createJwt(payload, secret) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', secret)
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
        if (sql.includes('log_data_access')) {
          return { rows: [{ log_data_access: null }] };
        }
        if (sql.includes('admin_convert_lead')) {
          return {
            rows: [{
              admin_convert_lead: {
                success: true,
                client_id: 'client-1',
                pin: '4016',
                pin_token: '11111111-1111-4111-8111-111111111111',
              },
            }],
          };
        }
        if (sql.includes('admin_clear_telegram_binding')) {
          return {
            rows: [{
              admin_clear_telegram_binding: {
                success: true,
                client_id: 'client-1',
                cleared: true,
              },
            }],
          };
        }
        if (sql.includes('admin_regenerate_pin')) {
          return {
            rows: [{
              admin_regenerate_pin: {
              success: true,
              client_id: 'client-1',
              pin: '4016',
              pin_token: '11111111-1111-4111-8111-111111111111',
                sessions_revoked: 2,
              },
            }],
          };
        }
        if (sql.includes('create_client_with_pin')) {
          return {
            rows: [{
              client_id: '55555555-5555-4555-8555-555555555555',
              pin_token: '66666666-6666-4666-8666-666666666666',
              pin_token_expires_at: '2026-06-23T00:00:00.000Z',
            }],
          };
        }
        throw new Error('Unexpected SQL in admin client access mock: ' + sql);
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
  const prevJwt = process.env.JWT_SECRET;
  const jwtSecret = 'test-jwt-secret-for-admin-convert-lead';
  process.env.JWT_SECRET = jwtSecret;

  const curatorId = '11111111-1111-4111-8111-111111111111';
  const token = createJwt({
    sub: curatorId,
    email: 'curator@example.test',
    role: 'curator',
    exp: Math.floor(Date.now() / 1000) + 3600,
  }, jwtSecret);

  const mockPool = createMockPool();
  const handler = await loadHandler(mockPool);

  const res = await handler({
    httpMethod: 'POST',
    path: '/rpc',
    queryStringParameters: { fn: 'admin_convert_lead' },
    headers: {
      origin: 'https://app.heyslab.ru',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ p_lead_id: '22222222-2222-4222-8222-222222222222' }),
  });

  assert.strictEqual(res.statusCode, 200);
  const convertQuery = mockPool.queries.find((q) => q.sql.includes('admin_convert_lead'));
  assert.ok(convertQuery, 'admin_convert_lead SQL should run');
  assert.match(convertQuery.sql, /p_lead_id => \$1::uuid/);
  assert.match(convertQuery.sql, /p_curator_id => \$2::uuid/);
  assert.doesNotMatch(convertQuery.sql, /p_pin/);
  assert.deepStrictEqual(convertQuery.values, [
    '22222222-2222-4222-8222-222222222222',
    curatorId,
  ]);
  assert.strictEqual(JSON.parse(res.body).admin_convert_lead.pin, '4016');

  const clearRes = await handler({
    httpMethod: 'POST',
    path: '/rpc',
    queryStringParameters: { fn: 'admin_clear_telegram_binding' },
    headers: {
      origin: 'https://app.heyslab.ru',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ p_client_id: '33333333-3333-4333-8333-333333333333' }),
  });

  assert.strictEqual(clearRes.statusCode, 200);
  const clearQuery = mockPool.queries.find((q) => q.sql.includes('admin_clear_telegram_binding'));
  assert.ok(clearQuery, 'admin_clear_telegram_binding SQL should run');
  assert.match(clearQuery.sql, /p_client_id => \$1::uuid/);
  assert.match(clearQuery.sql, /p_curator_id => \$2::uuid/);
  assert.deepStrictEqual(clearQuery.values, [
    '33333333-3333-4333-8333-333333333333',
    curatorId,
  ]);
  assert.strictEqual(JSON.parse(clearRes.body).admin_clear_telegram_binding.cleared, true);

  const regenerateRes = await handler({
    httpMethod: 'POST',
    path: '/rpc',
    queryStringParameters: { fn: 'admin_regenerate_pin' },
    headers: {
      origin: 'https://app.heyslab.ru',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ p_client_id: '44444444-4444-4444-8444-444444444444' }),
  });

  assert.strictEqual(regenerateRes.statusCode, 200);
  const regenerateQuery = mockPool.queries.find((q) => q.sql.includes('admin_regenerate_pin'));
  assert.ok(regenerateQuery, 'admin_regenerate_pin SQL should run');
  assert.match(regenerateQuery.sql, /p_client_id => \$1::uuid/);
  assert.match(regenerateQuery.sql, /p_curator_id => \$2::uuid/);
  assert.deepStrictEqual(regenerateQuery.values, [
    '44444444-4444-4444-8444-444444444444',
    curatorId,
  ]);
  assert.strictEqual(JSON.parse(regenerateRes.body).admin_regenerate_pin.sessions_revoked, 2);

  const createRes = await handler({
    httpMethod: 'POST',
    path: '/rpc',
    queryStringParameters: { fn: 'create_client_with_pin' },
    headers: {
      origin: 'https://app.heyslab.ru',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      p_name: 'Ann',
      p_phone: '79991112233',
      p_pin_salt: '0123456789abcdef0123456789abcdef',
      p_pin_hash: '0'.repeat(64),
    }),
  });

  assert.strictEqual(createRes.statusCode, 200);
  const createQuery = mockPool.queries.find((q) => q.sql.includes('create_client_with_pin'));
  assert.ok(createQuery, 'create_client_with_pin SQL should run');
  assert.match(createQuery.sql, /p_name => \$1::text/);
  assert.match(createQuery.sql, /p_phone => \$2::text/);
  assert.match(createQuery.sql, /p_pin_salt => \$3::text/);
  assert.match(createQuery.sql, /p_pin_hash => \$4::text/);
  assert.match(createQuery.sql, /p_curator_id => \$5::uuid/);
  assert.deepStrictEqual(createQuery.values, [
    'Ann',
    '79991112233',
    '0123456789abcdef0123456789abcdef',
    '0'.repeat(64),
    curatorId,
  ]);
  assert.strictEqual(JSON.parse(createRes.body).client_id, '55555555-5555-4555-8555-555555555555');

  process.env.JWT_SECRET = prevJwt;
  console.log('admin client access contract tests: OK');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
