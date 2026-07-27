-- Forward-fix: rotating an outdated health consent must not purge an intake.
--
-- log_consents() first revokes the previous version and only then inserts the
-- current one. The original immediate trigger observed that intermediate
-- state and deleted trial_intakes even though the transaction finished with a
-- valid active health consent. Defer the decision until transaction end and
-- purge only when no active grant remains.

BEGIN;

CREATE OR REPLACE FUNCTION public.purge_trial_intake_on_health_revoke()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.consent_type = 'health_data'
     AND (NEW.granted = FALSE OR NEW.revoked_at IS NOT NULL)
     AND (OLD.granted IS DISTINCT FROM NEW.granted OR OLD.revoked_at IS DISTINCT FROM NEW.revoked_at)
     AND NOT EXISTS (
       SELECT 1
       FROM public.consents c
       WHERE c.client_id = NEW.client_id
         AND c.consent_type = 'health_data'
         AND c.granted = TRUE
         AND c.is_active = TRUE
         AND c.revoked_at IS NULL
     ) THEN
    DELETE FROM public.trial_intakes WHERE client_id = NEW.client_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purge_trial_intake_on_health_revoke ON public.consents;
CREATE CONSTRAINT TRIGGER trg_purge_trial_intake_on_health_revoke
AFTER UPDATE ON public.consents
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.purge_trial_intake_on_health_revoke();

COMMIT;
