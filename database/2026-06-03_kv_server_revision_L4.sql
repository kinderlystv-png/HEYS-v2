-- 2026-06-03 L4: plain-upsert soft-CAS on base_revision + per-key revision return.
--
-- DORMANT when applied: clients only send `base_revision` once the L4 client ships
-- (behind a flag). With base_revision absent → unconditional upsert == today's
-- behaviour (the backward-compat escape hatch). Requires _L1.sql (revision column).
--
-- Diffed against the LIVE batch_upsert functions (2026-06-03): they carry NO
-- SQL-level guards (identity/_writerCid/context/changelog all live in the RPC CF,
-- AFTER the function). So this preserves the live INSERT semantics verbatim
-- (session → user_id=NULL hotfix 2026-05-28; curator → user_id=EXCLUDED.user_id) and
-- ADDS only:
--   * soft-CAS: base_revision NOT NULL AND current_revision > base_revision → reject
--     into stale_rejected[] (do NOT overwrite), else upsert.
--   * saved_items: [{k, revision}] per accepted row (RETURNING revision) so the client
--     can set its per-key localRevisionByKey map authoritatively on ack — NOT from the
--     global server_revision max (which would over-estimate and skip concurrent writes).

CREATE OR REPLACE FUNCTION public.batch_upsert_client_kv_by_session(
  p_session_token text,
  p_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
BEGIN
  SELECT client_id INTO v_client_id
  FROM client_sessions
  WHERE token_hash = digest(p_session_token, 'sha256')
    AND expires_at > NOW()
    AND revoked_at IS NULL;

  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_or_expired_session');
  END IF;

  IF jsonb_typeof(p_items) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_items must be JSON array');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_key := v_item->>'k';
    v_value := v_item->'v';
    v_base_revision := nullif(v_item->>'base_revision', '')::bigint;

    IF v_key IS NOT NULL AND v_value IS NOT NULL THEN
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
        user_id = NULL   -- HOTFIX 2026-05-28: см. upsert_client_kv_by_session.
      RETURNING revision INTO v_new_revision;

      v_saved_items := v_saved_items || jsonb_build_array(jsonb_build_object('k', v_key, 'revision', v_new_revision));
      v_saved := v_saved + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'saved', v_saved,
    'saved_items', v_saved_items,
    'stale_rejected', v_stale,
    'server_revision', coalesce((select max(revision) from client_kv_store where client_id = v_client_id), 0)
  );
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
SET search_path TO 'public'
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
BEGIN
  -- 1) Ownership check (unchanged from live).
  SELECT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = p_client_id AND curator_id = p_curator_id
  ) INTO v_owns;

  IF NOT v_owns THEN
    RETURN jsonb_build_object('success', false, 'saved', 0, 'error', 'curator_does_not_own_client');
  END IF;

  -- 2) Upsert each item. Changelog is written by the RPC handler AFTER this function
  --    (it knows OLD values and diffs against the actions payload) — unchanged.
  FOR v_item IN SELECT jsonb_array_elements(p_items)
  LOOP
    v_key := v_item->>'k';
    v_value := v_item->'v';
    v_base_revision := nullif(v_item->>'base_revision', '')::bigint;

    IF v_key IS NOT NULL THEN
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
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'saved', v_saved,
    'saved_items', v_saved_items,
    'stale_rejected', v_stale,
    'server_revision', coalesce((select max(revision) from client_kv_store where client_id = p_client_id), 0)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.batch_upsert_client_kv_by_session(text, jsonb) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.batch_upsert_client_kv_by_curator(uuid, uuid, jsonb) TO heys_rpc;
