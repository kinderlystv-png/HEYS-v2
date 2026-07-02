\set ON_ERROR_STOP on

BEGIN;

ALTER TABLE public.shared_products
  ADD COLUMN IF NOT EXISTS brand_fingerprint TEXT;

COMMENT ON COLUMN public.shared_products.brand_fingerprint IS
  'Optional v2 dedupe key: normalized product name + normalized brand + rounded nutrients. Legacy fingerprint stays brand-agnostic.';

DROP INDEX IF EXISTS public.idx_shared_products_fingerprint_unique;

CREATE INDEX IF NOT EXISTS idx_shared_products_fingerprint
  ON public.shared_products (fingerprint);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_products_brand_fingerprint_unique
  ON public.shared_products (brand_fingerprint)
  WHERE brand_fingerprint IS NOT NULL AND brand_fingerprint <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_products_fingerprint_brandless_unique
  ON public.shared_products (fingerprint)
  WHERE COALESCE(NULLIF(TRIM(brand), ''), '') = ''
    AND COALESCE(NULLIF(brand_fingerprint, ''), '') = '';

CREATE OR REPLACE FUNCTION public.compute_product_brand_fingerprint(p_product jsonb)
RETURNS text AS $$
DECLARE
  v_name text;
  v_brand text;
  v_combined text;
