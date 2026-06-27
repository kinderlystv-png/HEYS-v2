-- HEYS: barcode support for shared products and pending moderation queue.
-- Makes barcode a first-class lookup key alongside fingerprint/name_norm.

ALTER TABLE public.shared_products
  ADD COLUMN IF NOT EXISTS barcode text;

ALTER TABLE public.shared_products_pending
  ADD COLUMN IF NOT EXISTS barcode text;

WITH normalized AS (
  SELECT
    id,
    upper(regexp_replace(coalesce(barcode, ''), '[^0-9A-Za-z]', '', 'g')) AS cleaned
  FROM public.shared_products
  WHERE barcode IS NOT NULL
)
UPDATE public.shared_products sp
SET barcode = CASE
  WHEN length(normalized.cleaned) BETWEEN 6 AND 32 THEN normalized.cleaned
  ELSE NULL
END
FROM normalized
WHERE sp.id = normalized.id
  AND sp.barcode IS DISTINCT FROM CASE
    WHEN length(normalized.cleaned) BETWEEN 6 AND 32 THEN normalized.cleaned
    ELSE NULL
  END;

WITH normalized AS (
  SELECT
    id,
    upper(regexp_replace(coalesce(NULLIF(barcode, ''), product_data->>'barcode', ''), '[^0-9A-Za-z]', '', 'g')) AS cleaned
  FROM public.shared_products_pending
  WHERE coalesce(NULLIF(barcode, ''), product_data->>'barcode') IS NOT NULL
)
UPDATE public.shared_products_pending spp
SET barcode = CASE
  WHEN length(normalized.cleaned) BETWEEN 6 AND 32 THEN normalized.cleaned
  ELSE NULL
END
FROM normalized
WHERE spp.id = normalized.id
  AND spp.barcode IS DISTINCT FROM CASE
    WHEN length(normalized.cleaned) BETWEEN 6 AND 32 THEN normalized.cleaned
    ELSE NULL
  END;

CREATE INDEX IF NOT EXISTS idx_shared_products_barcode
  ON public.shared_products(barcode)
  WHERE barcode IS NOT NULL AND barcode <> '';

CREATE INDEX IF NOT EXISTS idx_shared_products_pending_barcode
  ON public.shared_products_pending(barcode)
  WHERE barcode IS NOT NULL AND barcode <> '';

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
  v_json_size INT;
BEGIN
  v_client_id := public.require_client_id(p_session_token);

  v_json_size := length(p_product_data::TEXT);
  IF v_json_size > 16384 THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'product_data_too_large',
      'message', 'Product data too large (max 16KB)'
    );
  END IF;

  v_name_trimmed := TRIM(p_name);
  IF v_name_trimmed IS NULL OR length(v_name_trimmed) < 2 THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'name_too_short',
      'message', 'Название продукта обязательно (минимум 2 символа)'
    );
  END IF;

  IF length(v_name_trimmed) > 200 THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'name_too_long',
      'message', 'Название продукта слишком длинное (max 200 символов)'
    );
  END IF;

  v_name_norm_resolved := COALESCE(NULLIF(TRIM(p_name_norm), ''), lower(v_name_trimmed));
  v_fingerprint_resolved := COALESCE(
    NULLIF(TRIM(p_fingerprint), ''),
    public.compute_product_fingerprint(p_product_data),
    v_name_norm_resolved
  );
  v_barcode := upper(regexp_replace(coalesce(p_product_data->>'barcode', ''), '[^0-9A-Za-z]', '', 'g'));
  IF length(v_barcode) < 6 OR length(v_barcode) > 32 THEN
    v_barcode := NULL;
  END IF;

  SELECT id INTO v_existing_id
  FROM public.shared_products
  WHERE (v_barcode IS NOT NULL AND barcode = v_barcode)
     OR fingerprint = v_fingerprint_resolved
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'exists',
      'existing_id', v_existing_id,
      'message', 'Продукт уже существует в общей базе'
    );
  END IF;

  SELECT id INTO v_existing_id
  FROM public.shared_products_pending
  WHERE status = 'pending'
    AND (
      (v_barcode IS NOT NULL AND barcode = v_barcode)
      OR fingerprint = v_fingerprint_resolved
    )
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'pending_dup',
      'pending_id', v_existing_id,
      'message', 'Заявка с таким продуктом уже на модерации'
    );
  END IF;

  SELECT curator_id INTO v_curator_id
  FROM public.clients
  WHERE id = v_client_id;

  IF v_curator_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'no_curator',
      'message', 'У клиента не назначен куратор'
    );
  END IF;

  INSERT INTO public.shared_products_pending
    (client_id, curator_id, product_data, name_norm, fingerprint, barcode, status)
  VALUES
    (v_client_id, v_curator_id, p_product_data, v_name_norm_resolved, v_fingerprint_resolved, v_barcode, 'pending')
  RETURNING id INTO v_pending_id;

  RETURN jsonb_build_object(
    'status', 'pending',
    'pending_id', v_pending_id,
    'message', 'Заявка отправлена куратору'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'status', 'error',
    'error', 'unexpected',
    'message', SQLERRM
  );
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
  v_existing_id UUID;
  v_new_id UUID;
