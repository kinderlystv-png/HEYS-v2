-- ═══════════════════════════════════════════════════════════════════
-- 🔐 Subscription Write Guard (P0 Security Fix)
-- Дата: 2025-12-25
-- Цель: Server-side проверка подписки в write-функциях
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 1) Helper: Проверка может ли клиент писать данные
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.subscription_can_write(p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Может писать: trial или active
  -- Не может: none или read_only
  SELECT 
    CASE public.get_effective_subscription_status(p_client_id)
      WHEN 'active' THEN true
      WHEN 'trial' THEN true
      ELSE false
    END;
$$;

COMMENT ON FUNCTION public.subscription_can_write(uuid) IS 
  'Проверка: может ли клиент писать данные (trial/active=true, none/read_only=false)';

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 2) Обновлённый save_client_kv с проверкой подписки
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.save_client_kv(uuid, text, jsonb);
CREATE OR REPLACE FUNCTION public.save_client_kv(
  p_client_id UUID,
  p_key TEXT,
  p_value JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_curator_id UUID;
  v_can_write BOOLEAN;
  v_status TEXT;
BEGIN
  -- 🔐 P0 Security: Проверяем подписку СНАЧАЛА
  v_can_write := public.subscription_can_write(p_client_id);
  
  IF NOT v_can_write THEN
    v_status := public.get_effective_subscription_status(p_client_id);
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'subscription_required',
      'status', v_status,
      'message', 'Для записи данных необходима активная подписка'
    );
  END IF;

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

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 3) Обновлённый upsert_client_kv (алиас)
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.upsert_client_kv(uuid, text, jsonb);
CREATE OR REPLACE FUNCTION public.upsert_client_kv(
  p_client_id UUID,
  p_key TEXT,
  p_value JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.save_client_kv(p_client_id, p_key, p_value);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 4) Обновлённый batch_upsert_client_kv с проверкой подписки
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.batch_upsert_client_kv(uuid, jsonb);
CREATE OR REPLACE FUNCTION public.batch_upsert_client_kv(
  p_client_id UUID,
  p_items JSONB  -- массив [{k: "key", v: value}, ...]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_curator_id UUID;
  v_item JSONB;
  v_saved INTEGER := 0;
  v_can_write BOOLEAN;
  v_status TEXT;
BEGIN
  -- 🔐 P0 Security: Проверяем подписку СНАЧАЛА
  v_can_write := public.subscription_can_write(p_client_id);
  
  IF NOT v_can_write THEN
    v_status := public.get_effective_subscription_status(p_client_id);
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'subscription_required',
      'status', v_status,
      'saved', 0,
      'message', 'Для записи данных необходима активная подписка'
    );
  END IF;

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

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 5) Обновлённый delete_client_kv с проверкой подписки
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.delete_client_kv(uuid, text);
CREATE OR REPLACE FUNCTION public.delete_client_kv(
  p_client_id UUID,
  p_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
  v_can_write BOOLEAN;
  v_status TEXT;
BEGIN
  -- 🔐 P0 Security: Проверяем подписку СНАЧАЛА
  v_can_write := public.subscription_can_write(p_client_id);
  
  IF NOT v_can_write THEN
    v_status := public.get_effective_subscription_status(p_client_id);
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'subscription_required',
      'status', v_status,
      'message', 'Для удаления данных необходима активная подписка'
    );
  END IF;

  DELETE FROM public.client_kv_store
  WHERE client_id = p_client_id AND k = p_key;
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  
  RETURN jsonb_build_object('success', true, 'deleted', v_deleted);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 🔐 Права доступа (минимальные)
-- ═══════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.subscription_can_write(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_client_kv(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_client_kv(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.batch_upsert_client_kv(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_client_kv(uuid, text) FROM PUBLIC;

-- Только для heys_admin (Cloud Function)
GRANT EXECUTE ON FUNCTION public.subscription_can_write(uuid) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.save_client_kv(uuid, text, jsonb) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.upsert_client_kv(uuid, text, jsonb) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.batch_upsert_client_kv(uuid, jsonb) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.delete_client_kv(uuid, text) TO heys_admin;

-- ═══════════════════════════════════════════════════════════════════
-- ✅ Готово
-- ═══════════════════════════════════════════════════════════════════

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ Subscription Write Guard установлен!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '🔐 Теперь write-функции проверяют подписку:';
  RAISE NOTICE '   • save_client_kv      — требует trial/active';
  RAISE NOTICE '   • upsert_client_kv    — требует trial/active';
  RAISE NOTICE '   • batch_upsert_client_kv — требует trial/active';
  RAISE NOTICE '   • delete_client_kv    — требует trial/active';
  RAISE NOTICE '';
  RAISE NOTICE '🚫 Для статусов none/read_only вернётся:';
  RAISE NOTICE '   {success: false, error: "subscription_required", status: "..."}';
  RAISE NOTICE '';
END $$;
