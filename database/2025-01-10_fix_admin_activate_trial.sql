-- =====================================================
-- FIX: admin_activate_trial - убрана несуществующая колонка status
-- Date: 2025-01-10
-- Author: AI Assistant
-- =====================================================
--
-- ПРОБЛЕМА:
-- Функция admin_activate_trial содержала INSERT в subscriptions с колонкой `status`,
-- которая НЕ СУЩЕСТВУЕТ в таблице subscriptions.
--
-- Колонки subscriptions:
-- id, client_id, trial_started_at, trial_ends_at, active_until, canceled_at, created_at, updated_at
--
-- РЕШЕНИЕ:
-- Убрана колонка `status` из INSERT и ON CONFLICT DO UPDATE
-- =====================================================

CREATE OR REPLACE FUNCTION admin_activate_trial(
  p_queue_id UUID,
  p_trial_days INTEGER DEFAULT 7,
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

  -- 4.1 UPSERT в subscriptions (БЕЗ колонки status - её нет в таблице!)
  INSERT INTO subscriptions (client_id, trial_started_at, trial_ends_at)
  VALUES (v_queue_record.client_id, NOW(), v_trial_ends)
  ON CONFLICT (client_id) DO UPDATE SET
    trial_started_at = EXCLUDED.trial_started_at,
    trial_ends_at = EXCLUDED.trial_ends_at,
    updated_at = NOW();

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

-- Проверяем что колонки status нет в subscriptions
-- SELECT column_name FROM information_schema.columns 
-- WHERE table_name = 'subscriptions' ORDER BY ordinal_position;
