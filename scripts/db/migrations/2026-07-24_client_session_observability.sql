-- Client Session Observability: trusted, structured app-start diagnostics.
--
-- Privacy contract:
--   * no food, health values, message bodies, phone numbers, IPs or bearer tokens;
--   * curator reads only clients owned by p_curator_id;
--   * raw console text remains unavailable through the curator RPC;
--   * retention target is 30 days; deletion stays disabled until owner/legal sign-off.
--
-- This migration intentionally redacts historical PIN bearer tokens. That redaction
-- is irreversible and must not be rolled back.

BEGIN;

ALTER TABLE public.client_log_trace
  ADD COLUMN IF NOT EXISTS event_id uuid,
  ADD COLUMN IF NOT EXISTS boot_id text,
  ADD COLUMN IF NOT EXISTS event_name text,
  ADD COLUMN IF NOT EXISTS event_source text,
  ADD COLUMN IF NOT EXISTS event_status text,
  ADD COLUMN IF NOT EXISTS flow_id text,
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS build_id text,
  ADD COLUMN IF NOT EXISTS device_id text,
  ADD COLUMN IF NOT EXISTS device_class text,
  ADD COLUMN IF NOT EXISTS os_name text,
  ADD COLUMN IF NOT EXISTS browser_name text,
  ADD COLUMN IF NOT EXISTS display_mode text,
  ADD COLUMN IF NOT EXISTS actor_role text,
  ADD COLUMN IF NOT EXISTS trust_level text,
  ADD COLUMN IF NOT EXISTS event_context jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_log_trace_event_id
  ON public.client_log_trace (event_id)
  WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_client_log_trace_client_boot_ts
  ON public.client_log_trace (client_id, boot_id, client_ts DESC)
  WHERE client_id IS NOT NULL AND boot_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_client_log_trace_event_name_ts
  ON public.client_log_trace (event_name, client_ts DESC)
  WHERE event_name IS NOT NULL;

COMMENT ON TABLE public.client_log_trace IS
  'Client console and structured lifecycle telemetry. Target retention: 30 days; cleanup is dry-run until owner/legal approval.';
COMMENT ON COLUMN public.client_log_trace.event_context IS
  'Allowlisted diagnostic metadata only. Never store health values, message text, phone, IP or auth tokens.';
COMMENT ON COLUMN public.client_log_trace.trust_level IS
  'Server-assigned identity trust: authenticated, curator, or anonymous.';

CREATE OR REPLACE VIEW public.client_app_session_summary_v1 AS
SELECT
  client_id,
  boot_id,
  min(client_ts) AS started_at,
  max(client_ts) AS last_event_at,
  greatest(0, floor(extract(epoch FROM (max(client_ts) - min(client_ts))) * 1000))::integer AS duration_ms,
  max(build_id) FILTER (WHERE build_id IS NOT NULL) AS build_id,
  max(device_id) FILTER (WHERE device_id IS NOT NULL) AS device_id,
  max(device_class) FILTER (WHERE device_class IS NOT NULL) AS device_class,
  max(os_name) FILTER (WHERE os_name IS NOT NULL) AS os_name,
  max(browser_name) FILTER (WHERE browser_name IS NOT NULL) AS browser_name,
  max(display_mode) FILTER (WHERE display_mode IS NOT NULL) AS display_mode,
  count(*)::integer AS event_count,
  count(*) FILTER (WHERE level = 'error' OR event_status = 'failed')::integer AS error_count,
  CASE
    WHEN bool_or(event_name IN ('boot_failed', 'app_runtime_failed') OR event_status = 'failed' OR level = 'error') THEN 'failed'
    WHEN bool_or(event_name = 'boot_ready') THEN
      CASE WHEN bool_or(level = 'warn' OR event_status = 'degraded') THEN 'degraded' ELSE 'ready' END
    WHEN max(client_ts) < now() - interval '90 seconds' THEN 'abandoned'
    ELSE 'starting'
  END AS outcome,
  count(*) FILTER (WHERE level = 'warn' OR event_status IN ('degraded', 'timeout'))::integer AS warning_count,
  bool_or(event_name = 'sync_cycle_completed') AS initial_sync_completed,
  (array_agg(event_name ORDER BY client_ts DESC, id DESC)
    FILTER (WHERE event_status IN ('completed', 'ready', 'uploaded') OR event_name IN ('boot_ready', 'sync_cycle_completed', 'write_uploaded')))[1]
    AS last_success_event,
  (array_agg(event_name ORDER BY client_ts DESC, id DESC)
    FILTER (WHERE level = 'error' OR event_status = 'failed' OR event_name IN ('boot_failed', 'app_runtime_failed', 'sync_cycle_failed', 'write_failed')))[1]
    AS problem_event
