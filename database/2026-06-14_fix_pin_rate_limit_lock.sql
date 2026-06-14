BEGIN;

CREATE OR REPLACE FUNCTION public.increment_pin_attempt(
  p_phone TEXT,
  p_ip INET
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max_attempts INT := 5;
  v_lock_minutes INT := 15;
  v_window INTERVAL := INTERVAL '10 minutes';
  v_result RECORD;
BEGIN
  p_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');

  INSERT INTO public.pin_login_attempts (
    phone,
    ip_address,
    attempts,
    first_attempt_at,
    last_attempt_at,
    locked_until
  )
  VALUES (p_phone, p_ip, 1, NOW(), NOW(), NULL)
  ON CONFLICT (phone, ip_address)
  DO UPDATE SET
    attempts = CASE
      WHEN pin_login_attempts.first_attempt_at > NOW() - v_window
      THEN pin_login_attempts.attempts + 1
      ELSE 1
    END,
    first_attempt_at = CASE
      WHEN pin_login_attempts.first_attempt_at > NOW() - v_window
      THEN pin_login_attempts.first_attempt_at
      ELSE NOW()
    END,
    last_attempt_at = NOW(),
    locked_until = CASE
      WHEN pin_login_attempts.first_attempt_at <= NOW() - v_window
      THEN NULL
      WHEN pin_login_attempts.first_attempt_at > NOW() - v_window
        AND (pin_login_attempts.attempts + 1) >= v_max_attempts
      THEN GREATEST(
        COALESCE(pin_login_attempts.locked_until, 'epoch'::timestamptz),
        NOW() + make_interval(mins => v_lock_minutes)
      )
      ELSE pin_login_attempts.locked_until
    END
  RETURNING attempts, locked_until INTO v_result;

  IF v_result.locked_until IS NOT NULL AND v_result.attempts = v_max_attempts THEN
    INSERT INTO public.security_events (event_type, phone, ip_address, meta)
    VALUES ('pin_locked', p_phone, p_ip, jsonb_build_object(
      'attempts', v_result.attempts,
      'lock_duration_minutes', v_lock_minutes
    ));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_pin_rate_limit(
  p_phone TEXT,
  p_ip INET
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_locked_until TIMESTAMPTZ;
BEGIN
  p_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');

  SELECT locked_until INTO v_locked_until
  FROM public.pin_login_attempts
  WHERE phone = p_phone AND ip_address = p_ip;

  IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
    RAISE EXCEPTION 'pin_rate_limited:% minutes',
      EXTRACT(MINUTE FROM (v_locked_until - NOW()))::int + 1;
  END IF;

  DELETE FROM public.pin_login_attempts
  WHERE phone = p_phone
    AND ip_address = p_ip
    AND last_attempt_at < NOW() - INTERVAL '10 minutes'
    AND locked_until IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_pin_attempt(TEXT, INET) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_pin_rate_limit(TEXT, INET) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.increment_pin_attempt(TEXT, INET) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.check_pin_rate_limit(TEXT, INET) TO heys_rpc;

COMMIT;
