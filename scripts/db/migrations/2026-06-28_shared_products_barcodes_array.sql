-- HEYS: multiple package barcodes per product.
-- Keeps legacy shared_products.barcode as primary barcode and adds barcodes[] aliases.

ALTER TABLE public.shared_products
  ADD COLUMN IF NOT EXISTS barcodes text[];

ALTER TABLE public.shared_products_pending
  ADD COLUMN IF NOT EXISTS barcodes text[];

CREATE OR REPLACE FUNCTION public.normalize_product_barcodes(
  p_product_data jsonb,
  p_primary text DEFAULT NULL
) RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  WITH raw(ord, value) AS (
    SELECT 0, p_primary
    UNION ALL
    SELECT 1, p_product_data->>'barcode'
    UNION ALL
    SELECT 2 + row_number() OVER (), value
    FROM jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(p_product_data->'barcodes') = 'array' THEN p_product_data->'barcodes'
        ELSE '[]'::jsonb
      END
    ) AS value
  ),
  cleaned AS (
    SELECT ord, upper(regexp_replace(coalesce(value, ''), '[^0-9A-Za-z]', '', 'g')) AS code
    FROM raw
  ),
  grouped AS (
    SELECT code, min(ord) AS ord
    FROM cleaned
    WHERE length(code) BETWEEN 6 AND 32
    GROUP BY code
  )
  SELECT coalesce(array_agg(code ORDER BY ord), ARRAY[]::text[])
  FROM grouped;
$$;

UPDATE public.shared_products sp
SET
  barcodes = public.normalize_product_barcodes(
    jsonb_build_object('barcode', sp.barcode, 'barcodes', to_jsonb(sp.barcodes)),
    sp.barcode
  ),
  barcode = nullif((public.normalize_product_barcodes(
    jsonb_build_object('barcode', sp.barcode, 'barcodes', to_jsonb(sp.barcodes)),
    sp.barcode
  ))[1], '')
WHERE sp.barcode IS NOT NULL OR sp.barcodes IS NOT NULL;

UPDATE public.shared_products_pending spp
SET
  barcodes = public.normalize_product_barcodes(
    coalesce(spp.product_data, '{}'::jsonb) || jsonb_build_object('barcode', spp.barcode, 'barcodes', to_jsonb(spp.barcodes)),
    spp.barcode
  ),
  barcode = nullif((public.normalize_product_barcodes(
    coalesce(spp.product_data, '{}'::jsonb) || jsonb_build_object('barcode', spp.barcode, 'barcodes', to_jsonb(spp.barcodes)),
    spp.barcode
  ))[1], '')
WHERE spp.barcode IS NOT NULL OR spp.barcodes IS NOT NULL OR spp.product_data ? 'barcodes';

