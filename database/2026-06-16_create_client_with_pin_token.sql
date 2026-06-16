-- Manual curator-created clients should receive the same Telegram deep-link
-- token as lead-converted clients, so the curator can hand off PIN + bot link
-- immediately without a second "regenerate PIN/link" step.

DROP FUNCTION IF EXISTS public.create_client_with_pin(TEXT, TEXT, TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.create_client_with_pin(
  p_name TEXT,
  p_phone TEXT,
  p_pin_salt TEXT,
  p_pin_hash TEXT,
  p_curator_id UUID
)
RETURNS TABLE(
  client_id UUID,
  pin_token UUID,
  pin_token_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_id UUID;
  v_phone_normalized TEXT;
  v_pin_token UUID := gen_random_uuid();
  v_pin_token_expires TIMESTAMPTZ := NOW() + INTERVAL '7 days';
BEGIN
  IF p_curator_id IS NULL THEN
    RAISE EXCEPTION 'curator_id_required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.curators WHERE id = p_curator_id) THEN
    RAISE EXCEPTION 'curator_not_found';
  END IF;

  v_phone_normalized := regexp_replace(p_phone, '[^0-9]', '', 'g');
  IF length(v_phone_normalized) = 10 THEN
    v_phone_normalized := '7' || v_phone_normalized;
  END IF;
  IF NOT v_phone_normalized LIKE '7%' THEN
    v_phone_normalized := '7' || right(v_phone_normalized, 10);
  END IF;

  IF v_phone_normalized IS NULL OR length(v_phone_normalized) < 11 THEN
    RAISE EXCEPTION 'invalid_phone';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.clients
     WHERE phone_normalized = v_phone_normalized
       AND curator_id = p_curator_id
  ) THEN
    RAISE EXCEPTION 'phone_already_exists';
  END IF;

  IF p_pin_salt IS NULL OR length(p_pin_salt) < 16 THEN
    RAISE EXCEPTION 'invalid_salt';
  END IF;

  IF p_pin_hash IS NULL OR length(p_pin_hash) < 32 THEN
    RAISE EXCEPTION 'invalid_hash';
  END IF;

  INSERT INTO public.clients(
    name,
    curator_id,
    phone_normalized,
    pin_salt,
    pin_hash,
    pin_token,
    pin_token_expires_at,
    updated_at
  ) VALUES (
    NULLIF(TRIM(COALESCE(p_name, '')), ''),
    p_curator_id,
    v_phone_normalized,
    p_pin_salt,
    p_pin_hash,
    v_pin_token,
    v_pin_token_expires,
    NOW()
  )
  RETURNING id INTO new_id;

  RETURN QUERY SELECT new_id, v_pin_token, v_pin_token_expires;
END;
$$;

COMMENT ON FUNCTION public.create_client_with_pin(TEXT, TEXT, TEXT, TEXT, UUID) IS
  'Curator-only manual client creation with PIN hash and one-time Telegram pin_token.';

GRANT EXECUTE ON FUNCTION public.create_client_with_pin(TEXT, TEXT, TEXT, TEXT, UUID) TO heys_rpc;
