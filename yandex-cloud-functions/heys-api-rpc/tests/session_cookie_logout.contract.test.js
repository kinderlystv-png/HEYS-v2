const assert = require('assert');
const path = require('path');

function createMockPool() {
  const api = {
    lastQuery: null,
    connect: async () => ({
      query: async (sql, values = []) => {
        if (sql === 'SELECT 1') return { rows: [{ '?column?': 1 }] };
        api.lastQuery = { sql, values };
        if (!sql.includes('revoke_session')) {
          throw new Error('Unexpected SQL in session cookie logout mock: ' + sql);
        }
        return { rows: [{ revoke_session: true }] };
      },
      release: () => {},
    }),
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

  const res = await handler({
    httpMethod: 'POST',
    path: '/rpc',
    queryStringParameters: { fn: 'revoke_session' },
    headers: {
      origin: 'https://app.heyslab.ru',
      cookie: 'other=1; heys_session_token=cookie-session-1',
    },
    body: '{}',
  });

  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(mockPool.lastQuery.values, ['cookie-session-1']);
  assert.match(mockPool.lastQuery.sql, /revoke_session\(p_session_token => \$1::text\)/);
  assert.match(res.headers['Set-Cookie'], /heys_session_token=;/);
  assert.match(res.headers['Set-Cookie'], /Max-Age=0/);
  assert.deepStrictEqual(res.multiValueHeaders['Set-Cookie'], [
    'heys_session_token=; Domain=.heyslab.ru; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
    'heys_session_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
  ]);
  assert.deepStrictEqual(JSON.parse(res.body), { revoke_session: true });

  console.log('session_cookie_logout contract tests: OK');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
