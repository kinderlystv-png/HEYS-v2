-- =====================================================
-- Продление триала для тестовых клиентов
-- Date: 2026-02-04
-- =====================================================

-- 1. Создаём функцию admin_get_all_clients
CREATE OR REPLACE FUNCTION admin_get_all_clients()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT jsonb_agg(jsonb_build_object(
      'id', id,
      'name', name,
      'phone_normalized', phone_normalized,
      'subscription_status', subscription_status,
      'trial_ends_at', trial_ends_at,
      'trial_started_at', trial_started_at,
      'created_at', created_at
    ) ORDER BY created_at)
    FROM clients
  );
END;
$$;

-- 2. Создаём функцию admin_extend_trial
CREATE OR REPLACE FUNCTION admin_extend_trial(
  p_client_id UUID,
  p_days INTEGER DEFAULT 30
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
      'error', 'client_not_found'
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
    updated_at = NOW()
  WHERE client_id = p_client_id;

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

GRANT EXECUTE ON FUNCTION admin_get_all_clients() TO heys_admin;
GRANT EXECUTE ON FUNCTION admin_extend_trial(UUID, INTEGER) TO heys_admin;

