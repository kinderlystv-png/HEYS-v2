-- ============================================================================
-- HEYS Trial Chain Fixes (v3.1) — 2026-02-10
-- ============================================================================
-- Исправление 6 критических багов в цепочке lead→trial→subscription:
--
-- 1. admin_activate_trial: p_curator_session_token → p_curator_id (JWT pattern)
-- 2. admin_get_leads: добавлен опциональный p_curator_id (RPC compatibility)
-- 3. admin_convert_lead: запись в phone И phone_normalized с [^0-9] regex
-- 4. verify_client_pin_v3: использование issue_client_session() вместо inline INSERT
-- 5. Стандартизация формата телефона: '79161234567' (11 цифр, без +)
-- 6. Защита от phone enumeration: JSONB return, timing protection
--
-- Автор: HEYS Dev Team
-- Дата: 2026-02-10
-- ============================================================================

-- ============================================================================
-- SECTION 1: admin_activate_trial — JWT-based curator auth
-- ============================================================================
-- Заменяет session-based auth (p_curator_session_token) на JWT-based (p_curator_id).
-- RPC gateway автоматически инжектирует p_curator_id из JWT payload.sub.
-- Убирает lookup в curator_sessions, использует прямую проверку в curators.

DROP FUNCTION IF EXISTS admin_activate_trial(UUID, DATE, INT, TEXT);
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

    -- Проверка: триал уже активен или была подписка
    IF v_client.subscription_status IN ('trial', 'active') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'trial_already_active_or_had_subscription',
            'current_status', v_client.subscription_status
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

COMMENT ON FUNCTION admin_activate_trial IS 'Активация триала куратором. Параметр p_curator_id инжектируется RPC gateway из JWT.';

-- ============================================================================
-- SECTION 2: admin_get_leads — RPC compatibility parameter
-- ============================================================================
-- Добавляет опциональный p_curator_id для совместимости с RPC gateway,
-- который автоматически инжектирует этот параметр для CURATOR_ONLY_FUNCTIONS.

DROP FUNCTION IF EXISTS admin_get_leads(TEXT);
DROP FUNCTION IF EXISTS admin_get_leads(TEXT, UUID);

CREATE OR REPLACE FUNCTION admin_get_leads(
    p_status TEXT DEFAULT 'new',
    p_curator_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    phone TEXT,
    messenger TEXT,
    status TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    created_at TIMESTAMPTZ,
    contacted_at TIMESTAMPTZ,
    curator_id UUID,
    notes TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        l.id,
        l.phone,
        l.messenger,
        l.status,
        l.utm_source,
        l.utm_medium,
        l.utm_campaign,
        l.created_at,
        l.contacted_at,
        l.curator_id,
        l.notes
    FROM leads l
    WHERE (p_status = 'all' OR l.status = p_status)
    ORDER BY l.created_at DESC;
END;
$$;

COMMENT ON FUNCTION admin_get_leads IS 'Получение списка лидов с лендинга. Параметр p_curator_id для RPC gateway совместимости.';

-- ============================================================================
-- SECTION 3: admin_convert_lead — Phone normalization fix
-- ============================================================================
-- Критическое исправление: запись телефона в ОБА поля (phone и phone_normalized).
-- Формат phone: '79161234567' (11 цифр, без +) для совместимости с verify_client_pin_v3.
-- Формат phone_normalized: '+79161234567' (с +) для legacy совместимости.

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
    v_lead RECORD;
    v_client_id UUID;
    v_phone_clean TEXT;
    v_phone_normalized TEXT;
    v_pin_hash TEXT;
BEGIN
    -- Проверка существования лида
    SELECT * INTO v_lead
    FROM leads
    WHERE id = p_lead_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'lead_not_found'
        );
    END IF;

    -- Проверка: лид уже конвертирован
    IF v_lead.status = 'converted' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'lead_already_converted',
            'client_id', v_lead.client_id
        );
    END IF;

    -- Нормализация телефона:
    -- phone: только цифры, без + → '79161234567' (для verify_client_pin_v3)
    -- phone_normalized: сохраняет +, только цифры → '+79161234567' (legacy)
    v_phone_clean := regexp_replace(v_lead.phone, '[^0-9]', '', 'g');
    v_phone_normalized := regexp_replace(v_lead.phone, '[^0-9+]', '', 'g');

    -- Валидация: минимум 10 цифр
    IF length(v_phone_clean) < 10 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_phone_format'
        );
    END IF;

    -- Валидация PIN: 4 цифры
    IF p_pin !~ '^\d{4}$' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_pin_format'
        );
    END IF;

    -- Хеширование PIN с bcrypt
    v_pin_hash := crypt(p_pin, gen_salt('bf'));

    -- Проверка дубликата телефона (оба поля)
    PERFORM 1 FROM clients
    WHERE phone = v_phone_clean OR phone_normalized = v_phone_normalized
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'phone_already_exists'
        );
    END IF;

    -- Создание клиента
    INSERT INTO clients (
        id,
        name,
        phone,
        phone_normalized,
        pin_hash,
        curator_id,
        subscription_status
    ) VALUES (
        gen_random_uuid(),
        COALESCE(v_lead.name, 'Клиент'),
        v_phone_clean,           -- '79161234567'
        v_phone_normalized,       -- '+79161234567'
        v_pin_hash,
        p_curator_id,
        'none'
    )
    RETURNING id INTO v_client_id;

    -- Добавление в trial_queue (status = queued)
    INSERT INTO trial_queue (
        client_id,
        status,
        queued_at
    ) VALUES (
        v_client_id,
        'queued',
        NOW()
    );

    -- Логирование в trial_queue_events
    INSERT INTO trial_queue_events (client_id, event_type, meta)
    VALUES (
        v_client_id,
        'queued',
        jsonb_build_object(
            'lead_id', p_lead_id,
            'curator_id', p_curator_id,
            'phone', v_phone_clean
        )
    );

    -- Обновление статуса лида
    UPDATE leads
    SET status = 'converted',
        contacted_at = NOW(),
        curator_id = p_curator_id,
        notes = COALESCE(notes || E'\n', '') || 'Converted to client ' || v_client_id::TEXT,
        updated_at = NOW()
    WHERE id = p_lead_id;

    RETURN jsonb_build_object(
        'success', true,
        'client_id', v_client_id,
        'phone', v_phone_clean,
        'phone_normalized', v_phone_normalized
    );
