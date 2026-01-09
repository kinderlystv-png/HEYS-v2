-- =====================================================
-- УПРОЩЁННАЯ СИСТЕМА ОЧЕРЕДИ ТРИАЛА
-- =====================================================
-- Версия: 1.0.0
-- Дата: 2025-01-09
-- 
-- ИЗМЕНЕНИЯ:
-- 1. Убрана автоматическая выдача офферов
-- 2. Новые статусы: pending → assigned | rejected (вместо queued → offer → assigned)
-- 3. Куратор вручную активирует триал после проверки пользователя
-- 4. Убран claim_trial_offer (пользователь не сам активирует)
-- 5. Убран assign_trials_from_queue (CRON)
-- =====================================================

-- =====================================================
-- 1. УПРОЩЁННЫЙ request_trial()
-- Пользователь просто оставляет заявку, всегда status='pending'
-- =====================================================
CREATE OR REPLACE FUNCTION request_trial(
  p_session_token TEXT,
  p_source TEXT DEFAULT 'app'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client_id UUID;
  v_existing_queue RECORD;
  v_existing_trial RECORD;
  v_queue_id UUID;
  v_queue_position INT;
BEGIN
  -- 1. Проверка сессии клиента
  SELECT client_id INTO v_client_id
  FROM client_sessions
  WHERE token_hash = digest(p_session_token, 'sha256')
    AND expires_at > NOW();
    
  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_session');
  END IF;
  
  -- 2. Проверка: уже есть активная подписка?
  SELECT subscription_status, trial_ends_at 
  INTO v_existing_trial
  FROM clients
  WHERE id = v_client_id;
  
  IF v_existing_trial.subscription_status IN ('trial', 'active') THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'already_has_subscription',
      'status', v_existing_trial.subscription_status
    );
  END IF;
  
  -- 3. Проверка: уже в очереди?
  SELECT id, status, created_at, queue_position
  INTO v_existing_queue
  FROM trial_queue
  WHERE client_id = v_client_id
    AND status IN ('pending', 'assigned')
  LIMIT 1;
  
  IF v_existing_queue.id IS NOT NULL THEN
    -- Уже есть заявка
    RETURN jsonb_build_object(
      'success', true,
      'already_in_queue', true,
      'status', v_existing_queue.status,
      'queue_position', v_existing_queue.queue_position,
      'requested_at', v_existing_queue.created_at
    );
  END IF;
  
  -- 4. Определяем позицию в очереди
  SELECT COALESCE(MAX(queue_position), 0) + 1 
  INTO v_queue_position
  FROM trial_queue
  WHERE status = 'pending';
  
  -- 5. Создаём заявку со статусом 'pending'
  INSERT INTO trial_queue (
    client_id,
    status,
    source,
    queue_position,
    priority,
    created_at
  ) VALUES (
    v_client_id,
    'pending',
    p_source,
    v_queue_position,
    0,
    NOW()
  )
  RETURNING id INTO v_queue_id;
  
  -- 6. Логируем событие
  INSERT INTO trial_queue_events (client_id, event_type, meta)
  VALUES (v_client_id, 'request_submitted', jsonb_build_object(
    'source', p_source,
    'queue_position', v_queue_position
  ));
  
  -- 7. Возвращаем результат
  RETURN jsonb_build_object(
    'success', true,
    'status', 'pending',
    'queue_id', v_queue_id,
    'queue_position', v_queue_position,
    'message', 'Заявка отправлена. Куратор свяжется с вами для активации триала.'
  );
END;
$$;

-- =====================================================
-- 2. ОБНОВЛЁННЫЙ get_trial_queue_status()
-- Статус заявки пользователя (упрощённый)
-- =====================================================
CREATE OR REPLACE FUNCTION get_trial_queue_status(
  p_session_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client_id UUID;
  v_queue_record RECORD;
  v_client_status TEXT;
BEGIN
  -- 1. Проверка сессии
  SELECT client_id INTO v_client_id
  FROM client_sessions
  WHERE token_hash = digest(p_session_token, 'sha256')
    AND expires_at > NOW();
    
  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_session');
  END IF;
  
  -- 2. Проверяем статус подписки
  SELECT subscription_status INTO v_client_status
  FROM clients WHERE id = v_client_id;
  
  IF v_client_status IN ('trial', 'active') THEN
    RETURN jsonb_build_object(
      'success', true,
      'in_queue', false,
      'subscription_status', v_client_status
    );
  END IF;
  
  -- 3. Ищем запись в очереди
  SELECT 
    id,
    status,
    queue_position,
    created_at,
    assigned_at,
    rejected_at,
    rejection_reason
  INTO v_queue_record
  FROM trial_queue
  WHERE client_id = v_client_id
    AND status IN ('pending', 'assigned', 'rejected')
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_queue_record.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'in_queue', false,
      'can_request', true
    );
  END IF;
  
  -- 4. Возвращаем статус
  RETURN jsonb_build_object(
    'success', true,
    'in_queue', true,
    'status', v_queue_record.status,
    'queue_position', v_queue_record.queue_position,
    'requested_at', v_queue_record.created_at,
    'assigned_at', v_queue_record.assigned_at,
    'rejected_at', v_queue_record.rejected_at,
    'rejection_reason', v_queue_record.rejection_reason
  );
