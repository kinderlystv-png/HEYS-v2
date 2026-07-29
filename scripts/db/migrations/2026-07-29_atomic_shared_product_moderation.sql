-- 2026-07-29: atomic curator-only moderation for shared product requests.
--
-- The browser sends only the pending id and action. The RPC gateway injects
-- p_curator_id from a verified curator JWT; this function locks the pending
-- row, verifies ownership, applies the product change, and marks moderation
-- complete in the same database transaction.

CREATE OR REPLACE FUNCTION public.moderate_pending_shared_product_by_curator(
  p_curator_id uuid,
  p_pending_id uuid,
  p_action text DEFAULT 'approve',
  p_reject_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_pending public.shared_products_pending%ROWTYPE;
  v_product public.shared_products%ROWTYPE;
  v_product_data jsonb;
  v_patch jsonb;
  v_published jsonb;
  v_request_type text;
  v_action text;
  v_target_id uuid;
  v_product_id uuid;
  v_barcodes text[];
  v_updated_rows integer;
BEGIN
  IF p_curator_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'curator_required';
  END IF;
  IF p_pending_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'status', 'error', 'error', 'pending_id_required');
  END IF;

  v_action := lower(trim(coalesce(p_action, '')));
  IF v_action NOT IN ('approve', 'reject') THEN
    RETURN jsonb_build_object('success', false, 'status', 'error', 'error', 'invalid_moderation_action');
  END IF;

  SELECT *
  INTO v_pending
  FROM public.shared_products_pending
  WHERE id = p_pending_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'status', 'not_found', 'error', 'pending_not_found');
  END IF;
  IF v_pending.curator_id IS DISTINCT FROM p_curator_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'pending_forbidden';
  END IF;
  IF v_pending.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', 'race',
      'error', 'already_moderated',
      'current_status', v_pending.status
    );
  END IF;

  IF v_action = 'reject' THEN
    UPDATE public.shared_products_pending
    SET status = 'rejected',
        reject_reason = nullif(trim(coalesce(p_reject_reason, '')), ''),
        moderated_at = now(),
        moderated_by = p_curator_id
    WHERE id = p_pending_id
      AND status = 'pending';
    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

    IF v_updated_rows = 0 THEN
      RETURN jsonb_build_object('success', false, 'status', 'race', 'error', 'already_moderated');
    END IF;
    RETURN jsonb_build_object('success', true, 'status', 'rejected', 'pending_id', p_pending_id);
  END IF;

  v_product_data := coalesce(v_pending.product_data, '{}'::jsonb);
  v_request_type := coalesce(
    nullif(v_product_data #>> '{_pendingRequest,type}', ''),
    nullif(v_product_data #>> '{_pendingRequest,request_type}', ''),
    nullif(v_product_data #>> '{_sharedChange,type}', ''),
    nullif(v_product_data #>> '{_sharedChange,request_type}', ''),
    'new_product'
  );
  v_target_id := coalesce(
    nullif(v_product_data #>> '{_pendingRequest,target_product_id}', '')::uuid,
    nullif(v_product_data #>> '{_pendingRequest,targetProductId}', '')::uuid,
    nullif(v_product_data #>> '{_sharedChange,target_product_id}', '')::uuid,
    nullif(v_product_data #>> '{_sharedChange,targetProductId}', '')::uuid,
    nullif(v_product_data->>'variant_of', '')::uuid,
    nullif(v_product_data->>'shared_origin_id', '')::uuid
  );

  IF v_request_type NOT IN ('new_product', 'product_update', 'barcode_update', 'variant_create') THEN
    RETURN jsonb_build_object('success', false, 'status', 'error', 'error', 'invalid_request_type');
  END IF;
  IF v_request_type <> 'new_product' AND v_target_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'status', 'error', 'error', 'target_product_required');
  END IF;
  IF v_request_type <> 'new_product'
     AND NOT EXISTS (SELECT 1 FROM public.shared_products WHERE id = v_target_id) THEN
    RETURN jsonb_build_object('success', false, 'status', 'not_found', 'error', 'target_product_not_found');
  END IF;

  IF v_request_type IN ('new_product', 'variant_create') THEN
    v_published := public.publish_shared_product_by_curator(p_curator_id, v_product_data);
    IF coalesce((v_published->>'success')::boolean, false) IS NOT TRUE
       AND coalesce(v_published->>'status', '') NOT IN ('published', 'exists') THEN
      RETURN jsonb_build_object(
        'success', false,
        'status', 'error',
        'error', coalesce(v_published->>'error', 'publish_failed'),
        'message', v_published->>'message'
      );
    END IF;

    v_product_id := nullif(v_published->>'id', '')::uuid;
    IF v_request_type = 'variant_create' THEN
      UPDATE public.shared_products
      SET variant_of = v_target_id,
          updated_at = now()
      WHERE id = v_product_id;
      GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
      IF v_updated_rows = 0 THEN
        RAISE EXCEPTION 'published_product_not_found';
      END IF;
    END IF;
  ELSE
    v_barcodes := public.normalize_product_barcodes(v_product_data);
    IF v_request_type = 'barcode_update' THEN
      UPDATE public.shared_products
      SET barcode = nullif(v_barcodes[1], ''),
          barcodes = coalesce(v_barcodes, ARRAY[]::text[]),
          updated_at = now()
      WHERE id = v_target_id;
    ELSE
      IF v_product_data ? 'portions'
         AND jsonb_typeof(v_product_data->'portions') NOT IN ('array', 'null') THEN
        RETURN jsonb_build_object('success', false, 'status', 'error', 'error', 'invalid_portions_contract');
      END IF;
      IF v_product_data ? 'additives'
         AND jsonb_typeof(v_product_data->'additives') NOT IN ('array', 'null') THEN
        RETURN jsonb_build_object('success', false, 'status', 'error', 'error', 'invalid_additives_contract');
      END IF;

      v_patch := v_product_data - '_pendingRequest' - '_sharedChange';
      IF v_patch ? 'badFat100' THEN v_patch := v_patch || jsonb_build_object('badfat100', v_patch->'badFat100'); END IF;
      IF v_patch ? 'goodFat100' THEN v_patch := v_patch || jsonb_build_object('goodfat100', v_patch->'goodFat100'); END IF;
      IF v_patch ? 'harmScore' THEN v_patch := v_patch || jsonb_build_object('harm', v_patch->'harmScore'); END IF;
      IF v_patch ? 'novaGroup' THEN v_patch := v_patch || jsonb_build_object('nova_group', v_patch->'novaGroup'); END IF;
      IF v_patch ? 'nutrientDensity' THEN v_patch := v_patch || jsonb_build_object('nutrient_density', v_patch->'nutrientDensity'); END IF;
      IF v_patch ? 'isOrganic' THEN v_patch := v_patch || jsonb_build_object('is_organic', v_patch->'isOrganic'); END IF;
      IF v_patch ? 'isWholeGrain' THEN v_patch := v_patch || jsonb_build_object('is_whole_grain', v_patch->'isWholeGrain'); END IF;
      IF v_patch ? 'isFermented' THEN v_patch := v_patch || jsonb_build_object('is_fermented', v_patch->'isFermented'); END IF;
      IF v_patch ? 'isRaw' THEN v_patch := v_patch || jsonb_build_object('is_raw', v_patch->'isRaw'); END IF;
      IF v_patch ? 'vitaminA' THEN v_patch := v_patch || jsonb_build_object('vitamin_a', v_patch->'vitaminA'); END IF;
      IF v_patch ? 'vitaminC' THEN v_patch := v_patch || jsonb_build_object('vitamin_c', v_patch->'vitaminC'); END IF;
      IF v_patch ? 'vitaminD' THEN v_patch := v_patch || jsonb_build_object('vitamin_d', v_patch->'vitaminD'); END IF;
      IF v_patch ? 'vitaminE' THEN v_patch := v_patch || jsonb_build_object('vitamin_e', v_patch->'vitaminE'); END IF;
      IF v_patch ? 'vitaminK' THEN v_patch := v_patch || jsonb_build_object('vitamin_k', v_patch->'vitaminK'); END IF;
      IF v_patch ? 'vitaminB1' THEN v_patch := v_patch || jsonb_build_object('vitamin_b1', v_patch->'vitaminB1'); END IF;
      IF v_patch ? 'vitaminB2' THEN v_patch := v_patch || jsonb_build_object('vitamin_b2', v_patch->'vitaminB2'); END IF;
      IF v_patch ? 'vitaminB3' THEN v_patch := v_patch || jsonb_build_object('vitamin_b3', v_patch->'vitaminB3'); END IF;
      IF v_patch ? 'vitaminB6' THEN v_patch := v_patch || jsonb_build_object('vitamin_b6', v_patch->'vitaminB6'); END IF;
      IF v_patch ? 'vitaminB9' THEN v_patch := v_patch || jsonb_build_object('vitamin_b9', v_patch->'vitaminB9'); END IF;
      IF v_patch ? 'vitaminB12' THEN v_patch := v_patch || jsonb_build_object('vitamin_b12', v_patch->'vitaminB12'); END IF;
      IF v_patch ? 'brandFingerprint' THEN v_patch := v_patch || jsonb_build_object('brand_fingerprint', v_patch->'brandFingerprint'); END IF;

      IF nullif(trim(coalesce(v_patch->>'brand', '')), '') IS NULL THEN
        v_patch := v_patch - 'brand' - 'brand_fingerprint' - 'brandFingerprint';
      END IF;
      IF nullif(trim(coalesce(v_patch->>'name', '')), '') IS NULL THEN
        v_patch := v_patch - 'name';
      ELSE
        v_patch := v_patch || jsonb_build_object(
          'name_norm', lower(trim(regexp_replace(v_patch->>'name', '\s+', ' ', 'g')))
        );
      END IF;

      -- Explicit wire contract: JSON arrays become PostgreSQL text[] only
      -- after normalize_product_barcodes; portions remains native jsonb.
      v_patch := v_patch || jsonb_build_object(
        'barcode', nullif(v_barcodes[1], ''),
        'barcodes', to_jsonb(coalesce(v_barcodes, ARRAY[]::text[]))
      );
      SELECT * INTO v_product
      FROM jsonb_populate_record(NULL::public.shared_products, v_patch);

      UPDATE public.shared_products sp
      SET name = CASE WHEN v_patch ? 'name' THEN v_product.name ELSE sp.name END,
          brand = CASE WHEN v_patch ? 'brand' THEN nullif(trim(v_product.brand), '') ELSE sp.brand END,
          brand_fingerprint = CASE WHEN v_patch ? 'brand_fingerprint' THEN nullif(v_product.brand_fingerprint, '') ELSE sp.brand_fingerprint END,
          name_norm = CASE WHEN v_patch ? 'name_norm' THEN v_product.name_norm ELSE sp.name_norm END,
          barcode = v_product.barcode,
          barcodes = coalesce(v_product.barcodes, ARRAY[]::text[]),
          simple100 = CASE WHEN v_patch ? 'simple100' THEN v_product.simple100 ELSE sp.simple100 END,
          complex100 = CASE WHEN v_patch ? 'complex100' THEN v_product.complex100 ELSE sp.complex100 END,
          protein100 = CASE WHEN v_patch ? 'protein100' THEN v_product.protein100 ELSE sp.protein100 END,
          badfat100 = CASE WHEN v_patch ? 'badfat100' THEN v_product.badfat100 ELSE sp.badfat100 END,
          goodfat100 = CASE WHEN v_patch ? 'goodfat100' THEN v_product.goodfat100 ELSE sp.goodfat100 END,
          trans100 = CASE WHEN v_patch ? 'trans100' THEN v_product.trans100 ELSE sp.trans100 END,
          fiber100 = CASE WHEN v_patch ? 'fiber100' THEN v_product.fiber100 ELSE sp.fiber100 END,
          gi = CASE WHEN v_patch ? 'gi' THEN v_product.gi ELSE sp.gi END,
          harm = CASE WHEN v_patch ? 'harm' THEN v_product.harm ELSE sp.harm END,
          category = CASE WHEN v_patch ? 'category' THEN v_product.category ELSE sp.category END,
          portions = CASE WHEN v_patch ? 'portions' THEN v_product.portions ELSE sp.portions END,
          description = CASE WHEN v_patch ? 'description' THEN v_product.description ELSE sp.description END,
          sodium100 = CASE WHEN v_patch ? 'sodium100' THEN v_product.sodium100 ELSE sp.sodium100 END,
          omega3_100 = CASE WHEN v_patch ? 'omega3_100' THEN v_product.omega3_100 ELSE sp.omega3_100 END,
          omega6_100 = CASE WHEN v_patch ? 'omega6_100' THEN v_product.omega6_100 ELSE sp.omega6_100 END,
          nova_group = CASE WHEN v_patch ? 'nova_group' THEN v_product.nova_group ELSE sp.nova_group END,
          additives = CASE WHEN v_patch ? 'additives' THEN v_product.additives ELSE sp.additives END,
          nutrient_density = CASE WHEN v_patch ? 'nutrient_density' THEN v_product.nutrient_density ELSE sp.nutrient_density END,
          is_organic = CASE WHEN v_patch ? 'is_organic' THEN v_product.is_organic ELSE sp.is_organic END,
          is_whole_grain = CASE WHEN v_patch ? 'is_whole_grain' THEN v_product.is_whole_grain ELSE sp.is_whole_grain END,
          is_fermented = CASE WHEN v_patch ? 'is_fermented' THEN v_product.is_fermented ELSE sp.is_fermented END,
          is_raw = CASE WHEN v_patch ? 'is_raw' THEN v_product.is_raw ELSE sp.is_raw END,
          vitamin_a = CASE WHEN v_patch ? 'vitamin_a' THEN v_product.vitamin_a ELSE sp.vitamin_a END,
          vitamin_c = CASE WHEN v_patch ? 'vitamin_c' THEN v_product.vitamin_c ELSE sp.vitamin_c END,
          vitamin_d = CASE WHEN v_patch ? 'vitamin_d' THEN v_product.vitamin_d ELSE sp.vitamin_d END,
          vitamin_e = CASE WHEN v_patch ? 'vitamin_e' THEN v_product.vitamin_e ELSE sp.vitamin_e END,
          vitamin_k = CASE WHEN v_patch ? 'vitamin_k' THEN v_product.vitamin_k ELSE sp.vitamin_k END,
          vitamin_b1 = CASE WHEN v_patch ? 'vitamin_b1' THEN v_product.vitamin_b1 ELSE sp.vitamin_b1 END,
          vitamin_b2 = CASE WHEN v_patch ? 'vitamin_b2' THEN v_product.vitamin_b2 ELSE sp.vitamin_b2 END,
          vitamin_b3 = CASE WHEN v_patch ? 'vitamin_b3' THEN v_product.vitamin_b3 ELSE sp.vitamin_b3 END,
          vitamin_b6 = CASE WHEN v_patch ? 'vitamin_b6' THEN v_product.vitamin_b6 ELSE sp.vitamin_b6 END,
          vitamin_b9 = CASE WHEN v_patch ? 'vitamin_b9' THEN v_product.vitamin_b9 ELSE sp.vitamin_b9 END,
          vitamin_b12 = CASE WHEN v_patch ? 'vitamin_b12' THEN v_product.vitamin_b12 ELSE sp.vitamin_b12 END,
          calcium = CASE WHEN v_patch ? 'calcium' THEN v_product.calcium ELSE sp.calcium END,
          iron = CASE WHEN v_patch ? 'iron' THEN v_product.iron ELSE sp.iron END,
          magnesium = CASE WHEN v_patch ? 'magnesium' THEN v_product.magnesium ELSE sp.magnesium END,
          phosphorus = CASE WHEN v_patch ? 'phosphorus' THEN v_product.phosphorus ELSE sp.phosphorus END,
          potassium = CASE WHEN v_patch ? 'potassium' THEN v_product.potassium ELSE sp.potassium END,
          zinc = CASE WHEN v_patch ? 'zinc' THEN v_product.zinc ELSE sp.zinc END,
          selenium = CASE WHEN v_patch ? 'selenium' THEN v_product.selenium ELSE sp.selenium END,
          iodine = CASE WHEN v_patch ? 'iodine' THEN v_product.iodine ELSE sp.iodine END,
          updated_at = now()
      WHERE sp.id = v_target_id;
    END IF;

    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
    IF v_updated_rows = 0 THEN
      RETURN jsonb_build_object('success', false, 'status', 'not_found', 'error', 'target_product_not_found');
    END IF;
    v_product_id := v_target_id;
  END IF;

  UPDATE public.shared_products_pending
  SET status = 'approved',
      moderated_at = now(),
      moderated_by = p_curator_id
  WHERE id = p_pending_id
    AND status = 'pending';
  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  IF v_updated_rows = 0 THEN
    RAISE EXCEPTION 'pending_status_update_failed';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'approved',
    'pending_id', p_pending_id,
    'request_type', v_request_type,
    'product_id', v_product_id,
    'publish_status', v_published->>'status',
    'existing', coalesce(v_published->>'status', '') = 'exists',
    'variant', v_request_type = 'variant_create'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.moderate_pending_shared_product_by_curator(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.moderate_pending_shared_product_by_curator(uuid, uuid, text, text) TO heys_rpc;
REVOKE ALL ON FUNCTION public.approve_pending_products_bulk(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_pending_products_bulk(uuid, uuid[]) TO heys_rpc;

COMMENT ON FUNCTION public.moderate_pending_shared_product_by_curator(uuid, uuid, text, text) IS
  'JWT-gated curator moderation: locks owned pending row and atomically applies product change or rejection with pending status update.';

-- ROLLBACK:
-- REVOKE ALL ON FUNCTION public.moderate_pending_shared_product_by_curator(uuid, uuid, text, text) FROM heys_rpc;
-- DROP FUNCTION IF EXISTS public.moderate_pending_shared_product_by_curator(uuid, uuid, text, text);
-- GRANT EXECUTE ON FUNCTION public.approve_pending_products_bulk(uuid, uuid[]) TO PUBLIC;
