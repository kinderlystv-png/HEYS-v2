'use strict';

const crypto = require('node:crypto');

const RECORD_FIELDS = [
  't', 'ts', 'tool', 'session_id', 'seq', 'conn_id', 'duration_ms', 'upstream_calls', 'upstream_ms',
  'status', 'error_code', 'resp_bytes', 'arg_count', 'arg_keys', 'cold_start', 'uptime_ms', 'fn_version', 'role',
  'hint',
];

const VALID_STATUS = new Set(['ok', 'error', 'rejected']);
const VALID_ROLE = new Set(['curator', 'client']);
const DEFAULT_LIST_LIMIT = 5000;
const MAX_LIST_LIMIT = 5000;

function verifyMcpTelemetryAuthorization(authHeader) {
  const secret = process.env.MCP_TELEMETRY_SECRET;
  if (!secret || !String(secret).trim()) {
    return {
      ok: false,
      status: 503,
      body: {
        ok: false,
        inserted: false,
        reason: 'telemetry_disabled',
        error: { code: 'TELEMETRY_DISABLED', message: 'MCP telemetry insert is not configured' },
      },
    };
  }
  const h = authHeader || '';
  if (!h.startsWith('Bearer ')) {
    return {
      ok: false,
      status: 401,
      body: {
        ok: false,
        inserted: false,
        reason: 'unauthorized',
        error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization' },
      },
    };
  }
  const token = h.slice(7).trim();
  const digestA = crypto.createHash('sha256').update(token, 'utf8').digest();
  const digestB = crypto.createHash('sha256').update(String(secret), 'utf8').digest();
  if (digestA.length !== digestB.length || !crypto.timingSafeEqual(digestA, digestB)) {
    return {
      ok: false,
      status: 401,
      body: {
        ok: false,
        inserted: false,
        reason: 'unauthorized',
        error: { code: 'UNAUTHORIZED', message: 'Invalid telemetry credentials' },
      },
    };
  }
  return { ok: true };
}

function normalizeInsertRecord(raw = {}) {
  const record = {};
  for (const field of RECORD_FIELDS) {
    if (raw[field] !== undefined && raw[field] !== null) record[field] = raw[field];
  }
  if (record.t !== 'mcp_call') record.t = 'mcp_call';
  if (!record.ts || typeof record.tool !== 'string' || !record.tool.trim()) {
    return { ok: false, reason: 'invalid_payload' };
  }
  if (!record.session_id || !Number.isFinite(Number(record.seq))) {
    return { ok: false, reason: 'missing_session_or_seq' };
  }
  record.seq = Math.round(Number(record.seq));
  if (record.status && !VALID_STATUS.has(record.status)) record.status = 'error';
  if (record.role && !VALID_ROLE.has(record.role)) record.role = null;
  for (const key of ['duration_ms', 'upstream_calls', 'upstream_ms', 'resp_bytes', 'arg_count', 'uptime_ms']) {
    if (record[key] !== undefined && record[key] !== null) {
      const n = Number(record[key]);
      record[key] = Number.isFinite(n) ? Math.round(n) : null;
    }
  }
  if (record.cold_start !== undefined && record.cold_start !== null) {
    record.cold_start = record.cold_start === true;
  }
  return { ok: true, record };
}

function rowToRecord(row) {
  if (!row) return null;
  return {
    t: row.t,
    ts: row.ts instanceof Date ? row.ts.toISOString() : row.ts,
    tool: row.tool,
    session_id: row.session_id,
    seq: row.seq,
    conn_id: row.conn_id,
    duration_ms: row.duration_ms,
    upstream_calls: row.upstream_calls,
    upstream_ms: row.upstream_ms,
    status: row.status,
    error_code: row.error_code,
    resp_bytes: row.resp_bytes,
    arg_count: row.arg_count,
    arg_keys: Array.isArray(row.arg_keys) ? row.arg_keys : undefined,
    cold_start: row.cold_start === true,
    uptime_ms: row.uptime_ms,
    fn_version: row.fn_version,
    role: row.role,
    hint: row.hint,
  };
}

