-- ═══════════════════════════════════════════════════════════════════
-- 🌐 HEYS: RPC функция для публикации продукта куратором
-- Created: 2025-01-01
-- Purpose: Публикация продуктов кураторами через RPC (JWT auth)
-- Причина: Кураторы используют JWT, не session_token
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- 📝 publish_shared_product_by_curator — публикация продукта куратором
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.publish_shared_product_by_curator(
  p_curator_id UUID,
  p_product_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  
  -- 2. Извлекаем fingerprint и name_norm из product_data
  v_fingerprint := p_product_data->>'fingerprint';
  v_name_norm := LOWER(TRIM(REGEXP_REPLACE(p_product_data->>'name', '\s+', ' ', 'g')));
  
  IF v_fingerprint IS NULL OR v_fingerprint = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'fingerprint_required',
      'message', 'Fingerprint обязателен'
    );
  END IF;
  
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
  
  -- 4. Вставляем новый продукт (включая 29 extended полей)
  INSERT INTO shared_products (
    created_by_user_id,
    name,
    name_norm,
    fingerprint,
    -- Базовые нутриенты (12)
    simple100,
    complex100,
    protein100,
    badfat100,
    goodfat100,
    trans100,
    fiber100,
    gi,
    harm,
    category,
    portions,
    description,
    -- Extended нутриенты (5)
    sodium100,
    omega3_100,
    omega6_100,
    nova_group,
    additives,
    -- Nutrient density (1)
    nutrient_density,
    -- Флаги качества (4)
    is_organic,
    is_whole_grain,
    is_fermented,
    is_raw,
    -- Витамины (11)
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
    -- Минералы (8)
    calcium,
    iron,
    magnesium,
    phosphorus,
    potassium,
    zinc,
    selenium,
    iodine
  ) VALUES (
    p_curator_id,
    p_product_data->>'name',
    v_name_norm,
    v_fingerprint,
    -- Базовые нутриенты
    COALESCE((p_product_data->>'simple100')::numeric, 0),
    COALESCE((p_product_data->>'complex100')::numeric, 0),
    COALESCE((p_product_data->>'protein100')::numeric, 0),
    COALESCE((p_product_data->>'badFat100')::numeric, 0),
    COALESCE((p_product_data->>'goodFat100')::numeric, 0),
    COALESCE((p_product_data->>'trans100')::numeric, 0),
    COALESCE((p_product_data->>'fiber100')::numeric, 0),
    (p_product_data->>'gi')::numeric,
    (p_product_data->>'harm')::numeric,
    p_product_data->>'category',
    (p_product_data->'portions')::jsonb,
    p_product_data->>'description',
    -- Extended нутриенты (NULL если не переданы)
    (p_product_data->>'sodium100')::numeric,
    (p_product_data->>'omega3_100')::numeric,
    (p_product_data->>'omega6_100')::numeric,
    (p_product_data->>'nova_group')::integer,
    CASE 
      WHEN p_product_data->'additives' IS NOT NULL 
      THEN ARRAY(SELECT jsonb_array_elements_text(p_product_data->'additives'))
      ELSE NULL
    END,
    -- Nutrient density
    (p_product_data->>'nutrient_density')::numeric,
    -- Флаги качества
    (p_product_data->>'is_organic')::boolean,
    (p_product_data->>'is_whole_grain')::boolean,
    (p_product_data->>'is_fermented')::boolean,
    (p_product_data->>'is_raw')::boolean,
    -- Витамины
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
    -- Минералы
    (p_product_data->>'calcium')::numeric,
    (p_product_data->>'iron')::numeric,
    (p_product_data->>'magnesium')::numeric,
    (p_product_data->>'phosphorus')::numeric,
    (p_product_data->>'potassium')::numeric,
    (p_product_data->>'zinc')::numeric,
    (p_product_data->>'selenium')::numeric,
    (p_product_data->>'iodine')::numeric
  )
  RETURNING id INTO v_new_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'status', 'published',
    'id', v_new_id,
    'message', 'Продукт опубликован в общую базу'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'db_error',
    'message', SQLERRM
  );
END;
$$;

COMMENT ON FUNCTION public.publish_shared_product_by_curator(UUID, JSONB) IS 
'Публикация продукта куратором в shared_products. 
Использует curator_id (UUID) напрямую — для JWT-авторизованных кураторов.
P3: REST read-only, используем RPC.';

-- Права
GRANT EXECUTE ON FUNCTION public.publish_shared_product_by_curator(UUID, JSONB) TO heys_rpc;

-- Отзываем у PUBLIC
REVOKE ALL ON FUNCTION public.publish_shared_product_by_curator(UUID, JSONB) FROM PUBLIC;

DO $$
BEGIN
  RAISE NOTICE '✅ publish_shared_product_by_curator created successfully';
END $$;
