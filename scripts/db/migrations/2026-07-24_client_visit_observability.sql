-- Treat every cold start and foreground resume as a separate client visit while
-- preserving boot_id as the immutable page-load identifier.

ALTER TABLE public.client_log_trace
  ADD COLUMN IF NOT EXISTS visit_id text;

CREATE INDEX IF NOT EXISTS idx_client_log_trace_client_visit_ts
  ON public.client_log_trace (client_id, visit_id, client_ts DESC)
  WHERE client_id IS NOT NULL AND visit_id IS NOT NULL;

COMMENT ON COLUMN public.client_log_trace.visit_id IS
  'Cold-start or foreground-resume visit. Multiple visits may share one immutable boot_id.';

CREATE OR REPLACE VIEW public.client_app_visit_summary_v1 AS
WITH visit_events AS (
  SELECT t.*, COALESCE(t.visit_id, t.boot_id) AS effective_visit_id
  FROM public.client_log_trace t
  WHERE t.client_id IS NOT NULL
    AND t.boot_id IS NOT NULL
    AND t.actor_role = 'client'
)
SELECT
  client_id,
  effective_visit_id AS visit_id,
  max(boot_id) AS boot_id,
  CASE
    WHEN bool_or(event_name = 'visit_started' AND event_context->>'visit_kind' = 'resume') THEN 'resume'
    ELSE 'cold_start'
  END AS visit_kind,
  min(client_ts) AS started_at,
  max(client_ts) AS last_event_at,
  greatest(0, floor(extract(epoch FROM (max(client_ts) - min(client_ts))) * 1000))::integer AS duration_ms,
  max(build_id) FILTER (WHERE build_id IS NOT NULL AND build_id <> 'unknown') AS build_id,
  max(device_id) FILTER (WHERE device_id IS NOT NULL) AS device_id,
  max(device_class) FILTER (WHERE device_class IS NOT NULL) AS device_class,
  max(os_name) FILTER (WHERE os_name IS NOT NULL) AS os_name,
  max(browser_name) FILTER (WHERE browser_name IS NOT NULL) AS browser_name,
  max(display_mode) FILTER (WHERE display_mode IS NOT NULL) AS display_mode,
  count(*)::integer AS event_count,
  count(*) FILTER (WHERE level = 'error' OR event_status = 'failed')::integer AS error_count,
  CASE
    WHEN bool_or(
      event_name IN ('boot_failed', 'app_runtime_failed')
      OR (event_name IS NOT NULL AND event_status = 'failed')
    ) THEN 'failed'
    WHEN bool_or(event_name IN ('boot_ready', 'visit_ready')) THEN
      CASE
        WHEN bool_or(
          (level IN ('warn', 'error') OR event_status IN ('degraded', 'timeout', 'failed'))
          AND event_name IS DISTINCT FROM 'ews_input_insufficient'
        ) THEN 'degraded'
        ELSE 'ready'
      END
    WHEN bool_or(event_name IN ('boot_started', 'visit_started'))
      AND max(client_ts) < now() - interval '90 seconds' THEN 'abandoned'
    WHEN max(client_ts) < now() - interval '90 seconds'
      AND bool_or(event_name IS NOT NULL) THEN
      CASE
        WHEN bool_or(
          (level IN ('warn', 'error') OR event_status IN ('degraded', 'timeout', 'failed'))
          AND event_name IS DISTINCT FROM 'ews_input_insufficient'
        ) THEN 'degraded'
        ELSE 'ready'
      END
    ELSE 'starting'
  END AS outcome,
  count(*) FILTER (WHERE level = 'warn' OR event_status IN ('degraded', 'timeout'))::integer AS warning_count,
  bool_or(event_name IN ('initial_sync_ready', 'sync_cycle_completed')) AS initial_sync_completed,
  (array_agg(event_name ORDER BY client_ts DESC, id DESC)
    FILTER (WHERE event_status IN ('completed', 'ready', 'uploaded') OR event_name IN ('visit_ready', 'boot_ready', 'initial_sync_ready', 'sync_cycle_completed', 'write_uploaded')))[1]
    AS last_success_event,
  (array_agg(event_name ORDER BY client_ts DESC, id DESC)
    FILTER (
      WHERE event_name IS NOT NULL
        AND (
          level IN ('warn', 'error')
          OR event_status IN ('degraded', 'timeout', 'failed')
          OR event_name IN ('boot_failed', 'app_runtime_failed', 'sync_cycle_failed', 'write_failed')
        )
    ))[1] AS problem_event
FROM visit_events
GROUP BY client_id, effective_visit_id;

