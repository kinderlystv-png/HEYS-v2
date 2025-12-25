-- ═══════════════════════════════════════════════════════════════════
-- 🔐 P1 HOTFIX: Session-версии KV функций (IDOR fix)
-- ═══════════════════════════════════════════════════════════════════
-- Критическая уязвимость: KV функции принимают UUID от клиента!
-- Решение: session-версии извлекают client_id из сессии
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- 1) upsert_client_kv_by_session — основная функция записи
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
  v_result JSONB;
BEGIN
  -- 1. Получить client_id из сессии (безопасно!)
  v_client_id := public.require_client_id(p_session_token);
  
  -- 2. Проверить право на запись (подписка активна?)
  IF NOT public.subscription_can_write(v_client_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'subscription_required'
    );
  END IF;
  
  -- 3. Upsert в client_kv_store
  INSERT INTO client_kv_store (client_id, key, value, updated_at)
  VALUES (v_client_id, p_key, p_value, NOW())
  ON CONFLICT (client_id, key) DO UPDATE SET
    value = EXCLUDED.value,
    updated_at = NOW();
  
  RETURN jsonb_build_object(
    'success', true,
    'key', p_key
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION public.upsert_client_kv_by_session(TEXT, TEXT, JSONB) IS
  '🔐 P1: Session-safe KV upsert. Client ID extracted from session, prevents IDOR.';

-- ═══════════════════════════════════════════════════════════════════
-- 2) batch_upsert_client_kv_by_session — пакетная запись
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
BEGIN
  -- 1. Получить client_id из сессии (безопасно!)
  v_client_id := public.require_client_id(p_session_token);
  
  -- 2. Проверить право на запись
  IF NOT public.subscription_can_write(v_client_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'saved', 0,
      'error', 'subscription_required'
    );
  END IF;
  
  -- 3. Итерировать по массиву items
  FOR v_item IN SELECT jsonb_array_elements(p_items)
  LOOP
    v_key := v_item->>'k';
    v_value := v_item->'v';
    
    IF v_key IS NOT NULL THEN
      INSERT INTO client_kv_store (client_id, key, value, updated_at)
      VALUES (v_client_id, v_key, v_value, NOW())
      ON CONFLICT (client_id, key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = NOW();
      
      v_saved := v_saved + 1;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'saved', v_saved
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
  '🔐 P1: Session-safe batch KV upsert. Client ID extracted from session, prevents IDOR.';

-- ═══════════════════════════════════════════════════════════════════
-- 3) get_client_kv_by_session — чтение KV
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_client_kv_by_session(
  p_session_token TEXT,
  p_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_value JSONB;
BEGIN
  -- 1. Получить client_id из сессии (безопасно!)
  v_client_id := public.require_client_id(p_session_token);
  
  -- 2. Получить значение (чтение разрешено даже в read_only)
  SELECT value INTO v_value
  FROM client_kv_store
  WHERE client_id = v_client_id AND key = p_key;
  
  IF v_value IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'found', false,
      'key', p_key,
      'value', null
    );
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'found', true,
    'key', p_key,
    'value', v_value
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION public.get_client_kv_by_session(TEXT, TEXT) IS
  '🔐 P1: Session-safe KV read. Client ID extracted from session, prevents IDOR.';

-- ═══════════════════════════════════════════════════════════════════
-- 4) delete_client_kv_by_session — удаление KV
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.delete_client_kv_by_session(
  p_session_token TEXT,
  p_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_deleted INT;
BEGIN
  -- 1. Получить client_id из сессии (безопасно!)
  v_client_id := public.require_client_id(p_session_token);
  
  -- 2. Проверить право на запись
  IF NOT public.subscription_can_write(v_client_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'subscription_required'
    );
  END IF;
  
  -- 3. Удалить
  DELETE FROM client_kv_store
  WHERE client_id = v_client_id AND key = p_key;
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'deleted', v_deleted > 0
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION public.delete_client_kv_by_session(TEXT, TEXT) IS
  '🔐 P1: Session-safe KV delete. Client ID extracted from session, prevents IDOR.';

-- ═══════════════════════════════════════════════════════════════════
-- 5) GRANT для heys_rpc (только session-версии!)
-- ═══════════════════════════════════════════════════════════════════
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.upsert_client_kv_by_session(TEXT, TEXT, JSONB) TO heys_rpc;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.batch_upsert_client_kv_by_session(TEXT, JSONB) TO heys_rpc;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_client_kv_by_session(TEXT, TEXT) TO heys_rpc;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.delete_client_kv_by_session(TEXT, TEXT) TO heys_rpc;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 6) REVOKE UUID-версий от heys_rpc (IDOR prevention!)
-- ═══════════════════════════════════════════════════════════════════
DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.get_client_kv(UUID, TEXT) FROM heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.save_client_kv(UUID, TEXT, JSONB) FROM heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.delete_client_kv(UUID, TEXT) FROM heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.upsert_client_kv(UUID, TEXT, JSONB) FROM heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.batch_upsert_client_kv(UUID, JSONB) FROM heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; WHEN undefined_object THEN NULL; END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════
-- Проверка
-- ═══════════════════════════════════════════════════════════════════
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ Session-версии KV функций созданы!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE 'Созданы функции:';
  RAISE NOTICE '  • upsert_client_kv_by_session(TEXT, TEXT, JSONB)';
  RAISE NOTICE '  • batch_upsert_client_kv_by_session(TEXT, JSONB)';
  RAISE NOTICE '  • get_client_kv_by_session(TEXT, TEXT)';
  RAISE NOTICE '  • delete_client_kv_by_session(TEXT, TEXT)';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️ ВАЖНО: Обновите ALLOWED_FUNCTIONS в CF!';
  RAISE NOTICE '   Убрать: get_client_kv, save_client_kv, delete_client_kv,';
  RAISE NOTICE '           upsert_client_kv, batch_upsert_client_kv';
  RAISE NOTICE '   Добавить: *_by_session версии';
  RAISE NOTICE '';
END $$;
