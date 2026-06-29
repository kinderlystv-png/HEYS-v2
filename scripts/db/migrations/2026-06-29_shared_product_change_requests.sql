-- 2026-06-29: shared product change requests
--
-- Context: PIN clients can edit their personal product copy immediately, but
-- shared catalog changes must go through curator moderation. Brand/SKU
-- refinements are stored as variants linked to the generic shared product.
-- Apply: bash scripts/db/psql.sh -f scripts/db/migrations/2026-06-29_shared_product_change_requests.sql
-- Rollback: see ===== ROLLBACK ===== at the end.

BEGIN;

ALTER TABLE public.shared_products
  ADD COLUMN IF NOT EXISTS variant_of uuid REFERENCES public.shared_products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_shared_products_variant_of
  ON public.shared_products(variant_of)
  WHERE variant_of IS NOT NULL;

COMMENT ON COLUMN public.shared_products.variant_of IS
  'Optional parent shared product for brand/SKU variants created from a generic product.';

CREATE OR REPLACE FUNCTION public.create_pending_shared_product_change_by_session(
  p_session_token text,
  p_request_type text,
  p_target_product_id uuid,
  p_product_data jsonb DEFAULT '{}'::jsonb,
  p_name text DEFAULT NULL,
  p_name_norm text DEFAULT NULL,
  p_fingerprint text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_client_id uuid;
  v_curator_id uuid;
  v_pending_id uuid;
  v_existing_id uuid;
  v_request_type text;
  v_name_trimmed text;
  v_name_norm text;
  v_fingerprint text;
  v_barcode text;
  v_barcodes text[];
  v_product_data jsonb;
  v_json_size int;
BEGIN
  v_client_id := public.require_client_id(p_session_token);
  v_request_type := nullif(trim(coalesce(p_request_type, '')), '');

  IF v_request_type NOT IN ('variant_create', 'product_update', 'barcode_update') THEN
    RETURN jsonb_build_object('status', 'error', 'error', 'invalid_request_type', 'message', 'Invalid shared product change type');
  END IF;

  IF p_target_product_id IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'error', 'target_product_required', 'message', 'Shared product id is required');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.shared_products WHERE id = p_target_product_id) THEN
    RETURN jsonb_build_object('status', 'error', 'error', 'target_product_not_found', 'message', 'Shared product not found');
  END IF;

  v_json_size := length(coalesce(p_product_data, '{}'::jsonb)::text);
  IF v_json_size > 24576 THEN
    RETURN jsonb_build_object('status', 'error', 'error', 'product_data_too_large', 'message', 'Product data too large (max 24KB)');
  END IF;

  v_name_trimmed := trim(coalesce(p_name, p_product_data->>'name', ''));
  IF length(v_name_trimmed) < 2 THEN
    RETURN jsonb_build_object('status', 'error', 'error', 'name_too_short', 'message', 'Название продукта обязательно');
  END IF;

  SELECT curator_id INTO v_curator_id
  FROM public.clients
  WHERE id = v_client_id;

  IF v_curator_id IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'error', 'no_curator', 'message', 'У клиента не назначен куратор');
  END IF;

  v_name_norm := coalesce(nullif(trim(p_name_norm), ''), lower(regexp_replace(v_name_trimmed, '\s+', ' ', 'g')));
  v_product_data := coalesce(p_product_data, '{}'::jsonb)
    || jsonb_build_object(
      '_pendingRequest',
      coalesce(p_product_data->'_pendingRequest', '{}'::jsonb)
        || jsonb_build_object(
          'type', v_request_type,
          'target_product_id', p_target_product_id,
          'client_id', v_client_id
        )
    );
  IF v_request_type = 'variant_create' THEN
    v_product_data := v_product_data || jsonb_build_object('variant_of', p_target_product_id);
  END IF;

  v_fingerprint := coalesce(
    nullif(trim(p_fingerprint), ''),
    public.compute_product_fingerprint(v_product_data),
    v_name_norm
  );
  v_barcodes := public.normalize_product_barcodes(v_product_data);
  v_barcode := nullif(v_barcodes[1], '');

  SELECT id INTO v_existing_id
  FROM public.shared_products_pending
  WHERE status = 'pending'
    AND client_id = v_client_id
    AND product_data->'_pendingRequest'->>'type' = v_request_type
    AND product_data->'_pendingRequest'->>'target_product_id' = p_target_product_id::text
    AND fingerprint = v_fingerprint
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'pending_dup', 'pending_id', v_existing_id, 'message', 'Такая заявка уже ждёт модерации');
  END IF;

  INSERT INTO public.shared_products_pending
    (client_id, curator_id, product_data, name_norm, fingerprint, barcode, barcodes, status)
  VALUES
    (v_client_id, v_curator_id, v_product_data, v_name_norm, v_fingerprint, v_barcode, v_barcodes, 'pending')
  RETURNING id INTO v_pending_id;

  RETURN jsonb_build_object('status', 'pending', 'pending_id', v_pending_id, 'message', 'Заявка отправлена куратору');

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('status', 'error', 'error', 'unexpected', 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_pending_shared_product_change_by_session(text, text, uuid, jsonb, text, text, text) TO heys_rpc;

COMMIT;


-- ===== ROLLBACK =====
-- BEGIN;
-- REVOKE ALL ON FUNCTION public.create_pending_shared_product_change_by_session(text, text, uuid, jsonb, text, text, text) FROM heys_rpc;
-- DROP FUNCTION IF EXISTS public.create_pending_shared_product_change_by_session(text, text, uuid, jsonb, text, text, text);
-- DROP INDEX IF EXISTS public.idx_shared_products_variant_of;
-- ALTER TABLE public.shared_products DROP COLUMN IF EXISTS variant_of;
-- COMMIT;
