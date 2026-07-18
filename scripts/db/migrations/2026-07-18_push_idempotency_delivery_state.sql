-- 2026-07-18: Retry-safe reminder delivery state.
--
-- Context: the legacy insert-only sentinel marked a reminder as sent before
-- Web Push delivery. A transient rejection then suppressed every later retry.
-- This migration adds a bounded claim lease and a terminal delivered state.
--
-- ROLLBACK (manual, only after rolling the function back):
-- UPDATE public.push_idempotency
--    SET sent_at = COALESCE(sent_at, delivered_at, NOW())
--  WHERE sent_at IS NULL;
-- ALTER TABLE public.push_idempotency DROP CONSTRAINT IF EXISTS push_idempotency_status_check;
-- DROP INDEX IF EXISTS public.idx_push_idempotency_expired_claims;
-- ALTER TABLE public.push_idempotency ALTER COLUMN sent_at SET NOT NULL;
-- ALTER TABLE public.push_idempotency DROP COLUMN IF EXISTS delivered_at,
--   DROP COLUMN IF EXISTS claim_token, DROP COLUMN IF EXISTS lease_until,
--   DROP COLUMN IF EXISTS status;

-- Reminder delivery state: distinguish an in-flight lease from a delivered push.
-- Existing rows represent historical completed claims and stay delivered.

ALTER TABLE public.push_idempotency
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'delivered',
  ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claim_token UUID,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

UPDATE public.push_idempotency
   SET status = 'delivered',
       delivered_at = COALESCE(delivered_at, sent_at),
       lease_until = NULL,
       claim_token = NULL
 WHERE status = 'delivered';

ALTER TABLE public.push_idempotency
  ALTER COLUMN sent_at DROP NOT NULL;

ALTER TABLE public.push_idempotency
  ALTER COLUMN delivered_at SET DEFAULT NOW();

ALTER TABLE public.push_idempotency
  DROP CONSTRAINT IF EXISTS push_idempotency_status_check;

ALTER TABLE public.push_idempotency
  ADD CONSTRAINT push_idempotency_status_check CHECK (
    (
      status = 'delivered'
      AND delivered_at IS NOT NULL
      AND lease_until IS NULL
      AND claim_token IS NULL
    )
    OR
    (
      status = 'claimed'
      AND delivered_at IS NULL
      AND lease_until IS NOT NULL
      AND claim_token IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_push_idempotency_expired_claims
  ON public.push_idempotency(lease_until)
  WHERE status = 'claimed';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_idempotency TO heys_admin, heys_rpc;

COMMENT ON TABLE public.push_idempotency IS
  'Reminder delivery state: claimed rows are retryable leases; delivered rows suppress duplicates.';
COMMENT ON COLUMN public.push_idempotency.status IS
  'claimed while a worker owns a lease; delivered after at least one successful push.';
COMMENT ON COLUMN public.push_idempotency.claim_token IS
  'Unique lease owner token; prevents an old worker from releasing a newer claim.';
