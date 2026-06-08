-- =============================================================================
-- SEC-009 — DB-side rate-limit для heys-api-messages.
--
-- Зачем: heys-api-messages держит rate-limit в in-memory Map (rateMap).
-- Это сбрасывается на каждом cold-start cloud function — атакующий может
-- эксплуатировать `cold-start race`: запустить N запросов параллельно через
-- N-инстансовый автоскейл → каждый инстанс счёл что у клиента 0 attempts →
-- лимит обходится.
--
-- Этот PR переносит счётчик в БД: атомарный UPSERT на client_id с reset
-- window_start раз в RATE_LIMIT_WINDOW_SECONDS. Cold-start не аффектит.
--
-- Fixed window (не sliding) — может пропустить до 2× max на границе окна.
-- Это accepted для anti-flood; для anti-abuse достаточно.
--
-- Apply:
--   bash scripts/db/psql.sh --single-transaction -f database/2026-06-08_messages_rate_limit.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS messages_rate_limits (
  client_id    uuid PRIMARY KEY,
  attempts     int NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_rate_limits_window
  ON messages_rate_limits (window_start);

-- SECDEF потому что вызывается из heys_rpc и должна писать в таблицу.
-- search_path pinned по образцу SEC-015 миграции.
CREATE OR REPLACE FUNCTION check_messages_rate_limit(
  p_client_id uuid,
  p_max int,
  p_window_seconds int
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now            timestamptz := now();
  v_window_cutoff  timestamptz := v_now - make_interval(secs => p_window_seconds);
  v_current        record;
BEGIN
  -- Atomic upsert: reset если окно протухло, иначе инкремент.
  INSERT INTO messages_rate_limits (client_id, attempts, window_start)
  VALUES (p_client_id, 1, v_now)
  ON CONFLICT (client_id) DO UPDATE
    SET attempts     = CASE
                         WHEN messages_rate_limits.window_start < v_window_cutoff
                           THEN 1
                         ELSE messages_rate_limits.attempts + 1
                       END,
        window_start = CASE
                         WHEN messages_rate_limits.window_start < v_window_cutoff
                           THEN v_now
                         ELSE messages_rate_limits.window_start
                       END
  RETURNING attempts, window_start INTO v_current;

  IF v_current.attempts > p_max THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'retry_after',
        GREATEST(1, EXTRACT(EPOCH FROM (v_current.window_start + make_interval(secs => p_window_seconds) - v_now))::int)
    );
  END IF;

  RETURN jsonb_build_object('allowed', true, 'attempts', v_current.attempts);
END;
$$;

-- heys_rpc нужен EXECUTE (если функция вызывается через rpc-маршрут).
GRANT EXECUTE ON FUNCTION check_messages_rate_limit(uuid, int, int) TO heys_rpc;
-- heys_rest тоже — на случай если messages идёт через REST endpoint.
GRANT EXECUTE ON FUNCTION check_messages_rate_limit(uuid, int, int) TO heys_rest;

-- Cleanup: периодически прибиваем устаревшие rate-limit записи. Опционально,
-- не критично для функциональности — таблица не растёт.
COMMENT ON TABLE messages_rate_limits IS
  'SEC-009: per-client message rate-limit counter. Auto-resets per window. '
  'Cleanup via cron-maintenance или вручную: DELETE FROM messages_rate_limits WHERE window_start < now() - interval ''1 hour''.';
