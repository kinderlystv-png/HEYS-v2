-- Harden legacy client-id KV write functions that still have heys_rpc EXECUTE.
--
-- The current RPC app should use session/curator-specific functions, but live
-- grants still allow these legacy entry points. Keep them compatible for valid
-- client data while rejecting auth/session/non-client keys before INSERT and
-- reporting skipped writes honestly.

CREATE OR REPLACE FUNCTION public.save_client_kv(
  p_client_id uuid,
  p_key text,
  p_value jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_curator_id uuid;
  v_can_write boolean;
  v_status text;
  v_new_revision bigint;
BEGIN
  v_can_write := public.subscription_can_write(p_client_id);

  IF NOT v_can_write THEN
    v_status := public.get_effective_subscription_status(p_client_id);
    RETURN jsonb_build_object(
      'success', false,
      'error', 'subscription_required',
      'status', v_status,
      'message', 'Для записи данных необходима активная подписка'
    );
  END IF;

  SELECT curator_id INTO v_curator_id
  FROM public.clients
  WHERE id = p_client_id;

  IF v_curator_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'client_not_found');
  END IF;

  IF public.is_client_kv_non_client_key(p_key) THEN
    BEGIN
      INSERT INTO public.data_loss_audit (client_id, key, action, allowed, reason)
      VALUES (p_client_id, p_key, 'non_client_data_rejected', false, 'save_client_kv_blacklist');
    EXCEPTION WHEN others THEN
      NULL;
    END;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'non_client_data',
      'key', p_key
    );
  END IF;

  INSERT INTO public.client_kv_store (user_id, client_id, k, v, updated_at)
  VALUES (v_curator_id, p_client_id, p_key, p_value, timezone('utc', now()))
  ON CONFLICT (client_id, k)
  DO UPDATE SET
    v = EXCLUDED.v,
    updated_at = timezone('utc', now()),
    user_id = EXCLUDED.user_id
  RETURNING revision INTO v_new_revision;

  IF v_new_revision IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'write_skipped',
      'key', p_key
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'key', p_key, 'revision', v_new_revision);
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_client_kv(
  p_client_id uuid,
  p_key text,
  p_value jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN public.save_client_kv(p_client_id, p_key, p_value);
END;
$function$;

CREATE OR REPLACE FUNCTION public.batch_upsert_client_kv(
  p_client_id uuid,
  p_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_curator_id uuid;
  v_item jsonb;
  v_key text;
  v_value jsonb;
  v_saved int := 0;
  v_saved_items jsonb := '[]'::jsonb;
  v_rejected jsonb := '[]'::jsonb;
  v_rejected_count int := 0;
  v_can_write boolean;
  v_status text;
  v_new_revision bigint;
BEGIN
  v_can_write := public.subscription_can_write(p_client_id);

  IF NOT v_can_write THEN
    v_status := public.get_effective_subscription_status(p_client_id);
    RETURN jsonb_build_object(
      'success', false,
      'error', 'subscription_required',
      'status', v_status,
      'saved', 0,
      'message', 'Для записи данных необходима активная подписка'
    );
  END IF;

  SELECT curator_id INTO v_curator_id
  FROM public.clients
  WHERE id = p_client_id;

  IF v_curator_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'client_not_found', 'saved', 0);
  END IF;

  IF coalesce(jsonb_typeof(p_items), '') <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_items must be JSON array', 'saved', 0);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_key := v_item->>'k';
    v_value := v_item->'v';
    v_new_revision := NULL;

    IF v_key IS NULL THEN
      CONTINUE;
    END IF;

    IF public.is_client_kv_non_client_key(v_key) THEN
      v_rejected := v_rejected || jsonb_build_array(jsonb_build_object(
        'k', v_key,
        'reason', 'non_client_data'
      ));

      BEGIN
        INSERT INTO public.data_loss_audit (client_id, key, action, allowed, reason)
        VALUES (p_client_id, v_key, 'non_client_data_rejected', false, 'batch_upsert_client_kv_blacklist');
      EXCEPTION WHEN others THEN
        NULL;
      END;

      CONTINUE;
    END IF;

    INSERT INTO public.client_kv_store (user_id, client_id, k, v, updated_at)
    VALUES (v_curator_id, p_client_id, v_key, v_value, timezone('utc', now()))
    ON CONFLICT (client_id, k)
    DO UPDATE SET
      v = EXCLUDED.v,
      updated_at = timezone('utc', now()),
      user_id = EXCLUDED.user_id
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
    'rejected', v_rejected_count,
    'rejected_items', v_rejected,
    'error', CASE WHEN v_saved = 0 AND v_rejected_count > 0 THEN 'not_client_data' ELSE NULL END
  ));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.save_client_kv(uuid, text, jsonb) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.save_client_kv(uuid, text, jsonb) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.upsert_client_kv(uuid, text, jsonb) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.upsert_client_kv(uuid, text, jsonb) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.batch_upsert_client_kv(uuid, jsonb) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.batch_upsert_client_kv(uuid, jsonb) TO heys_rpc;

COMMENT ON FUNCTION public.save_client_kv(uuid, text, jsonb) IS
  'Legacy client-id KV upsert with subscription guard, DB-level non-client key rejection, and honest write reporting.';

COMMENT ON FUNCTION public.batch_upsert_client_kv(uuid, jsonb) IS
  'Legacy client-id batch KV upsert with subscription guard, DB-level non-client key rejection, and honest saved counts.';
