-- Restore subscription write gates for current client_kv_store write paths.
--
-- Regression:
--   Later KV hardening migrations preserved identity/context/data-loss guards but
--   lost the old subscription gate. A PIN client with status `none` could write
--   `heys_dayv2_*` meals before trial activation.
--
-- Policy:
--   * full client data writes require effective status `trial` or `active`;
--   * small bootstrap/UX keys remain writable without subscription;
--   * `heys_dayv2_*` is writable without subscription only when it has no meals
--     payload, so onboarding/check-in scalars do not unlock food diary writes.

BEGIN;

CREATE OR REPLACE FUNCTION public.subscription_can_write(p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(
    public.get_effective_subscription_status(p_client_id) IN ('trial', 'active'),
    false
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_always_writable_key(p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT regexp_replace(coalesce(p_key, ''), '^heys_[0-9a-f-]{36}_', 'heys_', 'i') = ANY (ARRAY[
    'heys_profile',
    'heys_norms',
    'heys_consents',
    'heys_onboarding_complete',
    'heys_tour_completed',
    'heys_advice_settings',
    'heys_insights_tour_completed',
    'heys_tour_interrupted_step',
    'heys_weekly_wrap_view_count',
    'heys_widget_layout_v1',
    'heys_widget_layout_meta_v1'
  ]);
$function$;

CREATE OR REPLACE FUNCTION public.is_dayv2_key(p_key text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT regexp_replace(coalesce(p_key, ''), '^heys_[0-9a-f-]{36}_', 'heys_', 'i')
    ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$';
$function$;

CREATE OR REPLACE FUNCTION public.client_kv_value_has_meals(p_key text, p_value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.is_dayv2_key(p_key)
    AND COALESCE(jsonb_array_length(COALESCE(p_value->'meals', '[]'::jsonb)), 0) > 0;
$function$;

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
    OR public.is_always_writable_key(p_key)
    OR (
      public.is_dayv2_key(p_key)
      AND NOT public.client_kv_value_has_meals(p_key, p_value)
    );
$function$;

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
  v_status text;
BEGIN
  SELECT client_id INTO v_client_id
  FROM client_sessions
  WHERE token_hash = digest(p_session_token, 'sha256')
    AND expires_at > NOW()
    AND revoked_at IS NULL;

  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_or_expired_session');
  END IF;

  IF public.is_client_kv_non_client_key(p_key) THEN
    BEGIN
      INSERT INTO public.data_loss_audit (client_id, key, action, allowed, reason)
      VALUES (v_client_id, p_key, 'non_client_data_rejected', false, 'upsert_client_kv_by_session_blacklist');
    EXCEPTION WHEN others THEN
      NULL;
    END;

    RETURN jsonb_build_object('success', false, 'error', 'non_client_data', 'key', p_key);
  END IF;

  IF NOT public.client_kv_value_can_write(v_client_id, p_key, p_value) THEN
    v_status := COALESCE(public.get_effective_subscription_status(v_client_id), 'none');
    BEGIN
      INSERT INTO public.data_loss_audit (client_id, key, action, allowed, reason)
      VALUES (v_client_id, p_key, 'subscription_write_blocked', false, 'upsert_client_kv_by_session:' || v_status);
    EXCEPTION WHEN others THEN
      NULL;
    END;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'subscription_required',
      'status', v_status,
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
    RETURN jsonb_build_object('success', false, 'error', 'write_skipped', 'key', p_key);
  END IF;

  RETURN jsonb_build_object('success', true, 'key', p_key, 'revision', v_new_revision);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'sqlstate', SQLSTATE);
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
  v_subscription_rejected int := 0;
  v_status text;
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

  v_status := COALESCE(public.get_effective_subscription_status(v_client_id), 'none');

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

    IF NOT public.client_kv_value_can_write(v_client_id, v_key, v_value) THEN
      v_subscription_rejected := v_subscription_rejected + 1;
      v_rejected := v_rejected || jsonb_build_array(jsonb_build_object(
        'k', v_key,
        'reason', 'subscription_required',
        'status', v_status
      ));

      BEGIN
        INSERT INTO public.data_loss_audit (client_id, key, action, allowed, reason)
        VALUES (v_client_id, v_key, 'subscription_write_blocked', false, 'batch_upsert_client_kv_by_session:' || v_status);
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
    'success', v_saved > 0 OR v_rejected_count = 0,
    'saved', v_saved,
    'saved_items', v_saved_items,
    'stale_rejected', v_stale,
    'rejected', v_rejected_count,
    'rejected_items', v_rejected,
    'error', CASE
      WHEN v_saved = 0 AND v_subscription_rejected > 0 THEN 'subscription_required'
      WHEN v_saved = 0 AND v_rejected_count > 0 THEN 'not_client_data'
      ELSE NULL
    END,
    'status', CASE WHEN v_saved = 0 AND v_subscription_rejected > 0 THEN v_status ELSE NULL END,
    'server_revision', coalesce((select max(revision) from client_kv_store where client_id = v_client_id), 0)
  ));
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'sqlstate', SQLSTATE, 'saved', v_saved);
END;
$function$;

CREATE OR REPLACE FUNCTION public.batch_upsert_client_kv_by_curator(
  p_curator_id uuid,
  p_client_id uuid,
  p_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_owns boolean;
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
  v_subscription_rejected int := 0;
  v_status text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = p_client_id AND curator_id = p_curator_id
  ) INTO v_owns;

  IF NOT v_owns THEN
    RETURN jsonb_build_object('success', false, 'saved', 0, 'error', 'curator_does_not_own_client');
  END IF;

  v_status := COALESCE(public.get_effective_subscription_status(p_client_id), 'none');

  FOR v_item IN SELECT jsonb_array_elements(p_items)
  LOOP
    v_key := v_item->>'k';
    v_value := v_item->'v';
    v_base_revision := nullif(v_item->>'base_revision', '')::bigint;

    IF v_key IS NULL THEN
      CONTINUE;
    END IF;

    IF NOT public.client_kv_value_can_write(p_client_id, v_key, v_value) THEN
      v_subscription_rejected := v_subscription_rejected + 1;
      v_rejected := v_rejected || jsonb_build_array(jsonb_build_object(
        'k', v_key,
        'reason', 'subscription_required',
        'status', v_status
      ));

      BEGIN
        INSERT INTO public.data_loss_audit (client_id, key, action, allowed, reason)
        VALUES (p_client_id, v_key, 'subscription_write_blocked', false, 'batch_upsert_client_kv_by_curator:' || v_status);
      EXCEPTION WHEN others THEN
        NULL;
      END;

      CONTINUE;
    END IF;

    SELECT revision INTO v_current_revision
    FROM client_kv_store
    WHERE client_id = p_client_id AND k = v_key;

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
    VALUES (p_client_id, v_key, v_value, NOW(), p_curator_id)
    ON CONFLICT (client_id, k) DO UPDATE SET
      v = EXCLUDED.v,
      updated_at = NOW(),
      user_id = EXCLUDED.user_id
    RETURNING revision INTO v_new_revision;

    v_saved_items := v_saved_items || jsonb_build_array(jsonb_build_object('k', v_key, 'revision', v_new_revision));
    v_saved := v_saved + 1;
  END LOOP;

  v_rejected_count := jsonb_array_length(v_rejected);

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'success', v_saved > 0 OR v_rejected_count = 0,
    'saved', v_saved,
    'saved_items', v_saved_items,
    'stale_rejected', v_stale,
    'rejected', v_rejected_count,
    'rejected_items', v_rejected,
    'error', CASE WHEN v_saved = 0 AND v_subscription_rejected > 0 THEN 'subscription_required' ELSE NULL END,
    'status', CASE WHEN v_saved = 0 AND v_subscription_rejected > 0 THEN v_status ELSE NULL END,
    'server_revision', coalesce((select max(revision) from client_kv_store where client_id = p_client_id), 0)
  ));