END;
$$;

-- =====================================================
-- 3. НОВАЯ ФУНКЦИЯ admin_activate_trial()
-- Куратор активирует триал для пользователя
-- =====================================================
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
      RETURN jsonb_build_object('success', false, 'error', 'invalid_curator_session');
    END IF;
  END IF;
  
  -- 2. Находим запись в очереди
  SELECT 
    tq.id,
    tq.client_id,
    tq.status,
    c.name AS client_name,
    c.phone_normalized AS client_phone
  INTO v_queue_record
  FROM trial_queue tq
  LEFT JOIN clients c ON c.id = tq.client_id
  WHERE tq.id = p_queue_id;
  
  IF v_queue_record.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'queue_record_not_found');
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
  
  -- 4. Обновляем статус клиента
  UPDATE clients
  SET 
    subscription_status = 'trial',
    trial_ends_at = v_trial_ends,
    trial_started_at = NOW()
  WHERE id = v_queue_record.client_id;
  
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
    'client_phone', v_queue_record.client_phone,
    'trial_ends_at', v_trial_ends,
    'trial_days', p_trial_days
  );
END;
$$;

-- =====================================================
-- 4. НОВАЯ ФУНКЦИЯ admin_reject_request()
-- Куратор отклоняет заявку с причиной
-- =====================================================
CREATE OR REPLACE FUNCTION admin_reject_request(
  p_queue_id UUID,
  p_reason TEXT DEFAULT 'Не указана',
  p_curator_session_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_curator_id UUID;
  v_queue_record RECORD;
BEGIN
  -- 1. Проверка куратора (опционально для MVP)
  IF p_curator_session_token IS NOT NULL THEN
    SELECT user_id INTO v_curator_id
    FROM curator_sessions 
    WHERE token_hash = digest(p_curator_session_token, 'sha256')
      AND expires_at > NOW();
    
    IF v_curator_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_curator_session');
    END IF;
  END IF;
  
  -- 2. Находим запись
  SELECT 
    tq.id,
    tq.client_id,
    tq.status,
    c.name AS client_name
  INTO v_queue_record
  FROM trial_queue tq
  LEFT JOIN clients c ON c.id = tq.client_id
  WHERE tq.id = p_queue_id;
  
  IF v_queue_record.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'queue_record_not_found');
  END IF;
  
  IF v_queue_record.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'invalid_status',
      'current_status', v_queue_record.status
    );
  END IF;
  
  -- 3. Обновляем статус на 'rejected'
  UPDATE trial_queue
  SET 
    status = 'rejected',
    rejected_at = NOW(),
    rejection_reason = p_reason
  WHERE id = p_queue_id;
  
  -- 4. Логируем
  INSERT INTO trial_queue_events (client_id, event_type, meta)
  VALUES (v_queue_record.client_id, 'request_rejected', jsonb_build_object(
    'rejected_by', COALESCE(v_curator_id::text, 'admin'),
    'reason', p_reason
  ));
  
  -- 5. Возвращаем результат
  RETURN jsonb_build_object(
    'success', true,
    'client_id', v_queue_record.client_id,
    'client_name', v_queue_record.client_name,
    'reason', p_reason
  );
END;
$$;

-- =====================================================
-- 5. Добавляем новые поля в trial_queue (если нет)
-- =====================================================
DO $$
BEGIN
  -- Добавляем поле rejected_at если нет
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'trial_queue' AND column_name = 'rejected_at'
  ) THEN
    ALTER TABLE trial_queue ADD COLUMN rejected_at TIMESTAMPTZ;
  END IF;
  
  -- Добавляем поле rejection_reason если нет
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'trial_queue' AND column_name = 'rejection_reason'
  ) THEN
    ALTER TABLE trial_queue ADD COLUMN rejection_reason TEXT;
  END IF;