BEGIN
  v_name := lower(trim(regexp_replace(coalesce(p_product->>'name',''), '\s+', ' ', 'g')));
  v_brand := lower(trim(regexp_replace(coalesce(p_product->>'brand',''), '\s+', ' ', 'g')));

  IF v_brand = '' THEN
    RETURN NULL;
  END IF;

  v_combined := v_name || '::' || v_brand || '::' ||
    regexp_replace(round(coalesce((p_product->>'simple100')::numeric,  0), 1)::text, '\.0+$', '') || '|' ||
    regexp_replace(round(coalesce((p_product->>'complex100')::numeric, 0), 1)::text, '\.0+$', '') || '|' ||
    regexp_replace(round(coalesce((p_product->>'protein100')::numeric, 0), 1)::text, '\.0+$', '') || '|' ||
    regexp_replace(round(coalesce((p_product->>'badFat100')::numeric,  0), 1)::text, '\.0+$', '') || '|' ||
    regexp_replace(round(coalesce((p_product->>'goodFat100')::numeric, 0), 1)::text, '\.0+$', '') || '|' ||
    regexp_replace(round(coalesce((p_product->>'trans100')::numeric,   0), 1)::text, '\.0+$', '') || '|' ||
    regexp_replace(round(coalesce((p_product->>'fiber100')::numeric,   0), 1)::text, '\.0+$', '') || '|' ||
    regexp_replace(round(coalesce((p_product->>'gi')::numeric,         0), 1)::text, '\.0+$', '') || '|' ||
    regexp_replace(round(coalesce((p_product->>'harm')::numeric,       0), 1)::text, '\.0+$', '');

  RETURN encode(digest(v_combined, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.compute_product_brand_fingerprint(jsonb) IS
  'Server-side mirror of HEYS.models.computeProductBrandFingerprint: name + brand + rounded nutrients. Returns NULL for brandless products.';

GRANT EXECUTE ON FUNCTION public.compute_product_brand_fingerprint(jsonb) TO heys_rpc;

CREATE OR REPLACE FUNCTION public.publish_shared_product_by_session(
  p_session_token TEXT,
  p_product_data JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_client_id UUID;
  v_user_id UUID;
  v_fingerprint TEXT;
  v_brand TEXT;
  v_brand_fingerprint TEXT;
  v_name_norm TEXT;
  v_existing_id UUID;
  v_new_id UUID;
BEGIN
  v_client_id := public.require_client_id(p_session_token);

  SELECT user_id INTO v_user_id
  FROM clients
  WHERE id = v_client_id;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'only_curators_can_publish',
      'message', 'Только кураторы могут публиковать в общую базу. Клиенты используют create_pending_product_by_session.'
    );
  END IF;

  v_fingerprint := p_product_data->>'fingerprint';
  v_brand := NULLIF(TRIM(REGEXP_REPLACE(COALESCE(p_product_data->>'brand', ''), '\s+', ' ', 'g')), '');
  v_brand_fingerprint := NULLIF(COALESCE(p_product_data->>'brand_fingerprint', p_product_data->>'brandFingerprint'), '');
  IF v_brand IS NULL THEN
    v_brand_fingerprint := NULL;
  ELSIF v_brand_fingerprint IS NULL THEN
    v_brand_fingerprint := public.compute_product_brand_fingerprint(p_product_data || jsonb_build_object('brand', v_brand));
  END IF;
  v_name_norm := LOWER(TRIM(REGEXP_REPLACE(p_product_data->>'name', '\s+', ' ', 'g')));

  IF v_fingerprint IS NULL OR v_fingerprint = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'fingerprint_required',
      'message', 'Fingerprint обязателен'
    );
  END IF;

  IF v_brand_fingerprint IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM shared_products
    WHERE brand_fingerprint = v_brand_fingerprint
    LIMIT 1;
  ELSE
    SELECT id INTO v_existing_id
    FROM shared_products
    WHERE fingerprint = v_fingerprint
      AND COALESCE(NULLIF(TRIM(brand), ''), '') = ''
    LIMIT 1;
  END IF;

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
    brand,
    brand_fingerprint,
    name_norm,
    fingerprint,
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
    v_user_id,
    p_product_data->>'name',
    v_brand,
    v_brand_fingerprint,
    v_name_norm,
    v_fingerprint,
    COALESCE((p_product_data->>'simple100')::numeric, 0),
    COALESCE((p_product_data->>'complex100')::numeric, 0),
    COALESCE((p_product_data->>'protein100')::numeric, 0),
    COALESCE((p_product_data->>'badFat100')::numeric, 0),
    COALESCE((p_product_data->>'goodFat100')::numeric, 0),
    COALESCE((p_product_data->>'trans100')::numeric, 0),
    COALESCE((p_product_data->>'fiber100')::numeric, 0),
    (p_product_data->>'gi')::numeric,
    (p_product_data->>'harm')::numeric,
    (p_product_data->>'sodium100')::numeric,
    (p_product_data->>'omega3_100')::numeric,
    (p_product_data->>'omega6_100')::numeric,
    (p_product_data->>'nova_group')::integer,
    CASE
      WHEN p_product_data->'additives' IS NOT NULL
        AND jsonb_typeof(p_product_data->'additives') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_product_data->'additives'))
      ELSE NULL
    END,
    (p_product_data->>'nutrient_density')::numeric,
    COALESCE((p_product_data->>'is_organic')::boolean, false),
    COALESCE((p_product_data->>'is_whole_grain')::boolean, false),
    COALESCE((p_product_data->>'is_fermented')::boolean, false),
    COALESCE((p_product_data->>'is_raw')::boolean, false),
    (p_product_data->>'vitamin_a')::numeric,
    (p_product_data->>'vitamin_c')::numeric,
    (p_product_data->>'vitamin_d')::numeric,
    (p_product_data->>'vitamin_e')::numeric,
    (p_product_data->>'vitamin_k')::numeric,
    (p_product_data->>'vitamin_b1')::numeric,
    (p_product_data->>'vitamin_b2')::numeric,
    (p_product_data->>'vitamin_b3')::numeric,
    (p_product_data->>'vitamin_b6')::numeric,
    (p_product_data->>'vitamin_b9')::numeric,
    (p_product_data->>'vitamin_b12')::numeric,
    (p_product_data->>'calcium')::numeric,
    (p_product_data->>'iron')::numeric,
    (p_product_data->>'magnesium')::numeric,
    (p_product_data->>'phosphorus')::numeric,
    (p_product_data->>'potassium')::numeric,
    (p_product_data->>'zinc')::numeric,
    (p_product_data->>'selenium')::numeric,
    (p_product_data->>'iodine')::numeric,
    p_product_data->>'category',
    p_product_data->'portions',
    p_product_data->>'description'
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'published',
    'id', v_new_id,
    'message', 'Продукт опубликован в общую базу'
  );

