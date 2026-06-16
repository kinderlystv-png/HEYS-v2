-- Keep curator batch upsert reporting honest when DB-level guards reject
-- auth/session/non-client keys.
--
-- The client_kv_store BEFORE trigger from 2026-06-16 prevents bad rows from
-- landing, but old SQL counted an INSERT skipped by a BEFORE trigger as saved.
-- This function rejects those keys before INSERT and also treats NULL RETURNING
-- as a skipped write.

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
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = p_client_id AND curator_id = p_curator_id
  ) INTO v_owns;

  IF NOT v_owns THEN
    RETURN jsonb_build_object('success', false, 'saved', 0, 'error', 'curator_does_not_own_client');
  END IF;

  FOR v_item IN SELECT jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  LOOP
    v_key := v_item->>'k';
    v_value := v_item->'v';
    v_new_revision := NULL;
    v_base_revision := nullif(v_item->>'base_revision', '')::bigint;

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
        VALUES (p_client_id, v_key, 'non_client_data_rejected', false, 'batch_upsert_client_kv_by_curator_blacklist');
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
    'server_revision', coalesce((select max(revision) from client_kv_store where client_id = p_client_id), 0)
  ));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.batch_upsert_client_kv_by_curator(uuid, uuid, jsonb) TO heys_rpc;

COMMENT ON FUNCTION public.batch_upsert_client_kv_by_curator(uuid, uuid, jsonb) IS
  'Curator batch client_kv_store upsert with honest saved counts when non-client/auth/session keys are rejected.';