END;
$function$;

CREATE OR REPLACE FUNCTION public.safe_upsert_client_kv(
  p_client_id uuid,
  p_key text,
  p_value jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_allowed boolean;
  v_status text;
BEGIN
  IF public.is_client_kv_non_client_key(p_key) THEN
    BEGIN
      INSERT INTO public.data_loss_audit (client_id, key, action, allowed, reason)
      VALUES (p_client_id, p_key, 'non_client_data_rejected', false, 'safe_upsert_client_kv_blacklist');
    EXCEPTION WHEN others THEN
      NULL;
    END;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'non_client_data',
      'message', 'Non-client data key cannot be written to client_kv_store'
    );
  END IF;

  IF NOT public.client_kv_value_can_write(p_client_id, p_key, p_value) THEN
    v_status := COALESCE(public.get_effective_subscription_status(p_client_id), 'none');
    BEGIN
      INSERT INTO public.data_loss_audit (client_id, key, action, allowed, reason)
      VALUES (p_client_id, p_key, 'subscription_write_blocked', false, 'safe_upsert_client_kv:' || v_status);
    EXCEPTION WHEN others THEN
      NULL;
    END;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'subscription_required',
      'status', v_status,
      'message', 'Active trial or subscription is required for this write'
    );
  END IF;

  v_allowed := check_day_overwrite_allowed(p_client_id, p_key, p_value);

  IF NOT v_allowed THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'data_loss_protection',
      'message', 'Cannot overwrite day with meals by empty day'
    );
  END IF;

  INSERT INTO public.client_kv_store (client_id, k, v, updated_at)
  VALUES (p_client_id, p_key, p_value, now())
  ON CONFLICT (client_id, k) DO UPDATE
  SET v = EXCLUDED.v, updated_at = now();

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.subscription_can_write(uuid) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.subscription_can_write(uuid) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.is_always_writable_key(text) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.is_always_writable_key(text) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.is_always_writable_key(text) TO heys_rest;
GRANT EXECUTE ON FUNCTION public.is_dayv2_key(text) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.is_dayv2_key(text) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.is_dayv2_key(text) TO heys_rest;
GRANT EXECUTE ON FUNCTION public.client_kv_value_has_meals(text, jsonb) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.client_kv_value_has_meals(text, jsonb) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.client_kv_value_has_meals(text, jsonb) TO heys_rest;
GRANT EXECUTE ON FUNCTION public.client_kv_value_can_write(uuid, text, jsonb) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.client_kv_value_can_write(uuid, text, jsonb) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.client_kv_value_can_write(uuid, text, jsonb) TO heys_rest;
GRANT EXECUTE ON FUNCTION public.upsert_client_kv_by_session(text, text, jsonb) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.batch_upsert_client_kv_by_session(text, jsonb) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.batch_upsert_client_kv_by_curator(uuid, uuid, jsonb) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.safe_upsert_client_kv(uuid, text, jsonb) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.safe_upsert_client_kv(uuid, text, jsonb) TO heys_rest;

COMMENT ON FUNCTION public.client_kv_value_can_write(uuid, text, jsonb) IS
  'Value-aware client KV write gate: trial/active can write all client data; bootstrap keys allowed; dayv2 with meals requires trial/active.';

COMMIT;
