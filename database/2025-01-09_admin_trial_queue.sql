-- =====================================================
-- HEYS Admin Trial Queue Functions
-- Created: 2025-01-09
-- Purpose: Admin (curator) functions for managing trial queue
-- =====================================================

-- =====================================================
-- 1. admin_get_trial_queue_list()
-- Получить полный список участников очереди с данными клиентов
-- =====================================================
CREATE OR REPLACE FUNCTION admin_get_trial_queue_list(
  p_curator_session_token TEXT DEFAULT NULL
)
RETURNS TABLE (
  queue_id UUID,
  client_id UUID,
  client_name TEXT,
  client_phone TEXT,
  status TEXT,
  queue_position INT,
  queued_at TIMESTAMPTZ,
  offer_sent_at TIMESTAMPTZ,
  offer_expires_at TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  source TEXT,
  priority INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_curator_id UUID;
BEGIN
  -- Если передан токен куратора — проверяем
  IF p_curator_session_token IS NOT NULL THEN
    SELECT user_id INTO v_curator_id
    FROM curator_sessions 
    WHERE token_hash = digest(p_curator_session_token, 'sha256')
      AND expires_at > NOW();
    
    IF v_curator_id IS NULL THEN
      RAISE EXCEPTION 'Invalid or expired curator session';
    END IF;
  END IF;
  -- Для MVP без токена тоже разрешаем (локальный режим)
  
  RETURN QUERY
  SELECT 
    tq.id AS queue_id,
    tq.client_id,
    COALESCE(c.name, 'Неизвестный') AS client_name,
    COALESCE(c.phone_normalized, '') AS client_phone,
    tq.status,
    ROW_NUMBER() OVER (
      PARTITION BY (tq.status = 'queued')
      ORDER BY tq.priority DESC, tq.queued_at ASC
    )::INT AS queue_position,
    tq.queued_at,
    tq.offer_sent_at,
    tq.offer_expires_at,
    tq.assigned_at,
    tq.canceled_at,
    tq.source,
    tq.priority
  FROM trial_queue tq
  LEFT JOIN clients c ON c.id = tq.client_id
  WHERE tq.status IN ('queued', 'offer', 'assigned', 'canceled', 'expired')
  ORDER BY 
    CASE tq.status 
      WHEN 'queued' THEN 1 
      WHEN 'offer' THEN 2 
      WHEN 'assigned' THEN 3 
      ELSE 4 
    END,
    tq.priority DESC,
    tq.queued_at ASC;
END;
$$;

-- =====================================================
-- 2. admin_add_to_queue()
-- Добавить клиента в очередь вручную
-- =====================================================
CREATE OR REPLACE FUNCTION admin_add_to_queue(
  p_client_id UUID,
  p_source TEXT DEFAULT 'admin_manual',
  p_priority INT DEFAULT 10,
  p_curator_session_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_curator_id UUID;
  v_queue_id UUID;
  v_existing_status TEXT;
  v_position INT;
BEGIN
  -- Проверка куратора (опционально для MVP)
  IF p_curator_session_token IS NOT NULL THEN
    SELECT user_id INTO v_curator_id
    FROM curator_sessions 
    WHERE token_hash = digest(p_curator_session_token, 'sha256')
      AND expires_at > NOW();
    
    IF v_curator_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_curator_session');
    END IF;
  END IF;
  
  -- Проверяем нет ли уже в активной очереди
  SELECT status INTO v_existing_status
  FROM trial_queue
  WHERE client_id = p_client_id
    AND status IN ('queued', 'offer')
  LIMIT 1;
  
  IF v_existing_status IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'already_in_queue',
      'current_status', v_existing_status
    );
  END IF;
  
  -- Проверяем есть ли активная подписка
  IF EXISTS (
    SELECT 1 FROM clients 
    WHERE id = p_client_id 
      AND subscription_status IN ('trial', 'active')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'has_active_subscription');
  END IF;
  
  -- Добавляем в очередь
  INSERT INTO trial_queue (client_id, curator_id, status, source, priority, queued_at)
  VALUES (
    p_client_id, 
    '00000000-0000-0000-0000-000000000000'::uuid, -- Global curator для MVP
    'queued',
    p_source,
    p_priority,
    NOW()
  )
  RETURNING id INTO v_queue_id;
  
  -- Вычисляем позицию
  SELECT COUNT(*) INTO v_position
  FROM trial_queue
  WHERE status = 'queued'
    AND (priority > p_priority OR (priority = p_priority AND queued_at <= NOW()));
  
  -- Логируем событие
  INSERT INTO trial_queue_events (client_id, event_type, meta)
  VALUES (p_client_id, 'queued', jsonb_build_object(
    'source', 'admin_manual',
    'added_by', COALESCE(v_curator_id::text, 'admin')
  ));
  
  RETURN jsonb_build_object(
    'success', true,
    'queue_id', v_queue_id,
    'position', v_position
  );
END;
$$;

-- =====================================================
-- 3. admin_remove_from_queue()
-- Удалить клиента из очереди
-- =====================================================
CREATE OR REPLACE FUNCTION admin_remove_from_queue(
  p_client_id UUID,
  p_reason TEXT DEFAULT 'admin_removed',
  p_curator_session_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_curator_id UUID;
  v_queue_id UUID;
  v_old_status TEXT;
BEGIN
  -- Проверка куратора (опционально для MVP)
  IF p_curator_session_token IS NOT NULL THEN
    SELECT user_id INTO v_curator_id
    FROM curator_sessions 
    WHERE token_hash = digest(p_curator_session_token, 'sha256')
      AND expires_at > NOW();
    
    IF v_curator_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_curator_session');
    END IF;
  END IF;
  
  -- Находим запись в очереди
  SELECT id, status INTO v_queue_id, v_old_status
  FROM trial_queue
  WHERE client_id = p_client_id
    AND status IN ('queued', 'offer')
  LIMIT 1;
  
  IF v_queue_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_in_queue');
  END IF;
  
  -- Обновляем статус
  UPDATE trial_queue
  SET 
    status = 'canceled',
    canceled_at = NOW()
  WHERE id = v_queue_id;
  
  -- Логируем
  INSERT INTO trial_queue_events (client_id, event_type, meta)
  VALUES (p_client_id, 'canceled', jsonb_build_object(
    'reason', p_reason,
    'removed_by', COALESCE(v_curator_id::text, 'admin'),
    'old_status', v_old_status
  ));
  
  RETURN jsonb_build_object(
    'success', true,
    'removed_queue_id', v_queue_id,
    'old_status', v_old_status
  );
END;
$$;

-- =====================================================
-- 4. admin_send_offer()
-- Отправить оффер конкретному клиенту из очереди
-- =====================================================
CREATE OR REPLACE FUNCTION admin_send_offer(
  p_client_id UUID,
  p_offer_window_minutes INT DEFAULT 120,
  p_curator_session_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_curator_id UUID;
  v_queue_id UUID;
  v_current_status TEXT;
  v_offer_expires TIMESTAMPTZ;
BEGIN
  -- Проверка куратора (опционально для MVP)
  IF p_curator_session_token IS NOT NULL THEN
    SELECT user_id INTO v_curator_id
    FROM curator_sessions 
    WHERE token_hash = digest(p_curator_session_token, 'sha256')
      AND expires_at > NOW();
    
    IF v_curator_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_curator_session');
    END IF;
  END IF;
  
  -- Находим запись в очереди
  SELECT id, status INTO v_queue_id, v_current_status
  FROM trial_queue
  WHERE client_id = p_client_id
    AND status IN ('queued', 'offer', 'expired')
  LIMIT 1;
  
  IF v_queue_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_in_queue');
  END IF;
  
  -- Если уже offer — обновляем время
  v_offer_expires := NOW() + (p_offer_window_minutes || ' minutes')::interval;
  
  UPDATE trial_queue
  SET 
    status = 'offer',
    offer_sent_at = NOW(),
    offer_expires_at = v_offer_expires
  WHERE id = v_queue_id;
  
  -- Логируем
  INSERT INTO trial_queue_events (client_id, event_type, meta)
  VALUES (p_client_id, 'offer_sent', jsonb_build_object(
    'sent_by', COALESCE(v_curator_id::text, 'admin'),
    'manual', true,
    'offer_expires_at', v_offer_expires
  ));
  
  RETURN jsonb_build_object(
    'success', true,
    'queue_id', v_queue_id,
    'offer_expires_at', v_offer_expires,
    'previous_status', v_current_status
  );
END;
$$;

-- =====================================================
-- 5. admin_get_queue_stats()
-- Получить статистику по очереди
-- =====================================================
CREATE OR REPLACE FUNCTION admin_get_queue_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_queued_count INT;
  v_offer_count INT;
  v_assigned_today INT;
  v_canceled_today INT;
  v_limits RECORD;
BEGIN
  -- Считаем статусы
  SELECT 
    COUNT(*) FILTER (WHERE status = 'queued') AS queued,
    COUNT(*) FILTER (WHERE status = 'offer') AS offer,
    COUNT(*) FILTER (WHERE status = 'assigned' AND assigned_at::date = CURRENT_DATE) AS assigned_today,
    COUNT(*) FILTER (WHERE status = 'canceled' AND canceled_at::date = CURRENT_DATE) AS canceled_today
  INTO v_queued_count, v_offer_count, v_assigned_today, v_canceled_today
  FROM trial_queue;
  
  -- Получаем лимиты
  SELECT * INTO v_limits
  FROM curator_trial_limits
  WHERE curator_id = '00000000-0000-0000-0000-000000000000'::uuid;
  
  RETURN jsonb_build_object(
    'queued', v_queued_count,
    'offer_pending', v_offer_count,
    'assigned_today', v_assigned_today,
    'canceled_today', v_canceled_today,
    'limits', jsonb_build_object(
      'max_active_trials', COALESCE(v_limits.max_active_trials, 3),
      'is_accepting_trials', COALESCE(v_limits.is_accepting_trials, false),
      'offer_window_minutes', COALESCE(v_limits.offer_window_minutes, 120),
      'trial_days', COALESCE(v_limits.trial_days, 7)
    )
  );
END;
$$;

-- =====================================================
-- 6. admin_update_queue_settings()
-- Обновить настройки очереди (лимиты)
-- =====================================================
CREATE OR REPLACE FUNCTION admin_update_queue_settings(
  p_is_accepting BOOLEAN DEFAULT NULL,
  p_max_active INT DEFAULT NULL,
  p_offer_window_minutes INT DEFAULT NULL,
  p_trial_days INT DEFAULT NULL,
  p_curator_session_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_curator_id UUID := '00000000-0000-0000-0000-000000000000'::uuid;
  v_updated RECORD;
BEGIN
  -- Проверка куратора (опционально для MVP)
  IF p_curator_session_token IS NOT NULL THEN
    SELECT user_id INTO v_curator_id
    FROM curator_sessions 
    WHERE token_hash = digest(p_curator_session_token, 'sha256')
      AND expires_at > NOW();
    
    IF v_curator_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_curator_session');
    END IF;
    -- Используем глобальный curator_id для MVP
    v_curator_id := '00000000-0000-0000-0000-000000000000'::uuid;
  END IF;
  
  -- Upsert настроек
  INSERT INTO curator_trial_limits (curator_id, is_accepting_trials, max_active_trials, offer_window_minutes, trial_days)
  VALUES (
    v_curator_id,
    COALESCE(p_is_accepting, false),
    COALESCE(p_max_active, 3),
    COALESCE(p_offer_window_minutes, 120),
    COALESCE(p_trial_days, 7)
  )
  ON CONFLICT (curator_id) DO UPDATE SET
    is_accepting_trials = COALESCE(p_is_accepting, curator_trial_limits.is_accepting_trials),
    max_active_trials = COALESCE(p_max_active, curator_trial_limits.max_active_trials),
    offer_window_minutes = COALESCE(p_offer_window_minutes, curator_trial_limits.offer_window_minutes),
    trial_days = COALESCE(p_trial_days, curator_trial_limits.trial_days)
  RETURNING * INTO v_updated;
  
  RETURN jsonb_build_object(
    'success', true,
    'settings', jsonb_build_object(
      'is_accepting_trials', v_updated.is_accepting_trials,
      'max_active_trials', v_updated.max_active_trials,
      'offer_window_minutes', v_updated.offer_window_minutes,
      'trial_days', v_updated.trial_days
    )
  );
END;
$$;

-- =====================================================
-- Права доступа
-- =====================================================
-- Для MVP разрешаем PUBLIC (в проде добавить GRANT только curator role)
GRANT EXECUTE ON FUNCTION admin_get_trial_queue_list TO PUBLIC;
GRANT EXECUTE ON FUNCTION admin_add_to_queue TO PUBLIC;
GRANT EXECUTE ON FUNCTION admin_remove_from_queue TO PUBLIC;
GRANT EXECUTE ON FUNCTION admin_send_offer TO PUBLIC;
GRANT EXECUTE ON FUNCTION admin_get_queue_stats TO PUBLIC;
GRANT EXECUTE ON FUNCTION admin_update_queue_settings TO PUBLIC;

-- =====================================================
-- Комментарии
-- =====================================================
COMMENT ON FUNCTION admin_get_trial_queue_list IS 'Получить список участников очереди с данными клиентов (для админки куратора)';
COMMENT ON FUNCTION admin_add_to_queue IS 'Добавить клиента в очередь вручную (для админки куратора)';
COMMENT ON FUNCTION admin_remove_from_queue IS 'Удалить клиента из очереди (для админки куратора)';
COMMENT ON FUNCTION admin_send_offer IS 'Отправить оффер конкретному клиенту (для админки куратора)';
COMMENT ON FUNCTION admin_get_queue_stats IS 'Статистика очереди: кол-во в каждом статусе + настройки';
COMMENT ON FUNCTION admin_update_queue_settings IS 'Обновить настройки очереди (лимиты, is_accepting)';
