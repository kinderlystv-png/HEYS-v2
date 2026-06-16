-- Keep PIN/session KV writes from reporting auth/session/non-client keys as
-- saved when DB-level guards reject them.

CREATE OR REPLACE FUNCTION public.upsert_client_kv_by_session(
  p_session_token text,
  p_key text,
  p_value jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_client_id uuid;
  v_new_revision bigint;
BEGIN
  SELECT client_id INTO v_client_id
  FROM client_sessions
  WHERE token_hash = digest(p_session_token, 'sha256')
    AND expires_at > NOW()
    AND revoked_at IS NULL;

  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_or_expired_session'
    );
  END IF;

  IF public.is_client_kv_non_client_key(p_key) THEN
    BEGIN
      INSERT INTO public.data_loss_audit (client_id, key, action, allowed, reason)
      VALUES (v_client_id, p_key, 'non_client_data_rejected', false, 'upsert_client_kv_by_session_blacklist');
    EXCEPTION WHEN others THEN
      NULL;
    END;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'non_client_data',
      'key', p_key
    );
  END IF;

  INSERT INTO client_kv_store (client_id, k, v, updated_at, user_id)
  VALUES (v_client_id, p_key, p_value, NOW(), NULL)
  ON CONFLICT (client_id, k) DO UPDATE SET
    v = EXCLUDED.v,
    updated_at = NOW(),
    user_id = NULL
  RETURNING revision INTO v_new_revision;

  IF v_new_revision IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'write_skipped',
      'key', p_key
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'key', p_key,
    'revision', v_new_revision
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'sqlstate', SQLSTATE
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.batch_upsert_client_kv_by_session(
  p_session_token text,
  p_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_client_id uuid;
  v_item jsonb;
  v_key text;
  v_value jsonb;
  v_base_revision bigint;
  v_current_revision bigint;
  v_new_revision bigint;
  v_saved int := 0;
  v_saved_items jsonb := '[]'::jsonb;
  v_stale jsonb := '[]'::jsonb;
  v_rejected jsonb := '[]'::jsonb;
  v_rejected_count int := 0;
BEGIN
  SELECT client_id INTO v_client_id
  FROM client_sessions
  WHERE token_hash = digest(p_session_token, 'sha256')
    AND expires_at > NOW()
    AND revoked_at IS NULL;

  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_or_expired_session');
  END IF;

  IF coalesce(jsonb_typeof(p_items), '') <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_items must be JSON array');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_key := v_item->>'k';
    v_value := v_item->'v';
    v_new_revision := NULL;
    v_base_revision := nullif(v_item->>'base_revision', '')::bigint;

    IF v_key IS NULL OR v_value IS NULL THEN
      CONTINUE;
    END IF;

    IF public.is_client_kv_non_client_key(v_key) THEN
      v_rejected := v_rejected || jsonb_build_array(jsonb_build_object(
        'k', v_key,
        'reason', 'non_client_data'
      ));

      BEGIN
        INSERT INTO public.data_loss_audit (client_id, key, action, allowed, reason)
        VALUES (v_client_id, v_key, 'non_client_data_rejected', false, 'batch_upsert_client_kv_by_session_blacklist');
      EXCEPTION WHEN others THEN
        NULL;
      END;

      CONTINUE;
    END IF;

    SELECT revision INTO v_current_revision
    FROM client_kv_store
    WHERE client_id = v_client_id AND k = v_key;

    IF v_base_revision IS NOT NULL
       AND v_current_revision IS NOT NULL
       AND v_current_revision > v_base_revision THEN
      v_stale := v_stale || jsonb_build_array(jsonb_build_object(
        'k', v_key,
        'reason', 'stale_base_revision',
        'base_revision', v_base_revision,
        'current_revision', v_current_revision
      ));
      CONTINUE;
    END IF;

    INSERT INTO client_kv_store (client_id, k, v, updated_at, user_id)
    VALUES (v_client_id, v_key, v_value, NOW(), NULL)
    ON CONFLICT (client_id, k) DO UPDATE SET
      v = EXCLUDED.v,
      updated_at = NOW(),
      user_id = NULL
    RETURNING revision INTO v_new_revision;

    IF v_new_revision IS NULL THEN
      v_rejected := v_rejected || jsonb_build_array(jsonb_build_object(
        'k', v_key,
        'reason', 'write_skipped'
      ));
      CONTINUE;
    END IF;

    v_saved_items := v_saved_items || jsonb_build_array(jsonb_build_object('k', v_key, 'revision', v_new_revision));
    v_saved := v_saved + 1;
  END LOOP;

  v_rejected_count := jsonb_array_length(v_rejected);

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'success', true,
    'saved', v_saved,
    'saved_items', v_saved_items,
    'stale_rejected', v_stale,
    'rejected', v_rejected_count,
    'rejected_items', v_rejected,
    'error', CASE WHEN v_saved = 0 AND v_rejected_count > 0 THEN 'not_client_data' ELSE NULL END,
    'server_revision', coalesce((select max(revision) from client_kv_store where client_id = v_client_id), 0)
  ));
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'sqlstate', SQLSTATE, 'saved', v_saved);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.upsert_client_kv_by_session(text, text, jsonb) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.batch_upsert_client_kv_by_session(text, jsonb) TO heys_rpc;

COMMENT ON FUNCTION public.upsert_client_kv_by_session(text, text, jsonb) IS
  'PIN/session single client_kv_store upsert with DB-level auth/session key rejection and honest write reporting.';

COMMENT ON FUNCTION public.batch_upsert_client_kv_by_session(text, jsonb) IS
  'PIN/session batch client_kv_store upsert with honest saved counts when non-client/auth/session keys are rejected.';
