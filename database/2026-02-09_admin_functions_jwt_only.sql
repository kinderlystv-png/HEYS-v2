-- ═══════════════════════════════════════════════════════════════════════════════════
-- 🔐 JWT-only авторизация для admin_* функций
-- Дата: 2026-02-09
-- Версия: 1.0.0
-- 
-- Миграция убирает p_curator_session_token из всех admin_* функций
-- и заменяет на p_curator_id UUID, который передаётся cloud function
-- после JWT проверки.
--
-- Преимущества:
--   ✅ Единая точка авторизации (JWT в cloud function)
--   ✅ Stateless (не нужна таблица curator_sessions)
--   ✅ Безопасно (JWT криптографически подписан)
--   ✅ Масштабируемо (нет синхронизации сессий)
--   ✅ Audit trail (curator_id из JWT невозможно подделать)
--
-- Изменяемые функции:
--   1. admin_activate_trial — убрать p_curator_session_token, добавить p_curator_id
--   2. admin_extend_trial — добавить p_curator_id для audit
--   3. admin_get_all_clients — добавить p_curator_id для фильтрации (опционально)
-- 
-- НЕ изменяемые (уже правильные):
--   ✅ admin_extend_subscription — уже принимает p_curator_id
--   ✅ admin_cancel_subscription — уже принимает p_curator_id
--   ✅ admin_convert_lead — уже принимает p_curator_id
--
-- ═══════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 1. admin_activate_trial v4.0 — JWT-only (без curator_sessions)
-- ═══════════════════════════════════════════════════════════════════════════════════

-- Удаляем старые версии
DROP FUNCTION IF EXISTS admin_activate_trial(UUID, DATE, INT, TEXT);
DROP FUNCTION IF EXISTS admin_activate_trial(UUID, INT, TEXT);
DROP FUNCTION IF EXISTS admin_activate_trial(UUID, INT, TEXT, DATE);