END $$;

-- =====================================================
-- 6. ОБНОВЛЯЕМ admin_get_trial_queue_list()
-- Фильтруем по pending для основного списка
-- =====================================================
CREATE OR REPLACE FUNCTION admin_get_trial_queue_list(
  p_status TEXT DEFAULT NULL,  -- NULL = все, 'pending' = только ожидающие
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_total INT;
BEGIN
  -- Получаем общее количество
  SELECT COUNT(*) INTO v_total
  FROM trial_queue tq
  WHERE (p_status IS NULL OR tq.status = p_status);
  
  -- Получаем список с данными клиентов
  SELECT jsonb_agg(row_to_json(t)) INTO v_result
  FROM (
    SELECT 
      tq.id AS queue_id,
      tq.client_id,
      COALESCE(c.name, 'Неизвестный') AS client_name,
      COALESCE(c.phone_normalized, '') AS client_phone,
      tq.status,
      tq.queue_position,
      tq.created_at AS requested_at,
      tq.assigned_at,
      tq.rejected_at,
      tq.rejection_reason,
      tq.source,
      tq.priority
    FROM trial_queue tq
    LEFT JOIN clients c ON c.id = tq.client_id
    WHERE (p_status IS NULL OR tq.status = p_status)
    ORDER BY 
      CASE tq.status 
        WHEN 'pending' THEN 0 
        WHEN 'assigned' THEN 1 
        ELSE 2 
      END,
      tq.priority DESC,
      tq.created_at ASC
    LIMIT p_limit
    OFFSET p_offset
  ) t;
  
  RETURN jsonb_build_object(
    'success', true,
    'items', COALESCE(v_result, '[]'::jsonb),
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset
  );
END;
$$;

-- =====================================================
-- 7. Обновляем get_public_trial_capacity()
-- Упрощаем - показываем только принимаем ли заявки
-- =====================================================
CREATE OR REPLACE FUNCTION get_public_trial_capacity()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_accepting BOOLEAN;
  v_pending_count INT;
BEGIN
  -- Проверяем принимаем ли заявки
  SELECT COALESCE(is_accepting_trials, false)
  INTO v_is_accepting
  FROM curator_trial_limits
  WHERE curator_id = '00000000-0000-0000-0000-000000000000'::uuid;
  
  -- Считаем очередь
  SELECT COUNT(*)
  INTO v_pending_count
  FROM trial_queue
  WHERE status = 'pending';
  
  RETURN jsonb_build_object(
    'is_accepting', COALESCE(v_is_accepting, false),
    'queue_length', v_pending_count
  );
END;
$$;

-- =====================================================
-- ПРАВА ДОСТУПА
-- =====================================================
GRANT EXECUTE ON FUNCTION request_trial TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_trial_queue_status TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_trial_capacity TO PUBLIC;
GRANT EXECUTE ON FUNCTION admin_activate_trial TO PUBLIC;
GRANT EXECUTE ON FUNCTION admin_reject_request TO PUBLIC;
GRANT EXECUTE ON FUNCTION admin_get_trial_queue_list TO PUBLIC;

-- =====================================================
-- КОММЕНТАРИИ
-- =====================================================
COMMENT ON FUNCTION request_trial IS 'Пользователь оставляет заявку на триал (всегда status=pending)';
COMMENT ON FUNCTION get_trial_queue_status IS 'Статус заявки пользователя';
COMMENT ON FUNCTION get_public_trial_capacity IS 'Публичная проверка - принимаются ли заявки';
COMMENT ON FUNCTION admin_activate_trial IS 'Куратор активирует триал для пользователя после проверки';
COMMENT ON FUNCTION admin_reject_request IS 'Куратор отклоняет заявку с указанием причины';
COMMENT ON FUNCTION admin_get_trial_queue_list IS 'Список заявок с данными клиентов для куратора';

-- =====================================================
-- МИГРАЦИЯ СУЩЕСТВУЮЩИХ ДАННЫХ
-- =====================================================
-- Переводим старые статусы в новые
UPDATE trial_queue 
SET status = 'pending' 
WHERE status IN ('queued', 'offer');

-- Переводим expired в rejected
UPDATE trial_queue 
SET 
  status = 'rejected',
  rejected_at = COALESCE(offer_expires_at, NOW()),
  rejection_reason = 'Оффер истёк (legacy)'
WHERE status = 'expired';
