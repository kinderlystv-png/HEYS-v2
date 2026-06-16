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
    lastQuery: null,
    connect: async () => ({
      query: async (sql, values = []) => {
        api.lastQuery = { sql, values };
        if (!sql.includes('FROM clients c')) {
          throw new Error('Unexpected SQL in auth clients mock: ' + sql);
        }
        return {
          rows: [{
            id: 'client-cookie-1',
            name: 'Cookie Client',
            updated_at: '2026-06-16T00:00:00.000Z',
            subscription_status: null,
            trial_ends_at: null,
            active_until: null,
            has_pin: true,
            has_telegram_binding: false,
          }],
        };
      },
      release: () => {},
    }),
  };
  return api;
}

async function run() {
  const prevJwt = process.env.JWT_SECRET;
  const jwtSecret = 'test-jwt-secret-for-curator-cookie-32';
  process.env.JWT_SECRET = jwtSecret;

  const curatorId = '11111111-1111-4111-8111-111111111111';
  const token = createJwt({
    sub: curatorId,
    email: 'curator@example.test',
    role: 'curator',
    exp: Math.floor(Date.now() / 1000) + 3600,
  }, jwtSecret);

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

  const res = await handler({
    httpMethod: 'GET',
    path: '/auth/clients',
    headers: {
      origin: 'https://app.heyslab.ru',
      cookie: `other=1; heys_curator_jwt=${encodeURIComponent(token)}`,
    },
    body: '',
  });

  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(mockPool.lastQuery.values, [curatorId]);
  assert.match(mockPool.lastQuery.sql, /telegram_chat_id IS NOT NULL/);
  assert.strictEqual(res.headers['Access-Control-Allow-Credentials'], 'true');
  assert.deepStrictEqual(JSON.parse(res.body).data[0], {
    id: 'client-cookie-1',
    name: 'Cookie Client',
    updated_at: '2026-06-16T00:00:00.000Z',
    subscription_status: null,
    trial_ends_at: null,
    active_until: null,
    has_pin: true,
    has_telegram_binding: false,
  });

  const logoutRes = await handler({
    httpMethod: 'POST',
    path: '/auth/curator-logout',
    headers: {
      origin: 'https://app.heyslab.ru',
      cookie: `heys_curator_jwt=${encodeURIComponent(token)}`,
    },
    body: '{}',
  });

  assert.strictEqual(logoutRes.statusCode, 200);
  assert.match(logoutRes.headers['Set-Cookie'], /heys_curator_jwt=;/);
  assert.match(logoutRes.headers['Set-Cookie'], /Max-Age=0/);
  assert.deepStrictEqual(logoutRes.multiValueHeaders['Set-Cookie'], [
    'heys_curator_jwt=; Domain=.heyslab.ru; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
    'heys_curator_jwt=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
  ]);
  assert.deepStrictEqual(JSON.parse(logoutRes.body), { ok: true });

  process.env.JWT_SECRET = prevJwt;
  console.log('curator_cookie_auth_clients contract tests: OK');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
