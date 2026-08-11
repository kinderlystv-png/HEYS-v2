-- HEYS: закрытие обходов между legacy-входом и схемой access_code.
--
-- 1. verify_client_pin_v3 — только для клиентов БЕЗ access_code_hash.
--    Иначе старый путь обходит login_client_v1 и подписание с кодом.
-- 2. log_consents — для клиентов С access_code_hash checkbox-подпись запрещена;
--    только sign_consents_with_access_code_by_session.
--
-- Legacy sunset: v3 остаётся до первого set_client_access_code. После — только
-- login_client_v1 / verify_client_onetime_pin (первый вход) / sign_*_with_access_code.

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
BEGIN
  v_phone_normalized := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');

  SELECT * INTO v_client
    FROM public.clients
   WHERE regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = v_phone_normalized
     AND pin_hash IS NOT NULL
   ORDER BY created_at DESC
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
    v_correct := (v_client.pin_hash = crypt(p_pin, v_client.pin_hash));
  END IF;

  IF NOT v_found OR NOT v_correct THEN
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
     SET pin_failed_attempts = 0, pin_locked_until = NULL
   WHERE id = v_client.id;

  v_session := public.issue_client_session_v2(v_client.id, p_user_agent, p_ip, 30);

  PERFORM public.log_security_event(
    'pin_success', v_phone_normalized, v_client.id, p_ip, p_user_agent,
    jsonb_build_object('session_id', v_session->>'session_id')
  );

  RETURN jsonb_build_object(
    'success', true,
    'client_id', v_client.id,
    'session_token', v_session->>'session_token',
    'expires_at', v_session->>'expires_at'
  );
END;
$$;

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
