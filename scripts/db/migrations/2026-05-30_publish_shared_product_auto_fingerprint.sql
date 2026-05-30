-- ═══════════════════════════════════════════════════════════════════
-- 🔧 publish_shared_product_by_curator: auto-derive fingerprint
-- Date: 2026-05-30
-- Context:
--   До этого функция требовала fingerprint в input и падала с
--   'fingerprint_required' если он отсутствовал. Bulk approve
--   (approve_pending_products_bulk) передавал sweep'нутые product_data
--   без fingerprint → весь bulk-путь не работал (incident 2026-05-30).
--
-- Изменение:
--   fingerprint теперь server-derived. Если в input передан — используем,
--   если нет — вычисляем через compute_product_fingerprint (single source
--   of truth). Удалена 'fingerprint_required' ветка.
-- ═══════════════════════════════════════════════════════════════════

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
  v_existing_id UUID;
  v_new_id UUID;
BEGIN
  -- 1. Проверяем: curator_id передан?
  IF p_curator_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'curator_id_required',
      'message', 'curator_id обязателен'
    );
  END IF;

  -- 2. Извлекаем fingerprint (auto-derive если нет) и name_norm
  v_fingerprint := COALESCE(
    NULLIF(p_product_data->>'fingerprint', ''),
    public.compute_product_fingerprint(p_product_data)
  );
  v_name_norm := LOWER(TRIM(REGEXP_REPLACE(p_product_data->>'name', '\s+', ' ', 'g')));

  -- 3. Проверяем: продукт уже существует?
  SELECT id INTO v_existing_id
  FROM shared_products
  WHERE fingerprint = v_fingerprint
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'exists',
      'id', v_existing_id,
      'message', 'Продукт уже существует в общей базе'
    );
  END IF;

  -- 4. Вставляем новый продукт с расширенными полями
  INSERT INTO shared_products (
    created_by_user_id,
    name,
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
    p_curator_id,
    p_product_data->>'name',
    v_name_norm,
    v_fingerprint,
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

COMMENT ON FUNCTION public.publish_shared_product_by_curator(uuid, jsonb) IS
  'Публикация продукта в shared_products куратором. Fingerprint server-derived: если в product_data нет — вычисляется через compute_product_fingerprint (2026-05-30, fix incident bulk approve).';

-- ═══════════════════════════════════════════════════════════════════
-- ✅ Verification: вызов без fingerprint должен теперь работать
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('public.publish_shared_product_by_curator'::regproc);
  IF v_def LIKE '%fingerprint_required%' THEN
    RAISE EXCEPTION 'Old fingerprint_required branch still present';
  END IF;
  IF position('compute_product_fingerprint' IN v_def) = 0 THEN
    RAISE EXCEPTION 'compute_product_fingerprint reference missing in updated function';
  END IF;
  RAISE NOTICE '✅ publish_shared_product_by_curator: auto-derive ветка установлена';
END $$;