CREATE OR REPLACE FUNCTION admin_activate_trial(
  p_client_id UUID,
  p_start_date DATE DEFAULT CURRENT_DATE,
  p_trial_days INT DEFAULT 7,
  p_curator_id UUID DEFAULT NULL  -- ✅ JWT-проверенный curator ID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client RECORD;
  v_queue_id UUID;
  v_trial_start TIMESTAMPTZ;
  v_trial_end TIMESTAMPTZ;
  v_is_future BOOLEAN;
  v_status TEXT;
BEGIN
  -- 1. Curator ID уже проверен cloud function через JWT
  --    p_curator_id содержит валидный curator ID или NULL
  --    NULL означает что функция вызвана БЕЗ авторизации (не должно происходить)
  
  -- 2. Проверяем клиента
  SELECT id, name INTO v_client
  FROM clients
  WHERE id = p_client_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'not_found',
      'message', 'Клиент не найден'
    );
  END IF;
  
  -- 3. Определяем: сегодня или будущая дата
  v_is_future := p_start_date > CURRENT_DATE;
  v_trial_start := p_start_date::TIMESTAMPTZ;
  v_trial_end := (p_start_date + (p_trial_days || ' days')::INTERVAL)::TIMESTAMPTZ;
  
  -- Если сегодня — используем NOW() для точного времени
  IF NOT v_is_future THEN
    v_trial_start := NOW();
    v_trial_end := NOW() + (p_trial_days || ' days')::INTERVAL;
    v_status := 'trial';
  ELSE
    v_status := 'trial_pending';
  END IF;
  
  -- 4. Обновляем clients
  UPDATE clients
  SET 
    subscription_status = v_status,
    trial_started_at = v_trial_start,
    trial_ends_at = v_trial_end,
    updated_at = NOW()
  WHERE id = p_client_id;
  
  -- 5. UPSERT в subscriptions (source of truth)
  INSERT INTO subscriptions (client_id, trial_started_at, trial_ends_at, active_until, payment_method)
  VALUES (p_client_id, v_trial_start, v_trial_end, v_trial_end, 'trial')
  ON CONFLICT (client_id) DO UPDATE SET
    trial_started_at = v_trial_start,
    trial_ends_at = v_trial_end,
    active_until = v_trial_end,
    payment_method = 'trial',
    updated_at = NOW();
  
  -- 6. AUDIT LOG: сохраняем curator_id если передан
  IF p_curator_id IS NOT NULL THEN
    INSERT INTO trial_queue_events (
      client_id, 
      event_type, 
      event_data
    ) VALUES (
      p_client_id,
      'trial_activated_by_curator',
      jsonb_build_object(
        'curator_id', p_curator_id,
        'start_date', p_start_date,
        'trial_days', p_trial_days,
        'status', v_status,
        'is_future', v_is_future
      )
    );
  END IF;
  
  -- 7. Обновляем trial_queue если есть
  UPDATE trial_queue 
  SET 
    status = 'claimed',
    updated_at = NOW()
  WHERE client_id = p_client_id 
    AND status IN ('queued', 'offer');
  
  -- 8. Возвращаем результат
  RETURN jsonb_build_object(
    'success', true,
    'status', v_status,
    'trial_started_at', v_trial_start,
    'trial_ends_at', v_trial_end,
    'is_future', v_is_future,
    'message', CASE 
      WHEN v_is_future THEN 'Триал запланирован на ' || p_start_date::TEXT
      ELSE 'Триал активирован на ' || p_trial_days || ' дней'
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_activate_trial(UUID, DATE, INT, UUID) TO heys_rpc;
GRANT EXECUTE ON FUNCTION admin_activate_trial(UUID, DATE, INT, UUID) TO heys_admin;

COMMENT ON FUNCTION admin_activate_trial(UUID, DATE, INT, UUID) IS 'Trial Machine v4.0 - JWT-only, curator selects start date, p_curator_id from cloud function after JWT check';

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 2. admin_extend_trial v2.0 — добавить p_curator_id для audit
-- ═══════════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS admin_extend_trial(UUID, INTEGER);

CREATE OR REPLACE FUNCTION admin_extend_trial(
  p_client_id UUID,
  p_days INTEGER DEFAULT 30,
  p_curator_id UUID DEFAULT NULL  -- ✅ Для audit log
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client RECORD;
  v_new_trial_ends TIMESTAMPTZ;
BEGIN
  -- Получаем клиента
  SELECT id, name, subscription_status, trial_ends_at
  INTO v_client
  FROM clients
  WHERE id = p_client_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'client_not_found',
      'message', 'Клиент не найден'
    );
  END IF;

  -- Вычисляем новую дату
  -- Если триал истёк — продлеваем от сейчас, иначе от текущей даты окончания
  IF v_client.trial_ends_at IS NULL OR v_client.trial_ends_at < NOW() THEN
    v_new_trial_ends := NOW() + (p_days || ' days')::interval;
  ELSE
    v_new_trial_ends := v_client.trial_ends_at + (p_days || ' days')::interval;
  END IF;

  -- Обновляем clients
  UPDATE clients
  SET
    subscription_status = 'trial',
    trial_ends_at = v_new_trial_ends,
    updated_at = NOW()
  WHERE id = p_client_id;

  -- Обновляем subscriptions (если есть)
  UPDATE subscriptions
  SET
    trial_ends_at = v_new_trial_ends,
    active_until = v_new_trial_ends,
    payment_method = 'trial',
    updated_at = NOW()
  WHERE client_id = p_client_id;

  -- AUDIT LOG
  IF p_curator_id IS NOT NULL THEN
    INSERT INTO trial_queue_events (
      client_id,
      event_type,
      event_data
    ) VALUES (
      p_client_id,
      'trial_extended_by_curator',
      jsonb_build_object(
        'curator_id', p_curator_id,
        'days_added', p_days,
        'new_trial_ends', v_new_trial_ends,
        'old_trial_ends', v_client.trial_ends_at
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'client_id', p_client_id,
    'client_name', v_client.name,
    'old_trial_ends', v_client.trial_ends_at,
    'new_trial_ends', v_new_trial_ends,
    'days_added', p_days
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_extend_trial(UUID, INTEGER, UUID) TO heys_rpc;
GRANT EXECUTE ON FUNCTION admin_extend_trial(UUID, INTEGER, UUID) TO heys_admin;

COMMENT ON FUNCTION admin_extend_trial(UUID, INTEGER, UUID) IS 'Extend trial for N days, p_curator_id for audit log (optional)';

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 3. admin_get_all_clients v2.0 — добавить p_curator_id для фильтрации
-- ═══════════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS admin_get_all_clients();

CREATE OR REPLACE FUNCTION admin_get_all_clients(
  p_curator_id UUID DEFAULT NULL  -- ✅ Фильтровать по куратору (опционально)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Если p_curator_id передан — фильтруем только клиентов этого куратора
  -- Если NULL — возвращаем всех (для суперадминов)
  RETURN (
    SELECT jsonb_agg(jsonb_build_object(
      'id', id,
      'name', name,
      'phone_normalized', phone_normalized,
      'subscription_status', subscription_status,
      'trial_ends_at', trial_ends_at,
      'trial_started_at', trial_started_at,
      'curator_id', curator_id,
      'created_at', created_at
    ) ORDER BY created_at DESC)
    FROM clients
    WHERE p_curator_id IS NULL OR curator_id = p_curator_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_all_clients(UUID) TO heys_rpc;
GRANT EXECUTE ON FUNCTION admin_get_all_clients(UUID) TO heys_admin;

COMMENT ON FUNCTION admin_get_all_clients(UUID) IS 'Returns all clients, filtered by p_curator_id if provided, all clients if NULL (superadmin)';

-- ═══════════════════════════════════════════════════════════════════════════════════
-- ФИНАЛИЗАЦИЯ
-- ═══════════════════════════════════════════════════════════════════════════════════

COMMIT;

-- Вывод информации
DO $$
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════════════════';
  RAISE NOTICE '🔐 JWT-only Migration applied successfully!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Updated functions:';
  RAISE NOTICE '  1. admin_activate_trial(client_id, start_date, trial_days, curator_id)';
  RAISE NOTICE '     - Removed: p_curator_session_token';
  RAISE NOTICE '     - Added: p_curator_id UUID';
  RAISE NOTICE '     - Audit log: trial_queue_events';
  RAISE NOTICE '';
  RAISE NOTICE '  2. admin_extend_trial(client_id, days, curator_id)';
  RAISE NOTICE '     - Added: p_curator_id UUID for audit';
  RAISE NOTICE '     - Audit log: trial_queue_events';
  RAISE NOTICE '';
  RAISE NOTICE '  3. admin_get_all_clients(curator_id)';
  RAISE NOTICE '     - Added: p_curator_id UUID for filtering';
  RAISE NOTICE '     - NULL = all clients (superadmin)';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Next steps:';
  RAISE NOTICE '  1. Update heys-api-rpc/index.js:';
  RAISE NOTICE '     - Move admin_* functions to CURATOR_ONLY_FUNCTIONS';
  RAISE NOTICE '  2. Test JWT authorization on dev environment';
  RAISE NOTICE '  3. Deploy cloud function to production';
  RAISE NOTICE '  4. Verify trial activation works';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  curator_sessions table is now UNUSED';
  RAISE NOTICE '    Can be dropped after verification (optional)';
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════════';
END $$;
