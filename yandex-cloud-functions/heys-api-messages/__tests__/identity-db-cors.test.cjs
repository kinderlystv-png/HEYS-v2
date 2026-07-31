const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const functionDir = path.resolve(__dirname, '..');
const handlerPath = path.join(functionDir, 'index.js');
const dbPoolPath = path.join(functionDir, 'shared', 'db-pool.js');
const secretsPath = path.join(functionDir, 'shared', 'secrets.js');
const webpushPath = require.resolve('web-push', { paths: [functionDir] });

test('exhausted identity DB acquisition returns controlled credentialed-CORS JSON', async (t) => {
  let acquireCalls = 0;
  const previousPublicKey = process.env.VAPID_PUBLIC_KEY;
  const previousPrivateKey = process.env.VAPID_PRIVATE_KEY;

  process.env.VAPID_PUBLIC_KEY = 'test-public-key';
  process.env.VAPID_PRIVATE_KEY = 'test-private-key';

  require.cache[dbPoolPath] = {
    id: dbPoolPath,
    filename: dbPoolPath,
    loaded: true,
    exports: {
      getPool() {
        throw new Error('resolveIdentity must not use raw pool.connect()');
      },
      async acquireHealthyClient() {
        acquireCalls += 1;
        throw new Error('Connection terminated unexpectedly');
      },
    },
  };
  require.cache[secretsPath] = {
    id: secretsPath,
    filename: secretsPath,
    loaded: true,
    exports: { initSecrets: async () => ({ source: 'test' }) },
  };
  require.cache[webpushPath] = {
    id: webpushPath,
    filename: webpushPath,
    loaded: true,
    exports: { setVapidDetails() {} },
  };
  delete require.cache[handlerPath];

  t.after(() => {
    delete require.cache[handlerPath];
    delete require.cache[dbPoolPath];
    delete require.cache[secretsPath];
    delete require.cache[webpushPath];
    if (previousPublicKey === undefined) delete process.env.VAPID_PUBLIC_KEY;
    else process.env.VAPID_PUBLIC_KEY = previousPublicKey;
    if (previousPrivateKey === undefined) delete process.env.VAPID_PRIVATE_KEY;
    else process.env.VAPID_PRIVATE_KEY = previousPrivateKey;
  });

  const { handler } = require(handlerPath);
  const response = await handler({
    httpMethod: 'GET',
    path: '/messages/unread-count',
    headers: {
      origin: 'https://app.heyslab.ru',
      authorization: 'Bearer client-session-token',
    },
  });

  assert.equal(acquireCalls, 1);
  assert.equal(response.statusCode, 500);
  assert.equal(response.headers['Access-Control-Allow-Origin'], 'https://app.heyslab.ru');
  assert.equal(response.headers['Access-Control-Allow-Credentials'], 'true');
  assert.deepEqual(JSON.parse(response.body), { error: 'internal_error' });
  assert.doesNotMatch(response.body, /Connection terminated unexpectedly/);

  const authFailure = await handler({
    httpMethod: 'GET',
    path: '/messages/unread-count',
    headers: { origin: 'https://app.heyslab.ru' },
  });
  assert.equal(authFailure.statusCode, 401);
  assert.equal(authFailure.headers['Access-Control-Allow-Origin'], 'https://app.heyslab.ru');
  assert.equal(authFailure.headers['Access-Control-Allow-Credentials'], 'true');
  assert.deepEqual(JSON.parse(authFailure.body), { error: 'missing_auth' });
  assert.equal(acquireCalls, 1);
});