COMMENT ON VIEW public.client_app_visit_summary_v1 IS
  'Structured client visit summary. Cold starts and foreground resumes are separate; boot_id remains the page-load identity.';

CREATE OR REPLACE FUNCTION public.get_client_observability_by_curator(
  p_curator_id uuid,
  p_client_id uuid,
  p_since timestamptz DEFAULT now() - interval '24 hours',
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_since timestamptz;
  v_limit integer;
  v_sessions jsonb;
  v_logins jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = p_client_id AND curator_id = p_curator_id
  ) THEN
    RAISE EXCEPTION 'client_not_found_or_forbidden' USING ERRCODE = '42501';
  END IF;

  v_since := greatest(COALESCE(p_since, now() - interval '24 hours'), now() - interval '30 days');
  v_limit := least(greatest(COALESCE(p_limit, 50), 1), 100);

  WITH selected_sessions AS (
    SELECT s.*
    FROM public.client_app_visit_summary_v1 s
    WHERE s.client_id = p_client_id AND s.started_at >= v_since
    ORDER BY (s.outcome IN ('failed', 'degraded', 'abandoned')) DESC, s.started_at DESC
    LIMIT v_limit
  ), session_payload AS (
    SELECT jsonb_build_object(
      'visit_id', s.visit_id,
      'visit_kind', s.visit_kind,
      'boot_id', s.boot_id,
      'started_at', s.started_at,
      'last_event_at', s.last_event_at,
      'duration_ms', s.duration_ms,
      'build_id', s.build_id,
      'device_id', s.device_id,
      'device_class', s.device_class,
      'os_name', s.os_name,
      'browser_name', s.browser_name,
      'display_mode', s.display_mode,
      'event_count', s.event_count,
      'error_count', s.error_count,
      'warning_count', s.warning_count,
      'initial_sync_completed', s.initial_sync_completed,
      'last_success_event', s.last_success_event,
      'problem_event', s.problem_event,
      'outcome', s.outcome,
      'events', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'at', t.client_ts,
          'name', t.event_name,
          'source', t.event_source,
          'status', t.event_status,
          'flow_id', t.flow_id,
          'duration_ms', t.duration_ms,
          'level', t.level,
          'context', COALESCE(t.event_context, '{}'::jsonb)
        ) ORDER BY t.client_ts, t.id)
        FROM public.client_log_trace t
        WHERE t.client_id = p_client_id
          AND COALESCE(t.visit_id, t.boot_id) = s.visit_id
          AND t.actor_role = 'client'
          AND t.event_name IS NOT NULL
      ), '[]'::jsonb)
    ) AS payload, s.started_at
    FROM selected_sessions s
  )
  SELECT COALESCE(jsonb_agg(payload ORDER BY started_at DESC), '[]'::jsonb)
  INTO v_sessions
  FROM session_payload;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'at', se.created_at,
    'type', se.event_type,
    'user_agent', left(COALESCE(se.user_agent, ''), 500),
    'reason', CASE WHEN se.event_type = 'pin_failed' THEN se.meta->>'reason' ELSE NULL END
  ) ORDER BY se.created_at DESC), '[]'::jsonb)
  INTO v_logins
  FROM (
    SELECT created_at, event_type, user_agent, meta
    FROM public.security_events
    WHERE client_id = p_client_id
      AND created_at >= v_since
      AND event_type IN ('pin_success', 'pin_failed', 'pin_rate_limited', 'session_revoked')
    ORDER BY created_at DESC
    LIMIT 200
  ) se;

  RETURN jsonb_build_object(
    'client_id', p_client_id,
    'since', v_since,
    'sessions', v_sessions,
    'logins', v_logins
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_curator_observability_overview(
  p_curator_id uuid,
  p_since timestamptz DEFAULT now() - interval '24 hours',
  p_client_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_statuses text[] DEFAULT NULL,
  p_device_class text DEFAULT NULL,
  p_display_mode text DEFAULT NULL,
  p_build_id text DEFAULT NULL,
  p_problem_stage text DEFAULT NULL,
  p_sort text DEFAULT 'problems',
  p_cursor_started_at timestamptz DEFAULT NULL,
  p_cursor_boot_id text DEFAULT NULL,
  p_cursor_problem_rank integer DEFAULT NULL,
  p_cursor_duration_ms integer DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_since timestamptz;
  v_limit integer;
  v_sort text;
  v_result jsonb;
BEGIN
  IF p_curator_id IS NULL THEN
    RAISE EXCEPTION 'curator_required' USING ERRCODE = '42501';
  END IF;

  IF p_client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clients WHERE id = p_client_id AND curator_id = p_curator_id
  ) THEN
    RAISE EXCEPTION 'client_not_found_or_forbidden' USING ERRCODE = '42501';
  END IF;

  v_since := greatest(COALESCE(p_since, now() - interval '24 hours'), now() - interval '30 days');
  v_limit := least(greatest(COALESCE(p_limit, 50), 1), 100);
  v_sort := CASE WHEN p_sort IN ('newest', 'problems', 'duration') THEN p_sort ELSE 'problems' END;

  PERFORM public.log_data_access(
    'curator', p_curator_id, p_client_id, 'get_curator_observability_overview',
    ARRAY['client_log_trace', 'security_events'], false, NULL, NULL,
    jsonb_build_object('since', v_since, 'filtered_client', p_client_id IS NOT NULL)
  );

  WITH owned_sessions AS (
    SELECT
      s.*,
      c.name AS client_name,
      CASE
        WHEN s.problem_event = 'sync_cycle_failed' THEN 'sync'
        WHEN s.problem_event = 'write_failed' THEN 'write'
        WHEN s.problem_event = 'app_runtime_failed' THEN 'runtime'
        WHEN s.problem_event = 'boot_failed' THEN 'boot'
        WHEN s.outcome = 'abandoned' AND s.visit_kind = 'resume' THEN 'runtime'
        WHEN s.outcome = 'abandoned' THEN 'boot'
        WHEN s.outcome = 'failed' THEN 'runtime'
        WHEN s.outcome = 'degraded' THEN 'warning'
        ELSE NULL
      END AS problem_stage,
      CASE WHEN s.outcome IN ('failed', 'degraded', 'abandoned') THEN 1 ELSE 0 END AS problem_rank
    FROM public.client_app_visit_summary_v1 s
    JOIN public.clients c ON c.id = s.client_id AND c.curator_id = p_curator_id
    WHERE s.started_at >= v_since
      AND (p_client_id IS NULL OR s.client_id = p_client_id)
      AND (NULLIF(trim(COALESCE(p_search, '')), '') IS NULL OR c.name ILIKE '%' || trim(p_search) || '%')
      AND (p_statuses IS NULL OR cardinality(p_statuses) = 0 OR s.outcome = ANY(p_statuses))
      AND (p_device_class IS NULL OR p_device_class = '' OR s.device_class = p_device_class)
      AND (p_display_mode IS NULL OR p_display_mode = '' OR s.display_mode = p_display_mode)
      AND (p_build_id IS NULL OR p_build_id = '' OR s.build_id = p_build_id)
  ), filtered AS (
    SELECT * FROM owned_sessions
    WHERE p_problem_stage IS NULL OR p_problem_stage = '' OR problem_stage = p_problem_stage
  ), totals AS (
    SELECT
      count(*)::integer AS visits,
      count(DISTINCT client_id)::integer AS active_clients,
      count(*) FILTER (WHERE outcome = 'ready')::integer AS ready,
      count(*) FILTER (WHERE outcome = 'failed')::integer AS failed,
      count(*) FILTER (WHERE outcome = 'degraded')::integer AS degraded,
      count(*) FILTER (WHERE outcome = 'abandoned')::integer AS abandoned,
      count(*) FILTER (WHERE outcome = 'starting')::integer AS starting,
      count(*) FILTER (WHERE problem_stage IN ('sync', 'write'))::integer AS sync_problems
    FROM filtered
  ), cursor_filtered AS (
    SELECT * FROM filtered f
    WHERE p_cursor_started_at IS NULL OR
      (v_sort = 'newest' AND (f.started_at, f.visit_id) < (p_cursor_started_at, COALESCE(p_cursor_boot_id, ''))) OR
      (v_sort = 'problems' AND (
        f.problem_rank < COALESCE(p_cursor_problem_rank, 0) OR
        (f.problem_rank = COALESCE(p_cursor_problem_rank, 0) AND (f.started_at, f.visit_id) < (p_cursor_started_at, COALESCE(p_cursor_boot_id, '')))
      )) OR
      (v_sort = 'duration' AND (
        f.duration_ms < COALESCE(p_cursor_duration_ms, 0) OR
        (f.duration_ms = COALESCE(p_cursor_duration_ms, 0) AND (f.started_at, f.visit_id) < (p_cursor_started_at, COALESCE(p_cursor_boot_id, '')))
      ))
  ), page AS (
    SELECT * FROM cursor_filtered
    ORDER BY
      CASE WHEN v_sort = 'problems' THEN problem_rank END DESC,
      CASE WHEN v_sort = 'duration' THEN duration_ms END DESC,
      started_at DESC,
      visit_id DESC
    LIMIT v_limit + 1
  ), visible_page AS (
    SELECT * FROM page
    ORDER BY
      CASE WHEN v_sort = 'problems' THEN problem_rank END DESC,
      CASE WHEN v_sort = 'duration' THEN duration_ms END DESC,
      started_at DESC,
      visit_id DESC
    LIMIT v_limit
  ), session_payload AS (
    SELECT jsonb_build_object(
      'client_id', s.client_id,
      'client_name', s.client_name,
      'visit_id', s.visit_id,
      'visit_kind', s.visit_kind,
      'boot_id', s.boot_id,
      'started_at', s.started_at,
      'last_event_at', s.last_event_at,
      'duration_ms', s.duration_ms,
      'build_id', s.build_id,
      'device_id', s.device_id,
      'device_class', s.device_class,
      'os_name', s.os_name,
      'browser_name', s.browser_name,
      'display_mode', s.display_mode,
      'event_count', s.event_count,
      'error_count', s.error_count,
      'warning_count', s.warning_count,
      'initial_sync_completed', s.initial_sync_completed,
      'last_success_event', s.last_success_event,
      'problem_event', s.problem_event,
      'problem_stage', s.problem_stage,
      'outcome', s.outcome,
      'events', COALESCE((
        SELECT jsonb_agg(event_payload ORDER BY event_at, event_order)
        FROM (
          SELECT
            t.client_ts AS event_at,
            t.id::text AS event_order,
            jsonb_build_object(
              'at', t.client_ts, 'name', t.event_name, 'source', t.event_source,
              'status', t.event_status, 'duration_ms', t.duration_ms, 'level', t.level,
              'context', COALESCE(t.event_context, '{}'::jsonb)
            ) AS event_payload
          FROM public.client_log_trace t
          WHERE t.client_id = s.client_id
            AND COALESCE(t.visit_id, t.boot_id) = s.visit_id
            AND t.actor_role = 'client' AND t.event_name IS NOT NULL
          UNION ALL
          SELECT
            se.created_at, se.id::text,
            jsonb_build_object(
              'at', se.created_at, 'name', se.event_type, 'source', 'auth',
              'status', CASE WHEN se.event_type = 'pin_success' THEN 'completed' ELSE 'failed' END,
              'level', CASE WHEN se.event_type = 'pin_success' THEN 'info' ELSE 'warn' END,
              'context', CASE WHEN se.event_type = 'pin_failed'
                THEN jsonb_build_object('reason', left(COALESCE(se.meta->>'reason', 'unknown'), 80))
                ELSE '{}'::jsonb END
            )
          FROM public.security_events se
          WHERE se.client_id = s.client_id
            AND se.created_at BETWEEN s.started_at - interval '2 minutes' AND s.last_event_at + interval '2 minutes'
            AND se.event_type IN ('pin_success', 'pin_failed', 'pin_rate_limited', 'session_revoked')
        ) timeline
      ), '[]'::jsonb)
    ) AS payload,
    s.*
    FROM visible_page s
  ), sessions_json AS (
    SELECT COALESCE(jsonb_agg(payload ORDER BY
      CASE WHEN v_sort = 'problems' THEN problem_rank END DESC,
      CASE WHEN v_sort = 'duration' THEN duration_ms END DESC,
      started_at DESC, visit_id DESC
    ), '[]'::jsonb) AS value
    FROM session_payload
  ), last_visible AS (
    SELECT * FROM visible_page
    ORDER BY
      CASE WHEN v_sort = 'problems' THEN problem_rank END ASC,
      CASE WHEN v_sort = 'duration' THEN duration_ms END ASC,
      started_at ASC,
      visit_id ASC
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'since', v_since,
    'generated_at', now(),
    'summary', jsonb_build_object(
      'active_clients', totals.active_clients,
      'visits', totals.visits,
      'launches', totals.visits,
      'ready', totals.ready,
      'failed', totals.failed,
      'degraded', totals.degraded,
      'abandoned', totals.abandoned,
      'starting', totals.starting,
      'sync_problems', totals.sync_problems,
      'success_rate', CASE WHEN totals.visits = 0 THEN 0 ELSE round(totals.ready::numeric * 100 / totals.visits, 1) END
    ),
    'sessions', sessions_json.value,
    'has_more', (SELECT count(*) > v_limit FROM page),
    'next_cursor', CASE WHEN (SELECT count(*) > v_limit FROM page) THEN (
      SELECT jsonb_build_object(
        'started_at', started_at, 'boot_id', visit_id,
        'problem_rank', problem_rank, 'duration_ms', duration_ms
      ) FROM last_visible
    ) ELSE NULL END
  ) INTO v_result
  FROM totals CROSS JOIN sessions_json;

  RETURN v_result;
END;
$function$;
