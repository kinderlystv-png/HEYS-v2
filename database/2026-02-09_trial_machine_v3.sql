-- ═══════════════════════════════════════════════════════════════════════════════════
-- 🔧 Trial Machine v3.0 — куратор выбирает дату старта триала
-- Дата: 2026-02-09
-- 
-- Корректный флоу v3.0:
--   1. Клиент оставляет заявку на лендинге → leads таблица
--   2. Куратор видит лиды в админке → admin_get_leads()
--   3. Куратор создаёт клиента из лида → admin_convert_lead()
--   4. Куратор даёт клиенту PIN, обсуждает программу
--   5. Куратор активирует триал С ВЫБОРОМ ДАТЫ → admin_activate_trial()
--      - Если дата = сегодня → сразу trial (7 дней)
--      - Если дата в будущем → trial_pending (ждём дату)
--   6. Дата наступила → trial (7 дней отсюда)
--   7. 7 дней истекли → read_only → paywall
--
-- Изменения от v2.0:
--   - admin_activate_trial: принимает p_client_id (не p_queue_id) + p_start_date
--   - get_effective_subscription_status: trial_pending = trial_started_at > NOW()
--   - Новые: admin_get_leads(), admin_convert_lead()
--   - activate_trial_timer_by_session: deprecated (куратор сам выбирает дату)
-- ═══════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 1. ОБНОВЛЁННАЯ admin_activate_trial v3.0
--    Принимает p_client_id + p_start_date (DATE, default сегодня)
--    Если start_date = сегодня → trial сразу
--    Если start_date > сегодня → trial_pending до наступления даты
-- ═══════════════════════════════════════════════════════════════════════════════════

-- Удаляем все версии (разные сигнатуры)
DROP FUNCTION IF EXISTS public.admin_activate_trial(UUID, INT, TEXT);
DROP FUNCTION IF EXISTS public.admin_activate_trial(UUID, INT, TEXT, DATE);
DROP FUNCTION IF EXISTS public.admin_activate_trial(UUID, DATE, INT, TEXT);

