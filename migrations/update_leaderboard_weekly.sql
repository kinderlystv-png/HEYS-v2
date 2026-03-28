-- Updated get_leaderboard_weekly_by_session:
-- Now computes CEB scores from client_kv_store when leaderboard_snapshots has gaps.
-- This ensures ALL sharing participants appear with scores, not just those
-- whose device happened to publish a snapshot.
CREATE OR REPLACE FUNCTION public.get_leaderboard_weekly_by_session(
    p_session_token TEXT,
    p_today_date    DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
    display_name TEXT,
    is_self      BOOLEAN,
    daily_scores JSONB,
    avg_balance  NUMERIC,
    days_count   INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER
AS $fn$
DECLARE
    v_client_id  UUID;
    v_week_start DATE;
BEGIN
    v_client_id := public.require_client_id(p_session_token);

    -- Monday of the ISO week containing p_today_date
    v_week_start := p_today_date
        - ((EXTRACT(ISODOW FROM p_today_date)::int - 1) || ' days')::interval;

    RETURN QUERY
    WITH
    -- All participants with sharing enabled
    participants AS (
        SELECT lp.client_id, lp.display_name
        FROM public.leaderboard_preferences lp
        WHERE lp.sharing_enabled = TRUE
    ),
    -- All dates in the week (Monday..today)
    week_dates AS (
        SELECT d::date AS dt
        FROM generate_series(v_week_start, p_today_date, '1 day'::interval) d
    ),
    -- Pre-fetch profiles for all participants (one query, not N subqueries)
    profiles AS (
        SELECT kv.client_id, kv.v AS profile_data
        FROM public.client_kv_store kv
        JOIN participants p ON p.client_id = kv.client_id
        WHERE kv.k = 'heys_profile'
    ),
    -- Pre-fetch day data for all participants for the week
    day_data AS (
        SELECT kv.client_id, REPLACE(kv.k, 'heys_dayv2_', '')::date AS dt, kv.v AS day_json
        FROM public.client_kv_store kv
        JOIN participants p ON p.client_id = kv.client_id
        WHERE kv.k >= 'heys_dayv2_' || v_week_start::text
          AND kv.k <= 'heys_dayv2_' || p_today_date::text
          AND kv.k LIKE 'heys_dayv2_%'
    ),
    -- Existing snapshots from leaderboard_snapshots
    existing_snapshots AS (
        SELECT ls.client_id, ls.snapshot_date, ls.day_balance
        FROM public.leaderboard_snapshots ls
        WHERE ls.snapshot_date >= v_week_start
          AND ls.snapshot_date <= p_today_date
    ),
    -- Cross-join: every participant x every date
    expected AS (
        SELECT p.client_id, p.display_name, wd.dt
        FROM participants p
        CROSS JOIN week_dates wd
    ),
    -- Combine: prefer snapshot, fallback to computed CEB
    combined AS (
        SELECT
            e.client_id,
            e.display_name,
            e.dt,
            COALESCE(
                es.day_balance,
                public.compute_ceb_from_day_jsonb(dd.day_json, pr.profile_data)
            ) AS day_balance
        FROM expected e
        LEFT JOIN existing_snapshots es
            ON es.client_id = e.client_id AND es.snapshot_date = e.dt
        LEFT JOIN day_data dd
            ON dd.client_id = e.client_id AND dd.dt = e.dt
        LEFT JOIN profiles pr
            ON pr.client_id = e.client_id
    ),
    -- Aggregate per participant (skip NULL scores = no data at all)
    week_data AS (
        SELECT
            c.client_id,
            c.display_name,
            jsonb_object_agg(c.dt::text, c.day_balance)
                FILTER (WHERE c.day_balance IS NOT NULL) AS daily_scores,
            ROUND(AVG(c.day_balance), 1)                 AS avg_balance,
            COUNT(c.day_balance)::integer                 AS days_count
        FROM combined c
        WHERE c.day_balance IS NOT NULL
        GROUP BY c.client_id, c.display_name
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
$fn$;
