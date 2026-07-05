-- =============================================================================
-- HEYS Ops timeline + curator status dashboard
--
-- Apply:
--   bash scripts/db/psql.sh --single-transaction -f database/2026-07-05_ops_incidents_and_status.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ops_incidents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source           text NOT NULL,
  event_key        text NOT NULL,
  severity         text NOT NULL CHECK (severity IN ('info', 'warn', 'critical')),
  status           text NOT NULL CHECK (status IN ('open', 'resolved')) DEFAULT 'open',
  title            text NOT NULL,
  details          jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz,
  occurrence_count int NOT NULL DEFAULT 1,
  UNIQUE (source, event_key)
);

CREATE INDEX IF NOT EXISTS idx_ops_incidents_status_last_seen
  ON public.ops_incidents (status, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_ops_incidents_event_key
  ON public.ops_incidents (event_key);

CREATE OR REPLACE FUNCTION public.record_ops_incident(
  p_source text,
  p_event_key text,
  p_severity text,
  p_title text,
  p_details jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.ops_incidents;
BEGIN
  IF p_source IS NULL OR p_event_key IS NULL OR p_title IS NULL THEN
    RAISE EXCEPTION 'source, event_key and title are required';
  END IF;

  INSERT INTO public.ops_incidents (
    source,
    event_key,
    severity,
    status,
    title,
    details,
    first_seen_at,
    last_seen_at,
    resolved_at,
    occurrence_count
  )
  VALUES (
    p_source,
    p_event_key,
    COALESCE(NULLIF(p_severity, ''), 'warn'),
    'open',
    p_title,
    COALESCE(p_details, '{}'::jsonb),
    now(),
    now(),
    NULL,
    1
  )
  ON CONFLICT (source, event_key) DO UPDATE
     SET severity = EXCLUDED.severity,
         status = 'open',
         title = EXCLUDED.title,
         details = EXCLUDED.details,
         last_seen_at = now(),
         resolved_at = NULL,
         occurrence_count = public.ops_incidents.occurrence_count + 1
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_ops_incident(
  p_source text,
  p_event_key text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ops_incidents
     SET status = 'resolved',
         resolved_at = COALESCE(resolved_at, now()),
         last_seen_at = now()
   WHERE source = p_source
     AND event_key = p_event_key
     AND status <> 'resolved';

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_ops_status(
  p_curator_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_backup jsonb;
  v_heartbeats jsonb;
  v_incidents jsonb;
  v_counts jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.curators c WHERE c.id = p_curator_id) THEN
    RAISE EXCEPTION 'curator_not_found';
  END IF;

  SELECT COALESCE(to_jsonb(x), 'null'::jsonb)
    INTO v_backup
    FROM (
      SELECT status,
             run_at,
             round(extract(epoch FROM now() - run_at) / 3600)::int AS hours_ago,
             success_count,
             error_count,
             duration_sec
        FROM public.backup_run_log
       ORDER BY run_at DESC
       LIMIT 1
    ) x;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.task), '[]'::jsonb)
    INTO v_heartbeats
    FROM (
      SELECT task,
             last_ok_at,
             round(extract(epoch FROM now() - last_ok_at) / 60)::int AS minutes_ago,
             (last_ok_at < now() - max_silence) AS stale
        FROM public.maintenance_heartbeat
       ORDER BY task
    ) x;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.last_seen_at DESC), '[]'::jsonb)
    INTO v_incidents
    FROM (
      SELECT source,
             event_key,
             severity,
             status,
             title,
             details,
             first_seen_at,
             last_seen_at,
             resolved_at,
             occurrence_count
        FROM public.ops_incidents
       ORDER BY status = 'open' DESC, last_seen_at DESC
       LIMIT 20
    ) x;

  SELECT jsonb_build_object(
           'open_incidents', count(*) FILTER (WHERE status = 'open'),
           'critical_open', count(*) FILTER (WHERE status = 'open' AND severity = 'critical'),
           'stale_heartbeats', (
             SELECT count(*) FROM public.maintenance_heartbeat
              WHERE last_ok_at < now() - max_silence
           )
         )
    INTO v_counts
    FROM public.ops_incidents;

  RETURN jsonb_build_object(
    'ok',
      COALESCE((v_counts->>'open_incidents')::int, 0) = 0
      AND COALESCE((v_counts->>'stale_heartbeats')::int, 0) = 0
      AND COALESCE((v_backup->>'status'), '') = 'ok'
      AND COALESCE((v_backup->>'hours_ago')::int, 999) <= 30,
    'generated_at', now(),
    'backup', v_backup,
    'heartbeats', v_heartbeats,
    'incidents', v_incidents,
    'counts', v_counts
  );
END;
$$;

GRANT SELECT, INSERT, UPDATE ON public.ops_incidents TO heys_admin;
GRANT SELECT ON public.ops_incidents TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.record_ops_incident(text, text, text, text, jsonb) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.resolve_ops_incident(text, text) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.admin_get_ops_status(uuid) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.admin_get_ops_status(uuid) TO heys_admin;

COMMENT ON TABLE public.ops_incidents IS
  'Ops incident timeline for infrastructure checks, Telegram polling, backup chain and deployment drift.';
