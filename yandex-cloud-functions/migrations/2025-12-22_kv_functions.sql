-- ═══════════════════════════════════════════════════════════════════════════════
-- 🔑 RPC функции для client_kv_store
-- ═══════════════════════════════════════════════════════════════════════════════
-- Дата: 2025-12-22
-- Описание: Функции для работы с key-value хранилищем клиентов через RPC
-- ═══════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────────
-- 📖 get_client_kv - получить одно или все значения
-- ────────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_client_kv(uuid, text);
CREATE OR REPLACE FUNCTION public.get_client_kv(
  p_client_id UUID,
  p_key TEXT DEFAULT NULL
)
RETURNS TABLE(
  k TEXT,
  v JSONB,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_key IS NOT NULL THEN
    -- Получить конкретный ключ
    RETURN QUERY
    SELECT kv.k, kv.v, kv.updated_at
    FROM public.client_kv_store kv
    WHERE kv.client_id = p_client_id AND kv.k = p_key;
  ELSE
    -- Получить все ключи клиента
    RETURN QUERY
    SELECT kv.k, kv.v, kv.updated_at
    FROM public.client_kv_store kv
    WHERE kv.client_id = p_client_id
    ORDER BY kv.k;
  END IF;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────────
-- 💾 save_client_kv - сохранить значение (INSERT или UPDATE)
-- ────────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.save_client_kv(uuid, text, jsonb);
CREATE OR REPLACE FUNCTION public.save_client_kv(
  p_client_id UUID,
  p_key TEXT,
  p_value JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_curator_id UUID;
  v_result JSONB;
BEGIN
  -- Получаем curator_id клиента
  SELECT curator_id INTO v_curator_id
  FROM public.clients
  WHERE id = p_client_id;
  
  IF v_curator_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'client_not_found');
  END IF;
  
  -- UPSERT: вставляем или обновляем
  INSERT INTO public.client_kv_store (user_id, client_id, k, v, updated_at)
  VALUES (v_curator_id, p_client_id, p_key, p_value, timezone('utc', now()))
  ON CONFLICT (client_id, k)
  DO UPDATE SET 
    v = EXCLUDED.v,
    updated_at = timezone('utc', now());
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────────
-- 🔄 upsert_client_kv - алиас для save_client_kv (для совместимости)
-- ────────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.upsert_client_kv(uuid, text, jsonb);
CREATE OR REPLACE FUNCTION public.upsert_client_kv(
  p_client_id UUID,
  p_key TEXT,
  p_value JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN public.save_client_kv(p_client_id, p_key, p_value);
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────────
-- 📦 batch_upsert_client_kv - пакетное сохранение
-- ────────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.batch_upsert_client_kv(uuid, jsonb);
CREATE OR REPLACE FUNCTION public.batch_upsert_client_kv(
  p_client_id UUID,
  p_items JSONB  -- массив [{k: "key", v: value}, ...]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_curator_id UUID;
  v_item JSONB;
  v_saved INTEGER := 0;
BEGIN
  -- Получаем curator_id клиента
  SELECT curator_id INTO v_curator_id
  FROM public.clients
  WHERE id = p_client_id;
  
  IF v_curator_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'client_not_found', 'saved', 0);
  END IF;
  
  -- Обрабатываем каждый элемент
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.client_kv_store (user_id, client_id, k, v, updated_at)
    VALUES (
      v_curator_id, 
      p_client_id, 
      v_item->>'k', 
      v_item->'v', 
      timezone('utc', now())
    )
    ON CONFLICT (client_id, k)
    DO UPDATE SET 
      v = EXCLUDED.v,
      updated_at = timezone('utc', now());
    
    v_saved := v_saved + 1;
  END LOOP;
  
  RETURN jsonb_build_object('success', true, 'saved', v_saved);
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────────
-- 🗑️ delete_client_kv - удалить ключ
-- ────────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.delete_client_kv(uuid, text);
CREATE OR REPLACE FUNCTION public.delete_client_kv(
  p_client_id UUID,
  p_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.client_kv_store
  WHERE client_id = p_client_id AND k = p_key;
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  
  RETURN jsonb_build_object('success', true, 'deleted', v_deleted);
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────────
-- 🔐 Права доступа
-- ────────────────────────────────────────────────────────────────────────────────

-- Revoke all
REVOKE ALL ON FUNCTION public.get_client_kv(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_client_kv(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_client_kv(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.batch_upsert_client_kv(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_client_kv(uuid, text) FROM PUBLIC;

-- Grant to heys_admin (наш сервисный пользователь)
GRANT EXECUTE ON FUNCTION public.get_client_kv(uuid, text) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.save_client_kv(uuid, text, jsonb) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.upsert_client_kv(uuid, text, jsonb) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.batch_upsert_client_kv(uuid, jsonb) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.delete_client_kv(uuid, text) TO heys_admin;

-- ════════════════════════════════════════════════════════════════════════════
-- ✅ Проверка успешности миграции
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_functions TEXT[] := ARRAY[
      'get_client_kv', 
      'save_client_kv', 
      'upsert_client_kv', 
      'batch_upsert_client_kv',
      'delete_client_kv'
    ];
    f TEXT;
BEGIN
    FOREACH f IN ARRAY v_functions LOOP
        IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = f) THEN
            RAISE NOTICE '✅ Функция %() создана', f;
        ELSE
            RAISE NOTICE '❌ Функция %() НЕ найдена', f;
        END IF;
    END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 🎉 Миграция KV функций завершена!
-- ════════════════════════════════════════════════════════════════════════════
