-- =====================================================
-- Function: get_leaderboard_weekly_by_session
-- Получить недельный рейтинг (Пн–Вс текущей недели)
-- Возвращает по одной строке на участника с daily_scores JSONB
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_leaderboard_weekly_by_session(
    p_session_token  TEXT,
    p_today_date     DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    display_name TEXT,
    is_self      BOOLEAN,
    daily_scores JSONB,
    avg_balance  NUMERIC,
    days_count   INTEGER
) AS $$
DECLARE
    v_client_id  UUID;
    v_week_start DATE;
BEGIN
    v_client_id := public.require_client_id(p_session_token);

    -- Monday of the ISO week containing p_today_date
    v_week_start := p_today_date - ((EXTRACT(ISODOW FROM p_today_date)::int - 1) || ' days')::interval;

    RETURN QUERY
    WITH week_data AS (
        SELECT
            ls.client_id,
            lp.display_name,
            jsonb_object_agg(ls.snapshot_date::text, ls.day_balance) AS daily_scores,
            ROUND(AVG(ls.day_balance), 1)                           AS avg_balance,
            COUNT(*)::integer                                        AS days_count
        FROM public.leaderboard_snapshots ls
        JOIN public.leaderboard_preferences lp
            ON lp.client_id = ls.client_id
           AND lp.sharing_enabled = TRUE
        WHERE ls.snapshot_date >= v_week_start
          AND ls.snapshot_date <= p_today_date
        GROUP BY ls.client_id, lp.display_name
    )
    SELECT
        wd.display_name,
        (wd.client_id = v_client_id) AS is_self,
        wd.daily_scores,
        wd.avg_balance,
        wd.days_count
    FROM week_data wd
    ORDER BY wd.avg_balance DESC;

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'get_leaderboard_weekly_by_session error: %', SQLERRM;
        RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
