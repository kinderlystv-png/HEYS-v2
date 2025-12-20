-- =====================================================
-- HEYS Subscriptions & Payments Schema
-- Date: 2025-12-20
-- Description: Статусы подписок, триал, платежи
-- =====================================================

-- =====================================================
-- 1. Добавляем поля подписки в clients
-- =====================================================

ALTER TABLE clients ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trial';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS subscription_plan TEXT; -- 'base', 'pro', 'proplus'
ALTER TABLE clients ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- Комментарии
COMMENT ON COLUMN clients.subscription_status IS 'trial | active | read_only | canceled';
COMMENT ON COLUMN clients.subscription_plan IS 'base | pro | proplus';
COMMENT ON COLUMN clients.trial_started_at IS 'Время первого внесённого приёма пищи';

-- Индекс для поиска истекающих подписок
CREATE INDEX IF NOT EXISTS idx_clients_subscription_expires 
ON clients(subscription_expires_at) 
WHERE subscription_status = 'active';

-- Индекс для поиска истекающих триалов
CREATE INDEX IF NOT EXISTS idx_clients_trial_ends 
ON clients(trial_ends_at) 
WHERE subscription_status = 'trial';


-- =====================================================
-- 2. Таблица платежей (история)
-- =====================================================

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  
  -- Внешняя платёжная система (ЮKassa и др.)
  external_payment_id TEXT,
  external_status TEXT, -- 'pending', 'succeeded', 'canceled'
  payment_provider TEXT DEFAULT 'mock', -- 'mock', 'yukassa', 'stripe'
  
  -- Платёж
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'RUB',
  plan TEXT NOT NULL, -- 'base', 'pro', 'proplus'
  
  -- Период подписки
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  
  -- Статус
  status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'refunded'
  
  -- Метаданные
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_payments_client ON payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_external ON payments(external_payment_id) WHERE external_payment_id IS NOT NULL;

-- Комментарии
COMMENT ON TABLE payments IS 'История платежей клиентов';
COMMENT ON COLUMN payments.payment_provider IS 'mock для тестов, yukassa для продакшена';


-- =====================================================
-- 3. RLS политики для payments
-- =====================================================

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Кураторы видят платежи своих клиентов
CREATE POLICY "Curators can view client payments" ON payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients 
      WHERE clients.id = payments.client_id 
      AND clients.curator_id = auth.uid()
    )
  );

-- Кураторы могут создавать платежи для своих клиентов
CREATE POLICY "Curators can create client payments" ON payments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM clients 
      WHERE clients.id = payments.client_id 
      AND clients.curator_id = auth.uid()
    )
  );

-- Кураторы могут обновлять платежи своих клиентов
CREATE POLICY "Curators can update client payments" ON payments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM clients 
      WHERE clients.id = payments.client_id 
      AND clients.curator_id = auth.uid()
    )
  );


-- =====================================================
-- 4. RPC: Активировать подписку (mock или после оплаты)
-- =====================================================

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


-- =====================================================
-- 5. RPC: Старт триала (при первом приёме пищи)
-- =====================================================

CREATE OR REPLACE FUNCTION start_trial(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client RECORD;
  v_trial_end TIMESTAMPTZ;
BEGIN
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


-- =====================================================
-- 6. RPC: Проверить и обновить статус подписки
-- =====================================================

CREATE OR REPLACE FUNCTION check_subscription_status(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client RECORD;
  v_new_status TEXT;
BEGIN
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


-- =====================================================
-- 7. RPC: Получить статус подписки
-- =====================================================

CREATE OR REPLACE FUNCTION get_subscription_status(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client RECORD;
  v_days_left INTEGER;
BEGIN
  SELECT * INTO v_client FROM clients WHERE id = p_client_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Client not found');
  END IF;
  
  -- Считаем дни до конца
  IF v_client.subscription_status = 'active' AND v_client.subscription_expires_at IS NOT NULL THEN
    v_days_left := GREATEST(0, EXTRACT(DAY FROM v_client.subscription_expires_at - NOW())::INTEGER);
  ELSIF v_client.subscription_status = 'trial' AND v_client.trial_ends_at IS NOT NULL THEN
    v_days_left := GREATEST(0, EXTRACT(DAY FROM v_client.trial_ends_at - NOW())::INTEGER);
  ELSE
    v_days_left := 0;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'status', v_client.subscription_status,
    'plan', v_client.subscription_plan,
    'is_trial', v_client.subscription_status = 'trial',
    'trial_started_at', v_client.trial_started_at,
    'trial_ends_at', v_client.trial_ends_at,
    'subscription_expires_at', v_client.subscription_expires_at,
    'days_left', v_days_left,
    'can_edit', v_client.subscription_status IN ('trial', 'active')
  );
END;
$$;


-- =====================================================
-- 8. Триггер: Автозапуск триала при первом приёме пищи
-- (опционально, если есть таблица meals/day_records)
-- =====================================================

-- Этот триггер можно добавить позже когда будет таблица приёмов пищи
-- CREATE OR REPLACE FUNCTION trigger_start_trial_on_first_meal()
-- ...
