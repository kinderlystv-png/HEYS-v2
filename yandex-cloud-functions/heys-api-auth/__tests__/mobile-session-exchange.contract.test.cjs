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

function hashKey(value) {
  return Buffer.isBuffer(value) ? value.toString('hex') : String(value);
}

function createMockPool() {
  const clientId = '22222222-2222-4222-8222-222222222222';
  const state = {
    clientId,
    clientSessionToken: 'client-session-token',
    exchanges: new Map(),
    issuedWebClientSessions: [],
    lastInserted: null,
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

        if (/SELECT client_id\s+FROM public\.client_sessions/.test(sql)) {
          if (values[0] !== state.clientSessionToken) return { rows: [] };
          return { rows: [{ client_id: state.clientId }] };
        }

        if (/INSERT INTO public\.mobile_web_session_exchanges\(token_hash, curator_id/.test(sql)) {
          const exchange = {
            consumed: false,
            curatorId: values[1],
            kind: 'curator',
            returnUrl: values[2],
            tokenHash: values[0],
          };
          state.exchanges.set(hashKey(values[0]), exchange);
          state.lastInserted = exchange;
          return { rows: [] };
        }

        if (/INSERT INTO public\.mobile_web_session_exchanges\(token_hash, client_id/.test(sql)) {
          const exchange = {
            clientId: values[1],
            consumed: false,
            kind: 'client',
            returnUrl: values[2],
            tokenHash: values[0],
          };
          state.exchanges.set(hashKey(values[0]), exchange);
          state.lastInserted = exchange;
          return { rows: [] };
        }

        if (/UPDATE public\.mobile_web_session_exchanges e[\s\S]+FROM public\.curators c/.test(sql)) {
          const exchange = state.exchanges.get(hashKey(values[0]));
          assert.ok(exchange, 'exchange token must be inserted before consume');
          assert.strictEqual(values[1], exchange.returnUrl);

          if (exchange.kind !== 'curator' || exchange.consumed) return { rows: [] };
          exchange.consumed = true;
          return {
            rows: [{
              curator_id: exchange.curatorId,
              email: 'curator@example.test',
              return_url: exchange.returnUrl,
            }],
          };
        }

        if (/UPDATE public\.mobile_web_session_exchanges e[\s\S]+FROM public\.clients cl/.test(sql)) {
          const exchange = state.exchanges.get(hashKey(values[0]));
          assert.ok(exchange, 'exchange token must be inserted before consume');
          assert.strictEqual(values[1], exchange.returnUrl);

          if (exchange.kind !== 'client' || exchange.consumed) return { rows: [] };
          exchange.consumed = true;
          return {
            rows: [{
              client_id: exchange.clientId,
              return_url: exchange.returnUrl,
            }],
          };
        }

        if (/INSERT INTO public\.client_sessions\(token_hash, client_id, expires_at, user_agent, ip_address\)/.test(sql)) {
          state.issuedWebClientSessions.push({
            clientId: values[1],
            token: values[0],
            userAgent: values[3],
          });
          return { rows: [] };
        }

        throw new Error('Unexpected SQL in mobile exchange mock: ' + sql);
      },
      release: () => {},
    }),
  };
}

async function issueExchange(handler, token, returnUrl) {
  const issueRes = await handler({
    httpMethod: 'POST',
    path: '/auth/mobile/session-exchange',
    headers: {
      Authorization: `Bearer ${token}`,
      host: 'api.heyslab.ru',
      origin: 'https://app.heyslab.ru',
      'x-forwarded-proto': 'https',
    },
    body: JSON.stringify({ return_url: returnUrl }),
  });

  assert.strictEqual(issueRes.statusCode, 200);
  const issueBody = JSON.parse(issueRes.body);
  assert.match(issueBody.exchange_url, /^https:\/\/api\.heyslab\.ru\/auth\/mobile\/session-exchange\/consume/);
  assert.equal(issueBody.exchange_url.includes(token), false);
  return new URL(issueBody.exchange_url).searchParams.get('token');
}

async function consumeExchange(handler, token, returnUrl) {
  return handler({
    httpMethod: 'GET',
    path: '/auth/mobile/session-exchange/consume',
    headers: {
      host: 'api.heyslab.ru',
      origin: 'https://app.heyslab.ru',
    },
    queryStringParameters: {
      return_url: returnUrl,
      token,
    },
  });
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
  const exchangeToken = await issueExchange(handler, curatorToken, returnUrl);
  assert.ok(exchangeToken);
  assert.deepStrictEqual(mockPool.state.lastInserted, {
    consumed: false,
    curatorId,
    kind: 'curator',
    returnUrl,
    tokenHash: hashToken(exchangeToken),
  });

  const consumeRes = await consumeExchange(handler, exchangeToken, returnUrl);
  assert.strictEqual(consumeRes.statusCode, 302);
  assert.strictEqual(consumeRes.headers.Location, returnUrl);
  assert.match(consumeRes.headers['Set-Cookie'], /heys_curator_jwt=/);
  assert.match(consumeRes.headers['Set-Cookie'], /HttpOnly/);
  assert.ok(consumeRes.multiValueHeaders['Set-Cookie'].some((cookie) => /heys_session_token=;/.test(cookie)));

  const replayRes = await consumeExchange(handler, exchangeToken, returnUrl);
  assert.strictEqual(replayRes.statusCode, 401);
  assert.deepStrictEqual(JSON.parse(replayRes.body), { error: 'Invalid or expired exchange token' });

  const clientExchangeToken = await issueExchange(handler, mockPool.state.clientSessionToken, returnUrl);
  assert.ok(clientExchangeToken);
  assert.deepStrictEqual(mockPool.state.lastInserted, {
    clientId: mockPool.state.clientId,
    consumed: false,
    kind: 'client',
    returnUrl,
    tokenHash: hashToken(clientExchangeToken),
  });

  const clientConsumeRes = await consumeExchange(handler, clientExchangeToken, returnUrl);
  assert.strictEqual(clientConsumeRes.statusCode, 302);
  assert.strictEqual(clientConsumeRes.headers.Location, returnUrl);
  assert.match(clientConsumeRes.headers['Set-Cookie'], /heys_session_token=/);
  assert.match(clientConsumeRes.headers['Set-Cookie'], /HttpOnly/);
  assert.ok(clientConsumeRes.multiValueHeaders['Set-Cookie'].some((cookie) => /heys_curator_jwt=;/.test(cookie)));
  assert.strictEqual(mockPool.state.issuedWebClientSessions.length, 1);
  assert.strictEqual(mockPool.state.issuedWebClientSessions[0].clientId, mockPool.state.clientId);
  assert.strictEqual(mockPool.state.issuedWebClientSessions[0].userAgent, 'HEYS Mobile WebView');

  const clientReplayRes = await consumeExchange(handler, clientExchangeToken, returnUrl);
  assert.strictEqual(clientReplayRes.statusCode, 401);
  assert.deepStrictEqual(JSON.parse(clientReplayRes.body), { error: 'Invalid or expired exchange token' });

  process.env.JWT_SECRET = prevJwt;
  process.env.ALLOW_LOCALHOST_ORIGINS = prevLocalhost;
  console.log('mobile_session_exchange contract tests: OK');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
