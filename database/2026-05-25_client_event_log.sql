-- ═══════════════════════════════════════════════════════════════════════════════
-- 📝 client_event_log — append-only event log для debug-trace всех mutations
-- ═══════════════════════════════════════════════════════════════════════════════
-- Дата: 2026-05-25
-- Plan: plans/rustling-dazzling-bentley.md (Wave 5)
-- Motivation: Wave 1-4 закрыл "исчезающие продукты", но поведенческие баги
--   (omega3 mark на 2 дня, "Грудка Орион" в день 24 вместо 23) невозможно
--   расследовать без trace "кто/когда/что/откуда". Это server-side append-only
--   log на ~7 дней для всех ~17 mutation entry points в клиенте.
--
-- Backend выбран после анализа альтернатив (ring buffer в client_kv_store —
-- rejected из-за multi-tab race + 413 payload + hot-sync replace).
-- Pattern взят из client_data_changelog (push_notifications.sql).
--
-- Privacy (152-ФЗ): payload sanitized на клиенте (см. heys_event_log_v1.js
-- SAFE_PAYLOAD_KEYS). nutrients/weight/mood/sleep НЕ логируются.
--
-- Retention: 7 дней. Cleanup через heys-maintenance kvZombieCleanup task.
--
-- Apply:
--   bash scripts/db/psql.sh -f database/2026-05-25_client_event_log.sql
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1. Table
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_event_log (
  id         BIGSERIAL PRIMARY KEY,
  client_id  UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  ts         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  kind       TEXT NOT NULL,                 -- 'meal-add', 'supplement-mark', 'product-delete' etc.
  summary    TEXT NOT NULL,                 -- human-readable, sanitized
  source     TEXT,                          -- caller context: 'morning_supplements_reminder', 'group_header_tap' etc.
  payload    JSONB,                         -- structured, sanitized (whitelist on client)
  meta       JSONB                          -- {wallTimeUTC, localTimeStr, isNightTime, tabId, userAgent_short}
);

COMMENT ON TABLE public.client_event_log IS
  'Append-only debug event log per client. Retention 7 days. Sanitized payload (no health_data per 152-ФЗ). См. plans/rustling-dazzling-bentley.md Wave 5.';

-- ─────────────────────────────────────────────────────────────────
-- 2. Indexes
-- ─────────────────────────────────────────────────────────────────
-- Главный query pattern: ORDER BY ts DESC для конкретного клиента
CREATE INDEX IF NOT EXISTS client_event_log_client_ts_idx
  ON public.client_event_log(client_id, ts DESC);

-- Ускоряет retention DELETE
CREATE INDEX IF NOT EXISTS client_event_log_ts_idx
  ON public.client_event_log(ts);

-- ─────────────────────────────────────────────────────────────────
-- 3. RPC: log_client_event_by_session
--    Bulk insert events. Resolves client_id from session token.
--    Pattern из database/2026-03-30_batch_get_kv_by_session.sql
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_client_event_by_session(
  p_session_token TEXT,
  p_events        JSONB           -- array of {kind, summary, source?, payload?, meta?}
) RETURNS JSONB AS $$
DECLARE
  v_client_id  UUID;
  v_inserted   INTEGER := 0;
  v_max_batch  INTEGER := 50;    -- защита от spam: max 50 events за вызов
BEGIN
  -- 1. Validate session (тот же pattern что batch_get_client_kv_by_session)
  SELECT client_id INTO v_client_id
  FROM client_sessions
  WHERE token_hash = digest(p_session_token, 'sha256')
    AND expires_at > NOW()
    AND revoked_at IS NULL;

  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('error', 'invalid_session');
  END IF;

  -- 2. Validate batch size
  IF jsonb_typeof(p_events) != 'array' THEN
    RETURN jsonb_build_object('error', 'p_events must be array');
  END IF;

  IF jsonb_array_length(p_events) > v_max_batch THEN
    RETURN jsonb_build_object('error', 'batch too large', 'max', v_max_batch);
  END IF;

  -- 3. Bulk insert
  WITH inserted AS (
    INSERT INTO public.client_event_log (client_id, ts, kind, summary, source, payload, meta)
    SELECT
      v_client_id,
      COALESCE(
        (e->>'ts')::timestamptz,        -- client может прислать свой ts (важно для batched events)
        NOW()
      ),
      COALESCE(e->>'kind', 'unknown'),
      COALESCE(e->>'summary', ''),
      e->>'source',
      e->'payload',
      e->'meta'
    FROM jsonb_array_elements(p_events) AS e
    WHERE COALESCE(e->>'kind', '') != ''  -- skip empty
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted FROM inserted;

  RETURN jsonb_build_object('success', true, 'inserted', v_inserted);

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.log_client_event_by_session(TEXT, JSONB) IS
  '📝 Append events to client_event_log. Bulk insert, max 50 per call. Session-resolved client_id. Plan F-EL2.';

-- ─────────────────────────────────────────────────────────────────
-- 4. Grants
-- ─────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.log_client_event_by_session(TEXT, JSONB) TO heys_rpc;

-- ─────────────────────────────────────────────────────────────────
-- 5. Verification
-- ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'client_event_log') THEN
    RAISE NOTICE '✅ client_event_log table created';
  ELSE
    RAISE NOTICE '❌ client_event_log table NOT found';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'log_client_event_by_session') THEN
    RAISE NOTICE '✅ log_client_event_by_session() created';
  ELSE
    RAISE NOTICE '❌ log_client_event_by_session() NOT found';
  END IF;
END$$;

COMMIT;
