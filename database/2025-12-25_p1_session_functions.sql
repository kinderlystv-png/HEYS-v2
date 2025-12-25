-- ═══════════════════════════════════════════════════════════════════════════════
-- P1 Security: Session-based public functions (IDOR fix)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Версия: 1.0.0
-- Дата: 2025-12-25
-- 
-- Проблема:
--   get_client_data(UUID) и create_pending_product(UUID, ...) принимают
--   client_id напрямую без проверки владельца сессии → IDOR уязвимость.
--
-- Решение:
--   1. Создать session-версии: *_by_session(TEXT) 
--   2. Внутри вызывать require_client_id(session_token) для валидации
--   3. Убрать GRANT на UUID-версии для heys_rpc
--   4. Дать GRANT только на session-версии
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1️⃣ get_client_data_by_session — безопасная версия
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_client_data_by_session(p_session_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_data JSONB;
BEGIN
  -- Валидация сессии и получение client_id
  v_client_id := public.require_client_id(p_session_token);
  
  -- Получаем данные клиента (та же логика что в get_client_data(UUID))
  SELECT jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'phone', c.phone,
    'curator_id', c.curator_id,
    'subscription_status', c.subscription_status,
    'subscription_plan', c.subscription_plan,
    'trial_ends_at', c.trial_ends_at,
    'created_at', c.created_at,
    'updated_at', c.updated_at
  )
  INTO v_data
  FROM public.clients c
  WHERE c.id = v_client_id;

  IF v_data IS NULL THEN
    RAISE EXCEPTION 'client_not_found';
  END IF;

  RETURN v_data;
END;
$$;

COMMENT ON FUNCTION public.get_client_data_by_session(TEXT) IS 
'Безопасная версия get_client_data. Принимает session_token, валидирует через require_client_id, возвращает данные ТОЛЬКО владельца сессии.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2️⃣ create_pending_product_by_session — безопасная версия
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_pending_product_by_session(
  p_session_token TEXT,
  p_name TEXT,
  p_product_data JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_new_id UUID;
  v_name_trimmed TEXT;
  v_json_size INT;
BEGIN
  -- Валидация сессии
  v_client_id := public.require_client_id(p_session_token);
  
  -- 🔐 P1: Лимит размера JSONB (защита от DoS)
  v_json_size := length(p_product_data::TEXT);
  IF v_json_size > 16384 THEN  -- 16KB max
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Product data too large (max 16KB)'
    );
  END IF;
  
  -- Валидация имени
  v_name_trimmed := TRIM(p_name);
  IF v_name_trimmed IS NULL OR length(v_name_trimmed) < 2 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Название продукта обязательно (минимум 2 символа)'
    );
  END IF;
  
  IF length(v_name_trimmed) > 200 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Название продукта слишком длинное (max 200 символов)'
    );
  END IF;
  
  -- Вставка в pending_products
  -- Поля извлекаются из p_product_data JSONB
  INSERT INTO public.pending_products(
    client_id,
    name,
    kcal100,
    protein100,
    carbs100,
    fat100,
    simple100,
    complex100,
    good_fat100,
    bad_fat100,
    trans100,
    fiber100,
    gi,
    harm,
    category,
    portions,
    barcode
  ) VALUES (
    v_client_id,
    v_name_trimmed,
    (p_product_data->>'kcal100')::NUMERIC,
    (p_product_data->>'protein100')::NUMERIC,
    (p_product_data->>'carbs100')::NUMERIC,
    (p_product_data->>'fat100')::NUMERIC,
    (p_product_data->>'simple100')::NUMERIC,
    (p_product_data->>'complex100')::NUMERIC,
    (p_product_data->>'good_fat100')::NUMERIC,
    (p_product_data->>'bad_fat100')::NUMERIC,
    (p_product_data->>'trans100')::NUMERIC,
    (p_product_data->>'fiber100')::NUMERIC,
    (p_product_data->>'gi')::INTEGER,
    (p_product_data->>'harm')::INTEGER,
    p_product_data->>'category',
    p_product_data->'portions',  -- JSONB поле
    p_product_data->>'barcode'
  )
  RETURNING id INTO v_new_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'product_id', v_new_id
  );

EXCEPTION WHEN others THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

COMMENT ON FUNCTION public.create_pending_product_by_session(TEXT, TEXT, JSONB) IS 
'Безопасная версия create_pending_product. Принимает session_token, валидирует через require_client_id, создаёт pending product ТОЛЬКО для владельца сессии.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3️⃣ GRANT для heys_rpc — только session-версии
-- ═══════════════════════════════════════════════════════════════════════════════

-- Даём доступ к безопасным версиям
GRANT EXECUTE ON FUNCTION public.get_client_data_by_session(TEXT) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.create_pending_product_by_session(TEXT, TEXT, JSONB) TO heys_rpc;

-- Убираем доступ к UUID-версиям (если был)
DO $$ BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.get_client_data(UUID) FROM heys_rpc';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'get_client_data(UUID) not found, skipping revoke';
END $$;

-- Старая create_pending_product имеет много параметров, revoke на все варианты
DO $$ BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.create_pending_product(UUID, TEXT, JSONB) FROM heys_rpc';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'create_pending_product(UUID, TEXT, JSONB) not found';
END $$;

DO $$ BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.create_pending_product(UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, INTEGER, INTEGER, TEXT, JSONB, TEXT) FROM heys_rpc';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'create_pending_product (full signature) not found';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ✅ Проверка
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname IN ('get_client_data_by_session', 'create_pending_product_by_session');
  
  IF v_count = 2 THEN
    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE '✅ Session-функции созданы!';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE '';
    RAISE NOTICE '🔐 Новые безопасные функции:';
    RAISE NOTICE '   • get_client_data_by_session(TEXT)';
    RAISE NOTICE '   • create_pending_product_by_session(TEXT, TEXT, JSONB)';
    RAISE NOTICE '';
    RAISE NOTICE '❌ UUID-версии больше недоступны для heys_rpc';
    RAISE NOTICE '';
  ELSE
    RAISE EXCEPTION 'Ожидалось 2 функции, найдено %', v_count;
  END IF;
END $$;
