-- =====================================================
-- Migration: admin_activate_trial sync to subscriptions table (Phase 1 hotfix)
-- Date: 2026-04-28
-- Purpose:
--   admin_activate_trial обновляла только clients.subscription_status,
--   но клиентское приложение проверяет доступ через get_effective_subscription_status,
--   которая смотрит в subscriptions таблицу (она оставалась пустой).
--   Результат: куратор видит «Активен», клиент — read_only.
--
--   Этот патч добавляет UPSERT в subscriptions внутри функции и backfill
--   для уже активированных триалов где subscriptions.* пусты.
-- =====================================================

CREATE OR REPLACE FUNCTION admin_activate_trial(
    p_client_id UUID,
    p_start_date DATE DEFAULT CURRENT_DATE,
    p_trial_days INTEGER DEFAULT 7,
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
    IF p_curator_id IS NOT NULL THEN
        SELECT id, name INTO v_curator FROM curators WHERE id = p_curator_id;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'curator_not_found');
        END IF;
    END IF;

    SELECT * INTO v_client FROM clients WHERE id = p_client_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'client_not_found');
    END IF;

    IF v_client.subscription_status IN ('trial', 'active') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'trial_already_active_or_had_subscription',
            'current_status', v_client.subscription_status
        );
    END IF;

    v_is_future := (p_start_date > CURRENT_DATE);

    IF v_is_future THEN
        UPDATE clients
        SET subscription_status = 'trial_pending',
            trial_started_at = p_start_date::TIMESTAMPTZ,
            trial_ends_at = (p_start_date + (p_trial_days || ' days')::interval)::TIMESTAMPTZ,
            updated_at = NOW()
        WHERE id = p_client_id
        RETURNING trial_started_at, trial_ends_at
        INTO v_trial_start_at, v_trial_ends_at;
    ELSE
        UPDATE clients
        SET subscription_status = 'trial',
            trial_started_at = NOW(),
            trial_ends_at = NOW() + (p_trial_days || ' days')::interval,
            updated_at = NOW()
        WHERE id = p_client_id
        RETURNING trial_started_at, trial_ends_at
        INTO v_trial_start_at, v_trial_ends_at;
    END IF;

    -- 🔧 NEW: Синхронизируем subscriptions, иначе клиент будет в read_only
    -- т.к. клиентское приложение читает get_effective_subscription_status,
    -- которая смотрит в эту таблицу.
    INSERT INTO subscriptions (client_id, trial_started_at, trial_ends_at, trial_approved_at)
    VALUES (p_client_id, v_trial_start_at, v_trial_ends_at, NOW())
    ON CONFLICT (client_id) DO UPDATE SET
        trial_started_at = EXCLUDED.trial_started_at,
        trial_ends_at = EXCLUDED.trial_ends_at,
        trial_approved_at = NOW();

    UPDATE trial_queue
    SET status = 'assigned',
        assigned_at = NOW(),
        updated_at = NOW()
    WHERE client_id = p_client_id AND status = 'queued';

    INSERT INTO trial_queue_events (client_id, event_type, meta)
    VALUES (p_client_id, 'claimed', jsonb_build_object(
        'curator_id', p_curator_id,
        'start_date', p_start_date,
        'trial_days', p_trial_days,
        'is_future', v_is_future,
        'synced_subscriptions', true
    ));

    RETURN jsonb_build_object(
        'success', true,
        'status', CASE WHEN v_is_future THEN 'trial_pending' ELSE 'trial' END,
        'trial_started_at', v_trial_start_at,
        'trial_ends_at', v_trial_ends_at,
        'is_future', v_is_future
    );
END;
$$;

COMMENT ON FUNCTION admin_activate_trial(UUID, DATE, INTEGER, UUID) IS
  'Активация триала с синхронизацией subscriptions (фикс read_only-блокировки)';

-- Backfill для всех клиентов где clients.trial_*_at заполнено, а subscriptions.trial_*_at пусто
INSERT INTO subscriptions (client_id, trial_started_at, trial_ends_at, trial_approved_at)
SELECT c.id, c.trial_started_at, c.trial_ends_at, NOW()
FROM clients c
LEFT JOIN subscriptions s ON s.client_id = c.id
WHERE c.subscription_status IN ('trial', 'trial_pending')
  AND c.trial_started_at IS NOT NULL
  AND c.trial_ends_at IS NOT NULL
  AND (s.client_id IS NULL OR s.trial_ends_at IS NULL)
ON CONFLICT (client_id) DO UPDATE SET
    trial_started_at = COALESCE(subscriptions.trial_started_at, EXCLUDED.trial_started_at),
    trial_ends_at = COALESCE(subscriptions.trial_ends_at, EXCLUDED.trial_ends_at),
    trial_approved_at = COALESCE(subscriptions.trial_approved_at, NOW());
