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

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest();
}

function createMockPool() {
  const state = {
    consumed: false,
    inserted: null,
    queries: [],
  };

  return {
    state,
    connect: async () => ({
      query: async (sql, values = []) => {
        state.queries.push({ sql, values });

        if (/DELETE FROM public\.mobile_web_session_exchanges/.test(sql)) {
          return { rows: [] };
        }

        if (/INSERT INTO public\.mobile_web_session_exchanges/.test(sql)) {
          state.inserted = { tokenHash: values[0], curatorId: values[1], returnUrl: values[2] };
          return { rows: [] };
        }

        if (/UPDATE public\.mobile_web_session_exchanges e/.test(sql)) {
          assert.ok(state.inserted, 'exchange token must be inserted before consume');
          assert.deepStrictEqual(values[0], state.inserted.tokenHash);
          assert.strictEqual(values[1], state.inserted.returnUrl);

          if (state.consumed) return { rows: [] };
          state.consumed = true;
          return {
            rows: [{
              curator_id: state.inserted.curatorId,
              email: 'curator@example.test',
              return_url: state.inserted.returnUrl,
            }],
          };
        }

        throw new Error('Unexpected SQL in mobile exchange mock: ' + sql);
      },
      release: () => {},
    }),
  };
}

async function run() {
  const prevJwt = process.env.JWT_SECRET;
  const prevLocalhost = process.env.ALLOW_LOCALHOST_ORIGINS;
  const jwtSecret = 'test-jwt-secret-for-mobile-exchange-32';
  process.env.JWT_SECRET = jwtSecret;
  process.env.ALLOW_LOCALHOST_ORIGINS = '1';

  const curatorId = '11111111-1111-4111-8111-111111111111';
  const curatorToken = createJwt({
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

  const returnUrl = 'https://app.heyslab.ru/';
  const issueRes = await handler({
    httpMethod: 'POST',
    path: '/auth/mobile/session-exchange',
    headers: {
      Authorization: `Bearer ${curatorToken}`,
      host: 'api.heyslab.ru',
      origin: 'https://app.heyslab.ru',
      'x-forwarded-proto': 'https',
    },
    body: JSON.stringify({ return_url: returnUrl }),
  });

  assert.strictEqual(issueRes.statusCode, 200);
  const issueBody = JSON.parse(issueRes.body);
  assert.match(issueBody.exchange_url, /^https:\/\/api\.heyslab\.ru\/auth\/mobile\/session-exchange\/consume/);
  assert.equal(issueBody.exchange_url.includes(curatorToken), false);

  const exchangeUrl = new URL(issueBody.exchange_url);
  const exchangeToken = exchangeUrl.searchParams.get('token');
  assert.ok(exchangeToken);
  assert.deepStrictEqual(mockPool.state.inserted, {
    curatorId,
    returnUrl,
    tokenHash: hashToken(exchangeToken),
  });

  const consumeEvent = {
    httpMethod: 'GET',
    path: '/auth/mobile/session-exchange/consume',
    headers: {
      host: 'api.heyslab.ru',
      origin: 'https://app.heyslab.ru',
    },
    queryStringParameters: {
      return_url: returnUrl,
      token: exchangeToken,
    },
  };

  const consumeRes = await handler(consumeEvent);
  assert.strictEqual(consumeRes.statusCode, 302);
  assert.strictEqual(consumeRes.headers.Location, returnUrl);
  assert.match(consumeRes.headers['Set-Cookie'], /heys_curator_jwt=/);
  assert.match(consumeRes.headers['Set-Cookie'], /HttpOnly/);

  const replayRes = await handler(consumeEvent);
  assert.strictEqual(replayRes.statusCode, 401);
  assert.deepStrictEqual(JSON.parse(replayRes.body), { error: 'Invalid or expired exchange token' });

  process.env.JWT_SECRET = prevJwt;
  process.env.ALLOW_LOCALHOST_ORIGINS = prevLocalhost;
  console.log('mobile_session_exchange contract tests: OK');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
