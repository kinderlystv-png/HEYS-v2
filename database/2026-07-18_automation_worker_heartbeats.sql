-- Seed heartbeat contracts for standalone scheduled workers before enabling
-- the external fail-closed dead-man monitor. Workers update last_ok_at only
-- after a completed run; initial rows provide one normal schedule window for
-- the first invocation after deployment.

BEGIN;

INSERT INTO public.maintenance_heartbeat (task, last_ok_at, stale_alerted_at, max_silence)
VALUES
  ('cron_reminders',            now(), NULL, interval '45 minutes'),
  ('cron_security_alerts',      now(), NULL, interval '45 minutes'),
  ('cron_speechkit_transcribe', now(), NULL, interval '5 minutes'),
  ('cron_trial_drip',           now(), NULL, interval '30 hours'),
  ('cron_photo_cleanup',        now(), NULL, interval '8 days'),
  ('snapshot_demo',             now(), NULL, interval '3 hours')
ON CONFLICT (task) DO UPDATE
  SET max_silence = EXCLUDED.max_silence;

COMMIT;

-- Rollback (only if these worker heartbeat contracts are being removed):
-- DELETE FROM public.maintenance_heartbeat
--  WHERE task IN (
--    'cron_reminders', 'cron_security_alerts', 'cron_speechkit_transcribe',
--    'cron_trial_drip', 'cron_photo_cleanup', 'snapshot_demo'
--  );
