-- Activate push-notifications consent 1.2.
--
-- HALT: DO NOT APPLY.
-- Hash fba4df9d… is from an unsigned draft. After lawyer edits it will change.
-- legal_signoff_ref currently points at the draft itself, not a sign-off.
--
-- Deploy order after sign-off (same principle as the curator gate):
--   1) apply this SQL (registry first)
--   2) then frontend with LegalVersions.push_notifications = 1.2
-- Reverse order (frontend before registry) breaks signing for everyone:
-- consent_version_not_allowed. Caught locally 15.08.2026.
--
-- Prod 15.08.2026: push_notifications 1.1 still active (99433c270c3432dd…).
-- Do not rewrite 1.1: that hash is registered proof.
--
-- To apply: delete the RAISE block below, recompute sha256 from the signed
-- text, then: bash scripts/db/psql.sh -f database/2026-08-15_activate_push_consent_v1_2.sql

DO $$
BEGIN
  RAISE EXCEPTION 'DO NOT APPLY: push_notifications 1.2 is an unsigned draft (heys/2bab34). Recompute hash after lawyer sign-off, then registry before frontend.';
END $$;

INSERT INTO public.legal_consent_registry (
  consent_type,
  document_version,
  document_sha256,
  document_path,
  status,
  effective_at,
  legal_signoff_ref
) VALUES
  ('push_notifications', '1.2', 'fba4df9d1c745e48654b50c509304ea993eaf623b85e967752747626d4dec43a', 'apps/web/public/docs/v1.2/push-notifications-consent.md', 'active', '2026-08-15 00:00:00+03', 'docs/release/push-consent-v1.2-draft-2026-08-15.md')
ON CONFLICT (consent_type, document_version) DO UPDATE SET
  document_sha256 = EXCLUDED.document_sha256,
  document_path = EXCLUDED.document_path,
  status = EXCLUDED.status,
  effective_at = EXCLUDED.effective_at,
  legal_signoff_ref = EXCLUDED.legal_signoff_ref;

UPDATE public.legal_consent_registry
   SET status = 'retired'
 WHERE consent_type = 'push_notifications'
   AND document_version <> '1.2'
   AND status = 'active';
