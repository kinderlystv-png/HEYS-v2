-- =====================================================
-- Leaderboard RPC Functions (session-based)
-- Версия: 1.0.0
-- Дата: 2026-03-28
-- Описание: 3 session-safe RPCs для глобального лидерборда
-- =====================================================

-- =====================================================
-- Function 1: toggle_leaderboard_sharing_by_session
-- Включить/выключить участие в лидерборде
-- =====================================================
CREATE OR REPLACE FUNCTION public.toggle_leaderboard_sharing_by_session(
    p_session_token TEXT,
    p_enabled       BOOLEAN,
    p_display_name  TEXT DEFAULT NULL
)
RETURNS TABLE (
    success  BOOLEAN,
    message  TEXT
) AS $$
DECLARE
    v_client_id UUID;
BEGIN
    -- 1. Валидация сессии
    v_client_id := public.require_client_id(p_session_token);

    -- 2. Upsert preference
    INSERT INTO public.leaderboard_preferences (client_id, sharing_enabled, display_name)
    VALUES (
        v_client_id,
        p_enabled,
        COALESCE(NULLIF(TRIM(p_display_name), ''), '')
    )
    ON CONFLICT (client_id) DO UPDATE SET
        sharing_enabled = EXCLUDED.sharing_enabled,
        display_name = CASE
            WHEN NULLIF(TRIM(p_display_name), '') IS NOT NULL
            THEN TRIM(p_display_name)
            ELSE leaderboard_preferences.display_name
        END,
        updated_at = NOW();

    RETURN QUERY SELECT TRUE,
        ('Sharing ' || CASE WHEN p_enabled THEN 'enabled' ELSE 'disabled' END)::TEXT;

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'toggle_leaderboard_sharing_by_session error: %', SQLERRM;
        RETURN QUERY SELECT FALSE, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =====================================================
-- Function 2: publish_leaderboard_snapshot_by_session
-- Опубликовать/обновить ежедневный snapshot
-- Вызывается автоматически после computeCascadeState
-- =====================================================
CREATE OR REPLACE FUNCTION public.publish_leaderboard_snapshot_by_session(
    p_session_token  TEXT,
    p_snapshot_date  DATE,
    p_display_name   TEXT,
    p_day_balance    NUMERIC,
    p_cascade_pct    NUMERIC
)
RETURNS TABLE (
    success  BOOLEAN,
    message  TEXT
) AS $$
DECLARE
    v_client_id UUID;
    v_sharing   BOOLEAN;
BEGIN
    -- 1. Валидация сессии
    v_client_id := public.require_client_id(p_session_token);

    -- 2. Проверяем, включено ли sharing
    SELECT sharing_enabled INTO v_sharing
    FROM public.leaderboard_preferences
    WHERE client_id = v_client_id;

    IF v_sharing IS NOT TRUE THEN
        RETURN QUERY SELECT FALSE, 'Sharing not enabled'::TEXT;
        RETURN;
    END IF;

    -- 3. Upsert snapshot
    INSERT INTO public.leaderboard_snapshots (
        client_id, snapshot_date, day_balance, cascade_pct
    ) VALUES (
        v_client_id, p_snapshot_date, p_day_balance, p_cascade_pct
    )
    ON CONFLICT (client_id, snapshot_date) DO UPDATE SET
        day_balance = EXCLUDED.day_balance,
        cascade_pct = EXCLUDED.cascade_pct,
        updated_at  = NOW();

    -- 4. Обновляем display_name в preferences (если передано)
    IF NULLIF(TRIM(p_display_name), '') IS NOT NULL THEN
        UPDATE public.leaderboard_preferences
        SET display_name = TRIM(p_display_name)
        WHERE client_id = v_client_id
          AND display_name IS DISTINCT FROM TRIM(p_display_name);
    END IF;

    RETURN QUERY SELECT TRUE, 'Snapshot published'::TEXT;

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'publish_leaderboard_snapshot_by_session error: %', SQLERRM;
        RETURN QUERY SELECT FALSE, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =====================================================
-- Function 3: get_leaderboard_by_session
-- Получить рейтинг за дату (только users с sharing=true)
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_leaderboard_by_session(
    p_session_token  TEXT,
    p_snapshot_date  DATE
)
RETURNS TABLE (
    display_name TEXT,
    day_balance  NUMERIC,
    cascade_pct  NUMERIC,
    rank         BIGINT,
    is_self      BOOLEAN,
    updated_at   TIMESTAMPTZ
) AS $$
DECLARE
    v_client_id UUID;
BEGIN
    -- 1. Валидация сессии (caller должен быть аутентифицирован)
    v_client_id := public.require_client_id(p_session_token);

    -- 2. Возвращаем только участников с sharing_enabled=true
    RETURN QUERY
    SELECT
        lp.display_name,
        ls.day_balance,
        ls.cascade_pct,
        ROW_NUMBER() OVER (ORDER BY ls.day_balance DESC, ls.updated_at ASC) AS rank,
        (ls.client_id = v_client_id) AS is_self,
        ls.updated_at
    FROM public.leaderboard_snapshots ls
    JOIN public.leaderboard_preferences lp
        ON lp.client_id = ls.client_id
        AND lp.sharing_enabled = TRUE
    WHERE ls.snapshot_date = p_snapshot_date
    ORDER BY ls.day_balance DESC, ls.updated_at ASC;

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'get_leaderboard_by_session error: %', SQLERRM;
        -- Возвращаем пустой результат
        RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
