-- 2026-02-04: Gamification audit trail (XP, уровни, достижения)

BEGIN;

-- 1) Таблица audit-ивентов геймификации
CREATE TABLE IF NOT EXISTS public.gamification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  actor_type text NOT NULL, -- pin | curator | system
  actor_id uuid,
  session_id uuid,
  action text NOT NULL,     -- xp_gain | level_up | achievement_unlocked | daily_bonus
  reason text,
  xp_before integer,
  xp_after integer,
  xp_delta integer,
  level_before integer,
  level_after integer,
  achievements_before integer,
  achievements_after integer,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_gamification_events_client_time
  ON public.gamification_events (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gamification_events_action
  ON public.gamification_events (action);

-- 2) Session-safe логирование (PIN auth)
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
    client_id,
    actor_type,
    actor_id,
    session_id,
    action,
    reason,
    xp_before,
    xp_after,
    xp_delta,
    level_before,
    level_after,
    achievements_before,
    achievements_after,
    metadata
  ) VALUES (
    v_client_id,
    'pin',
    NULL,
    v_session_id,
    p_action,
    p_reason,
    p_xp_before,
    p_xp_after,
    p_xp_delta,
    p_level_before,
    p_level_after,
    p_achievements_before,
    p_achievements_after,
    COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.log_gamification_event_by_session(
  text, text, text, integer, integer, integer, integer, integer, integer, integer, jsonb
) IS 'Audit trail for gamification (PIN auth).';

-- 3) Curator-safe логирование (JWT auth)
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
    client_id,
    actor_type,
    actor_id,
    session_id,
    action,
    reason,
    xp_before,
    xp_after,
    xp_delta,
    level_before,
    level_after,
    achievements_before,
    achievements_after,
    metadata
  ) VALUES (
    p_client_id,
    'curator',
    p_curator_id,
    NULL,
    p_action,
    p_reason,
    p_xp_before,
    p_xp_after,
    p_xp_delta,
    p_level_before,
    p_level_after,
    p_achievements_before,
    p_achievements_after,
    COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.log_gamification_event_by_curator(
  uuid, uuid, text, text, integer, integer, integer, integer, integer, integer, integer, jsonb
) IS 'Audit trail for gamification (curator auth).';

-- 4) Получение истории (PIN auth)
CREATE OR REPLACE FUNCTION public.get_gamification_events_by_session(
  p_session_token text,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
  v_items jsonb;
  v_total integer;
BEGIN
  v_client_id := public.require_client_id(p_session_token);

  SELECT COALESCE(jsonb_agg(e ORDER BY e.created_at DESC), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      id,
      action,
      reason,
      xp_before,
      xp_after,
      xp_delta,
      level_before,
      level_after,
      achievements_before,
      achievements_after,
      metadata,
      actor_type,
      actor_id,
      created_at
    FROM public.gamification_events
    WHERE client_id = v_client_id
    ORDER BY created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) e;

  SELECT COUNT(*) INTO v_total
  FROM public.gamification_events
  WHERE client_id = v_client_id;

  RETURN jsonb_build_object(
    'success', true,
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset
  );
END;
$$;

COMMENT ON FUNCTION public.get_gamification_events_by_session(text, integer, integer) IS
  'Returns gamification audit history for client (PIN auth).';

-- 5) Получение истории (curator auth)
CREATE OR REPLACE FUNCTION public.get_gamification_events_by_curator(
  p_curator_id uuid,
  p_client_id uuid,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean;
  v_items jsonb;
  v_total integer;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.clients
    WHERE id = p_client_id AND curator_id = p_curator_id
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;

  SELECT COALESCE(jsonb_agg(e ORDER BY e.created_at DESC), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      id,
      action,
      reason,
      xp_before,
      xp_after,
      xp_delta,
      level_before,
      level_after,
      achievements_before,
      achievements_after,
      metadata,
      actor_type,
      actor_id,
      created_at
    FROM public.gamification_events
    WHERE client_id = p_client_id
    ORDER BY created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) e;

  SELECT COUNT(*) INTO v_total
  FROM public.gamification_events
  WHERE client_id = p_client_id;

  RETURN jsonb_build_object(
    'success', true,
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset
  );
END;
$$;

COMMENT ON FUNCTION public.get_gamification_events_by_curator(uuid, uuid, integer, integer) IS
  'Returns gamification audit history for curator (JWT auth).';

-- 6) Ретеншн: удаление старых событий (по умолчанию 90 дней)
CREATE OR REPLACE FUNCTION public.purge_gamification_events(
  p_days integer DEFAULT 90
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF p_days < 7 THEN
    RAISE EXCEPTION 'p_days слишком маленький (min 7)';
  END IF;

  DELETE FROM public.gamification_events
  WHERE created_at < (timezone('utc', now()) - make_interval(days => p_days));

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.purge_gamification_events(integer) IS
  'Retention helper: purge gamification events older than N days (default 90).';

-- 7) Grants
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.log_gamification_event_by_session(
    text, text, text, integer, integer, integer, integer, integer, integer, integer, jsonb
  ) TO heys_rpc;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.log_gamification_event_by_curator(
    uuid, uuid, text, text, integer, integer, integer, integer, integer, integer, integer, jsonb
  ) TO heys_rpc;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_gamification_events_by_session(text, integer, integer) TO heys_rpc;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_gamification_events_by_curator(uuid, uuid, integer, integer) TO heys_rpc;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

COMMIT;