async function handleInsertMcpCallEvent(pool, params, authHeader, { corsHeaders } = {}) {
  const authCheck = verifyMcpTelemetryAuthorization(authHeader);
  if (!authCheck.ok) {
    return {
      statusCode: authCheck.status,
      headers: corsHeaders,
      body: JSON.stringify(authCheck.body),
    };
  }

  const normalized = normalizeInsertRecord(params);
  if (!normalized.ok) {
    console.warn('[mcp-telemetry-db] rejected:', normalized.reason);
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ ok: true, inserted: false, reason: normalized.reason }),
    };
  }

  const { record } = normalized;
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO mcp_call_events (
         t, ts, tool, session_id, seq, conn_id, duration_ms, upstream_calls, upstream_ms,
         status, error_code, resp_bytes, arg_count, arg_keys, cold_start, uptime_ms, fn_version, role,
         hint
       ) VALUES (
         $1, $2::timestamptz, $3, $4, $5, $6, $7, $8, $9,
         $10, $11, $12, $13, $14, $15, $16, $17, $18,
         $19
       )
       ON CONFLICT (session_id, seq) WHERE session_id IS NOT NULL AND seq IS NOT NULL
       DO NOTHING`,
      [
        record.t,
        record.ts,
        record.tool,
        record.session_id,
        record.seq,
        record.conn_id ?? null,
        record.duration_ms ?? null,
        record.upstream_calls ?? null,
        record.upstream_ms ?? null,
        record.status ?? null,
        record.error_code ?? null,
        record.resp_bytes ?? null,
        record.arg_count ?? null,
        Array.isArray(record.arg_keys) && record.arg_keys.length ? record.arg_keys : null,
        record.cold_start ?? null,
        record.uptime_ms ?? null,
        record.fn_version ?? null,
        record.role ?? null,
        record.hint ?? null,
      ],
    );
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: true,
        inserted: result.rowCount > 0,
        reason: result.rowCount > 0 ? null : 'duplicate',
      }),
    };
  } catch (error) {
    console.warn('[mcp-telemetry-db] insert_failed:', error.message);
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ ok: true, inserted: false, reason: 'insert_failed' }),
    };
  } finally {
    client.release();
  }
}

async function handleListMcpCallEvents(pool, params, { corsHeaders } = {}) {
  const since = String(params.p_since || params.since || '').trim();
  const until = String(params.p_until || params.until || '').trim();
  if (!since || !until) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'p_since and p_until are required' },
      }),
    };
  }

  const role = String(params.p_role || params.role || 'curator').trim() || 'curator';
  const limitRaw = Number(params.p_limit ?? params.limit ?? DEFAULT_LIST_LIMIT);
  const limit = Math.min(
    MAX_LIST_LIMIT,
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.round(limitRaw) : DEFAULT_LIST_LIMIT,
  );

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT t, ts, tool, session_id, seq, conn_id, duration_ms, upstream_calls, upstream_ms,
              status, error_code, resp_bytes, arg_count, arg_keys, cold_start, uptime_ms, fn_version, role,
              hint
       FROM mcp_call_events
       WHERE ts >= $1::timestamptz AND ts <= $2::timestamptz
         AND ($3::text IS NULL OR role = $3)
       ORDER BY ts
       LIMIT $4`,
      [since, until, role === 'all' ? null : role, limit + 1],
    );
    const truncated = result.rows.length > limit;
    const rows = truncated ? result.rows.slice(0, limit) : result.rows;
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: true,
        records: rows.map(rowToRecord),
        truncated,
      }),
    };
  } catch (error) {
    console.error('[list_mcp_call_events]', error.message);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: false,
        error: { code: 'telemetry_db_read_failed', message: error.message },
      }),
    };
  } finally {
    client.release();
  }
}

/**
 * Сколько раз этот инструмент уже звался в этом подключении за окно.
 *
 * Заменяет память инстанса: на редком трафике YC разводит даже последовательные
 * вызовы по холодным инстансам, поэтому локальный счётчик серий почти всегда
 * пуст (замер 21.08: cold_start=t у большинства строк). Считаем по уже
 * пишущейся телеметрии — отдельного хранилища для этого не нужно.
 *
 * Аргументы вызова здесь не участвуют вовсе: считается серия по инструменту.
 * Это сознательно — в mcp_call_events нет и не должно быть значений
 * аргументов, а перебор формулировок как раз и виден по серии, а не по
 * повтору одного и того же запроса.
 */
async function handleCountMcpRecentCalls(pool, params, authHeader, { corsHeaders } = {}) {
  const authCheck = verifyMcpTelemetryAuthorization(authHeader);
  if (!authCheck.ok) {
    return { statusCode: authCheck.status, headers: corsHeaders, body: JSON.stringify(authCheck.body) };
  }

  const connId = String(params.p_conn_id || params.conn_id || '').trim();
  const tool = String(params.p_tool || params.tool || '').trim();
  const windowRaw = Number(params.p_window_ms ?? params.window_ms ?? 60000);
  const windowMs = Math.min(600000, Number.isFinite(windowRaw) && windowRaw > 0 ? Math.round(windowRaw) : 60000);
  if (!connId || !tool) {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ ok: true, count: 0, reason: 'invalid_payload' }),
    };
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT count(*)::int AS count
         FROM mcp_call_events
        WHERE conn_id = $1
          AND tool = $2
          AND ts >= now() - ($3::text || ' milliseconds')::interval`,
      [connId, tool, String(windowMs)],
    );
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ ok: true, count: result.rows[0] ? result.rows[0].count : 0 }),
    };
  } catch (error) {
    // Подсказка — не гарантия: не смогли посчитать, значит промолчим.
    console.warn('[mcp-telemetry-db] count_failed:', error.message);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, count: 0, reason: 'count_failed' }) };
  } finally {
    client.release();
  }
}

module.exports = {
  RECORD_FIELDS,
  handleCountMcpRecentCalls,
  verifyMcpTelemetryAuthorization,
  normalizeInsertRecord,
  rowToRecord,
  handleInsertMcpCallEvent,
  handleListMcpCallEvents,
};
