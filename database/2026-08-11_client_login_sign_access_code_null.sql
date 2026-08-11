-- Дополнение к client_login_scheme_v2: явный отказ при NULL access_code при подписании.

BEGIN;

CREATE OR REPLACE FUNCTION public.sign_consents_with_access_code_by_session(
  p_session_token TEXT,
  p_access_code TEXT,
  p_consents JSONB,
  p_device_id TEXT,
  p_ip TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client_id UUID;
  v_client public.clients%ROWTYPE;
  v_consent JSONB;
  v_type TEXT;
  v_version TEXT;
  v_hash TEXT;
  v_text TEXT;
  v_result JSONB := '[]'::jsonb;
  v_signature TEXT := 'pin_confirm';
BEGIN
  v_client_id := public.require_client_id(p_session_token);
  SELECT * INTO v_client FROM public.clients WHERE id = v_client_id FOR UPDATE;

  IF v_client.access_code_hash IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_code_not_set');
  END IF;
  IF p_access_code IS NULL OR BTRIM(p_access_code) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_code_required');
  END IF;
  IF v_client.access_code_hash <> crypt(p_access_code, v_client.access_code_hash) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_access_code');
  END IF;
  IF p_device_id IS NULL OR p_device_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_device_id');
  END IF;
  IF jsonb_typeof(p_consents) <> 'array' OR jsonb_array_length(p_consents) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_consents_payload');
  END IF;

  FOR v_consent IN SELECT * FROM jsonb_array_elements(p_consents) LOOP
    v_type := v_consent->>'type';
    v_version := v_consent->>'version';
    v_text := v_consent->>'document_text';
    SELECT document_sha256 INTO v_hash
      FROM public.legal_consent_registry
     WHERE consent_type = v_type AND document_version = v_version AND status = 'active';
    IF v_hash IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'consent_version_not_allowed',
        'consent_type', v_type, 'document_version', v_version);
    END IF;
    IF v_text IS NULL OR encode(digest(v_text, 'sha256'), 'hex') <> v_hash THEN
      RETURN jsonb_build_object('success', false, 'error', 'document_text_hash_mismatch',
        'consent_type', v_type, 'document_version', v_version);
    END IF;
  END LOOP;

  PERFORM set_config('app.consents_writer', 'authorized', true);
  FOR v_consent IN SELECT * FROM jsonb_array_elements(p_consents) LOOP
    v_type := v_consent->>'type';
    v_version := v_consent->>'version';
    v_text := v_consent->>'document_text';

    UPDATE public.consents
       SET granted = false, is_active = false, revoked_at = NOW()
     WHERE client_id = v_client_id AND consent_type = v_type
       AND granted = true AND revoked_at IS NULL;

    INSERT INTO public.consents (
      client_id, consent_type, document_version, signature_method,
      granted, is_active, ip_address, user_agent,
      device_id, session_auth_method, document_text_snapshot
    ) VALUES (
      v_client_id, v_type, v_version, v_signature,
      COALESCE((v_consent->>'granted')::boolean, true),
      COALESCE((v_consent->>'granted')::boolean, true),
      CASE WHEN NULLIF(BTRIM(p_ip), '') IS NOT NULL THEN p_ip::inet ELSE NULL END,
      LEFT(p_user_agent, 500),
      p_device_id,
      'access_code',
      v_text
    );

    SELECT document_sha256 INTO v_hash FROM public.legal_consent_registry
     WHERE consent_type = v_type AND document_version = v_version;
    v_result := v_result || jsonb_build_object(
      'type', v_type,
      'version', v_version,
      'document_sha256', v_hash,
      'device_id', p_device_id,
      'session_auth_method', 'access_code',
      'signature_method', v_signature,
      'logged', true
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'consents', v_result, 'client_id', v_client_id);
END;
$$;

COMMIT;