EXCEPTION WHEN unique_violation THEN
  IF v_brand_fingerprint IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM shared_products
    WHERE brand_fingerprint = v_brand_fingerprint
    LIMIT 1;
  ELSE
    SELECT id INTO v_existing_id
    FROM shared_products
    WHERE fingerprint = v_fingerprint
      AND COALESCE(NULLIF(TRIM(brand), ''), '') = ''
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'exists',
    'id', v_existing_id,
    'message', 'Продукт уже существует (race condition handled)'
  );

WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'message', 'Ошибка при публикации продукта'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.publish_shared_product_by_curator(
  p_curator_id UUID,
  p_product_data JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_fingerprint TEXT;
  v_brand TEXT;
  v_brand_fingerprint TEXT;
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
  v_brand := NULLIF(TRIM(REGEXP_REPLACE(COALESCE(p_product_data->>'brand', ''), '\s+', ' ', 'g')), '');
  v_brand_fingerprint := NULLIF(COALESCE(p_product_data->>'brand_fingerprint', p_product_data->>'brandFingerprint'), '');
  IF v_brand IS NULL THEN
    v_brand_fingerprint := NULL;
  ELSIF v_brand_fingerprint IS NULL THEN
    v_brand_fingerprint := public.compute_product_brand_fingerprint(p_product_data || jsonb_build_object('brand', v_brand));
  END IF;
  v_name_norm := LOWER(TRIM(REGEXP_REPLACE(p_product_data->>'name', '\s+', ' ', 'g')));
  v_barcodes := public.normalize_product_barcodes(p_product_data);
  v_barcode := NULLIF(v_barcodes[1], '');

  SELECT id INTO v_existing_id
  FROM shared_products
  WHERE array_length(v_barcodes, 1) IS NOT NULL
    AND (barcode = ANY(v_barcodes) OR coalesce(barcodes, ARRAY[]::text[]) && v_barcodes)
  LIMIT 1;

  IF v_existing_id IS NULL AND v_brand_fingerprint IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM shared_products
    WHERE brand_fingerprint = v_brand_fingerprint
    LIMIT 1;
  END IF;

  IF v_existing_id IS NULL AND v_brand_fingerprint IS NULL THEN
    SELECT id INTO v_existing_id
    FROM shared_products
    WHERE fingerprint = v_fingerprint
      AND COALESCE(NULLIF(TRIM(brand), ''), '') = ''
    LIMIT 1;
  END IF;

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
    created_by_user_id, name, brand, brand_fingerprint, name_norm, fingerprint, barcode, barcodes,
    simple100, complex100, protein100, badfat100, goodfat100, trans100, fiber100,
    gi, harm, sodium100, omega3_100, omega6_100, nova_group, additives, nutrient_density,
    is_organic, is_whole_grain, is_fermented, is_raw,
    vitamin_a, vitamin_c, vitamin_d, vitamin_e, vitamin_k,
    vitamin_b1, vitamin_b2, vitamin_b3, vitamin_b6, vitamin_b9, vitamin_b12,
    calcium, iron, magnesium, phosphorus, potassium, zinc, selenium, iodine,
    category, portions, description
  ) VALUES (
    p_curator_id,
    p_product_data->>'name',
    v_brand,
    v_brand_fingerprint,
    v_name_norm,
    v_fingerprint,
    v_barcode,
    v_barcodes,
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

EXCEPTION WHEN unique_violation THEN
  IF v_brand_fingerprint IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM shared_products
    WHERE brand_fingerprint = v_brand_fingerprint
    LIMIT 1;
  ELSE
    SELECT id INTO v_existing_id
    FROM shared_products
    WHERE fingerprint = v_fingerprint
      AND COALESCE(NULLIF(TRIM(brand), ''), '') = ''
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object('success', true, 'status', 'exists', 'id', v_existing_id, 'message', 'Продукт уже существует (race condition handled)');
END;
$function$;

COMMIT;
