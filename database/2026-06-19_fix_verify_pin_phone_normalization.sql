-- Fix PIN login for clients whose phone_normalized was stored in a display
-- format such as +79990000000 by older/admin flows.
--
-- verify_client_pin_v3 normalizes user input to digits only. The lookup must
-- normalize stored phone fields the same way instead of comparing raw strings.

BEGIN;

CREATE OR REPLACE FUNCTION public.verify_client_pin_v3(
  p_phone TEXT,
  p_pin TEXT,
  p_ip TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_client RECORD;
  v_ip INET;
  v_phone_normalized TEXT;
  v_session_token UUID;
  v_session_expires TIMESTAMPTZ;
  v_client_found BOOLEAN := FALSE;
  v_pin_correct BOOLEAN := FALSE;
BEGIN
  v_phone_normalized := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');

  BEGIN
    v_ip := COALESCE(NULLIF(TRIM(p_ip), '')::INET, '0.0.0.0'::INET);
  EXCEPTION WHEN OTHERS THEN
    v_ip := '0.0.0.0'::INET;
  END;

  BEGIN
    PERFORM public.check_pin_rate_limit(v_phone_normalized, v_ip);
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.log_security_event(
      'pin_rate_limited',
      v_phone_normalized,
      NULL,
      v_ip::TEXT,
      p_user_agent,
      jsonb_build_object('error', SQLERRM)
    );
    RAISE;
  END;

  SELECT id, pin_hash, name
  INTO v_client
  FROM public.clients
  WHERE (
      regexp_replace(COALESCE(phone_normalized, ''), '[^0-9]', '', 'g') = v_phone_normalized
      OR regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = v_phone_normalized
    )
    AND pin_hash IS NOT NULL
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  v_client_found := FOUND;

  IF v_client_found THEN
    v_pin_correct := (v_client.pin_hash = crypt(p_pin, v_client.pin_hash));
  END IF;

  PERFORM pg_sleep(0.25 + random() * 0.10);

  IF NOT v_client_found OR NOT v_pin_correct THEN
    PERFORM public.increment_pin_attempt(v_phone_normalized, v_ip);

    PERFORM public.log_security_event(
      'pin_failed',
      v_phone_normalized,
      CASE WHEN v_client_found THEN v_client.id ELSE NULL END,
      v_ip::TEXT,
      p_user_agent,
      jsonb_build_object(
        'reason', 'invalid_credentials',
        'client_exists', v_client_found
      )
    );

    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'invalid_credentials'
    );
  END IF;

  PERFORM public.reset_pin_attempts(v_phone_normalized, v_ip);

  IF v_client.pin_hash IS NOT NULL
     AND v_client.pin_hash ~ '^\$2[ab]\$0[0-9]\$'
  THEN
    UPDATE public.clients
       SET pin_hash = crypt(p_pin, gen_salt('bf', 12)),
           pin_updated_at = NOW()
     WHERE id = v_client.id;
  END IF;

  v_session_token := gen_random_uuid();
  v_session_expires := NOW() + INTERVAL '30 days';

  INSERT INTO public.client_sessions (
    token_hash,
    client_id,
    ip_address,
    user_agent,
    expires_at
  ) VALUES (
    digest(v_session_token::text, 'sha256'),
    v_client.id,
    v_ip,
    p_user_agent,
    v_session_expires
  );

  PERFORM public.log_security_event(
    'pin_success',
    v_phone_normalized,
    v_client.id,
    v_ip::TEXT,
    p_user_agent,
    jsonb_build_object('session_id', v_session_token)
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'session_token', v_session_token,
    'client_id', v_client.id,
    'name', v_client.name,
    'session_expires_at', v_session_expires
  );
END;
$function$;

COMMENT ON FUNCTION public.verify_client_pin_v3(TEXT, TEXT, TEXT, TEXT) IS
  'PIN login with normalized lookup across phone_normalized and phone.';

WITH normalized AS (
  SELECT
    id,
    regexp_replace(phone_normalized, '[^0-9]', '', 'g') AS digits
  FROM public.clients
  WHERE phone_normalized IS NOT NULL
    AND phone_normalized <> regexp_replace(phone_normalized, '[^0-9]', '', 'g')
),
safe_updates AS (
  SELECT n.id, n.digits
  FROM normalized n
  WHERE n.digits <> ''
    AND NOT EXISTS (
      SELECT 1
      FROM public.clients c2
      WHERE c2.id <> n.id
        AND regexp_replace(COALESCE(c2.phone_normalized, c2.phone, ''), '[^0-9]', '', 'g') = n.digits
    )
)
UPDATE public.clients c
SET phone_normalized = s.digits,
    updated_at = NOW()
FROM safe_updates s
WHERE c.id = s.id;

COMMIT;
