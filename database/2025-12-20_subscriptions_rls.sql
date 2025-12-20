-- =====================================================
-- HEYS Subscriptions RLS Policies
-- Date: 2025-12-20
-- Description: Блокировка записи для read_only/canceled
-- =====================================================

-- =====================================================
-- 1. RLS для clients: блокировка UPDATE при read_only
-- =====================================================

-- Существующая политика "Users can update their own clients" из database_clients_rls_policies.sql
-- проверяет только curator_id. Нужно её заменить на версию с проверкой subscription_status.

-- Удаляем старую политику
DROP POLICY IF EXISTS "Users can update their own clients" ON clients;

-- Создаём новую: куратор может обновлять клиентов только если статус не read_only/canceled
CREATE POLICY "Users can update their own clients" ON clients
  FOR UPDATE 
  USING (
    auth.uid() = curator_id
    AND subscription_status NOT IN ('read_only', 'canceled')
  )
  WITH CHECK (
    auth.uid() = curator_id
  );


-- =====================================================
-- 2. RPC: Проверка возможности редактирования
-- =====================================================

CREATE OR REPLACE FUNCTION can_client_edit(p_client_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT subscription_status INTO v_status 
  FROM clients 
  WHERE id = p_client_id;
  
  -- Триал и активные подписки могут редактировать
  RETURN v_status IN ('trial', 'active');
END;
$$;

COMMENT ON FUNCTION can_client_edit IS 'Проверяет может ли клиент редактировать данные (trial/active = true, read_only/canceled = false)';


-- =====================================================
-- 3. Триггер: Автопереход в read_only при истечении
-- =====================================================

CREATE OR REPLACE FUNCTION check_expired_subscriptions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Истекшие активные подписки → read_only
  UPDATE clients SET
    subscription_status = 'read_only',
    updated_at = NOW()
  WHERE subscription_status = 'active'
    AND subscription_expires_at < NOW();
  
  -- Истекшие триалы → read_only
  UPDATE clients SET
    subscription_status = 'read_only',
    updated_at = NOW()
  WHERE subscription_status = 'trial'
    AND trial_ends_at < NOW();
END;
$$;

COMMENT ON FUNCTION check_expired_subscriptions IS 'Cron-функция для автопереключения истекших подписок в read_only. Запускать раз в час.';


-- =====================================================
-- 4. RPC: Получить список истекающих триалов (для уведомлений)
-- =====================================================

CREATE OR REPLACE FUNCTION get_expiring_trials(hours_ahead INTEGER DEFAULT 24)
RETURNS TABLE (
  client_id UUID,
  client_name TEXT,
  trial_ends_at TIMESTAMPTZ,
  hours_left NUMERIC,
  phone TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    c.trial_ends_at,
    EXTRACT(EPOCH FROM (c.trial_ends_at - NOW())) / 3600 AS hours_left,
    c.phone
  FROM clients c
  WHERE c.subscription_status = 'trial'
    AND c.trial_ends_at IS NOT NULL
    AND c.trial_ends_at > NOW()
    AND c.trial_ends_at <= NOW() + (hours_ahead || ' hours')::INTERVAL
  ORDER BY c.trial_ends_at ASC;
END;
$$;

COMMENT ON FUNCTION get_expiring_trials IS 'Возвращает список клиентов с истекающими триалами для отправки уведомлений';


-- =====================================================
-- 5. Индексы для производительности
-- =====================================================

-- Индекс для быстрого поиска истекающих подписок
CREATE INDEX IF NOT EXISTS idx_clients_subscription_check 
ON clients(subscription_status, subscription_expires_at)
WHERE subscription_status = 'active';

CREATE INDEX IF NOT EXISTS idx_clients_trial_check 
ON clients(subscription_status, trial_ends_at)
WHERE subscription_status = 'trial';


-- =====================================================
-- 6. Защита от случайного изменения статуса
-- =====================================================

-- Триггер: запрещаем manual UPDATE на subscription_status
-- (только через RPC функции activate_subscription, start_trial)

CREATE OR REPLACE FUNCTION protect_subscription_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Разрешаем изменение только через SECURITY DEFINER функции
  -- Проверяем: если вызов НЕ из trusted функции → блокируем
  IF TG_OP = 'UPDATE' 
     AND OLD.subscription_status IS DISTINCT FROM NEW.subscription_status
     AND current_setting('app.trusted_function', true) IS NULL THEN
    RAISE EXCEPTION 'Изменение subscription_status разрешено только через RPC функции';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Применяем триггер (отключён по умолчанию, можно включить при необходимости)
-- CREATE TRIGGER protect_subscription_status_trigger
--   BEFORE UPDATE ON clients
--   FOR EACH ROW
--   EXECUTE FUNCTION protect_subscription_status();


-- =====================================================
-- 7. Обновляем RPC функции с флагом trusted
-- =====================================================

-- Модифицируем существующие функции для установки флага

CREATE OR REPLACE FUNCTION activate_subscription(
  p_client_id UUID,
  p_plan TEXT,
  p_months INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_amount DECIMAL(10,2);
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
  v_payment_id UUID;
BEGIN
  -- Устанавливаем флаг trusted function
  PERFORM set_config('app.trusted_function', 'true', true);
  
  -- Определяем стоимость
  v_amount := CASE p_plan
    WHEN 'base' THEN 1990.00
    WHEN 'pro' THEN 12990.00
    WHEN 'proplus' THEN 19990.00
    ELSE 0
  END;
  
  IF v_amount = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid plan');
  END IF;
  
  -- Период подписки
  v_period_start := NOW();
  v_period_end := NOW() + (p_months || ' months')::INTERVAL;
  
  -- Создаём запись платежа
  INSERT INTO payments (client_id, amount, plan, period_start, period_end, status, payment_provider)
  VALUES (p_client_id, v_amount * p_months, p_plan, v_period_start, v_period_end, 'completed', 'mock')
  RETURNING id INTO v_payment_id;
  
  -- Обновляем статус клиента
  UPDATE clients SET
    subscription_status = 'active',
    subscription_plan = p_plan,
    subscription_started_at = v_period_start,
    subscription_expires_at = v_period_end,
    updated_at = NOW()
  WHERE id = p_client_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'plan', p_plan,
    'expires_at', v_period_end
  );
END;
$$;


CREATE OR REPLACE FUNCTION start_trial(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client RECORD;
  v_trial_end TIMESTAMPTZ;
BEGIN
  -- Устанавливаем флаг trusted function
  PERFORM set_config('app.trusted_function', 'true', true);
  
  -- Получаем клиента
  SELECT * INTO v_client FROM clients WHERE id = p_client_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Client not found');
  END IF;
  
  -- Если триал уже начат — не перезапускаем
  IF v_client.trial_started_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true, 
      'already_started', true,
      'trial_ends_at', v_client.trial_ends_at
    );
  END IF;
  
  -- Триал 7 дней
  v_trial_end := NOW() + INTERVAL '7 days';
  
  -- Обновляем клиента
  UPDATE clients SET
    subscription_status = 'trial',
    trial_started_at = NOW(),
    trial_ends_at = v_trial_end,
    updated_at = NOW()
  WHERE id = p_client_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'trial_started_at', NOW(),
    'trial_ends_at', v_trial_end
  );
END;
$$;


CREATE OR REPLACE FUNCTION check_subscription_status(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client RECORD;
  v_new_status TEXT;
BEGIN
  -- Устанавливаем флаг trusted function
  PERFORM set_config('app.trusted_function', 'true', true);
  
  SELECT * INTO v_client FROM clients WHERE id = p_client_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Client not found');
  END IF;
  
  v_new_status := v_client.subscription_status;
  
  -- Проверяем истечение активной подписки
  IF v_client.subscription_status = 'active' AND v_client.subscription_expires_at < NOW() THEN
    v_new_status := 'read_only';
  END IF;
  
  -- Проверяем истечение триала
  IF v_client.subscription_status = 'trial' AND v_client.trial_ends_at IS NOT NULL AND v_client.trial_ends_at < NOW() THEN
    v_new_status := 'read_only';
  END IF;
  
  -- Обновляем если статус изменился
  IF v_new_status != v_client.subscription_status THEN
    UPDATE clients SET
      subscription_status = v_new_status,
      updated_at = NOW()
    WHERE id = p_client_id;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'status', v_new_status,
    'plan', v_client.subscription_plan,
    'expires_at', COALESCE(v_client.subscription_expires_at, v_client.trial_ends_at),
    'is_trial', v_client.subscription_status = 'trial'
  );
END;
$$;