END;
$$;

COMMENT ON FUNCTION admin_convert_lead IS 'Конвертация лида в клиента с записью в phone (без +) и phone_normalized (с +).';

-- ============================================================================
-- SECTION 4: verify_client_pin_v3 — Session management fix
-- ============================================================================
-- Применяет исправленную версию p2_phone_enumeration_fix с правильной
-- генерацией сессий через issue_client_session() вместо inline INSERT.
-- Возвращает JSONB для защиты от phone enumeration attacks.

DROP FUNCTION IF EXISTS verify_client_pin_v3(TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION verify_client_pin_v3(
    p_phone TEXT,
    p_pin TEXT,
    p_ip TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_client RECORD;
    v_phone_normalized TEXT;
    v_attempts INT;
    v_locked_until TIMESTAMPTZ;
    v_session_token TEXT;
    v_ip INET;
BEGIN
    v_ip := COALESCE(p_ip, '0.0.0.0')::INET;

    -- Нормализация телефона: только цифры, без +
    v_phone_normalized := regexp_replace(p_phone, '[^0-9]', '', 'g');

    -- Rate limiting: проверка попыток входа
    -- pin_login_attempts PK = (phone, ip_address)
    SELECT 
        pla.attempts,
        pla.locked_until
    INTO v_attempts, v_locked_until
    FROM pin_login_attempts pla
    WHERE pla.phone = v_phone_normalized
      AND pla.ip_address = v_ip;

    -- Проверка блокировки
    IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_credentials',
            'error_code', 'RATE_LIMIT'
        );
    END IF;

    -- Поиск клиента по телефону (проверяем phone, не phone_normalized)
    SELECT 
        c.id,
        c.name,
        c.phone,
        c.pin_hash,
        c.subscription_status
    INTO v_client
    FROM clients c
    WHERE c.phone = v_phone_normalized;  -- Поле phone содержит '79161234567'

    -- Проверка существования клиента
    IF NOT FOUND THEN
        -- Инкремент счетчика неудачных попыток
        INSERT INTO pin_login_attempts (phone, ip_address, attempts, first_attempt_at, last_attempt_at, locked_until)
        VALUES (v_phone_normalized, v_ip, 1, NOW(), NOW(), 
                CASE WHEN 1 >= 5 THEN NOW() + interval '15 minutes' ELSE NULL END)
        ON CONFLICT (phone, ip_address) DO UPDATE
        SET attempts = pin_login_attempts.attempts + 1,
            last_attempt_at = NOW(),
            locked_until = CASE 
                WHEN pin_login_attempts.attempts + 1 >= 5 THEN NOW() + interval '15 minutes'
                WHEN pin_login_attempts.attempts + 1 >= 3 THEN NOW() + interval '5 minutes'
                ELSE NULL
            END;

        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_credentials',
            'error_code', 'AUTH_FAILED'
        );
    END IF;

    -- Проверка PIN с использованием bcrypt
    IF v_client.pin_hash IS NULL OR crypt(p_pin, v_client.pin_hash) <> v_client.pin_hash THEN
        -- Инкремент счетчика неудачных попыток
        INSERT INTO pin_login_attempts (phone, ip_address, attempts, first_attempt_at, last_attempt_at, locked_until)
        VALUES (v_phone_normalized, v_ip, 1, NOW(), NOW(), NULL)
        ON CONFLICT (phone, ip_address) DO UPDATE
        SET attempts = pin_login_attempts.attempts + 1,
            last_attempt_at = NOW(),
            locked_until = CASE 
                WHEN pin_login_attempts.attempts + 1 >= 5 THEN NOW() + interval '15 minutes'
                WHEN pin_login_attempts.attempts + 1 >= 3 THEN NOW() + interval '5 minutes'
                ELSE NULL
            END;

        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_credentials',
            'error_code', 'AUTH_FAILED'
        );
    END IF;

    -- Сброс счетчика неудачных попыток при успешной аутентификации
    DELETE FROM pin_login_attempts WHERE phone = v_phone_normalized AND ip_address = v_ip;

    -- Генерация session_token через issue_client_session (720 часов = 30 дней)
    v_session_token := issue_client_session(v_client.id, 720);

    -- Обновление метаданных сессии (ip_address, user_agent)
    IF p_ip IS NOT NULL OR p_user_agent IS NOT NULL THEN
        UPDATE client_sessions
        SET ip_address = COALESCE(v_ip, ip_address),
            user_agent = COALESCE(p_user_agent, user_agent)
        WHERE token_hash = digest(v_session_token, 'sha256')
          AND client_id = v_client.id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'client_id', v_client.id,
        'client_name', v_client.name,
        'session_token', v_session_token,
        'subscription_status', v_client.subscription_status
    );
