-- Late Telegram binding or missed cron must not flood a client with all overdue
-- drip stages in one run. Return only the most relevant due stage per client.

CREATE OR REPLACE FUNCTION public.get_trial_drip_targets()
RETURNS TABLE(
    client_id UUID,
    name TEXT,
    telegram_chat_id BIGINT,
    drip_stage TEXT,
    days_left INTEGER,
    trial_ends_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    WITH base AS (
        SELECT
            c.id AS client_id,
            c.name,
            c.telegram_chat_id,
            c.trial_started_at,
            c.trial_ends_at,
            c.drip_sent_stages,
            c.subscription_status,
            EXTRACT(DAY FROM (NOW() - c.trial_started_at))::int AS days_passed,
            EXTRACT(DAY FROM (c.trial_ends_at - NOW()))::int AS days_left
        FROM public.clients c
        WHERE c.telegram_chat_id IS NOT NULL
          AND c.trial_started_at IS NOT NULL
          AND c.trial_ends_at IS NOT NULL
    ),
    due AS (
        SELECT
            b.client_id,
            b.name,
            b.telegram_chat_id,
            stages.stage::text AS drip_stage,
            b.days_left,
            b.trial_ends_at,
            stages.min_days
        FROM base b
        CROSS JOIN LATERAL (
            VALUES
              ('welcome', 0),
              ('mid',     3),
              ('prepay',  5),
              ('lastcall', 6),
              ('expired', 7)
        ) AS stages(stage, min_days)
        WHERE b.days_passed >= stages.min_days
          AND NOT (b.drip_sent_stages @> to_jsonb(stages.stage))
          AND (stages.stage <> 'expired' OR b.trial_ends_at < NOW())
    )
    SELECT DISTINCT ON (d.client_id)
        d.client_id,
        d.name,
        d.telegram_chat_id,
        d.drip_stage,
        d.days_left,
        d.trial_ends_at
    FROM due d
    ORDER BY d.client_id, d.min_days DESC;
END;
$$;

COMMENT ON FUNCTION public.get_trial_drip_targets() IS
  'Возвращает максимум один актуальный Telegram drip-стейдж на клиента за cron-прогон.';

GRANT EXECUTE ON FUNCTION public.get_trial_drip_targets() TO heys_rpc;
