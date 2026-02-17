-- =====================================================
-- EWS Weekly Snapshots RPC Functions
-- Версия: 1.0.0
-- Дата: 2026-02-16
-- Описание: Session-based RPC функции для синхронизации
--           weekly progress tracking с облаком
-- =====================================================

-- =====================================================
-- Function 1: upsert_weekly_snapshot_by_session
-- Назначение: Сохранить/обновить weekly snapshot для текущего клиента
-- Безопасность: Session-based (IDOR protection)
-- =====================================================
CREATE OR REPLACE FUNCTION public.upsert_weekly_snapshot_by_session(
    p_session_token TEXT,
    p_week_start DATE,
    p_week_end DATE,
    p_week_number INT,
    p_year INT,
    p_warnings_count INT,
    p_global_score INT,
    p_severity_breakdown JSONB,
    p_top_warnings JSONB DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    snapshot_id UUID,
    message TEXT
) AS $$
DECLARE
    v_client_id UUID;
    v_existing_id UUID;
    v_new_id UUID;
BEGIN
    -- 1. Валидация session_token через стандартный require_client_id()
    v_client_id := public.require_client_id(p_session_token);
    
    -- 2. Проверка существования snapshot для этой недели
    SELECT id INTO v_existing_id
    FROM public.ews_weekly_snapshots
    WHERE client_id = v_client_id
      AND week_start = p_week_start;
    
    -- 3. UPDATE существующего snapshot или INSERT нового
    IF v_existing_id IS NOT NULL THEN
        -- Обновляем существующий
        UPDATE public.ews_weekly_snapshots
        SET
            week_end = p_week_end,
            week_number = p_week_number,
            year = p_year,
            warnings_count = p_warnings_count,
            global_score = p_global_score,
            severity_breakdown = p_severity_breakdown,
            top_warnings = p_top_warnings,
            updated_at = NOW()
        WHERE id = v_existing_id;
        
        RETURN QUERY SELECT TRUE, v_existing_id, 'Snapshot updated'::TEXT;
    ELSE
        -- Создаём новый
        INSERT INTO public.ews_weekly_snapshots (
            client_id,
            week_start,
            week_end,
            week_number,
            year,
            warnings_count,
            global_score,
            severity_breakdown,
            top_warnings
        ) VALUES (
            v_client_id,
            p_week_start,
            p_week_end,
            p_week_number,
            p_year,
            p_warnings_count,
            p_global_score,
            p_severity_breakdown,
            p_top_warnings
        )
        RETURNING id INTO v_new_id;
        
        RETURN QUERY SELECT TRUE, v_new_id, 'Snapshot created'::TEXT;
    END IF;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'upsert_weekly_snapshot_by_session error: %', SQLERRM;
        RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- Function 2: get_weekly_snapshots_by_session
-- Назначение: Получить последние N недель snapshots текущего клиента
-- Безопасность: Session-based (IDOR protection)
-- По умолчанию: последние 4 недели (WEEKLY_CONFIG.WEEKS_TO_TRACK)
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_weekly_snapshots_by_session(
    p_session_token TEXT,
    p_weeks_count INT DEFAULT 4
)
RETURNS TABLE (
    week_start DATE,
    week_end DATE,
    week_number INT,
    year INT,
    warnings_count INT,
    global_score INT,
    severity_breakdown JSONB,
    top_warnings JSONB,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
DECLARE
    v_client_id UUID;
BEGIN
    -- 1. Валидация session_token через стандартный require_client_id()
    v_client_id := public.require_client_id(p_session_token);
    
    -- 2. Получение последних N недель, отсортированных от новых к старым
    RETURN QUERY
    SELECT
        s.week_start,
        s.week_end,
        s.week_number,
        s.year,
        s.warnings_count,
        s.global_score,
        s.severity_breakdown,
        s.top_warnings,
        s.created_at,
        s.updated_at
    FROM public.ews_weekly_snapshots s
    WHERE s.client_id = v_client_id
    ORDER BY s.week_start DESC
    LIMIT p_weeks_count;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'get_weekly_snapshots_by_session error: %', SQLERRM;
        RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- Function 3: delete_old_weekly_snapshots_by_session
-- Назначение: Удалить snapshots старше N недель (для cleanup)
-- Безопасность: Session-based (IDOR protection)
-- =====================================================
CREATE OR REPLACE FUNCTION public.delete_old_weekly_snapshots_by_session(
    p_session_token TEXT,
    p_weeks_to_keep INT DEFAULT 26 -- 6 месяцев по умолчанию
)
RETURNS TABLE (
    deleted_count INT,
    message TEXT
) AS $$
DECLARE
    v_client_id UUID;
    v_deleted INT;
    v_cutoff_date DATE;
BEGIN
    -- 1. Валидация session_token через стандартный require_client_id()
    v_client_id := public.require_client_id(p_session_token);
    
    -- 2. Вычисление cutoff date
    v_cutoff_date := CURRENT_DATE - (p_weeks_to_keep || ' weeks')::INTERVAL;
    
    -- 3. Удаление старых snapshots
    DELETE FROM public.ews_weekly_snapshots
    WHERE client_id = v_client_id
      AND week_start < v_cutoff_date;
    
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    
    RETURN QUERY SELECT v_deleted, format('Deleted %s old snapshots', v_deleted)::TEXT;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'delete_old_weekly_snapshots_by_session error: %', SQLERRM;
        RETURN QUERY SELECT 0, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- Grants для runtime users
-- =====================================================
GRANT EXECUTE ON FUNCTION public.upsert_weekly_snapshot_by_session TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.get_weekly_snapshots_by_session TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.delete_old_weekly_snapshots_by_session TO heys_rpc;

GRANT EXECUTE ON FUNCTION public.upsert_weekly_snapshot_by_session TO heys_rest;
GRANT EXECUTE ON FUNCTION public.get_weekly_snapshots_by_session TO heys_rest;
GRANT EXECUTE ON FUNCTION public.delete_old_weekly_snapshots_by_session TO heys_rest;

-- =====================================================
-- DEPLOYMENT NOTES:
-- 1. Применить после миграции 2026-02-16_ews_weekly_snapshots.sql
-- 2. Тестовый вызов:
--    SELECT * FROM public.get_weekly_snapshots_by_session('valid_session_token', 4);
-- 3. Добавить в yandex-cloud-functions/heys-api-rpc/index.js ALLOWED_FUNCTIONS
-- =====================================================
