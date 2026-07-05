-- =============================================================================
-- HEYS Ops dashboard follow-ups:
-- - runbook metadata inside incident details
-- - deploy receipts
-- - server-side dashboard refresh
-- - notification dedupe claim
--
-- Apply:
--   bash scripts/db/psql.sh --single-transaction -f database/2026-07-05_ops_dashboard_followups.sql
-- =============================================================================

ALTER TABLE public.ops_incidents
  ADD COLUMN IF NOT EXISTS last_state_change_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS notification_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_notification_state text;

CREATE TABLE IF NOT EXISTS public.ops_deploy_receipts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deployed_at    timestamptz NOT NULL DEFAULT now(),
  deploy_group   text NOT NULL,
  deploy_commit  text NOT NULL,
  status         text NOT NULL CHECK (status IN ('ok', 'failed')),
  canary_ok      boolean,
  actor          text,
  details        jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ops_deploy_receipts_deployed_at
  ON public.ops_deploy_receipts (deployed_at DESC);

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
    last_state_change_at,
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
         last_state_change_at = CASE
           WHEN public.ops_incidents.status <> 'open'
             OR public.ops_incidents.severity IS DISTINCT FROM EXCLUDED.severity
             OR public.ops_incidents.title IS DISTINCT FROM EXCLUDED.title
           THEN now()
           ELSE public.ops_incidents.last_state_change_at
         END,
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
         last_seen_at = now(),
         last_state_change_at = CASE
           WHEN status <> 'resolved' THEN now()
           ELSE last_state_change_at
         END
   WHERE source = p_source
     AND event_key = p_event_key
     AND status <> 'resolved';

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_ops_incident_notification(
  p_source text,
  p_event_key text,
  p_min_interval interval DEFAULT interval '1 hour',
  p_escalate_after interval DEFAULT interval '6 hours'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.ops_incidents;
  v_state text;
  v_should_notify boolean := false;
BEGIN
  SELECT *
    INTO v_row
    FROM public.ops_incidents
   WHERE source = p_source
     AND event_key = p_event_key
     AND status = 'open'
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('notify', false, 'reason', 'not_open');
  END IF;

  v_state := v_row.severity || ':' || v_row.status || ':' || v_row.title;
  v_should_notify :=
    v_row.last_notified_at IS NULL
    OR v_row.last_notified_at < now() - p_min_interval
    OR v_row.last_notification_state IS DISTINCT FROM v_state
    OR (
      v_row.severity = 'critical'
      AND v_row.last_state_change_at < now() - p_escalate_after
      AND v_row.last_notified_at < now() - interval '30 minutes'
    );

  IF NOT v_should_notify THEN
    RETURN jsonb_build_object('notify', false, 'reason', 'deduped');
  END IF;

  UPDATE public.ops_incidents
     SET last_notified_at = now(),
         notification_count = notification_count + 1,
         last_notification_state = v_state
   WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'notify', true,
    'severity', v_row.severity,
    'notification_count', v_row.notification_count + 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_ops_deploy_receipt(
  p_deploy_group text,
  p_deploy_commit text,
  p_status text DEFAULT 'ok',
  p_canary_ok boolean DEFAULT NULL,
  p_actor text DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.ops_deploy_receipts;
BEGIN
  INSERT INTO public.ops_deploy_receipts (
    deploy_group,
    deploy_commit,
    status,
    canary_ok,
    actor,
    details
  )
  VALUES (
    COALESCE(NULLIF(p_deploy_group, ''), 'unknown'),
    COALESCE(NULLIF(p_deploy_commit, ''), 'unknown'),
    COALESCE(NULLIF(p_status, ''), 'ok'),
    p_canary_ok,
    p_actor,
    COALESCE(p_details, '{}'::jsonb)
  )
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_ops_status_incidents()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_backup record;
  v_stale_count int;
BEGIN
  SELECT status,
         run_at,
         round(extract(epoch FROM now() - run_at) / 3600)::int AS hours_ago,
         error_count
    INTO v_backup
    FROM public.backup_run_log
   ORDER BY run_at DESC
   LIMIT 1;

  IF v_backup.run_at IS NULL THEN
    PERFORM public.record_ops_incident(
      'ops-dashboard',
      'backup_missing',
      'critical',
      'Backup run is missing',
      '{"runbook_command":"pnpm ops:heys:status --strict","runbook_title":"Проверить backup chain"}'::jsonb
    );
  ELSIF v_backup.status <> 'ok' OR v_backup.hours_ago > 30 OR COALESCE(v_backup.error_count, 0) > 0 THEN
    PERFORM public.record_ops_incident(
      'ops-dashboard',
      'backup_gap',
      'critical',
      'Backup chain gap',
      jsonb_build_object(
        'hours_ago', v_backup.hours_ago,
        'status', v_backup.status,
        'error_count', v_backup.error_count,
        'runbook_command', 'pnpm ops:heys:status --strict',
        'runbook_title', 'Проверить backup_run_log и heys-client-daily-backup'
      )
    );
  ELSE
    PERFORM public.resolve_ops_incident('ops-dashboard', 'backup_missing');
    PERFORM public.resolve_ops_incident('ops-dashboard', 'backup_gap');
  END IF;

  SELECT count(*)::int
    INTO v_stale_count
    FROM public.maintenance_heartbeat
   WHERE last_ok_at < now() - max_silence;

  IF v_stale_count > 0 THEN
    PERFORM public.record_ops_incident(
      'ops-dashboard',
      'heartbeat_stale',
      'critical',
      'Maintenance heartbeat stale',
      jsonb_build_object(
        'stale_count', v_stale_count,
        'runbook_command', 'pnpm ops:heys:status --strict',
        'runbook_title', 'Проверить maintenance triggers и logs'
      )
    );
  ELSE
    PERFORM public.resolve_ops_incident('ops-dashboard', 'heartbeat_stale');
  END IF;

  RETURN jsonb_build_object(
    'refreshed_at', now(),
    'backup_hours_ago', COALESCE(v_backup.hours_ago, 999),
    'stale_heartbeats', v_stale_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_refresh_ops_status(
  p_curator_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.curators c WHERE c.id = p_curator_id) THEN
    RAISE EXCEPTION 'curator_not_found';
  END IF;

  PERFORM public.refresh_ops_status_incidents();
  RETURN public.admin_get_ops_status(p_curator_id);
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
  v_deploys jsonb;
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

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.status = 'open' DESC, x.last_seen_at DESC), '[]'::jsonb)
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
             last_state_change_at,
             resolved_at,
             occurrence_count,
             notification_count,
             last_notified_at
        FROM public.ops_incidents
       ORDER BY status = 'open' DESC, last_seen_at DESC
       LIMIT 20
    ) x;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.deployed_at DESC), '[]'::jsonb)
    INTO v_deploys
    FROM (
      SELECT deploy_group,
             deploy_commit,
             status,
             canary_ok,
             actor,
             deployed_at,
             details
        FROM public.ops_deploy_receipts
       ORDER BY deployed_at DESC
       LIMIT 8
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
    'deploys', v_deploys,
    'counts', v_counts
  );
END;
$$;

GRANT SELECT, INSERT, UPDATE ON public.ops_incidents TO heys_admin;
GRANT SELECT ON public.ops_incidents TO heys_rpc;
GRANT SELECT, INSERT ON public.ops_deploy_receipts TO heys_admin;
GRANT SELECT ON public.ops_deploy_receipts TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.record_ops_incident(text, text, text, text, jsonb) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.resolve_ops_incident(text, text) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.claim_ops_incident_notification(text, text, interval, interval) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.record_ops_deploy_receipt(text, text, text, boolean, text, jsonb) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.refresh_ops_status_incidents() TO heys_admin;
GRANT EXECUTE ON FUNCTION public.admin_refresh_ops_status(uuid) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.admin_refresh_ops_status(uuid) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.admin_get_ops_status(uuid) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.admin_get_ops_status(uuid) TO heys_admin;

COMMENT ON TABLE public.ops_deploy_receipts IS
  'Receipt log for HEYS deploy groups, commits and post-deploy canary results.';
