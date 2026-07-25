-- Keep routine UI actions and recovered startup fallbacks out of the problem
-- visit count, while preserving real sync, write, runtime and recovery failures.
-- ROLLBACK: restore client_app_visit_summary_v1 from
-- 2026-07-25_client_observability_runtime_env.sql.

CREATE OR REPLACE VIEW public.client_app_visit_summary_v1 AS
WITH visit_events AS (
  SELECT t.*, COALESCE(t.visit_id, t.boot_id) AS effective_visit_id
  FROM public.client_log_trace t
  WHERE t.client_id IS NOT NULL
    AND t.boot_id IS NOT NULL
    AND t.actor_role = 'client'
), visit_signal_state AS (
  SELECT
    client_id,
    effective_visit_id,
    min(client_ts) FILTER (WHERE event_name = 'blank_screen_guard_triggered') AS blank_guard_at,
    min(client_ts) FILTER (WHERE event_name IN ('hunger_prompt_shown', 'step_shown')) AS visible_overlay_at
  FROM visit_events
  GROUP BY client_id, effective_visit_id
), classified_visit_events AS (
  SELECT
    v.*,
    COALESCE(s.visible_overlay_at <= s.blank_guard_at, false) AS visible_overlay_before_blank_guard,
    (v.event_name IS NULL
      AND v.level = 'error'
      AND v.message ~ '^\[HEYS\.api\] .*Attempt [12]/3 failed') AS transient_api_retry
  FROM visit_events v
  JOIN visit_signal_state s
    ON s.client_id = v.client_id
   AND s.effective_visit_id = v.effective_visit_id
), traced_visits AS (
SELECT
  client_id,
  effective_visit_id AS visit_id,
  max(boot_id) AS boot_id,
  CASE
    WHEN bool_or(event_name = 'visit_started' AND event_context->>'visit_kind' = 'client_entry') THEN 'client_entry'
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
  count(*) FILTER (WHERE (level = 'error' AND NOT transient_api_retry) OR event_status = 'failed')::integer AS error_count,
  CASE
    WHEN bool_or(
      event_name IN ('boot_failed', 'app_runtime_failed')
      OR (event_name IS NOT NULL AND event_status = 'failed')
    ) THEN 'failed'
    WHEN bool_or(event_name IN ('boot_ready', 'visit_ready')) THEN
      CASE
        WHEN bool_or(
          ((level = 'error' AND NOT transient_api_retry) OR (event_name IS NOT NULL AND (level = 'warn' OR event_status IN ('degraded', 'timeout', 'failed'))))
          AND event_name IS DISTINCT FROM 'ews_input_insufficient'
          AND event_name IS DISTINCT FROM 'hunger_prompt_dismissed'
          AND event_name IS DISTINCT FROM 'initial_sync_fallback_wait'
          AND NOT (event_name = 'blank_screen_guard_triggered' AND visible_overlay_before_blank_guard)
        ) THEN 'degraded'
        ELSE 'ready'
      END
    WHEN bool_or(event_name IN ('boot_started', 'visit_started'))
      AND max(client_ts) < now() - interval '90 seconds' THEN 'abandoned'
    WHEN max(client_ts) < now() - interval '90 seconds'
      AND bool_or(event_name IS NOT NULL) THEN
      CASE
        WHEN bool_or(
          ((level = 'error' AND NOT transient_api_retry) OR (event_name IS NOT NULL AND (level = 'warn' OR event_status IN ('degraded', 'timeout', 'failed'))))
          AND event_name IS DISTINCT FROM 'ews_input_insufficient'
          AND event_name IS DISTINCT FROM 'hunger_prompt_dismissed'
          AND event_name IS DISTINCT FROM 'initial_sync_fallback_wait'
          AND NOT (event_name = 'blank_screen_guard_triggered' AND visible_overlay_before_blank_guard)
        ) THEN 'degraded'
        ELSE 'ready'
      END
    ELSE 'starting'
  END AS outcome,
  count(*) FILTER (
    WHERE event_name IS NOT NULL
      AND (level = 'warn' OR event_status IN ('degraded', 'timeout'))
      AND event_name IS DISTINCT FROM 'hunger_prompt_dismissed'
      AND event_name IS DISTINCT FROM 'initial_sync_fallback_wait'
      AND NOT (event_name = 'blank_screen_guard_triggered' AND visible_overlay_before_blank_guard)
  )::integer AS warning_count,
  bool_or(event_name IN ('initial_sync_ready', 'sync_cycle_completed')) AS initial_sync_completed,
  (array_agg(event_name ORDER BY client_ts DESC, id DESC)
    FILTER (WHERE event_status IN ('completed', 'ready', 'uploaded') OR event_name IN ('visit_ready', 'boot_ready', 'initial_sync_ready', 'sync_cycle_completed', 'write_uploaded')))[1]
    AS last_success_event,
  COALESCE(
    (array_agg(event_name ORDER BY client_ts DESC, id DESC)
      FILTER (
        WHERE event_name IS NOT NULL
          AND event_name IS DISTINCT FROM 'hunger_prompt_dismissed'
          AND event_name IS DISTINCT FROM 'initial_sync_fallback_wait'
          AND NOT (event_name = 'blank_screen_guard_triggered' AND visible_overlay_before_blank_guard)
          AND (
            level IN ('warn', 'error')
            OR event_status IN ('degraded', 'timeout', 'failed')
            OR event_name IN ('boot_failed', 'app_runtime_failed', 'sync_cycle_failed', 'write_failed')
          )
      ))[1],
    CASE WHEN bool_or(
      event_name IS NULL
      AND level = 'error'
      AND message ~* '^ews / weekly .*save\.cloud\.error:.*Cloud save timeout'
    ) THEN 'write_failed' END
  ) AS problem_event,
  CASE
    WHEN bool_or(runtime_env = 'test') THEN 'test'
    WHEN bool_or(runtime_env = 'local') THEN 'local'
    ELSE 'production'
  END AS runtime_env
FROM classified_visit_events
GROUP BY client_id, effective_visit_id
), login_without_trace AS (
  SELECT
    se.client_id,
    'pin-' || se.id::text AS visit_id,
    'pin-' || se.id::text AS boot_id,
    'cold_start'::text AS visit_kind,
    se.created_at AS started_at,
    se.created_at AS last_event_at,
    0::integer AS duration_ms,
    NULL::text AS build_id,
    NULL::text AS device_id,
    CASE WHEN COALESCE(se.user_agent, '') ~* 'Mobile|Android|iPhone' THEN 'mobile' ELSE 'desktop' END AS device_class,
    CASE
      WHEN COALESCE(se.user_agent, '') ~* 'iPhone|iPad|iPod' THEN 'iOS'
      WHEN COALESCE(se.user_agent, '') ~* 'Android' THEN 'Android'
      ELSE 'other'
    END AS os_name,
    CASE
      WHEN COALESCE(se.user_agent, '') ~* 'CriOS|Chrome' THEN 'Chrome'
      WHEN COALESCE(se.user_agent, '') ~* 'Safari' THEN 'Safari'
      ELSE 'other'
    END AS browser_name,
    'unknown'::text AS display_mode,
    1::integer AS event_count,
    0::integer AS error_count,
    CASE WHEN se.created_at < now() - interval '90 seconds' THEN 'abandoned' ELSE 'starting' END AS outcome,
    0::integer AS warning_count,
    false AS initial_sync_completed,
    'pin_success'::text AS last_success_event,
    NULL::text AS problem_event,
    'production'::text AS runtime_env
  FROM public.security_events se
  WHERE se.event_type = 'pin_success'
    AND se.client_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.client_log_trace t
      WHERE t.client_id = se.client_id
        AND t.actor_role = 'client'
        AND t.boot_id IS NOT NULL
        AND t.client_ts BETWEEN se.created_at - interval '5 seconds' AND se.created_at + interval '2 minutes'
    )
)
SELECT * FROM traced_visits
UNION ALL
SELECT * FROM login_without_trace;

COMMENT ON VIEW public.client_app_visit_summary_v1 IS
  'Structured visits with signal-quality filtering for routine dismissals, transient sync fallback waits and already-visible startup overlays.';