BEGIN
  IF p_curator_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'curator_id_required',
      'message', 'curator_id обязателен'
    );
  END IF;

  v_fingerprint := COALESCE(
    NULLIF(p_product_data->>'fingerprint', ''),
    public.compute_product_fingerprint(p_product_data)
  );
  v_name_norm := LOWER(TRIM(REGEXP_REPLACE(p_product_data->>'name', '\s+', ' ', 'g')));
  v_barcode := upper(regexp_replace(coalesce(p_product_data->>'barcode', ''), '[^0-9A-Za-z]', '', 'g'));
  IF length(v_barcode) < 6 OR length(v_barcode) > 32 THEN
    v_barcode := NULL;
  END IF;

  SELECT id INTO v_existing_id
  FROM shared_products
  WHERE (v_barcode IS NOT NULL AND barcode = v_barcode)
     OR fingerprint = v_fingerprint
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'exists',
      'id', v_existing_id,
      'message', 'Продукт уже существует в общей базе'
    );
  END IF;

  INSERT INTO shared_products (
    created_by_user_id,
    name,
    name_norm,
    fingerprint,
    barcode,
    simple100,
    complex100,
    protein100,
    badfat100,
    goodfat100,
    trans100,
    fiber100,
    gi,
    harm,
    sodium100,
    omega3_100,
    omega6_100,
    nova_group,
    additives,
    nutrient_density,
    is_organic,
    is_whole_grain,
    is_fermented,
    is_raw,
    vitamin_a,
    vitamin_c,
    vitamin_d,
    vitamin_e,
    vitamin_k,
    vitamin_b1,
    vitamin_b2,
    vitamin_b3,
    vitamin_b6,
    vitamin_b9,
    vitamin_b12,
    calcium,
    iron,
    magnesium,
    phosphorus,
    potassium,
    zinc,
    selenium,
    iodine,
    category,
    portions,
    description
  ) VALUES (
    p_curator_id,
    p_product_data->>'name',
    v_name_norm,
    v_fingerprint,
    v_barcode,
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
      WHEN jsonb_typeof(p_product_data->'additives') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(p_product_data->'additives'))
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

  RETURN jsonb_build_object(
    'success', true,
    'status', 'published',
    'id', v_new_id,
    'message', 'Продукт опубликован в общей базе'
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.publish_shared_product_by_curator(uuid, jsonb) TO heys_rpc;

COMMENT ON COLUMN public.shared_products.barcode IS 'Normalized package barcode (EAN/UPC/code), exact lookup key for scanner flow.';
COMMENT ON COLUMN public.shared_products_pending.barcode IS 'Normalized package barcode copied from pending product_data for moderation dedup/search.';