CREATE OR REPLACE FUNCTION admin_activate_trial(
  p_client_id UUID,
  p_start_date DATE DEFAULT CURRENT_DATE,
  p_trial_days INT DEFAULT 7,
  p_curator_session_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_curator_id UUID;
  v_client RECORD;
  v_queue_id UUID;
  v_trial_start TIMESTAMPTZ;
  v_trial_end TIMESTAMPTZ;
  v_is_future BOOLEAN;
  v_status TEXT;
BEGIN
  -- 1. Проверка куратора (опционально)
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
  SET subscription_status = v_status
  WHERE id = p_client_id;
  
  -- 5. UPSERT в subscriptions
  INSERT INTO subscriptions (client_id, trial_approved_at, trial_started_at, trial_ends_at)
  VALUES (p_client_id, NOW(), v_trial_start, v_trial_end)
  ON CONFLICT (client_id) DO UPDATE SET
    trial_approved_at = NOW(),
    trial_started_at = v_trial_start,
    trial_ends_at = v_trial_end;
  
  -- 6. Обновляем запись в очереди (если есть)
  SELECT id INTO v_queue_id
  FROM trial_queue
  WHERE client_id = p_client_id
    AND status IN ('queued', 'offer')
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_queue_id IS NOT NULL THEN
    UPDATE trial_queue
    SET 
      status = 'assigned',
      assigned_at = NOW()
    WHERE id = v_queue_id;
    
    -- Логируем событие
    INSERT INTO trial_queue_events (client_id, event_type, meta)
    VALUES (p_client_id, 'claimed', jsonb_build_object(
      'approved_by', COALESCE(v_curator_id::text, 'admin'),
      'trial_days', p_trial_days,
      'start_date', p_start_date::text,
      'is_future', v_is_future
    ));
  END IF;
  
  -- 7. Возвращаем результат
  RETURN jsonb_build_object(
    'success', true,
    'client_id', p_client_id,
    'client_name', v_client.name,
    'status', v_status,
    'trial_days', p_trial_days,
    'start_date', p_start_date,
    'trial_started_at', v_trial_start,
    'trial_ends_at', v_trial_end,
    'is_future', v_is_future
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 2. ОБНОВЛЁННЫЙ get_effective_subscription_status v3.0
--    trial_pending = trial одобрен, но start_date в будущем (trial_started_at > NOW())
-- ═══════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_effective_subscription_status(p_client_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT
    CASE
      -- Платная подписка — приоритет
      WHEN s.active_until IS NOT NULL AND s.active_until > NOW() THEN 'active'
      -- Триал запущен и не истёк (start_date наступил)
      WHEN s.trial_started_at IS NOT NULL 
        AND s.trial_started_at <= NOW() 
        AND s.trial_ends_at IS NOT NULL 
        AND s.trial_ends_at > NOW() 
        THEN 'trial'
      -- Триал одобрен, но start_date в будущем
      WHEN s.trial_approved_at IS NOT NULL 
        AND s.trial_started_at IS NOT NULL 
        AND s.trial_started_at > NOW()
        THEN 'trial_pending'
      -- Триал/подписка истекли → read_only
      WHEN s.trial_started_at IS NOT NULL 
        OR s.active_until IS NOT NULL 
        OR s.canceled_at IS NOT NULL 
        THEN 'read_only'
      ELSE 'none'
    END
  FROM public.subscriptions s
  WHERE s.client_id = p_client_id;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 3. admin_get_leads — список лидов с лендинга для админки куратора
-- ═══════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_get_leads(
  p_status TEXT DEFAULT 'new'
)
RETURNS TABLE(
  id UUID,
  name TEXT,
  phone TEXT,
  messenger TEXT,
  utm_source TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    l.id,
    l.name,
    l.phone,
    l.messenger,
    l.utm_source,
    l.status,
    l.created_at,
    l.updated_at
  FROM leads l
  WHERE (p_status = 'all' OR l.status = p_status)
  ORDER BY l.created_at DESC
  LIMIT 100;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 4. admin_convert_lead — создать клиента из лида
--    Создаёт клиента, ставит PIN, добавляет в trial_queue, помечает лид converted
-- ═══════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_convert_lead(
  p_lead_id UUID,
  p_pin TEXT,
  p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead RECORD;
  v_client_id UUID;
  v_existing_client UUID;
  v_curator UUID;
BEGIN
  -- 1. Получаем лид
  SELECT * INTO v_lead
  FROM leads
  WHERE id = p_lead_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'lead_not_found',
      'message', 'Лид не найден'
    );
  END IF;
  
  IF v_lead.status = 'converted' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'already_converted',
      'message', 'Лид уже сконвертирован'
    );
  END IF;
  
  -- 2. Проверяем нет ли уже клиента с таким телефоном
  SELECT id INTO v_existing_client
  FROM clients
  WHERE phone_normalized = regexp_replace(v_lead.phone, '[^0-9+]', '', 'g');
  
  IF v_existing_client IS NOT NULL THEN
    -- Клиент уже есть — помечаем лид как converted
    UPDATE leads SET status = 'converted', updated_at = NOW() WHERE id = p_lead_id;
    
    RETURN jsonb_build_object(
      'success', true,
      'client_id', v_existing_client,
      'note', 'Клиент с этим телефоном уже существует',
      'already_existed', true
    );
  END IF;
  
  -- 3. Определяем куратора (первый доступный, если не указан)
  v_curator := p_curator_id;
  IF v_curator IS NULL THEN
    SELECT id INTO v_curator
    FROM curators
    WHERE is_active = true
    ORDER BY created_at
    LIMIT 1;
  END IF;
  
  IF v_curator IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'no_curator',
      'message', 'Нет активных кураторов'
    );
  END IF;
  
  -- 4. Создаём клиента
  v_client_id := gen_random_uuid();
  
  INSERT INTO clients (
    id, name, phone_normalized, curator_id,
    pin_hash, subscription_status
  ) VALUES (
    v_client_id,
    v_lead.name,
    regexp_replace(v_lead.phone, '[^0-9+]', '', 'g'),
    v_curator,
    crypt(p_pin, gen_salt('bf')),
    'none'
  );
  
  -- 5. Добавляем в trial_queue
  INSERT INTO trial_queue (client_id, status, created_at)
  VALUES (v_client_id, 'queued', NOW());
  
  -- 6. Помечаем лид как converted
  UPDATE leads 
  SET status = 'converted', updated_at = NOW()
  WHERE id = p_lead_id;
  
  -- 7. Логируем
  INSERT INTO trial_queue_events (client_id, event_type, meta)
  VALUES (v_client_id, 'queued', jsonb_build_object(
    'source', 'lead_conversion',
    'lead_id', p_lead_id,
    'lead_name', v_lead.name,
    'lead_phone', v_lead.phone
  ));
  
  RETURN jsonb_build_object(
    'success', true,
    'client_id', v_client_id,
    'client_name', v_lead.name,
    'client_phone', regexp_replace(v_lead.phone, '[^0-9+]', '', 'g'),
    'already_existed', false
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 5. GRANTs
-- ═══════════════════════════════════════════════════════════════════════════════════

-- Новая сигнатура admin_activate_trial
GRANT EXECUTE ON FUNCTION admin_activate_trial(UUID, DATE, INT, TEXT) TO heys_admin;
GRANT EXECUTE ON FUNCTION admin_activate_trial(UUID, DATE, INT, TEXT) TO heys_rpc;

-- Leads функции
GRANT EXECUTE ON FUNCTION public.admin_get_leads(TEXT) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.admin_get_leads(TEXT) TO heys_rpc;

GRANT EXECUTE ON FUNCTION public.admin_convert_lead(UUID, TEXT, UUID) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.admin_convert_lead(UUID, TEXT, UUID) TO heys_rpc;

-- Refreshe existing grants (get_effective_subscription_status updated)
GRANT EXECUTE ON FUNCTION public.get_effective_subscription_status(UUID) TO heys_rpc;

COMMIT;

DO $$
BEGIN
  RAISE NOTICE '✅ Trial Machine v3.0 миграция применена';
  RAISE NOTICE '  - admin_activate_trial: принимает p_client_id + p_start_date';
  RAISE NOTICE '  - get_effective_subscription_status: trial_pending = start_date в будущем';
  RAISE NOTICE '  - admin_get_leads: список лидов с лендинга';
  RAISE NOTICE '  - admin_convert_lead: создание клиента из лида';
END $$;
