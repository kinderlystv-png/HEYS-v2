-- ═══════════════════════════════════════════════════════════════════════════════
-- 🔧 FIX: RAISE NOTICE → RAISE WARNING для debug-функций
-- ═══════════════════════════════════════════════════════════════════════════════
-- Дата: 2026-05-26 (follow-up к 2026-05-26_debug_fns_raise_notice.sql)
--
-- Проблема: применил предыдущую миграцию с `RAISE NOTICE`, но обнаружил что
-- Yandex Managed Postgres имеет `log_min_messages = warning` (default).
-- NOTICE отфильтрован → нигде не пишется. `client_min_messages = notice`
-- значит pg отправляет NOTICE pg-driver'у, но Yandex Cloud Function код
-- (yandex-cloud-functions/heys-api-rpc/index.js) НЕ subscribed на
-- `client.on('notice', ...)` — теряется.
--
-- Подтверждено:
--   SHOW log_min_messages;        → warning
--   SHOW client_min_messages;     → notice
--   grep "on('notice'" index.js   → ничего
--
-- Fix: RAISE WARNING — попадает в pg server log при log_min_messages=warning,
-- виден через Yandex Console → Managed PostgreSQL → Logs. Семантика RETURN
-- не меняется (warning не throw'ит, как и notice). Клиент получает тот же
-- `{success:false, error:SQLERRM}`.
--
-- Apply:
--   bash scripts/db/psql.sh -f database/2026-05-26_debug_fns_raise_warning_fix.sql
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1. log_client_event_by_session
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_client_event_by_session(
  p_session_token TEXT,
  p_events        JSONB
) RETURNS JSONB AS $$
DECLARE
  v_client_id  UUID;
  v_inserted   INTEGER := 0;
  v_max_batch  INTEGER := 50;
BEGIN
  SELECT client_id INTO v_client_id
  FROM client_sessions
  WHERE token_hash = digest(p_session_token, 'sha256')
    AND expires_at > NOW()
    AND revoked_at IS NULL;

  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('error', 'invalid_session');
  END IF;

  IF jsonb_typeof(p_events) != 'array' THEN
    RETURN jsonb_build_object('error', 'p_events must be array');
  END IF;

  IF jsonb_array_length(p_events) > v_max_batch THEN
    RETURN jsonb_build_object('error', 'batch too large', 'max', v_max_batch);
  END IF;

  WITH inserted AS (
    INSERT INTO public.client_event_log (client_id, ts, kind, summary, source, payload, meta)
    SELECT
      v_client_id,
      COALESCE((e->>'ts')::timestamptz, NOW()),
      COALESCE(e->>'kind', 'unknown'),
      COALESCE(e->>'summary', ''),
      e->>'source',
      e->'payload',
      e->'meta'
    FROM jsonb_array_elements(p_events) AS e
    WHERE COALESCE(e->>'kind', '') != ''
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted FROM inserted;

  RETURN jsonb_build_object('success', true, 'inserted', v_inserted);

EXCEPTION
  WHEN OTHERS THEN
    -- RAISE WARNING вместо NOTICE: попадает в pg server log при
    -- log_min_messages=warning (default Yandex Managed Postgres).
    -- Доступен через Yandex Console → Managed PostgreSQL → Logs.
    RAISE WARNING '[log_client_event_by_session] SQLSTATE=% SQLERRM=% DETAIL=% HINT=%',
      SQLSTATE, SQLERRM,
      COALESCE(PG_EXCEPTION_DETAIL, 'none'),
      COALESCE(PG_EXCEPTION_HINT, 'none');
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─────────────────────────────────────────────────────────────────
-- 2. log_gamification_event_by_session
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_gamification_event_by_session(
  p_session_token text,
  p_action text,
  p_reason text DEFAULT NULL,
  p_xp_before integer DEFAULT NULL,
  p_xp_after integer DEFAULT NULL,
  p_xp_delta integer DEFAULT NULL,
  p_level_before integer DEFAULT NULL,
  p_level_after integer DEFAULT NULL,
  p_achievements_before integer DEFAULT NULL,
  p_achievements_after integer DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
  v_session_id uuid;
BEGIN
  v_client_id := public.require_client_id(p_session_token);

  SELECT id INTO v_session_id
  FROM public.client_sessions
  WHERE token_hash = digest(p_session_token, 'sha256')
    AND expires_at > now()
    AND revoked_at IS NULL
  LIMIT 1;

  INSERT INTO public.gamification_events (
    client_id, actor_type, actor_id, session_id,
    action, reason,
    xp_before, xp_after, xp_delta,
    level_before, level_after,
    achievements_before, achievements_after,
    metadata
  ) VALUES (
    v_client_id, 'pin', NULL, v_session_id,
    p_action, p_reason,
    p_xp_before, p_xp_after, p_xp_delta,
    p_level_before, p_level_after,
    p_achievements_before, p_achievements_after,
    COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[log_gamification_event_by_session] SQLSTATE=% SQLERRM=% DETAIL=% HINT=%',
      SQLSTATE, SQLERRM,
      COALESCE(PG_EXCEPTION_DETAIL, 'none'),
      COALESCE(PG_EXCEPTION_HINT, 'none');
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


-- ─────────────────────────────────────────────────────────────────
-- 3. log_gamification_event_by_curator
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_gamification_event_by_curator(
  p_curator_id uuid,
  p_client_id uuid,
  p_action text,
  p_reason text DEFAULT NULL,
  p_xp_before integer DEFAULT NULL,
  p_xp_after integer DEFAULT NULL,
  p_xp_delta integer DEFAULT NULL,
  p_level_before integer DEFAULT NULL,
  p_level_after integer DEFAULT NULL,
  p_achievements_before integer DEFAULT NULL,
  p_achievements_after integer DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.clients
    WHERE id = p_client_id AND curator_id = p_curator_id
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;

  INSERT INTO public.gamification_events (
    client_id, actor_type, actor_id, session_id,
    action, reason,
    xp_before, xp_after, xp_delta,
    level_before, level_after,
    achievements_before, achievements_after,
    metadata
  ) VALUES (
    p_client_id, 'curator', p_curator_id, NULL,
    p_action, p_reason,
    p_xp_before, p_xp_after, p_xp_delta,
    p_level_before, p_level_after,
    p_achievements_before, p_achievements_after,
    COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[log_gamification_event_by_curator] SQLSTATE=% SQLERRM=% DETAIL=% HINT=%',
      SQLSTATE, SQLERRM,
      COALESCE(PG_EXCEPTION_DETAIL, 'none'),
      COALESCE(PG_EXCEPTION_HINT, 'none');
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


-- ─────────────────────────────────────────────────────────────────
-- 4. Verification
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_warning_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_warning_count
  FROM pg_proc
  WHERE proname IN (
    'log_client_event_by_session',
    'log_gamification_event_by_session',
    'log_gamification_event_by_curator'
  )
  AND position('RAISE WARNING' in prosrc) > 0;

  IF v_warning_count = 3 THEN
    RAISE NOTICE 'OK: all 3 debug fns now use RAISE WARNING';
  ELSE
    RAISE WARNING 'PARTIAL: only % of 3 fns have RAISE WARNING', v_warning_count;
  END IF;
END$$;

COMMIT;
