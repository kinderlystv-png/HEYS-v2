-- Сырое mcp_call для tasks_mcp_trace и суточной агрегации (heys/8e2188).
--
-- Без идентификаторов людей при текущем составе полей — не ПДн.
-- Retention 180 дней — чистка в heys-maintenance.

CREATE TABLE IF NOT EXISTS mcp_call_events (
  id              bigserial PRIMARY KEY,
  t               text NOT NULL DEFAULT 'mcp_call',
  ts              timestamptz NOT NULL,
  tool            text NOT NULL,
  session_id      text,
  seq             integer,
  duration_ms     integer,
  upstream_calls  integer,
  upstream_ms     integer,
  status          text,
  error_code      text,
  resp_bytes      integer,
  arg_count       integer,
  cold_start      boolean,
  uptime_ms       integer,
  fn_version      text,
  role            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS mcp_call_events_session_seq_uniq
  ON mcp_call_events (session_id, seq)
  WHERE session_id IS NOT NULL AND seq IS NOT NULL;

CREATE INDEX IF NOT EXISTS mcp_call_events_ts_idx
  ON mcp_call_events (ts DESC);

CREATE INDEX IF NOT EXISTS mcp_call_events_role_ts_idx
  ON mcp_call_events (role, ts DESC);

COMMENT ON TABLE mcp_call_events IS
  'Сырое mcp_call без ПДн при текущем составе полей. Retention 180 дней.';

REVOKE ALL ON TABLE mcp_call_events FROM PUBLIC;
GRANT SELECT, INSERT, DELETE ON TABLE mcp_call_events TO heys_admin;
