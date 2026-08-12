-- Incomplete trial_candidates: hard-delete after 30 days without activity
-- (parity with purge_expired_trial_intakes). Rejected/expired keep retention_delete_at.
--
-- Activity anchor uses updated_at first: save_trial_candidate_intake_by_candidate_session
-- sets updated_at = NOW() on every autosave (including incomplete drafts), so a person
-- filling over several days does not look idle from day one.
-- Candidates have no last_client_activity_at; fall back through started/invite/created stamps.

CREATE OR REPLACE FUNCTION public.purge_expired_trial_candidates()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted INTEGER := 0;
BEGIN
  DELETE FROM public.trial_candidates
  WHERE (
    retention_delete_at IS NOT NULL
    AND retention_delete_at <= NOW()
    AND status IN ('rejected', 'expired')
  ) OR (
    status IN (
      'invite_prepared', 'invite_sent', 'in_progress', 'needs_clarification'
    )
    AND CASE
      WHEN status = 'needs_clarification'
        THEN GREATEST(
          reviewed_at, updated_at, started_at,
          invite_sent_at, invite_prepared_at, created_at
        )
      ELSE COALESCE(
        updated_at, started_at, invite_sent_at, invite_prepared_at, created_at
      )
    END <= NOW() - INTERVAL '30 days'
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.purge_expired_trial_candidates() IS
  'Hard-deletes rejected/expired by retention_delete_at and incomplete drafts after 30 days inactivity; answers_encrypted goes with the row (ON DELETE CASCADE for sessions/consents/audit).';

REVOKE EXECUTE ON FUNCTION public.purge_expired_trial_candidates() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_admin') THEN
    GRANT EXECUTE ON FUNCTION public.purge_expired_trial_candidates() TO heys_admin;
  END IF;
END $$;
