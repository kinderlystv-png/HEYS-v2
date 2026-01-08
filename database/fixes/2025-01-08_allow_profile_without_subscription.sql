-- ═══════════════════════════════════════════════════════════════════
-- 🔧 Fix: Разрешить сохранение профиля без подписки
-- Дата: 2025-01-08
-- Проблема: Новые клиенты со статусом 'none' не могут сохранить профиль
--           т.к. subscription_can_write() возвращает false
-- Решение: Разрешить сохранение критичных ключей (profile, consents) без подписки
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 1) Обновлённая subscription_can_write — разрешает критичные ключи
-- ═══════════════════════════════════════════════════════════════════

-- Список ключей которые можно сохранять без подписки
CREATE OR REPLACE FUNCTION public.is_always_writable_key(p_key TEXT)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  -- Эти ключи критичны для работы приложения и могут сохраняться без подписки
  SELECT p_key = ANY(ARRAY[
    'heys_profile',           -- Профиль пользователя (персональные данные)
    'heys_norms',             -- Нормы питания
    'heys_consents',          -- Согласия (юридически важно!)
    'heys_onboarding_complete', -- Флаг завершения онбординга
    'heys_tour_completed'     -- Флаг завершения тура
  ]);
$$;

COMMENT ON FUNCTION public.is_always_writable_key(text) IS 
  'Проверка: можно ли сохранять этот ключ без активной подписки (profile, consents, etc.)';

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 2) Обновлённая batch_upsert_client_kv_by_session — разрешает критичные ключи
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.batch_upsert_client_kv_by_session(
  p_session_token TEXT,
  p_items JSONB  -- [{k: "key1", v: {...}}, {k: "key2", v: {...}}]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_item JSONB;
  v_key TEXT;
  v_value JSONB;
  v_saved INT := 0;
  v_skipped INT := 0;
  v_can_write BOOLEAN;
BEGIN
  -- 1. Получить client_id из сессии (безопасно!)
  v_client_id := public.require_client_id(p_session_token);
  
  -- 2. Проверить общее право на запись
  v_can_write := public.subscription_can_write(v_client_id);
  
  -- 3. Итерировать по массиву items
  FOR v_item IN SELECT jsonb_array_elements(p_items)
  LOOP
    v_key := v_item->>'k';
    v_value := v_item->'v';
    
    IF v_key IS NOT NULL THEN
      -- 🆕 Разрешаем критичные ключи даже без подписки
      IF v_can_write OR public.is_always_writable_key(v_key) THEN
        INSERT INTO client_kv_store (client_id, k, v, updated_at)
        VALUES (v_client_id, v_key, v_value, NOW())
        ON CONFLICT (client_id, k) DO UPDATE SET
          v = EXCLUDED.v,
          updated_at = NOW();
        
        v_saved := v_saved + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
    END IF;
  END LOOP;
  
  -- Если всё заскипано — возвращаем ошибку, иначе успех
  IF v_saved = 0 AND v_skipped > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'saved', 0,
      'skipped', v_skipped,
      'error', 'subscription_required'
    );
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'saved', v_saved,
    'skipped', v_skipped
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'saved', v_saved,
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION public.batch_upsert_client_kv_by_session(TEXT, JSONB) IS
  '🔐 P1: Session-safe batch KV upsert. Разрешает критичные ключи (profile, consents) без подписки.';

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 3) Обновлённая upsert_client_kv_by_session — разрешает критичные ключи
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.upsert_client_kv_by_session(
  p_session_token TEXT,
  p_key TEXT,
  p_value JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_can_write BOOLEAN;
BEGIN
  -- 1. Получить client_id из сессии
  v_client_id := public.require_client_id(p_session_token);
  
  -- 2. Проверить право на запись ИЛИ критичный ключ
  v_can_write := public.subscription_can_write(v_client_id);
  
  IF NOT v_can_write AND NOT public.is_always_writable_key(p_key) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'subscription_required'
    );
  END IF;
  
  -- 3. UPSERT
  INSERT INTO client_kv_store (client_id, k, v, updated_at)
  VALUES (v_client_id, p_key, p_value, NOW())
  ON CONFLICT (client_id, k) DO UPDATE SET
    v = EXCLUDED.v,
    updated_at = NOW();
  
  RETURN jsonb_build_object('success', true);
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION public.upsert_client_kv_by_session(TEXT, TEXT, JSONB) IS
  '🔐 P1: Session-safe single KV upsert. Разрешает критичные ключи (profile, consents) без подписки.';

-- ═══════════════════════════════════════════════════════════════════
-- ✅ Проверка применения
-- ═══════════════════════════════════════════════════════════════════

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ Fix 2025-01-08: Profile без подписки — ПРИМЕНЁН';
  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE 'Теперь критичные ключи (profile, consents, etc.)';
  RAISE NOTICE 'можно сохранять даже при статусе подписки "none"';
  RAISE NOTICE '';
  RAISE NOTICE '• is_always_writable_key() — проверка критичных ключей';
  RAISE NOTICE '• batch_upsert_client_kv_by_session() — обновлена';
  RAISE NOTICE '• upsert_client_kv_by_session() — обновлена';
  RAISE NOTICE '';
END;
$$;