CREATE INDEX IF NOT EXISTS idx_shared_products_barcodes
  ON public.shared_products USING gin (barcodes)
  WHERE barcodes IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shared_products_pending_barcodes
  ON public.shared_products_pending USING gin (barcodes)
  WHERE barcodes IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_pending_product_by_session(
  p_session_token TEXT,
  p_name TEXT,
  p_product_data JSONB DEFAULT '{}'::JSONB,
  p_fingerprint TEXT DEFAULT NULL,
  p_name_norm TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_curator_id UUID;
  v_pending_id UUID;
  v_existing_id UUID;
  v_name_trimmed TEXT;
  v_name_norm_resolved TEXT;
  v_fingerprint_resolved TEXT;
  v_barcode TEXT;
  v_barcodes TEXT[];
  v_json_size INT;
BEGIN
  v_client_id := public.require_client_id(p_session_token);

  v_json_size := length(p_product_data::TEXT);
  IF v_json_size > 16384 THEN
    RETURN jsonb_build_object('status', 'error', 'error', 'product_data_too_large', 'message', 'Product data too large (max 16KB)');
  END IF;

  v_name_trimmed := TRIM(p_name);
  IF v_name_trimmed IS NULL OR length(v_name_trimmed) < 2 THEN
    RETURN jsonb_build_object('status', 'error', 'error', 'name_too_short', 'message', 'Название продукта обязательно (минимум 2 символа)');
  END IF;

  IF length(v_name_trimmed) > 200 THEN
    RETURN jsonb_build_object('status', 'error', 'error', 'name_too_long', 'message', 'Название продукта слишком длинное (max 200 символов)');
  END IF;

  v_name_norm_resolved := COALESCE(NULLIF(TRIM(p_name_norm), ''), lower(v_name_trimmed));
  v_fingerprint_resolved := COALESCE(
    NULLIF(TRIM(p_fingerprint), ''),
    public.compute_product_fingerprint(p_product_data),
    v_name_norm_resolved
  );
  v_barcodes := public.normalize_product_barcodes(p_product_data);
  v_barcode := nullif(v_barcodes[1], '');

  SELECT id INTO v_existing_id
  FROM public.shared_products
  WHERE (
      array_length(v_barcodes, 1) IS NOT NULL
      AND (barcode = ANY(v_barcodes) OR coalesce(barcodes, ARRAY[]::text[]) && v_barcodes)
    )
     OR (array_length(v_barcodes, 1) IS NULL AND fingerprint = v_fingerprint_resolved)
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'exists', 'existing_id', v_existing_id, 'message', 'Продукт уже существует в общей базе');
  END IF;

  SELECT id INTO v_existing_id
  FROM public.shared_products_pending
  WHERE status = 'pending'
    AND (
      (
        array_length(v_barcodes, 1) IS NOT NULL
        AND (barcode = ANY(v_barcodes) OR coalesce(barcodes, ARRAY[]::text[]) && v_barcodes)
      )
      OR (array_length(v_barcodes, 1) IS NULL AND fingerprint = v_fingerprint_resolved)
    )
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'pending_dup', 'pending_id', v_existing_id, 'message', 'Заявка с таким продуктом уже на модерации');
  END IF;

  SELECT curator_id INTO v_curator_id
  FROM public.clients
  WHERE id = v_client_id;

  IF v_curator_id IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'error', 'no_curator', 'message', 'У клиента не назначен куратор');
  END IF;

  INSERT INTO public.shared_products_pending
    (client_id, curator_id, product_data, name_norm, fingerprint, barcode, barcodes, status)
  VALUES
    (v_client_id, v_curator_id, p_product_data, v_name_norm_resolved, v_fingerprint_resolved, v_barcode, v_barcodes, 'pending')
  RETURNING id INTO v_pending_id;

  RETURN jsonb_build_object('status', 'pending', 'pending_id', v_pending_id, 'message', 'Заявка отправлена куратору');

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('status', 'error', 'error', 'unexpected', 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_pending_product_by_session(TEXT, TEXT, JSONB, TEXT, TEXT) TO heys_rpc;

CREATE OR REPLACE FUNCTION public.publish_shared_product_by_curator(
  p_curator_id uuid,
  p_product_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_fingerprint TEXT;
  v_name_norm TEXT;
  v_barcode TEXT;
  v_barcodes TEXT[];
  v_existing_id UUID;
  v_new_id UUID;
BEGIN
  IF p_curator_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'curator_id_required', 'message', 'curator_id обязателен');
  END IF;

  v_fingerprint := COALESCE(NULLIF(p_product_data->>'fingerprint', ''), public.compute_product_fingerprint(p_product_data));
  v_name_norm := LOWER(TRIM(REGEXP_REPLACE(p_product_data->>'name', '\s+', ' ', 'g')));
  v_barcodes := public.normalize_product_barcodes(p_product_data);
  v_barcode := nullif(v_barcodes[1], '');

  SELECT id INTO v_existing_id
  FROM shared_products
  WHERE (
      array_length(v_barcodes, 1) IS NOT NULL
      AND (barcode = ANY(v_barcodes) OR coalesce(barcodes, ARRAY[]::text[]) && v_barcodes)
    )
     OR fingerprint = v_fingerprint
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE shared_products sp
    SET
      barcode = coalesce(sp.barcode, v_barcode),
      barcodes = (
        SELECT array_agg(code ORDER BY ord)
        FROM (
          SELECT code, min(ord) AS ord
          FROM (
            SELECT unnest(coalesce(sp.barcodes, ARRAY[]::text[])) AS code, 0 AS ord
            UNION ALL
            SELECT unnest(v_barcodes) AS code, 1 AS ord
          ) s
          WHERE code IS NOT NULL AND code <> ''
          GROUP BY code
        ) g
      ),
      updated_at = now()
    WHERE sp.id = v_existing_id
      AND array_length(v_barcodes, 1) IS NOT NULL;

    RETURN jsonb_build_object('success', true, 'status', 'exists', 'id', v_existing_id, 'message', 'Продукт уже существует в общей базе');
  END IF;

  INSERT INTO shared_products (
    created_by_user_id, name, name_norm, fingerprint, barcode, barcodes,
    simple100, complex100, protein100, badfat100, goodfat100, trans100, fiber100,
    gi, harm, sodium100, omega3_100, omega6_100, nova_group, additives, nutrient_density,
    is_organic, is_whole_grain, is_fermented, is_raw,
    vitamin_a, vitamin_c, vitamin_d, vitamin_e, vitamin_k,
    vitamin_b1, vitamin_b2, vitamin_b3, vitamin_b6, vitamin_b9, vitamin_b12,
    calcium, iron, magnesium, phosphorus, potassium, zinc, selenium, iodine,
    category, portions, description
  ) VALUES (
    p_curator_id, p_product_data->>'name', v_name_norm, v_fingerprint, v_barcode, v_barcodes,
    COALESCE((p_product_data->>'simple100')::NUMERIC, 0),
    COALESCE((p_product_data->>'complex100')::NUMERIC, 0),
    COALESCE((p_product_data->>'protein100')::NUMERIC, 0),
    COALESCE((p_product_data->>'badFat100')::NUMERIC, 0),
    COALESCE((p_product_data->>'goodFat100')::NUMERIC, 0),
    COALESCE((p_product_data->>'trans100')::NUMERIC, 0),
    COALESCE((p_product_data->>'fiber100')::NUMERIC, 0),
    NULLIF(p_product_data->>'gi', '')::NUMERIC,
    NULLIF(p_product_data->>'harm', '')::NUMERIC,
    NULLIF(p_product_data->>'sodium100', '')::NUMERIC,
    NULLIF(p_product_data->>'omega3_100', '')::NUMERIC,
    NULLIF(p_product_data->>'omega6_100', '')::NUMERIC,
    NULLIF(p_product_data->>'nova_group', '')::INTEGER,
    CASE
      WHEN p_product_data->'additives' IS NULL THEN NULL
      WHEN jsonb_typeof(p_product_data->'additives') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(p_product_data->'additives'))
      ELSE NULL
    END,
    NULLIF(p_product_data->>'nutrient_density', '')::NUMERIC,
    COALESCE((p_product_data->>'is_organic')::BOOLEAN, false),
    COALESCE((p_product_data->>'is_whole_grain')::BOOLEAN, false),
    COALESCE((p_product_data->>'is_fermented')::BOOLEAN, false),
    COALESCE((p_product_data->>'is_raw')::BOOLEAN, false),
    NULLIF(p_product_data->>'vitamin_a', '')::NUMERIC,
    NULLIF(p_product_data->>'vitamin_c', '')::NUMERIC,
    NULLIF(p_product_data->>'vitamin_d', '')::NUMERIC,
    NULLIF(p_product_data->>'vitamin_e', '')::NUMERIC,
    NULLIF(p_product_data->>'vitamin_k', '')::NUMERIC,
    NULLIF(p_product_data->>'vitamin_b1', '')::NUMERIC,
    NULLIF(p_product_data->>'vitamin_b2', '')::NUMERIC,
    NULLIF(p_product_data->>'vitamin_b3', '')::NUMERIC,
    NULLIF(p_product_data->>'vitamin_b6', '')::NUMERIC,
    NULLIF(p_product_data->>'vitamin_b9', '')::NUMERIC,
    NULLIF(p_product_data->>'vitamin_b12', '')::NUMERIC,
    NULLIF(p_product_data->>'calcium', '')::NUMERIC,
    NULLIF(p_product_data->>'iron', '')::NUMERIC,
    NULLIF(p_product_data->>'magnesium', '')::NUMERIC,
    NULLIF(p_product_data->>'phosphorus', '')::NUMERIC,
    NULLIF(p_product_data->>'potassium', '')::NUMERIC,
    NULLIF(p_product_data->>'zinc', '')::NUMERIC,
    NULLIF(p_product_data->>'selenium', '')::NUMERIC,
    NULLIF(p_product_data->>'iodine', '')::NUMERIC,
    NULLIF(p_product_data->>'category', ''),
    p_product_data->'portions',
    NULLIF(p_product_data->>'description', '')
  ) RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('success', true, 'status', 'published', 'id', v_new_id, 'message', 'Продукт опубликован в общей базе');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.publish_shared_product_by_curator(uuid, jsonb) TO heys_rpc;

COMMENT ON COLUMN public.shared_products.barcodes IS 'All normalized package barcode aliases for exact scanner lookup.';
COMMENT ON COLUMN public.shared_products_pending.barcodes IS 'All normalized package barcode aliases copied from pending product_data.';
