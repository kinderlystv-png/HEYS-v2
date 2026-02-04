-- ═══════════════════════════════════════════════════════════════════════════════
-- 📅 2026-02-04: admin_extend_subscription — Продление подписки куратором
-- ═══════════════════════════════════════════════════════════════════════════════
-- 
-- Назначение: Позволяет куратору продлить подписку своего клиента на N месяцев
-- Безопасность: Проверяет что curator_id совпадает с владельцем клиента
-- 
-- Использование:
--   SELECT * FROM admin_extend_subscription(
--     p_curator_id := 'uuid-куратора',
--     p_client_id := 'uuid-клиента', 
--     p_months := 1
--   );
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
    v_new_end_date TIMESTAMPTZ;
    v_old_status TEXT;
    v_new_status TEXT;
BEGIN
    -- 1. Проверяем что клиент принадлежит куратору
    SELECT 
        c.id,
        c.name,
        c.subscription_status,
        c.trial_ends_at,
        c.subscription_plan,
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

    -- 2. Вычисляем новую дату окончания
    v_old_status := COALESCE(v_client.subscription_status, 'none');
    
    -- Если подписка уже истекла или её не было — считаем от сегодня
    -- Иначе — продлеваем от текущей даты окончания
    IF v_client.trial_ends_at IS NULL OR v_client.trial_ends_at < NOW() THEN
        v_new_end_date := NOW() + (p_months || ' months')::INTERVAL;
    ELSE
        v_new_end_date := v_client.trial_ends_at + (p_months || ' months')::INTERVAL;
    END IF;

    -- 3. Определяем новый статус
    -- Если был trial или expired — становится active
    IF v_old_status IN ('trial', 'expired', 'read_only', 'none', 'canceled') THEN
        v_new_status := 'active';
    ELSE
        v_new_status := v_old_status;
    END IF;

    -- 4. Обновляем клиента
    UPDATE public.clients
    SET 
        trial_ends_at = v_new_end_date,
        subscription_status = v_new_status,
        updated_at = NOW()
    WHERE id = p_client_id;

    -- 5. Обновляем subscriptions (если есть)
    UPDATE public.subscriptions
    SET 
        trial_ends_at = v_new_end_date,
        status = v_new_status,
        updated_at = NOW()
    WHERE client_id = p_client_id;

    -- 6. Логируем в историю (опционально)
    -- INSERT INTO subscription_history (client_id, action, old_status, new_status, new_end_date, performed_by, created_at)
    -- VALUES (p_client_id, 'extend', v_old_status, v_new_status, v_new_end_date, p_curator_id, NOW());

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

-- Права доступа
GRANT EXECUTE ON FUNCTION public.admin_extend_subscription(UUID, UUID, INT) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.admin_extend_subscription(UUID, UUID, INT) TO heys_admin;

COMMENT ON FUNCTION public.admin_extend_subscription IS 'Продление подписки клиента куратором на N месяцев';
