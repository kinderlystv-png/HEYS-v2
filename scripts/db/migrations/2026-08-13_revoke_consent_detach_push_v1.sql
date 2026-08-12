-- Detach client Web Push subscriptions when consent is revoked (152-FZ art. 21 p. 5).
-- Runs inside the revoke functions so callers cannot skip it.

CREATE OR REPLACE FUNCTION public.revoke_consent(
  p_client_id UUID,
  p_consent_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_push INTEGER := 0;
BEGIN
  PERFORM set_config('app.consents_writer', 'authorized', true);

  UPDATE consents
  SET granted = false, revoked_at = now()
  WHERE client_id = p_client_id
    AND consent_type = p_consent_type
    AND granted = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Consent not found or already revoked');
  END IF;

  IF p_consent_type IN ('push_notifications', 'personal_data') THEN
    DELETE FROM public.push_subscriptions WHERE client_id = p_client_id;
    GET DIAGNOSTICS v_deleted_push = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'consent_type', p_consent_type,
    'revoked_at', now(),
    'deleted_push_subscriptions', v_deleted_push
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_consent_by_session(
  p_session_token TEXT,
  p_consent_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client_id UUID;
  v_deleted_keys INTEGER := 0;
  v_killed_sessions INTEGER := 0;
  v_deleted_push INTEGER := 0;
BEGIN
  v_client_id := public.require_client_id(p_session_token);
  PERFORM set_config('app.consents_writer', 'authorized', true);

  UPDATE public.consents
  SET granted = FALSE, revoked_at = NOW()
  WHERE client_id = v_client_id
    AND consent_type = p_consent_type
    AND granted = TRUE
    AND revoked_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'consent_not_found_or_already_revoked');
  END IF;

  IF p_consent_type = 'health_data' THEN
    DELETE FROM public.client_kv_store
    WHERE client_id = v_client_id
      AND public.is_health_key(k);
    GET DIAGNOSTICS v_deleted_keys = ROW_COUNT;
  END IF;

  IF p_consent_type IN ('health_data', 'personal_data') THEN
    UPDATE public.client_sessions
    SET revoked_at = NOW()
    WHERE client_id = v_client_id
      AND revoked_at IS NULL;
    GET DIAGNOSTICS v_killed_sessions = ROW_COUNT;
  END IF;

  IF p_consent_type IN ('push_notifications', 'personal_data') THEN
    DELETE FROM public.push_subscriptions WHERE client_id = v_client_id;
    GET DIAGNOSTICS v_deleted_push = ROW_COUNT;
  END IF;

  PERFORM public.log_data_access(
    'client_self', v_client_id, v_client_id, 'revoke_consent',
    ARRAY[p_consent_type], p_consent_type = 'health_data', NULL, NULL,
    jsonb_build_object(
      'consent_type', p_consent_type,
      'deleted_keys', v_deleted_keys,
      'sessions_killed', v_killed_sessions,
      'deleted_push_subscriptions', v_deleted_push
    )
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'consent_type', p_consent_type,
    'deleted_keys', v_deleted_keys,
    'sessions_killed', v_killed_sessions,
    'deleted_push_subscriptions', v_deleted_push
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_my_account(p_session_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_deleted INT := 0;
BEGIN
  v_client_id := public.require_client_id(p_session_token);

  PERFORM set_config('app.consents_writer', 'authorized', true);
  UPDATE consents
     SET ip_address = NULL,
         user_agent = '[deleted]'
   WHERE client_id = v_client_id;

  DELETE FROM public.push_subscriptions WHERE client_id = v_client_id;

  PERFORM public.log_data_access('client_self', v_client_id, v_client_id,
    'account_deleted', NULL, true, NULL, NULL, '{}');

  DELETE FROM clients WHERE id = v_client_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('success', v_deleted > 0,
                            'deleted_client_id', v_client_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
