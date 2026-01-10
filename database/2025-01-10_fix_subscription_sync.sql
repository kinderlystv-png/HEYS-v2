-- ═══════════════════════════════════════════════════════════════════════════════════
-- 🔧 FIX: Синхронизация clients и subscriptions таблиц
-- Дата: 2025-01-10
-- Проблема: admin_activate_trial обновляет только clients, но не subscriptions
--           Это приводит к "лимбо" состоянию: get_trial_queue_status видит "trial",
--           а get_subscription_status_by_session видит "none"
-- ═══════════════════════════════════════════════════════════════════════════════════

-- 1. ИСПРАВЛЕННАЯ функция admin_activate_trial (добавляет UPSERT в subscriptions)
CREATE OR REPLACE FUNCTION admin_activate_trial(
  p_queue_id UUID,
  p_trial_days INT DEFAULT 7,
  p_curator_session_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_curator_id UUID;
  v_queue_record RECORD;
  v_trial_ends TIMESTAMPTZ;
BEGIN
  -- 1. Проверка куратора (опционально для MVP)
  IF p_curator_session_token IS NOT NULL THEN
    SELECT user_id INTO v_curator_id
    FROM curator_sessions 
    WHERE token_hash = digest(p_curator_session_token, 'sha256')
      AND expires_at > NOW();
    
    IF v_curator_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', 'unauthorized',
        'message', 'Неверная сессия куратора'
      );
    END IF;
  END IF;
  
  -- 2. Получаем запись из очереди
  SELECT 
    tq.id,
    tq.client_id,
    tq.status,
    c.name as client_name
  INTO v_queue_record
  FROM trial_queue tq
  JOIN clients c ON c.id = tq.client_id
  WHERE tq.id = p_queue_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'not_found',
      'message', 'Заявка не найдена'
    );
  END IF;
  
  IF v_queue_record.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'invalid_status',
      'current_status', v_queue_record.status,
      'message', 'Можно активировать только заявки со статусом pending'
    );
  END IF;
  
  -- 3. Вычисляем дату окончания триала
  v_trial_ends := NOW() + (p_trial_days || ' days')::interval;
  
  -- 4. Обновляем статус клиента в clients
  UPDATE clients
  SET 
    subscription_status = 'trial',
    trial_ends_at = v_trial_ends,
    trial_started_at = NOW()
  WHERE id = v_queue_record.client_id;
  
  -- 🆕 4.1 UPSERT в subscriptions (КРИТИЧЕСКИ ВАЖНО для get_subscription_status_by_session!)
  INSERT INTO subscriptions (client_id, trial_started_at, trial_ends_at, status)
  VALUES (v_queue_record.client_id, NOW(), v_trial_ends, 'active')
  ON CONFLICT (client_id) DO UPDATE SET
    trial_started_at = EXCLUDED.trial_started_at,
    trial_ends_at = EXCLUDED.trial_ends_at,
    status = 'active';
  
  -- 5. Обновляем запись в очереди
  UPDATE trial_queue
  SET 
    status = 'assigned',
    assigned_at = NOW()
  WHERE id = p_queue_id;
  
  -- 6. Логируем событие
  INSERT INTO trial_queue_events (client_id, event_type, meta)
  VALUES (v_queue_record.client_id, 'trial_activated', jsonb_build_object(
    'activated_by', COALESCE(v_curator_id::text, 'admin'),
    'trial_days', p_trial_days,
    'trial_ends_at', v_trial_ends
  ));
  
  -- 7. Возвращаем результат
  RETURN jsonb_build_object(
    'success', true,
    'client_id', v_queue_record.client_id,
    'client_name', v_queue_record.client_name,
    'trial_ends_at', v_trial_ends,
    'trial_days', p_trial_days
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 2. МИГРАЦИЯ: Исправляем существующих клиентов в "лимбо" состоянии
-- Клиенты у которых clients.subscription_status = 'trial' но subscriptions пустой
-- ═══════════════════════════════════════════════════════════════════════════════════

-- Находим и исправляем клиентов в "лимбо":
-- clients.subscription_status = 'trial' НО subscriptions.trial_ends_at IS NULL
DO $$
DECLARE
  v_fixed_count INT := 0;
  v_client RECORD;
BEGIN
  FOR v_client IN 
    SELECT 
      c.id,
      c.name,
      c.subscription_status,
      c.trial_started_at AS client_trial_started,
      c.trial_ends_at AS client_trial_ends,
      s.trial_started_at AS sub_trial_started,
      s.trial_ends_at AS sub_trial_ends
    FROM clients c
    LEFT JOIN subscriptions s ON s.client_id = c.id
    WHERE c.subscription_status = 'trial'
      AND (s.client_id IS NULL OR s.trial_ends_at IS NULL)
  LOOP
    -- Логируем
    RAISE NOTICE 'Fixing client % (%) - clients.trial_ends=%, subscriptions.trial_ends=%',
      v_client.id, 
      v_client.name,
      v_client.client_trial_ends,
      v_client.sub_trial_ends;
    
    -- UPSERT в subscriptions, используя даты из clients если есть
    INSERT INTO subscriptions (
      client_id, 
      trial_started_at, 
      trial_ends_at,
      status
    )
    VALUES (
      v_client.id,
      COALESCE(v_client.client_trial_started, NOW()),
      COALESCE(v_client.client_trial_ends, NOW() + INTERVAL '7 days'),
      'active'
    )
    ON CONFLICT (client_id) DO UPDATE SET
      trial_started_at = COALESCE(EXCLUDED.trial_started_at, subscriptions.trial_started_at, NOW()),
      trial_ends_at = COALESCE(EXCLUDED.trial_ends_at, subscriptions.trial_ends_at, NOW() + INTERVAL '7 days'),
      status = 'active';
    
    v_fixed_count := v_fixed_count + 1;
  END LOOP;
  
  RAISE NOTICE '✅ Fixed % clients in limbo state', v_fixed_count;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 3. Проверка результата
-- ═══════════════════════════════════════════════════════════════════════════════════

-- Проверяем что все клиенты с trial синхронизированы
SELECT 
  'После фикса:' AS info,
  COUNT(*) FILTER (WHERE c.subscription_status = 'trial' AND s.trial_ends_at IS NOT NULL) AS synced_trials,
  COUNT(*) FILTER (WHERE c.subscription_status = 'trial' AND s.trial_ends_at IS NULL) AS still_broken
FROM clients c
LEFT JOIN subscriptions s ON s.client_id = c.id;

-- ═══════════════════════════════════════════════════════════════════════════════════
-- GRANT права
-- ═══════════════════════════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION admin_activate_trial(UUID, INT, TEXT) TO heys_admin;
