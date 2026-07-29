const assert = require('assert');
const path = require('path');

function createMockPool() {
  const api = {
    queries: [],
    connect: async () => ({
      query: async (sql, values = []) => {
        if (sql === 'SELECT 1') return { rows: [{ '?column?': 1 }] };
        api.queries.push({ sql, values });
        if (!sql.includes('accept_trial_candidate_health_consent_by_candidate_session')) {
          throw new Error('Unexpected SQL in candidate consent RPC mock: ' + sql);
        }
        return {
          rows: [{
            accept_trial_candidate_health_consent_by_candidate_session: {
              success: true,
              document_version: '1.5',
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

async function run() {
  const mockPool = createMockPool();
  const handler = await loadHandler(mockPool);
  const response = await handler({
    httpMethod: 'POST',
    path: '/rpc',
    queryStringParameters: { fn: 'accept_trial_candidate_health_consent_by_candidate_session' },
    headers: {
      origin: 'https://app.heyslab.ru',
      cookie: 'heys_candidate_session_token=candidate-session-1',
      'x-forwarded-for': '203.0.113.42',
      'user-agent': 'candidate-consent-contract-test',
    },
    body: JSON.stringify({ p_document_version: '1.5' }),
  });

  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(response.headers['Access-Control-Allow-Origin'], 'https://app.heyslab.ru');
  assert.strictEqual(response.headers['Access-Control-Allow-Credentials'], 'true');

  const consentQueries = mockPool.queries.filter((entry) =>
    entry.sql.includes('accept_trial_candidate_health_consent_by_candidate_session'));
  assert.strictEqual(consentQueries.length, 1, 'consent RPC must execute exactly once');
  assert.ok(consentQueries[0].values.includes('candidate-session-1'));
  assert.ok(consentQueries[0].values.includes('1.5'));
  assert.ok(consentQueries[0].values.includes('203.0.113.42'));
  assert.ok(consentQueries[0].values.includes('candidate-consent-contract-test'));
  assert.deepStrictEqual(JSON.parse(response.body), {
    accept_trial_candidate_health_consent_by_candidate_session: {
      success: true,
      document_version: '1.5',
    },
  });

  console.log('candidate consent RPC contract tests: OK');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
