-- Keep account creation separate from trial activation.
--
-- Before the curator schedules/starts a trial, PIN clients may save only
-- bootstrap profile/consent keys. Daily check-in/diary data requires an
-- effective `trial` or `active` status. Legacy self-start RPCs stay installed
-- for rollback compatibility but are no longer executable by the gateway.

BEGIN;

CREATE OR REPLACE FUNCTION public.client_kv_value_can_write(
  p_client_id uuid,
  p_key text,
  p_value jsonb
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    public.subscription_can_write(p_client_id)
    OR public.is_always_writable_key(p_key);
$function$;

REVOKE ALL ON FUNCTION public.start_trial_by_session(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_trial_by_session(text, integer) FROM heys_rpc;
REVOKE ALL ON FUNCTION public.activate_trial_timer_by_session(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activate_trial_timer_by_session(text, integer) FROM heys_rpc;

COMMENT ON FUNCTION public.client_kv_value_can_write(uuid, text, jsonb) IS
  'Allows profile/bootstrap keys before trial; daily data only for effective trial/active access.';
COMMENT ON FUNCTION public.start_trial_by_session(text, integer) IS
  'Deprecated and gateway-revoked: trial activation is curator-only via admin_activate_trial.';
COMMENT ON FUNCTION public.activate_trial_timer_by_session(text, integer) IS
  'Deprecated and gateway-revoked: trial activation is curator-only via admin_activate_trial.';

COMMIT;
