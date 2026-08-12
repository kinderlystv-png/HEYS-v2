-- Fix client PIN login write/read mismatches (heys/375c71, 2026-08-12).
--
-- 1. verify_client_pin_v3 / verify_client_onetime_pin / login_client_v1:
--    lookup phone_normalized OR phone (regression from legacy_gate 2026-08-11).
-- 2. verify_client_pin_v3: bcrypt + legacy SHA256(pin:salt) + active onetime PIN.
-- 3. create_client_with_pin: also populate phone column.
-- 4. issue_onetime_pin_for_client: dual-write pin_hash (bcrypt) for legacy screen.
-- 5. Backfill phone from phone_normalized where missing.

BEGIN;

-- ─── Shared phone match (digits-only) ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.client_phone_digits_match(
  p_row_phone TEXT,
  p_row_phone_normalized TEXT,
  p_input_digits TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_input_digits, '') <> ''
     AND (
       regexp_replace(COALESCE(p_row_phone_normalized, ''), '[^0-9]', '', 'g') = p_input_digits
       OR regexp_replace(COALESCE(p_row_phone, ''), '[^0-9]', '', 'g') = p_input_digits
     );
$$;

-- ─── Internal: verify PIN against stored hashes ─────────────────────────────

CREATE OR REPLACE FUNCTION public.client_pin_matches(
  p_pin TEXT,
  p_pin_hash TEXT,
  p_pin_salt TEXT,
  p_onetime_pin_hash TEXT,
  p_onetime_consumed_at TIMESTAMPTZ,
  p_onetime_expires_at TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF p_pin_hash IS NOT NULL THEN
    IF p_pin_hash = crypt(p_pin, p_pin_hash) THEN
      RETURN 'pin_hash';
    END IF;
    IF p_pin_salt IS NOT NULL
       AND p_pin_hash ~ '^[0-9a-f]{64}$'
       AND encode(digest(p_pin || ':' || p_pin_salt, 'sha256'), 'hex') = lower(p_pin_hash) THEN
      RETURN 'pin_hash_legacy';
    END IF;
  END IF;

  IF p_onetime_pin_hash IS NOT NULL
     AND p_onetime_consumed_at IS NULL
     AND (p_onetime_expires_at IS NULL OR p_onetime_expires_at > now())
     AND p_onetime_pin_hash = crypt(p_pin, p_onetime_pin_hash) THEN
    RETURN 'onetime_pin';
  END IF;

  RETURN NULL;
END;
$$;

-- ─── verify_client_pin_v3 ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.verify_client_pin_v3(
  p_phone TEXT,
  p_pin TEXT,
  p_ip TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_phone_normalized TEXT;
  v_client public.clients%ROWTYPE;
  v_found BOOLEAN := false;
  v_match_kind TEXT;
  v_attempts INT;
  v_lock INTERVAL;
  v_session JSONB;
BEGIN
  v_phone_normalized := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');

  SELECT * INTO v_client
    FROM public.clients c
   WHERE public.client_phone_digits_match(c.phone, c.phone_normalized, v_phone_normalized)
     AND (c.pin_hash IS NOT NULL OR c.onetime_pin_hash IS NOT NULL)
   ORDER BY c.created_at DESC
   LIMIT 1
     FOR UPDATE;
  v_found := FOUND;

  IF v_found AND v_client.access_code_hash IS NOT NULL THEN
    PERFORM public.log_security_event(
      'pin_legacy_blocked', v_phone_normalized, v_client.id, p_ip, p_user_agent,
      jsonb_build_object('reason', 'access_code_login_required')
    );
    RETURN jsonb_build_object(
      'success', false,
      'error', 'access_code_login_required',
      'message', 'Используйте код доступа или вход с зарегистрированного устройства.'
    );
  END IF;

  IF v_found AND v_client.pin_locked_until IS NOT NULL AND v_client.pin_locked_until > now() THEN
    PERFORM public.log_security_event(
      'pin_locked', v_phone_normalized, v_client.id, p_ip, p_user_agent,
      jsonb_build_object('locked_until', v_client.pin_locked_until)
    );
    RETURN jsonb_build_object(
      'success', false, 'error', 'pin_rate_limited',
      'locked_until', v_client.pin_locked_until,
      'message', 'Слишком много попыток входа. Напишите куратору — он выдаст новый код для входа.'
    );
  END IF;

  IF v_found THEN
    v_match_kind := public.client_pin_matches(
      p_pin,
      v_client.pin_hash,
      v_client.pin_salt,
      v_client.onetime_pin_hash,
      v_client.onetime_pin_consumed_at,
      v_client.onetime_pin_expires_at
    );
  END IF;

  IF NOT v_found OR v_match_kind IS NULL THEN
    IF v_found THEN
      v_attempts := COALESCE(v_client.pin_failed_attempts, 0) + 1;
      v_lock := CASE
        WHEN v_attempts >= 15 THEN interval '24 hours'
        WHEN v_attempts >= 10 THEN interval '1 hour'
        WHEN v_attempts >= 5 THEN interval '15 minutes'
        ELSE NULL
      END;
      UPDATE public.clients
         SET pin_failed_attempts = v_attempts,
             pin_locked_until = CASE WHEN v_lock IS NULL THEN pin_locked_until ELSE now() + v_lock END
       WHERE id = v_client.id;
    END IF;

    PERFORM public.log_security_event(
      'pin_failed', v_phone_normalized,
      CASE WHEN v_found THEN v_client.id ELSE NULL END,
      p_ip, p_user_agent,
      jsonb_build_object('reason', 'invalid_credentials', 'client_exists', v_found,
                         'attempts', COALESCE(v_attempts, 0))
    );
    RETURN jsonb_build_object('success', false, 'error', 'invalid_credentials');
  END IF;

  UPDATE public.clients
     SET pin_failed_attempts = 0,
         pin_locked_until = NULL,
         pin_hash = CASE
           WHEN v_match_kind = 'pin_hash_legacy' THEN crypt(p_pin, gen_salt('bf', 12))
           ELSE pin_hash
         END,
         pin_salt = CASE
           WHEN v_match_kind = 'pin_hash_legacy' THEN NULL
           ELSE pin_salt
         END,
         pin_updated_at = CASE
           WHEN v_match_kind = 'pin_hash_legacy' THEN now()
           ELSE pin_updated_at
         END,
         onetime_pin_consumed_at = CASE
           WHEN v_match_kind = 'onetime_pin'
             OR (
               onetime_pin_hash IS NOT NULL
               AND onetime_pin_consumed_at IS NULL
               AND onetime_pin_hash = crypt(p_pin, onetime_pin_hash)
             )
             THEN now()
           ELSE onetime_pin_consumed_at
         END,
         updated_at = now()
   WHERE id = v_client.id;

  v_session := public.issue_client_session_v2(v_client.id, p_user_agent, p_ip, 30);

  PERFORM public.log_security_event(
    'pin_success', v_phone_normalized, v_client.id, p_ip, p_user_agent,
    jsonb_build_object('session_id', v_session->>'session_id', 'match_kind', v_match_kind)
  );

  RETURN jsonb_build_object(
    'success', true,
    'client_id', v_client.id,
    'session_token', v_session->>'session_token',
    'expires_at', v_session->>'expires_at'
  );
END;
$$;

COMMENT ON FUNCTION public.verify_client_pin_v3(TEXT, TEXT, TEXT, TEXT) IS
  'Legacy PIN login: dual phone lookup, bcrypt/SHA256/onetime PIN, access_code gate.';

-- ─── verify_client_onetime_pin — dual phone lookup ───────────────────────────

CREATE OR REPLACE FUNCTION public.verify_client_onetime_pin(
  p_phone TEXT,
  p_pin TEXT,
  p_device_id TEXT DEFAULT NULL,
  p_ip TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_phone_normalized TEXT;
  v_client public.clients%ROWTYPE;
  v_found BOOLEAN := false;
  v_correct BOOLEAN := false;
  v_attempts INT;
  v_lock INTERVAL;
  v_session JSONB;
  v_trusted BOOLEAN := false;
BEGIN
  v_phone_normalized := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');

  SELECT * INTO v_client
    FROM public.clients c
   WHERE public.client_phone_digits_match(c.phone, c.phone_normalized, v_phone_normalized)
   ORDER BY c.created_at DESC
   LIMIT 1
     FOR UPDATE;
  v_found := FOUND;

  IF v_found AND p_device_id IS NOT NULL THEN
    v_trusted := public.is_client_device_trusted(v_client.id, p_device_id);
  END IF;

  IF v_found AND NOT v_trusted
     AND v_client.pin_locked_until IS NOT NULL AND v_client.pin_locked_until > now() THEN
    PERFORM public.log_security_event(
      'pin_locked', v_phone_normalized, v_client.id, p_ip, p_user_agent,
      jsonb_build_object('locked_until', v_client.pin_locked_until)
    );
    RETURN jsonb_build_object(
      'success', false, 'error', 'pin_rate_limited',
      'locked_until', v_client.pin_locked_until,
      'message', 'Слишком много попыток входа. Напишите куратору — он выдаст новый код для входа.'
    );
  END IF;

  IF v_trusted THEN
    UPDATE public.clients
       SET pin_failed_attempts = 0,
           pin_locked_until = NULL,
           access_code_failed_attempts = 0,
           access_code_locked_until = NULL
     WHERE id = v_client.id;
  END IF;

  IF v_found THEN
    IF v_client.onetime_pin_hash IS NOT NULL
       AND v_client.onetime_pin_consumed_at IS NULL
       AND (v_client.onetime_pin_expires_at IS NULL OR v_client.onetime_pin_expires_at > now()) THEN
      v_correct := (v_client.onetime_pin_hash = crypt(p_pin, v_client.onetime_pin_hash));
    ELSIF v_client.pin_hash IS NOT NULL
          AND v_client.access_code_hash IS NULL
          AND v_client.onetime_pin_hash IS NULL THEN
      -- Legacy permanent PIN only when клиент never had curator onetime PIN.
      v_correct := (
        v_client.pin_hash = crypt(p_pin, v_client.pin_hash)
        OR (
          v_client.pin_salt IS NOT NULL
          AND v_client.pin_hash ~ '^[0-9a-f]{64}$'
          AND encode(digest(p_pin || ':' || v_client.pin_salt, 'sha256'), 'hex') = lower(v_client.pin_hash)
        )
      );
    END IF;
  END IF;

  IF NOT v_found OR NOT v_correct THEN
    IF v_found AND NOT v_trusted THEN
      v_attempts := COALESCE(v_client.pin_failed_attempts, 0) + 1;
      v_lock := CASE
        WHEN v_attempts >= 15 THEN interval '24 hours'
        WHEN v_attempts >= 10 THEN interval '1 hour'
        WHEN v_attempts >= 5 THEN interval '15 minutes'
        ELSE NULL
      END;
      UPDATE public.clients
         SET pin_failed_attempts = v_attempts,
             pin_locked_until = CASE WHEN v_lock IS NULL THEN pin_locked_until ELSE now() + v_lock END
       WHERE id = v_client.id;
    END IF;

    PERFORM public.log_security_event(
      'pin_failed', v_phone_normalized,
      CASE WHEN v_found THEN v_client.id ELSE NULL END,
      p_ip, p_user_agent,
      jsonb_build_object('reason', 'invalid_credentials', 'client_exists', v_found)
    );
    RETURN jsonb_build_object('success', false, 'error', 'invalid_credentials');
  END IF;

  UPDATE public.clients
     SET pin_failed_attempts = 0,
         pin_locked_until = NULL,
         pin_hash = CASE
           WHEN pin_hash IS NULL OR (
             pin_salt IS NOT NULL AND pin_hash ~ '^[0-9a-f]{64}$'
           ) THEN crypt(p_pin, gen_salt('bf', 12))
           ELSE pin_hash
         END,
         pin_salt = CASE
           WHEN pin_salt IS NOT NULL AND pin_hash ~ '^[0-9a-f]{64}$' THEN NULL
           ELSE pin_salt
         END,
         onetime_pin_consumed_at = CASE
           WHEN onetime_pin_hash IS NOT NULL AND onetime_pin_consumed_at IS NULL
             THEN now()
           ELSE onetime_pin_consumed_at
         END,
         updated_at = now()
   WHERE id = v_client.id;

  v_session := public.issue_client_session_v2(v_client.id, p_user_agent, p_ip, 30);

  PERFORM public.log_security_event(
    'onetime_pin_success', v_phone_normalized, v_client.id, p_ip, p_user_agent,
    jsonb_build_object('session_id', v_session->>'session_id', 'needs_access_code', v_client.access_code_hash IS NULL)
  );

  RETURN jsonb_build_object(
    'success', true,
    'client_id', v_client.id,
    'session_token', v_session->>'session_token',
    'expires_at', v_session->>'expires_at',
    'needs_access_code', v_client.access_code_hash IS NULL
  );
END;
$$;

-- ─── login_client_v1 — dual phone lookup ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.login_client_v1(
  p_phone TEXT,
  p_device_id TEXT,
  p_access_code TEXT DEFAULT NULL,
  p_ip TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_phone_normalized TEXT;
  v_client public.clients%ROWTYPE;
  v_found BOOLEAN := false;
  v_trusted BOOLEAN := false;
  v_session JSONB;
  v_attempts INT;
  v_lock INTERVAL;
  v_is_new_device BOOLEAN := false;
BEGIN
  v_phone_normalized := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');

  SELECT * INTO v_client
    FROM public.clients c
   WHERE public.client_phone_digits_match(c.phone, c.phone_normalized, v_phone_normalized)
   ORDER BY c.created_at DESC
   LIMIT 1
     FOR UPDATE;
  v_found := FOUND;

  IF NOT v_found OR v_client.access_code_hash IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_code_not_set');
  END IF;

  IF p_device_id IS NULL OR p_device_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_device_id');
  END IF;

  v_trusted := public.is_client_device_trusted(v_client.id, p_device_id);

  IF NOT v_trusted
     AND v_client.pin_locked_until IS NOT NULL AND v_client.pin_locked_until > now() THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'pin_rate_limited',
      'locked_until', v_client.pin_locked_until,
      'message', 'Слишком много попыток входа. Напишите куратору — он выдаст новый код для входа.'
    );
  END IF;

  IF v_trusted THEN
    UPDATE public.clients
       SET pin_failed_attempts = 0,
           pin_locked_until = NULL,
           access_code_failed_attempts = 0,
           access_code_locked_until = NULL
     WHERE id = v_client.id;

    v_session := public.issue_client_session_v2(v_client.id, p_user_agent, p_ip, 30);
    PERFORM public.register_client_device(v_client.id, p_device_id, p_user_agent, 30);

    RETURN jsonb_build_object(
      'success', true,
      'client_id', v_client.id,
      'session_token', v_session->>'session_token',
      'expires_at', v_session->>'expires_at',
      'auth_method', 'device_trust'
    );
  END IF;

  IF p_access_code IS NULL OR p_access_code = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_code_required');
  END IF;

  IF v_client.access_code_locked_until IS NOT NULL AND v_client.access_code_locked_until > now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_code_rate_limited',
      'locked_until', v_client.access_code_locked_until);
  END IF;

  IF v_client.access_code_hash <> crypt(p_access_code, v_client.access_code_hash) THEN
    v_attempts := COALESCE(v_client.access_code_failed_attempts, 0) + 1;
    v_lock := CASE
      WHEN v_attempts >= 15 THEN interval '24 hours'
      WHEN v_attempts >= 10 THEN interval '1 hour'
      WHEN v_attempts >= 5 THEN interval '15 minutes'
      ELSE NULL
    END;
    UPDATE public.clients
       SET access_code_failed_attempts = v_attempts,
           access_code_locked_until = CASE WHEN v_lock IS NULL THEN access_code_locked_until ELSE now() + v_lock END,
           pin_failed_attempts = v_attempts,
           pin_locked_until = CASE WHEN v_lock IS NULL THEN pin_locked_until ELSE now() + v_lock END
     WHERE id = v_client.id;
    RETURN jsonb_build_object('success', false, 'error', 'invalid_access_code');
  END IF;

  UPDATE public.clients
     SET access_code_failed_attempts = 0,
         access_code_locked_until = NULL,
         pin_failed_attempts = 0,
         pin_locked_until = NULL
   WHERE id = v_client.id;

  v_is_new_device := TRUE;
  v_session := public.issue_client_session_v2(v_client.id, p_user_agent, p_ip, 30);
  PERFORM public.register_client_device(v_client.id, p_device_id, p_user_agent, 30);

  IF v_is_new_device THEN
    PERFORM public.enqueue_client_auth_push(
      v_client.id,
      'new_device_login',
      jsonb_build_object('device_id', p_device_id)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'client_id', v_client.id,
    'session_token', v_session->>'session_token',
    'expires_at', v_session->>'expires_at',
    'auth_method', 'access_code',
    'new_device', v_is_new_device
  );
END;
$$;

-- ─── issue_onetime_pin_for_client — dual-write pin_hash ─────────────────────

CREATE OR REPLACE FUNCTION public.issue_onetime_pin_for_client(
  p_client_id UUID,
  p_pin TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pin TEXT;
  v_bcrypt TEXT;
BEGIN
  v_pin := COALESCE(
    p_pin,
    LPAD((floor(random() * 9000)::INT + 1000)::TEXT, 4, '0')
  );
  IF v_pin !~ '^\d{4,6}$' THEN
    RAISE EXCEPTION 'invalid_pin_format' USING ERRCODE = '22023';
  END IF;

  v_bcrypt := crypt(v_pin, gen_salt('bf', 12));

  UPDATE public.clients
     SET onetime_pin_hash = v_bcrypt,
         onetime_pin_expires_at = now() + interval '3 days',
         onetime_pin_consumed_at = NULL,
         pin_hash = v_bcrypt,
         pin_salt = NULL,
         access_code_hash = NULL,
         access_code_set_at = NULL,
         access_code_failed_attempts = 0,
         access_code_locked_until = NULL,
         pin_failed_attempts = 0,
         pin_locked_until = NULL,
         pin_updated_at = now(),
         updated_at = now()
   WHERE id = p_client_id;

  RETURN v_pin;
END;
$$;

-- ─── create_client_with_pin — populate phone ──────────────────────────────────

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
    phone,
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
  'Curator manual client creation: phone + phone_normalized, SHA256 pin_hash, pin_token.';

-- ─── Backfill phone from phone_normalized ─────────────────────────────────────
-- Skip rows where another client already owns the same digit string in phone.

UPDATE public.clients c
   SET phone = c.phone_normalized,
       updated_at = NOW()
 WHERE c.phone IS NULL
   AND c.phone_normalized IS NOT NULL
   AND NOT EXISTS (
     SELECT 1
       FROM public.clients c2
      WHERE c2.id <> c.id
        AND regexp_replace(COALESCE(c2.phone, ''), '[^0-9]', '', 'g')
            = regexp_replace(c.phone_normalized, '[^0-9]', '', 'g')
   );

COMMIT;

-- Restore access_code gate on log_consents (prod drift vs legacy_gate 2026-08-11).
BEGIN;

CREATE OR REPLACE FUNCTION public.log_consents(
  p_client_id UUID,
  p_consents JSONB,
  p_ip TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_consent JSONB;
  v_result JSONB := '[]'::jsonb;
  v_type TEXT;
  v_granted BOOLEAN;
  v_version TEXT;
  v_signature TEXT;
  v_hash TEXT;
  v_has_access_code BOOLEAN;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = p_client_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'client_not_found');
  END IF;

  SELECT (access_code_hash IS NOT NULL) INTO v_has_access_code
    FROM public.clients WHERE id = p_client_id;

  IF v_has_access_code THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'signing_requires_access_code',
      'hint', 'sign_consents_with_access_code_by_session'
    );
  END IF;

  IF jsonb_typeof(p_consents) <> 'array' OR jsonb_array_length(p_consents) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_consents_payload');
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_consents) item
     GROUP BY item->>'type' HAVING COUNT(*) > 1
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'duplicate_consent_type');
  END IF;

  FOR v_consent IN SELECT * FROM jsonb_array_elements(p_consents) LOOP
    v_type := v_consent->>'type';
    v_version := v_consent->>'version';
    v_signature := COALESCE(v_consent->>'signature_method', 'checkbox');
    IF v_signature = 'pin_confirm' THEN
      RETURN jsonb_build_object('success', false, 'error', 'pin_confirm_requires_access_code',
        'hint', 'sign_consents_with_access_code_by_session');
    END IF;
    SELECT document_sha256 INTO v_hash
      FROM public.legal_consent_registry
     WHERE consent_type = v_type AND document_version = v_version AND status = 'active';
    IF v_hash IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'consent_version_not_allowed',
        'consent_type', v_type, 'document_version', v_version);
    END IF;
    IF v_signature NOT IN ('checkbox', 'one_time_code', 'button', 'pin_confirm') THEN
      RETURN jsonb_build_object('success', false, 'error', 'signature_method_not_allowed');
    END IF;
  END LOOP;

  PERFORM set_config('app.consents_writer', 'authorized', true);
  FOR v_consent IN SELECT * FROM jsonb_array_elements(p_consents) LOOP
    v_type := v_consent->>'type';
    v_version := v_consent->>'version';
    v_granted := COALESCE((v_consent->>'granted')::boolean, true);
    v_signature := COALESCE(v_consent->>'signature_method', 'checkbox');

    UPDATE public.consents
       SET granted = false, is_active = false, revoked_at = NOW()
     WHERE client_id = p_client_id AND consent_type = v_type
       AND granted = true AND revoked_at IS NULL;

    INSERT INTO public.consents (
      client_id, consent_type, document_version, signature_method,
      granted, is_active, ip_address, user_agent
    ) VALUES (
      p_client_id, v_type, v_version, v_signature, v_granted, v_granted,
      CASE WHEN NULLIF(BTRIM(p_ip), '') IS NOT NULL THEN p_ip::inet ELSE NULL END,
      LEFT(p_user_agent, 500)
    );

    SELECT document_sha256 INTO v_hash FROM public.legal_consent_registry
     WHERE consent_type = v_type AND document_version = v_version;
    v_result := v_result || jsonb_build_object(
      'type', v_type, 'version', v_version, 'document_sha256', v_hash,
      'granted', v_granted, 'logged', true);
  END LOOP;
  RETURN jsonb_build_object('success', true, 'consents', v_result, 'client_id', p_client_id);
EXCEPTION WHEN invalid_text_representation THEN
  RETURN jsonb_build_object('success', false, 'error', 'invalid_consent_payload');
END;
$$;

COMMIT;
