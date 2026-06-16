const assert = require('assert');
const path = require('path');

function createMockPool() {
  const api = {
    lastQuery: null,
    connect: async () => ({
      query: async (sql, values = []) => {
        api.lastQuery = { sql, values };
        if (!sql.includes('revoke_session')) {
          throw new Error('Unexpected SQL in auth client logout mock: ' + sql);
        }
        return { rows: [{ revoked: true }] };
      },
      release: () => {},
    }),
  };
  return api;
}

async function run() {
  const prevJwt = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-jwt-secret-for-client-logout-cookie-32';

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
    httpMethod: 'POST',
    path: '/auth/client-logout',
    headers: {
      origin: 'https://app.heyslab.ru',
      cookie: 'other=1; heys_session_token=auth-cookie-session-1',
    },
    body: '{}',
  });

  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(mockPool.lastQuery.values, ['auth-cookie-session-1']);
  assert.match(res.headers['Set-Cookie'], /heys_session_token=;/);
  assert.match(res.headers['Set-Cookie'], /Max-Age=0/);
  assert.deepStrictEqual(JSON.parse(res.body), { ok: true, revoked: true });

  process.env.JWT_SECRET = prevJwt;
  console.log('client_logout_cookie contract tests: OK');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
