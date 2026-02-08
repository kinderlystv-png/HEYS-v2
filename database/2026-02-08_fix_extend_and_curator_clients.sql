-- ═══════════════════════════════════════════════════════════════════════════════
-- 📅 2026-02-08: Фикс admin_extend_subscription + get_curator_clients
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Проблемы:
--   1. admin_extend_subscription пишет SET status = ... в subscriptions,
--      но колонки status НЕТ → 500 Database Error
--   2. admin_extend_subscription обновляет trial_ends_at вместо active_until
--      для 'active' статуса → get_effective_subscription_status возвращает read_only
--   3. get_curator_clients читает clients.subscription_status (стейл),
--      а get_subscription_status_by_session использует subscriptions →
--      куратор видит 'trial', а клиент видит 'read_only'
--
-- Решение:
--   1. Фикс admin_extend_subscription — убрать status, использовать active_until
--   2. Фикс get_curator_clients — использовать get_effective_subscription_status()
--   3. Data-fix: Синхронизация subscriptions для клиентов с trial в clients
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. ФИКС admin_extend_subscription
--    - Убрана несуществующая колонка status
--    - Для 'active' статуса обновляет active_until (не trial_ends_at)
--    - UPSERT в subscriptions (создаёт запись если не было)
--    - Синхронизирует clients.subscription_status
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_extend_subscription(
    p_curator_id UUID,
    p_client_id UUID,
    p_months INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_client RECORD;
    v_sub RECORD;
    v_new_end_date TIMESTAMPTZ;
    v_old_status TEXT;
    v_new_status TEXT;
BEGIN
    -- 1. Проверяем что клиент принадлежит куратору
    SELECT
        c.id,
        c.name,
        c.subscription_status,
        c.curator_id
    INTO v_client
    FROM public.clients c
    WHERE c.id = p_client_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'client_not_found',
            'message', 'Клиент не найден'
        );
    END IF;

    IF v_client.curator_id IS NULL OR v_client.curator_id != p_curator_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'access_denied',
            'message', 'Вы не являетесь куратором этого клиента'
        );
    END IF;

    -- 2. Получаем текущее состояние из subscriptions (source of truth!)
    SELECT s.active_until, s.trial_ends_at, s.trial_started_at
    INTO v_sub
    FROM public.subscriptions s
    WHERE s.client_id = p_client_id;

    -- 3. Вычисляем old_status через get_effective_subscription_status
    v_old_status := COALESCE(public.get_effective_subscription_status(p_client_id), 'none');

    -- 4. Вычисляем новую дату окончания
    -- База: берём max из active_until и trial_ends_at (если не истекли)
    IF v_sub IS NOT NULL AND v_sub.active_until IS NOT NULL AND v_sub.active_until > NOW() THEN
        -- Активная подписка — продлеваем от active_until
        v_new_end_date := v_sub.active_until + (p_months || ' months')::INTERVAL;
    ELSIF v_sub IS NOT NULL AND v_sub.trial_ends_at IS NOT NULL AND v_sub.trial_ends_at > NOW() THEN
        -- Активный триал — продлеваем от trial_ends_at (конвертируя в active)
        v_new_end_date := v_sub.trial_ends_at + (p_months || ' months')::INTERVAL;
    ELSE
        -- Истекла или не было — считаем от сегодня
        v_new_end_date := NOW() + (p_months || ' months')::INTERVAL;
    END IF;

    v_new_status := 'active';

    -- 5. UPSERT в subscriptions (active_until, НЕ trial_ends_at!)
    INSERT INTO public.subscriptions (client_id, active_until, updated_at)
    VALUES (p_client_id, v_new_end_date, NOW())
    ON CONFLICT (client_id) DO UPDATE SET
        active_until = v_new_end_date,
        updated_at = NOW();

    -- 6. Синхронизируем clients table
    UPDATE public.clients
    SET
        subscription_status = v_new_status,
        updated_at = NOW()
    WHERE id = p_client_id;

    RETURN jsonb_build_object(
        'success', true,
        'client_id', p_client_id,
        'client_name', v_client.name,
        'old_status', v_old_status,
        'new_status', v_new_status,
        'new_end_date', v_new_end_date,
        'extended_months', p_months
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_extend_subscription(UUID, UUID, INT) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.admin_extend_subscription(UUID, UUID, INT) TO heys_admin;

COMMENT ON FUNCTION public.admin_extend_subscription IS 'Продление подписки клиента куратором на N месяцев. Обновляет subscriptions.active_until';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. ФИКС get_curator_clients
--    Использует get_effective_subscription_status() вместо clients.subscription_status
--    Читает trial_ends_at/active_until из subscriptions (source of truth)
--    DROP обязателен — return type изменился (добавлен active_until)
-- ═══════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_curator_clients(UUID);

CREATE OR REPLACE FUNCTION public.get_curator_clients(p_curator_id UUID)
RETURNS TABLE(
    id UUID,
    name TEXT,
    phone TEXT,
    subscription_status TEXT,
    subscription_plan TEXT,
    trial_ends_at TIMESTAMPTZ,
    active_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.name,
        c.phone_normalized AS phone,
        -- Source of truth: вычисляем статус из subscriptions, fallback на clients
        COALESCE(
            public.get_effective_subscription_status(c.id),
            c.subscription_status,
            'none'
        )::TEXT AS subscription_status,
        c.subscription_plan,
        -- Даты из subscriptions (source of truth), fallback на clients
        COALESCE(s.trial_ends_at, c.trial_ends_at) AS trial_ends_at,
        s.active_until,
        c.updated_at AS created_at
    FROM clients c
    LEFT JOIN subscriptions s ON s.client_id = c.id
    WHERE c.curator_id = p_curator_id
    ORDER BY c.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_curator_clients(UUID) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.get_curator_clients(UUID) TO heys_admin;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. DATA-FIX: Синхронизация subscriptions для клиентов
--    Если clients.subscription_status = 'trial' и clients.trial_ends_at > NOW(),
--    но в subscriptions нет записи или trial_ends_at не совпадает → фиксим
-- ═══════════════════════════════════════════════════════════════════════════════

-- 3a. Создаём subscriptions записи для клиентов без них (но с trial в clients)
INSERT INTO public.subscriptions (client_id, trial_started_at, trial_ends_at, trial_approved_at, updated_at)
SELECT
    c.id,
    COALESCE(c.trial_ends_at - INTERVAL '7 days', NOW()),
    c.trial_ends_at,
    COALESCE(c.trial_ends_at - INTERVAL '7 days', NOW()),
    NOW()
FROM public.clients c
LEFT JOIN public.subscriptions s ON s.client_id = c.id
WHERE c.subscription_status IN ('trial', 'trial_pending')
  AND c.trial_ends_at IS NOT NULL
  AND c.trial_ends_at > NOW()
  AND s.client_id IS NULL;

-- 3b. Синхронизируем trial_ends_at если clients > subscriptions
UPDATE public.subscriptions s
SET
    trial_ends_at = c.trial_ends_at,
    trial_started_at = COALESCE(s.trial_started_at, c.trial_ends_at - INTERVAL '7 days'),
    trial_approved_at = COALESCE(s.trial_approved_at, s.trial_started_at, c.trial_ends_at - INTERVAL '7 days'),
    updated_at = NOW()
FROM public.clients c
WHERE c.id = s.client_id
  AND c.subscription_status IN ('trial', 'trial_pending')
  AND c.trial_ends_at IS NOT NULL
  AND c.trial_ends_at > NOW()
  AND (s.trial_ends_at IS NULL OR s.trial_ends_at < c.trial_ends_at);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. admin_cancel_subscription — сброс подписки куратором
--    Обнуляет подписку: active_until, trial_ends_at → NULL
--    Ставит clients.subscription_status = 'none'
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_cancel_subscription(
    p_curator_id UUID,
    p_client_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_client RECORD;
    v_old_status TEXT;
BEGIN
    -- 1. Проверяем что клиент принадлежит куратору
    SELECT c.id, c.name, c.curator_id
    INTO v_client
    FROM public.clients c
    WHERE c.id = p_client_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'client_not_found',
            'message', 'Клиент не найден'
        );
    END IF;

    IF v_client.curator_id IS NULL OR v_client.curator_id != p_curator_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'access_denied',
            'message', 'Вы не являетесь куратором этого клиента'
        );
    END IF;

    -- 2. Получаем текущий статус
    v_old_status := COALESCE(public.get_effective_subscription_status(p_client_id), 'none');

    -- 3. Обнуляем subscriptions
    UPDATE public.subscriptions
    SET
        active_until = NULL,
        trial_ends_at = NULL,
        trial_started_at = NULL,
        trial_approved_at = NULL,
        canceled_at = NOW(),
        updated_at = NOW()
    WHERE client_id = p_client_id;

    -- 4. Обновляем clients
    UPDATE public.clients
    SET
        subscription_status = 'none',
        updated_at = NOW()
    WHERE id = p_client_id;

    RETURN jsonb_build_object(
        'success', true,
        'client_id', p_client_id,
        'client_name', v_client.name,
        'old_status', v_old_status,
        'new_status', 'none'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_cancel_subscription(UUID, UUID) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.admin_cancel_subscription(UUID, UUID) TO heys_admin;

COMMENT ON FUNCTION public.admin_cancel_subscription IS 'Сброс подписки клиента куратором. Обнуляет все даты, ставит none';

-- ═══════════════════════════════════════════════════════════════════════════════
-- DONE
-- ═══════════════════════════════════════════════════════════════════════════════
