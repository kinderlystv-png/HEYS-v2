-- Treat an explicit PIN login or curator client open as a separate visit even
-- when the SPA page itself was not reloaded.

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
  'Structured client visit summary. Cold starts, explicit client entries and foreground resumes are separate; boot_id remains the page-load identity.';