FROM public.client_log_trace
WHERE client_id IS NOT NULL
  AND boot_id IS NOT NULL
  AND actor_role = 'client'
GROUP BY client_id, boot_id;

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
    FROM public.client_app_session_summary_v1 s
    WHERE s.client_id = p_client_id AND s.started_at >= v_since
    ORDER BY (s.outcome IN ('failed', 'degraded', 'abandoned')) DESC, s.started_at DESC
    LIMIT v_limit
  ), session_payload AS (
    SELECT jsonb_build_object(
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
          AND t.boot_id = s.boot_id
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

REVOKE ALL ON FUNCTION public.get_client_observability_by_curator(uuid, uuid, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_client_observability_by_curator(uuid, uuid, timestamptz, integer) TO heys_rpc;

-- One curator request returns filtered totals and a cursor-paginated session page.
-- Timelines are correlated in SQL, so the API never performs a per-client/session loop.
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

  -- Aggregate dashboard access is audited once per request. client_id stays null
  -- for the all-client view; an explicit client filter is retained when present.
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
        WHEN s.problem_event IN ('sync_cycle_failed') THEN 'sync'
        WHEN s.problem_event IN ('write_failed') THEN 'write'
        WHEN s.problem_event IN ('app_runtime_failed') THEN 'runtime'
        WHEN s.problem_event IN ('boot_failed') OR s.outcome = 'abandoned' THEN 'boot'
        WHEN s.outcome = 'failed' THEN 'runtime'
        WHEN s.outcome = 'degraded' THEN 'warning'
        ELSE NULL
      END AS problem_stage,
      CASE WHEN s.outcome IN ('failed', 'degraded', 'abandoned') THEN 1 ELSE 0 END AS problem_rank
    FROM public.client_app_session_summary_v1 s
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
      count(*)::integer AS launches,
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
      (v_sort = 'newest' AND (f.started_at, f.boot_id) < (p_cursor_started_at, COALESCE(p_cursor_boot_id, ''))) OR
      (v_sort = 'problems' AND (
        f.problem_rank < COALESCE(p_cursor_problem_rank, 0) OR
        (f.problem_rank = COALESCE(p_cursor_problem_rank, 0) AND (f.started_at, f.boot_id) < (p_cursor_started_at, COALESCE(p_cursor_boot_id, '')))
      )) OR
      (v_sort = 'duration' AND (
        f.duration_ms < COALESCE(p_cursor_duration_ms, 0) OR
        (f.duration_ms = COALESCE(p_cursor_duration_ms, 0) AND (f.started_at, f.boot_id) < (p_cursor_started_at, COALESCE(p_cursor_boot_id, '')))
      ))
  ), page AS (
    SELECT * FROM cursor_filtered
    ORDER BY
      CASE WHEN v_sort = 'problems' THEN problem_rank END DESC,
      CASE WHEN v_sort = 'duration' THEN duration_ms END DESC,
      started_at DESC,
      boot_id DESC
    LIMIT v_limit + 1
  ), visible_page AS (
    SELECT * FROM page
    ORDER BY
      CASE WHEN v_sort = 'problems' THEN problem_rank END DESC,
      CASE WHEN v_sort = 'duration' THEN duration_ms END DESC,
      started_at DESC,
      boot_id DESC
    LIMIT v_limit
  ), session_payload AS (
    SELECT jsonb_build_object(
      'client_id', s.client_id,
      'client_name', s.client_name,
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
          WHERE t.client_id = s.client_id AND t.boot_id = s.boot_id
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
      started_at DESC, boot_id DESC
    ), '[]'::jsonb) AS value
    FROM session_payload
  ), last_visible AS (
    SELECT * FROM visible_page
    ORDER BY
      CASE WHEN v_sort = 'problems' THEN problem_rank END ASC,
      CASE WHEN v_sort = 'duration' THEN duration_ms END ASC,
      started_at ASC,
      boot_id ASC
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'since', v_since,
    'generated_at', now(),
    'summary', jsonb_build_object(
      'active_clients', totals.active_clients,
      'launches', totals.launches,
      'ready', totals.ready,
      'failed', totals.failed,
      'degraded', totals.degraded,
      'abandoned', totals.abandoned,
      'starting', totals.starting,
      'sync_problems', totals.sync_problems,
      'success_rate', CASE WHEN totals.launches = 0 THEN 0 ELSE round(totals.ready::numeric * 100 / totals.launches, 1) END
    ),
    'sessions', sessions_json.value,
    'has_more', (SELECT count(*) > v_limit FROM page),
    'next_cursor', CASE WHEN (SELECT count(*) > v_limit FROM page) THEN (
      SELECT jsonb_build_object(
        'started_at', started_at, 'boot_id', boot_id,
        'problem_rank', problem_rank, 'duration_ms', duration_ms
      ) FROM last_visible
    ) ELSE NULL END
  ) INTO v_result
  FROM totals CROSS JOIN sessions_json;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_curator_observability_overview(
  uuid, timestamptz, uuid, text, text[], text, text, text, text, text,
  timestamptz, text, integer, integer, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_curator_observability_overview(
  uuid, timestamptz, uuid, text, text[], text, text, text, text, text,
  timestamptz, text, integer, integer, integer
) TO heys_rpc;

-- Stop writing raw bearer tokens to security_events while preserving the login API.
CREATE OR REPLACE FUNCTION public.verify_client_pin_v3(
  p_phone text,
  p_pin text,
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_client record;
  v_ip inet;
  v_phone_normalized text;
  v_session_token uuid;
  v_session_record_id uuid;
  v_session_expires timestamptz;
  v_client_found boolean := false;
  v_pin_correct boolean := false;
BEGIN
  v_phone_normalized := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
  BEGIN
    v_ip := COALESCE(NULLIF(trim(p_ip), '')::inet, '0.0.0.0'::inet);
  EXCEPTION WHEN OTHERS THEN
    v_ip := '0.0.0.0'::inet;
  END;

  BEGIN
    PERFORM public.check_pin_rate_limit(v_phone_normalized, v_ip);
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.log_security_event('pin_rate_limited', v_phone_normalized, NULL, v_ip::text, p_user_agent, jsonb_build_object('error', SQLERRM));
    RAISE;
  END;

  SELECT id, pin_hash, name INTO v_client
  FROM public.clients
  WHERE (
    regexp_replace(COALESCE(phone_normalized, ''), '[^0-9]', '', 'g') = v_phone_normalized
    OR regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = v_phone_normalized
  ) AND pin_hash IS NOT NULL
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;
  v_client_found := FOUND;
  IF v_client_found THEN v_pin_correct := (v_client.pin_hash = crypt(p_pin, v_client.pin_hash)); END IF;
  PERFORM pg_sleep(0.25 + random() * 0.10);

  IF NOT v_client_found OR NOT v_pin_correct THEN
    PERFORM public.increment_pin_attempt(v_phone_normalized, v_ip);
    PERFORM public.log_security_event(
      'pin_failed', v_phone_normalized,
      CASE WHEN v_client_found THEN v_client.id ELSE NULL END,
      v_ip::text, p_user_agent,
      jsonb_build_object('reason', 'invalid_credentials', 'client_exists', v_client_found)
    );
    RETURN jsonb_build_object('success', false, 'error', 'invalid_credentials');
  END IF;

  PERFORM public.reset_pin_attempts(v_phone_normalized, v_ip);
  IF v_client.pin_hash ~ '^\$2[ab]\$0[0-9]\$' THEN
    UPDATE public.clients SET pin_hash = crypt(p_pin, gen_salt('bf', 12)), pin_updated_at = now()
    WHERE id = v_client.id;
  END IF;

  v_session_token := gen_random_uuid();
  v_session_expires := now() + interval '30 days';
  INSERT INTO public.client_sessions (token_hash, client_id, ip_address, user_agent, expires_at)
  VALUES (digest(v_session_token::text, 'sha256'), v_client.id, v_ip, p_user_agent, v_session_expires)
  RETURNING id INTO v_session_record_id;

  PERFORM public.log_security_event(
    'pin_success', v_phone_normalized, v_client.id, v_ip::text, p_user_agent,
    jsonb_build_object('session_record_id', v_session_record_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'session_token', v_session_token,
    'client_id', v_client.id,
    'name', v_client.name,
    'session_expires_at', v_session_expires
  );
END;
$function$;

COMMENT ON FUNCTION public.verify_client_pin_v3(text, text, text, text) IS
  'PIN login with normalized lookup; security audit stores only the non-secret session row id.';

UPDATE public.security_events
SET meta = meta - 'session_id'
WHERE event_type = 'pin_success' AND meta ? 'session_id';

COMMIT;