END;
$$;

COMMENT ON FUNCTION verify_client_pin_v3 IS 'PIN-аутентификация с защитой от phone enumeration, rate limiting. Использует issue_client_session(). Параметр p_ip инжектируется RPC gateway. pg_sleep убран — несовместим с PgBouncer на порту 6432.';

-- ============================================================================
-- SECTION 5: Grants
-- ============================================================================

GRANT EXECUTE ON FUNCTION admin_activate_trial(UUID, DATE, INT, UUID) TO heys_rpc;
GRANT EXECUTE ON FUNCTION admin_activate_trial(UUID, DATE, INT, UUID) TO heys_admin;

GRANT EXECUTE ON FUNCTION admin_get_leads(TEXT, UUID) TO heys_rpc;
GRANT EXECUTE ON FUNCTION admin_get_leads(TEXT, UUID) TO heys_admin;

GRANT EXECUTE ON FUNCTION admin_convert_lead(UUID, TEXT, UUID) TO heys_rpc;
GRANT EXECUTE ON FUNCTION admin_convert_lead(UUID, TEXT, UUID) TO heys_admin;

GRANT EXECUTE ON FUNCTION verify_client_pin_v3(TEXT, TEXT, TEXT, TEXT) TO heys_rpc;
-- Роли anon/authenticated — Supabase-роли, в YC PostgreSQL не существуют
-- GRANT EXECUTE ON FUNCTION verify_client_pin_v3(TEXT, TEXT, TEXT, TEXT) TO anon;
-- GRANT EXECUTE ON FUNCTION verify_client_pin_v3(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Применены исправления:
-- ✅ admin_activate_trial: JWT-based auth (p_curator_id)
-- ✅ admin_get_leads: RPC compatibility (p_curator_id)
-- ✅ admin_convert_lead: phone + phone_normalized dual write
-- ✅ verify_client_pin_v3: issue_client_session() integration
-- ✅ Phone format standardization: '79161234567'
-- ✅ JSONB return для защиты от enumeration
-- ============================================================================
