const assert = require('assert');
const crypto = require('crypto');
const path = require('path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'mcp-telemetry-rpc-contract-secret';
process.env.ALLOW_LOCALHOST_ORIGINS = '1';

const TELEMETRY_SECRET = 'test-mcp-telemetry-secret';
const CURATOR_ID = '11111111-1111-4111-8111-111111111111';

const SAMPLE_EVENT = {
  t: 'mcp_call',
  ts: '2026-08-17T19:04:18.000Z',
  tool: 'heys_get_day',
  session_id: '6c7a0025159a',
  seq: 3,
  conn_id: '91aa77bc0011',
  duration_ms: 299,
  upstream_calls: 1,
  upstream_ms: 200,
  status: 'ok',
  role: 'curator',
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
  const events = [];

  return {
    events,
    connect: async () => ({
      query: async (sql, values = []) => {
        if (/BEGIN|ROLLBACK|COMMIT/.test(sql)) return { rows: [] };

        if (sql.includes('INSERT INTO mcp_call_events')) {
          const existing = events.find(
            (row) => row.session_id === values[3] && row.seq === values[4],
          );
          if (existing) return { rowCount: 0, rows: [] };
          events.push({
            t: values[0],
            ts: values[1],
            tool: values[2],
            session_id: values[3],
            seq: values[4],
            conn_id: values[5],
            duration_ms: values[6],
            upstream_calls: values[7],
            upstream_ms: values[8],
            status: values[9],
            error_code: values[10],
            resp_bytes: values[11],
            arg_count: values[12],
            arg_keys: values[13],
            cold_start: values[14],
            uptime_ms: values[15],
            fn_version: values[16],
            role: values[17],
          });
          return { rowCount: 1, rows: [] };
        }

        if (sql.includes('count(*)::int')) {
          const [connId, tool] = values;
          const count = events.filter((row) => row.conn_id === connId && row.tool === tool).length;
          return { rows: [{ count }] };
        }

        if (sql.includes('FROM mcp_call_events')) {
          const since = values[0];
          const until = values[1];
          const role = values[2];
          const limit = values[3];
          let rows = events.filter((row) => row.ts >= since && row.ts <= until);
          if (role) rows = rows.filter((row) => row.role === role);
          rows = rows.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
          return { rows: rows.slice(0, limit) };
        }

        throw new Error('Unexpected SQL in mcp telemetry mock: ' + sql);
      },
      release: () => {},
    }),
  };
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
  const prevSecret = process.env.MCP_TELEMETRY_SECRET;
  process.env.MCP_TELEMETRY_SECRET = TELEMETRY_SECRET;

  const mockPool = createMockPool();
  const handler = await loadHandler(mockPool);
  const curatorToken = signJwt({ sub: CURATOR_ID, role: 'curator' });

  const unauthorized = await handler(rpcEvent('insert_mcp_call_event', null, SAMPLE_EVENT));
  assert.strictEqual(unauthorized.statusCode, 401);

  const badSecret = await handler(rpcEvent('insert_mcp_call_event', 'wrong', SAMPLE_EVENT));
  assert.strictEqual(badSecret.statusCode, 401);

  const inserted = await handler(
    rpcEvent('insert_mcp_call_event', TELEMETRY_SECRET, SAMPLE_EVENT),
  );
  assert.strictEqual(inserted.statusCode, 200);
  const insertedBody = JSON.parse(inserted.body);
  assert.strictEqual(insertedBody.ok, true);
  assert.strictEqual(insertedBody.inserted, true);
  assert.equal(mockPool.events.length, 1);

  const duplicate = await handler(
    rpcEvent('insert_mcp_call_event', TELEMETRY_SECRET, SAMPLE_EVENT),
  );
  assert.strictEqual(JSON.parse(duplicate.body).inserted, false);
  assert.equal(mockPool.events.length, 1);

  const skipped = await handler(
    rpcEvent('insert_mcp_call_event', TELEMETRY_SECRET, {
      t: 'mcp_call',
      ts: '2026-08-17T19:04:19.000Z',
      tool: 'heys_add_water',
    }),
  );
  assert.strictEqual(JSON.parse(skipped.body).reason, 'missing_session_or_seq');

  const listUnauthorized = await handler(rpcEvent('list_mcp_call_events', null, {
    p_since: '2026-08-17T00:00:00.000Z',
    p_until: '2026-08-17T23:59:59.999Z',
  }));
  assert.strictEqual(listUnauthorized.statusCode, 401);

  const listed = await handler(rpcEvent('list_mcp_call_events', curatorToken, {
    p_since: '2026-08-17T00:00:00.000Z',
    p_until: '2026-08-17T23:59:59.999Z',
    p_role: 'curator',
  }));
  assert.strictEqual(listed.statusCode, 200);
  const listBody = JSON.parse(listed.body);
  assert.strictEqual(listBody.ok, true);
  assert.strictEqual(listBody.records.length, 1);
  assert.strictEqual(listBody.records[0].tool, 'heys_get_day');
  // Псевдоним подключения доезжает до trace: без него цепочка, разорванная
  // холодным стартом, снова читалась бы как «вероятная».
  assert.strictEqual(listBody.records[0].conn_id, '91aa77bc0011');

  // Счётчик серии: heys-mcp спрашивает по нему, лишний ли круг. Тот же Bearer,
  // что у insert, и он обязан быть обязательным — иначе счётчик становится
  // открытым способом прощупывать активность коннектора.
  const counted = await handler(rpcEvent('count_mcp_recent_calls', TELEMETRY_SECRET, {
    p_conn_id: '91aa77bc0011',
    p_tool: 'heys_get_day',
    p_window_ms: 60000,
  }));
  assert.strictEqual(counted.statusCode, 200);
  assert.strictEqual(JSON.parse(counted.body).count, 1);

  const countedOther = await handler(rpcEvent('count_mcp_recent_calls', TELEMETRY_SECRET, {
    p_conn_id: '91aa77bc0011',
    p_tool: 'heys_search_products',
  }));
  assert.strictEqual(JSON.parse(countedOther.body).count, 0);

  const countUnauthorized = await handler(rpcEvent('count_mcp_recent_calls', 'не тот секрет', {
    p_conn_id: '91aa77bc0011',
    p_tool: 'heys_get_day',
  }));
  assert.strictEqual(countUnauthorized.statusCode, 401);

  if (prevSecret === undefined) delete process.env.MCP_TELEMETRY_SECRET;
  else process.env.MCP_TELEMETRY_SECRET = prevSecret;

  console.log('mcp_telemetry_rpc contract tests: OK');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
