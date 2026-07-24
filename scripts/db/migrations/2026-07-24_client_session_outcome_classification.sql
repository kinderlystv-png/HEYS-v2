-- Do not classify a successfully rendered client session as failed because of
-- an unstructured dependency/console error. Fatal outcomes must be backed by
-- a named structured lifecycle failure.

BEGIN;

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
    WHEN bool_or(
      event_name IN ('boot_failed', 'app_runtime_failed')
      OR (event_name IS NOT NULL AND event_status = 'failed')
    ) THEN 'failed'
    WHEN bool_or(event_name = 'boot_ready') THEN
      CASE
        WHEN bool_or(level IN ('warn', 'error') OR event_status IN ('degraded', 'timeout', 'failed')) THEN 'degraded'
        ELSE 'ready'
      END
    WHEN max(client_ts) < now() - interval '90 seconds' THEN 'abandoned'
    ELSE 'starting'
  END AS outcome,
  count(*) FILTER (WHERE level = 'warn' OR event_status IN ('degraded', 'timeout'))::integer AS warning_count,
  bool_or(event_name = 'sync_cycle_completed') AS initial_sync_completed,
  (array_agg(event_name ORDER BY client_ts DESC, id DESC)
    FILTER (WHERE event_status IN ('completed', 'ready', 'uploaded') OR event_name IN ('boot_ready', 'sync_cycle_completed', 'write_uploaded')))[1]
    AS last_success_event,
  (array_agg(event_name ORDER BY client_ts DESC, id DESC)
    FILTER (
      WHERE event_name IS NOT NULL
        AND (level = 'error' OR event_status = 'failed' OR event_name IN ('boot_failed', 'app_runtime_failed', 'sync_cycle_failed', 'write_failed'))
    ))[1] AS problem_event
FROM public.client_log_trace
WHERE client_id IS NOT NULL
  AND boot_id IS NOT NULL
  AND actor_role = 'client'
GROUP BY client_id, boot_id;

COMMENT ON VIEW public.client_app_session_summary_v1 IS
  'Structured client launch summary. Raw dependency errors after boot_ready degrade a session; only named lifecycle failures mark it failed.';

COMMIT;
