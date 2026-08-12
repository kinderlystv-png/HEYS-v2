-- Pre-purge Telegram warn for incomplete trial_candidates (~2 days before 30d TTL).
-- Only candidates who started filling: in_progress / needs_clarification, or
-- started_at / answers_encrypted. Bare invite_sent / invite_prepared without a
-- draft are excluded (owner decision 2026-08-12, heys/8958ff).
--
-- Delivery needs a Telegram chat_id: leads.telegram_chat_id (HEYS Start handoff)
-- or a matching clients.telegram_chat_id by phone. WhatsApp/MAX leads without a
-- chat stay unreachable for automatic warn.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT;

COMMENT ON COLUMN public.leads.telegram_chat_id IS
  'Telegram chat_id when the lead came through HEYS Start bot contact handoff; used for candidate draft purge warnings.';

CREATE INDEX IF NOT EXISTS leads_telegram_chat_idx
  ON public.leads(telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;

ALTER TABLE public.trial_candidates
  ADD COLUMN IF NOT EXISTS purge_warn_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.trial_candidates.purge_warn_sent_at IS
  'When the ~2-day pre-purge bot warning was sent or marked handled (no chat). NULL = not yet processed.';

CREATE OR REPLACE FUNCTION public.trial_candidate_inactivity_anchor(c public.trial_candidates)
RETURNS TIMESTAMPTZ
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN c.status = 'needs_clarification'
      THEN GREATEST(
        c.reviewed_at, c.updated_at, c.started_at,
        c.invite_sent_at, c.invite_prepared_at, c.created_at
      )
    ELSE COALESCE(
      c.updated_at, c.started_at, c.invite_sent_at, c.invite_prepared_at, c.created_at
    )
  END;
$$;

COMMENT ON FUNCTION public.trial_candidate_inactivity_anchor(public.trial_candidates) IS
  'Same activity anchor as purge_expired_trial_candidates (updated_at-first for drafts).';

CREATE OR REPLACE FUNCTION public.get_trial_candidate_purge_warn_targets()
RETURNS TABLE(
  candidate_id UUID,
  lead_id UUID,
  telegram_chat_id BIGINT,
  bot_kind TEXT,
  inactivity_days INTEGER,
  days_until_purge INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH eligible AS (
    SELECT
      c.id AS candidate_id,
      c.lead_id,
      public.trial_candidate_inactivity_anchor(c) AS anchor,
      COALESCE(l.telegram_chat_id, phone_client.telegram_chat_id) AS resolved_chat_id,
      CASE
        WHEN l.telegram_chat_id IS NOT NULL THEN 'start'
        WHEN phone_client.telegram_chat_id IS NOT NULL THEN 'client'
        ELSE NULL
      END AS resolved_bot_kind
    FROM public.trial_candidates c
    JOIN public.leads l ON l.id = c.lead_id
    LEFT JOIN LATERAL (
      SELECT cl.telegram_chat_id
      FROM public.clients cl
      WHERE cl.telegram_chat_id IS NOT NULL
        AND cl.phone IS NOT NULL
        AND l.phone IS NOT NULL
        AND cl.phone = l.phone
      ORDER BY cl.updated_at DESC NULLS LAST
      LIMIT 1
    ) phone_client ON TRUE
    WHERE c.purge_warn_sent_at IS NULL
      AND c.status IN (
        'invite_prepared', 'invite_sent', 'in_progress', 'needs_clarification'
      )
      AND (
        c.status IN ('in_progress', 'needs_clarification')
        OR c.started_at IS NOT NULL
        OR c.answers_encrypted IS NOT NULL
      )
      AND public.trial_candidate_inactivity_anchor(c) <= NOW() - INTERVAL '28 days'
  )
  SELECT
    e.candidate_id,
    e.lead_id,
    e.resolved_chat_id,
    e.resolved_bot_kind,
    FLOOR(EXTRACT(EPOCH FROM (NOW() - e.anchor)) / 86400)::int AS inactivity_days,
    GREATEST(
      0,
      CEIL(EXTRACT(EPOCH FROM ((e.anchor + INTERVAL '30 days') - NOW())) / 86400)
    )::int AS days_until_purge
  FROM eligible e
  ORDER BY e.anchor ASC;
END;
$$;

COMMENT ON FUNCTION public.get_trial_candidate_purge_warn_targets() IS
  'Incomplete trial candidates who started a draft and are within ~2 days of the 30d inactivity purge; telegram_chat_id may be null.';

CREATE OR REPLACE FUNCTION public.mark_trial_candidate_purge_warn_sent(p_candidate_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.trial_candidates
     SET purge_warn_sent_at = NOW()
   WHERE id = p_candidate_id
     AND purge_warn_sent_at IS NULL;
  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION public.mark_trial_candidate_purge_warn_sent(UUID) IS
  'Marks candidate draft purge warning as handled (sent or unreachable).';

REVOKE EXECUTE ON FUNCTION public.trial_candidate_inactivity_anchor(public.trial_candidates) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_trial_candidate_purge_warn_targets() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_trial_candidate_purge_warn_sent(UUID) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_admin') THEN
    GRANT EXECUTE ON FUNCTION public.trial_candidate_inactivity_anchor(public.trial_candidates) TO heys_admin;
    GRANT EXECUTE ON FUNCTION public.get_trial_candidate_purge_warn_targets() TO heys_admin;
    GRANT EXECUTE ON FUNCTION public.mark_trial_candidate_purge_warn_sent(UUID) TO heys_admin;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_rpc') THEN
    GRANT EXECUTE ON FUNCTION public.get_trial_candidate_purge_warn_targets() TO heys_rpc;
    GRANT EXECUTE ON FUNCTION public.mark_trial_candidate_purge_warn_sent(UUID) TO heys_rpc;
  END IF;
END $$;
