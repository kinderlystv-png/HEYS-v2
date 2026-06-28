-- HEYS: allow authenticated clients/curators to attach barcode aliases to shared products.
-- This intentionally exposes only a narrow append operation, not arbitrary shared_products updates.

CREATE OR REPLACE FUNCTION public._add_shared_product_barcode(
  p_product_id uuid,
  p_barcode text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_barcode text;
  v_existing_id uuid;
  v_existing_name text;
  v_product record;
BEGIN
  IF p_product_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'status', 'error', 'error', 'product_id_required', 'message', 'product_id is required');
  END IF;

  v_barcode := upper(regexp_replace(coalesce(p_barcode, ''), '[^0-9A-Za-z]', '', 'g'));
  IF length(v_barcode) < 6 OR length(v_barcode) > 32 THEN
    RETURN jsonb_build_object('success', false, 'status', 'error', 'error', 'invalid_barcode', 'message', 'Barcode must be 6-32 alphanumeric characters');
  END IF;

  SELECT id, name
  INTO v_existing_id, v_existing_name
  FROM public.shared_products
  WHERE id IS DISTINCT FROM p_product_id
    AND (
      barcode = v_barcode
      OR coalesce(barcodes, ARRAY[]::text[]) && ARRAY[v_barcode]::text[]
    )
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', 'duplicate',
      'error', 'barcode_duplicate',
      'existing_id', v_existing_id,
      'existing_name', v_existing_name,
      'message', 'Barcode is already attached to another shared product'
    );
  END IF;

  UPDATE public.shared_products sp
  SET
    barcode = coalesce(nullif(sp.barcode, ''), v_barcode),
    barcodes = (
      SELECT coalesce(array_agg(code ORDER BY ord), ARRAY[]::text[])
      FROM (
        SELECT code, min(ord) AS ord
        FROM (
          SELECT unnest(public.normalize_product_barcodes(
            jsonb_build_object('barcode', sp.barcode, 'barcodes', to_jsonb(sp.barcodes)),
            sp.barcode
          )) AS code, 0 AS ord
          UNION ALL
          SELECT v_barcode AS code, 1 AS ord
        ) raw
        WHERE code IS NOT NULL AND code <> ''
        GROUP BY code
      ) grouped
    ),
    updated_at = now()
  WHERE sp.id = p_product_id
  RETURNING id, name, barcode, barcodes, updated_at
  INTO v_product;

  IF v_product.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'status', 'error', 'error', 'product_not_found', 'message', 'Shared product not found');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'updated',
    'product', jsonb_build_object(
      'id', v_product.id,
      'name', v_product.name,
      'barcode', v_product.barcode,
      'barcodes', v_product.barcodes,
      'updated_at', v_product.updated_at
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public._add_shared_product_barcode(uuid, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.add_shared_product_barcode_by_session(
  p_session_token text,
  p_product_id uuid,
  p_barcode text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_client_id uuid;
  v_result jsonb;
BEGIN
  v_client_id := public.require_client_id(p_session_token);
  v_result := public._add_shared_product_barcode(p_product_id, p_barcode);
  RETURN v_result || jsonb_build_object('actor', 'client', 'client_id', v_client_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'status', 'error', 'error', 'unexpected', 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_shared_product_barcode_by_session(text, uuid, text) TO heys_rpc;

CREATE OR REPLACE FUNCTION public.add_shared_product_barcode_by_curator(
  p_curator_id uuid,
  p_product_id uuid,
  p_barcode text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_curator_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'status', 'error', 'error', 'curator_id_required', 'message', 'curator_id is required');
  END IF;

  v_result := public._add_shared_product_barcode(p_product_id, p_barcode);
  RETURN v_result || jsonb_build_object('actor', 'curator', 'curator_id', p_curator_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_shared_product_barcode_by_curator(uuid, uuid, text) TO heys_rpc;
