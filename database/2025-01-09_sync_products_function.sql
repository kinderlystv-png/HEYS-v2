-- ═══════════════════════════════════════════════════════════════════════════════
-- sync_shared_products_by_session — Синхронизация shared_products в client_kv_store
-- ═══════════════════════════════════════════════════════════════════════════════
-- Версия: 1.0.0
-- Дата: 2025-01-09
-- 
-- Назначение:
--   Копирует все продукты из shared_products в heys_products клиента,
--   используя правильные трансформации полей (fat100 = badfat100 + goodfat100 + trans100 и т.д.)
--
-- Использование:
--   SELECT sync_shared_products_by_session('session_token_here');
--
-- Безопасность:
--   - SECURITY DEFINER с валидацией сессии через require_client_id
--   - Клиент может синхронизировать только свои данные
--   - Идемпотентная операция (можно вызывать повторно)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.sync_shared_products_by_session(p_session_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_products_count INT;
  v_products_json JSONB;
  v_existing_count INT;
BEGIN
  -- Валидация сессии и получение client_id
  v_client_id := public.require_client_id(p_session_token);
  
  -- Считаем количество продуктов в shared_products
  SELECT COUNT(*) INTO v_products_count FROM public.shared_products;
  
  IF v_products_count = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'No products to sync',
      'products_count', 0
    );
  END IF;
  
  -- Формируем JSON массив продуктов с правильными трансформациями
  -- fat100 = badfat100 + goodfat100 + trans100
  -- carbs100 = simple100 + complex100
  -- kcal100 = protein100*4 + carbs100*4 + fat100*9
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', sp.id::TEXT,
      'name', sp.name,
      'kcal100', sp.kcal100,
      'protein100', sp.protein100,
      'carbs100', COALESCE(sp.simple100, 0) + COALESCE(sp.complex100, 0),
      'fat100', COALESCE(sp.bad_fat100, 0) + COALESCE(sp.good_fat100, 0) + COALESCE(sp.trans100, 0),
      'simple100', COALESCE(sp.simple100, 0),
      'complex100', COALESCE(sp.complex100, 0),
      'goodFat100', COALESCE(sp.good_fat100, 0),
      'badFat100', COALESCE(sp.bad_fat100, 0),
      'trans100', COALESCE(sp.trans100, 0),
      'fiber100', COALESCE(sp.fiber100, 0),
      'gi', COALESCE(sp.gi, 50),
      'harm', COALESCE(sp.harm, 0),
      'category', COALESCE(sp.category, 'Другое'),
      'portions', COALESCE(sp.portions, '[]'::JSONB),
      'barcode', sp.barcode,
      'shared', true
    )
  )
  INTO v_products_json
  FROM public.shared_products sp;

  -- Upsert в client_kv_store (заменяем heys_products полностью)
  INSERT INTO public.client_kv_store (client_id, k, v, updated_at)
  VALUES (
    v_client_id,
    'heys_products',
    v_products_json,
    NOW()
  )
  ON CONFLICT (client_id, k) 
  DO UPDATE SET 
    v = EXCLUDED.v,
    updated_at = NOW();

  -- Проверяем результат
  SELECT jsonb_array_length(v) INTO v_existing_count
  FROM public.client_kv_store
  WHERE client_id = v_client_id AND k = 'heys_products';

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Synced %s products to client', v_existing_count),
    'products_count', v_existing_count,
    'client_id', v_client_id
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'error_code', SQLSTATE
    );
END;
$$;

COMMENT ON FUNCTION public.sync_shared_products_by_session(TEXT) IS 
'Синхронизирует все продукты из shared_products в heys_products клиента. 
Использует session_token для безопасной идентификации. 
Трансформирует поля (fat100, carbs100) для совместимости с клиентским форматом.';

-- Права доступа
GRANT EXECUTE ON FUNCTION public.sync_shared_products_by_session(TEXT) TO heys_rpc;
