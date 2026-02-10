-- admin_update_lead_0status — отклонение / изменение статуса лида (v3.0)
-- Purpose: Update lead status (reject, convert, etc.)
-- Called by: curator admin panel via heys-api-rpc

-- Добавляем колонку rejection_reason если её нет
ALTER TABLE leads ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE OR REPLACE FUNCTION admin_update_lead_status(
  p_lead_id UUID,
  p_status TEXT,        -- 'new', 'converted', 'rejected'
  p_reason TEXT DEFAULT NULL,
  p_curator_id UUID DEFAULT NULL  -- JWT authenticated curator (unused but required for CF signature)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Валидация статуса
  IF p_status NOT IN ('new', 'converted', 'rejected') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_status',
      'message', 'Недопустимый статус'
    );
  END IF;

  -- Обновляем лида
  UPDATE leads
  SET 
    status = p_status,
    updated_at = NOW(),
    rejection_reason = CASE 
      WHEN p_status = 'rejected' THEN COALESCE(p_reason, 'rejected_by_curator')
      ELSE NULL
    END
  WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'lead_not_found',
      'message', 'Лид не найден'
    );
  END IF;

  -- Логирование (опционально, если есть таблица lead_events)
  -- INSERT INTO lead_events (lead_id, event_type, reason, created_at)
  -- VALUES (p_lead_id, 'status_changed', p_reason, NOW());

  RETURN jsonb_build_object(
    'success', true,
    'lead_id', p_lead_id,
    'status', p_status
  );
END;
$$;

-- Права доступа (публичный вызов — авторизация через JWT в heys-api-rpc)
-- GRANT EXECUTE ON FUNCTION admin_update_lead_status(UUID, TEXT, TEXT) TO authenticated;
-- Роль 'authenticated' отсутствует в Yandex Cloud PostgreSQL — убрали

COMMENT ON FUNCTION admin_update_lead_status IS 'Обновляет статус лида (curator admin panel v3.0)';
