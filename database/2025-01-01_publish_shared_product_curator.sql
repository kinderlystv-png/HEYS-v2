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
  
  -- 4. Вставляем новый продукт
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
    category,
    portions,
    description
  ) VALUES (
    p_curator_id,
    p_product_data->>'name',
    v_name_norm,
    v_fingerprint,
    COALESCE((p_product_data->>'simple100')::numeric, 0),
    COALESCE((p_product_data->>'complex100')::numeric, 0),
    COALESCE((p_product_data->>'protein100')::numeric, 0),
    COALESCE((p_product_data->>'badFat100')::numeric, 0),
    COALESCE((p_product_data->>'goodFat100')::numeric, 0),
    COALESCE((p_product_data->>'trans100')::numeric, 0),
    COALESCE((p_product_data->>'fiber100')::numeric, 0),
    (p_product_data->>'gi')::integer,
    (p_product_data->>'harm')::integer,
    p_product_data->>'category',
    (p_product_data->'portions')::jsonb,
    p_product_data->>'description'
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
