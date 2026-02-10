-- ============================================================================
-- HEYS Subscription Protection — 2026-02-10
-- ============================================================================
-- Защита от одновременного триала и подписки:
-- 1. admin_activate_trial: проверка trial_ends_at, subscription_ends_at
-- 2. admin_convert_lead: проверка перед добавлением в trial_queue
--
-- Автор: HEYS Dev Team
-- Дата: 2026-02-10 (late)
-- ============================================================================

-- ============================================================================
-- SECTION 1: admin_activate_trial — полная проверка подписок
-- ============================================================================
DROP FUNCTION IF EXISTS admin_activate_trial(UUID, DATE, INT, UUID);

CREATE OR REPLACE FUNCTION admin_activate_trial(
    p_client_id UUID,
    p_start_date DATE DEFAULT CURRENT_DATE,
    p_trial_days INT DEFAULT 7,
    p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_client RECORD;
    v_curator RECORD;
    v_trial_start_at TIMESTAMPTZ;
    v_trial_ends_at TIMESTAMPTZ;
    v_is_future BOOLEAN;
    v_has_active_subscription BOOLEAN;
BEGIN
    -- Проверка существования куратора (опционально, для логирования)
    IF p_curator_id IS NOT NULL THEN
        SELECT id, name INTO v_curator
        FROM curators
        WHERE id = p_curator_id;
        
        IF NOT FOUND THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'curator_not_found'
            );
        END IF;
    END IF;

    -- Получение данных клиента
    SELECT * INTO v_client
    FROM clients
    WHERE id = p_client_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'client_not_found'
        );
    END IF;

    -- УСИЛЕННАЯ ПРОВЕРКА: активная подписка или триал
    -- Проверяем:
    -- 1. trial_ends_at > NOW() (активный триал)
    -- 2. subscription_status = 'active' (активная подписка)
    -- 3. Наличие активной записи в subscriptions
    
    -- Проверка активного триала
    IF v_client.trial_ends_at IS NOT NULL AND v_client.trial_ends_at > NOW() THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'trial_already_active',
            'trial_ends_at', v_client.trial_ends_at
        );
    END IF;

    -- Проверка активной подписки в subscription_status
    IF v_client.subscription_status = 'active' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'subscription_already_active',
            'current_status', v_client.subscription_status
        );
    END IF;

    -- Проверка активной подписки в таблице subscriptions
    SELECT EXISTS(
        SELECT 1 
        FROM subscriptions 
        WHERE client_id = p_client_id 
          AND status = 'active'
          AND (ends_at IS NULL OR ends_at > NOW())
    ) INTO v_has_active_subscription;

    IF v_has_active_subscription THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'active_subscription_exists',
            'message', 'Client has active paid subscription'
        );
    END IF;

    -- Определение статуса триала по дате старта
    v_is_future := (p_start_date > CURRENT_DATE);

    IF v_is_future THEN
        -- Отложенный триал (trial_pending)
        UPDATE clients
        SET subscription_status = 'trial_pending',
            trial_started_at = p_start_date::TIMESTAMPTZ,
            trial_ends_at = (p_start_date + (p_trial_days || ' days')::interval)::TIMESTAMPTZ,
            updated_at = NOW()
        WHERE id = p_client_id
        RETURNING trial_started_at, trial_ends_at
        INTO v_trial_start_at, v_trial_ends_at;
    ELSE
        -- Немедленный триал (trial)
        UPDATE clients
        SET subscription_status = 'trial',
            trial_started_at = NOW(),
            trial_ends_at = NOW() + (p_trial_days || ' days')::interval,
            updated_at = NOW()
        WHERE id = p_client_id
        RETURNING trial_started_at, trial_ends_at
        INTO v_trial_start_at, v_trial_ends_at;
    END IF;

    -- Обновление trial_queue: queued → assigned
    UPDATE trial_queue
    SET status = 'assigned',
        assigned_at = NOW(),
        updated_at = NOW()
    WHERE client_id = p_client_id
      AND status = 'queued';

    -- Логирование события в trial_queue_events
    INSERT INTO trial_queue_events (client_id, event_type, meta)
    VALUES (
        p_client_id,
        'claimed',
        jsonb_build_object(
            'curator_id', p_curator_id,
            'start_date', p_start_date,
            'trial_days', p_trial_days,
            'is_future', v_is_future
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'status', CASE WHEN v_is_future THEN 'trial_pending' ELSE 'trial' END,
        'trial_started_at', v_trial_start_at,
        'trial_ends_at', v_trial_ends_at,
        'is_future', v_is_future
    );
END;
$$;

COMMENT ON FUNCTION admin_activate_trial IS 'Trial Machine v3.1: Активация триала с полной проверкой активных подписок';
GRANT EXECUTE ON FUNCTION admin_activate_trial TO heys_admin;


-- ============================================================================
-- SECTION 2: admin_convert_lead — защита от триала при активной подписке
-- ============================================================================
DROP FUNCTION IF EXISTS admin_convert_lead(UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION admin_convert_lead(
  p_lead_id UUID,
  p_pin TEXT,
  p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead_data RECORD;
  v_client_id UUID;
  v_client_data RECORD;
  v_existing_client RECORD;
BEGIN
  -- 1. Получить данные лида
  SELECT * INTO v_lead_data
  FROM leads
  WHERE id = p_lead_id
    AND COALESCE(status, 'new') = 'new';

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Lead not found or already converted'
    );
  END IF;

  -- 2. Проверка на существующего клиента с этим телефоном
  SELECT id, subscription_status, trial_ends_at INTO v_existing_client
  FROM clients
  WHERE phone = v_lead_data.phone
  LIMIT 1;

  IF FOUND THEN
    -- Клиент уже существует, обновляем лид и НЕ добавляем в trial_queue
    UPDATE leads
    SET 
      status = 'converted',
      converted_to_client_id = v_existing_client.id,
      converted_at = NOW(),
      updated_at = NOW()
    WHERE id = p_lead_id;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'client_already_exists',
      'client_id', v_existing_client.id,
      'message', 'Client with this phone already exists'
    );
  END IF;

  -- 3. Создать клиента
  INSERT INTO clients (
    name,
    phone,
    pin_hash,
    curator_id
  ) VALUES (
    v_lead_data.name,
    v_lead_data.phone,
    crypt(p_pin, gen_salt('bf')),  -- bcrypt hash
    p_curator_id
  )
  RETURNING id, name, phone, curator_id INTO v_client_data;

  v_client_id := v_client_data.id;

  -- 4. Обновить лид
  UPDATE leads
  SET 
    status = 'converted',
    converted_to_client_id = v_client_id,
    converted_at = NOW(),
    updated_at = NOW()
  WHERE id = p_lead_id;

  -- 5. Добавить в очередь триала (только для новых клиентов без подписки)
  INSERT INTO trial_queue (
    client_id,
    curator_id,
    status,
    created_at
  ) VALUES (
    v_client_id,
    p_curator_id,
    'queued',
    NOW()
  );

  -- 6. Записать событие
  INSERT INTO trial_queue_events (
    client_id,
    event_type,
    curator_id,
    metadata,
    created_at
  ) VALUES (
    v_client_id,
    'queued',
    p_curator_id,
    jsonb_build_object('source', 'lead_conversion', 'lead_id', p_lead_id),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'client_id', v_client_id,
    'client', jsonb_build_object(
      'id', v_client_data.id,
      'name', v_client_data.name,
      'phone', v_client_data.phone,
      'curator_id', v_client_data.curator_id
    )
  );
END;
$$;

COMMENT ON FUNCTION admin_convert_lead IS 'Trial Machine v3.1: Конвертация лида с проверкой дубликатов телефона';
GRANT EXECUTE ON FUNCTION admin_convert_lead TO heys_admin;
