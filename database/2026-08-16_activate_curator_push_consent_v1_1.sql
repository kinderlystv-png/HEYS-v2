-- Activate curator push-notifications consent 1.1.
--
-- Lawyer sign-off 16.08.2026: docs/release/vychitka-push-1.2-2026-08-16.md.
-- 1.1 supersedes 1.0 going forward. 1.0 is NOT annulled and its snapshot
-- (apps/web/public/docs/v1.0/curator-push-notifications-consent.md) stays
-- untouched: signatures under it are proof of the text that was signed
-- (lawyer, answer 7). Retiring the registry row only stops new signatures.
--
-- What 1.1 adds: the curator undertakes not to let third parties see the
-- notifications (art. 19 measure — the name of a client shows up on a locked
-- screen), an explicit revocation route and term, and a statement that the
-- consent is not a condition of performing curator duties (freely given
-- consent, matters at the first hire).
--
-- NO signature rows are stamped here. The 15.08 gate migration stamped 1.0 for
-- the then-active curators; 1.1 must be signed by each curator personally.
-- There is no signing screen yet (curator_consents is server-side only) —
-- owner decides: a small screen in the curator profile, or a paper act
-- referenced from legal_signoff_ref. Until then 1.1 is registered but unsigned.
--
-- The send-path gate does not look at the version
-- (yandex-cloud-functions/*/push-consent.js: granted = true AND revoked_at IS
-- NULL), so retiring 1.0 does not stop live push for a curator who signed 1.0.
--
-- Apply: bash scripts/db/psql.sh -f database/2026-08-16_activate_curator_push_consent_v1_1.sql

INSERT INTO public.legal_consent_registry (
  consent_type,
  document_version,
  document_sha256,
  document_path,
  status,
  effective_at,
  legal_signoff_ref
) VALUES
  ('curator_push_notifications', '1.1', '973e0fe4f2ec7544964c8706a7679d616f8009344bc28927567acd3fdcd47153', 'apps/web/public/docs/v1.1/curator-push-notifications-consent.md', 'active', '2026-08-16 00:00:00+03', 'docs/release/vychitka-push-1.2-2026-08-16.md')
ON CONFLICT (consent_type, document_version) DO UPDATE SET
  document_sha256 = EXCLUDED.document_sha256,
  document_path = EXCLUDED.document_path,
  status = EXCLUDED.status,
  effective_at = EXCLUDED.effective_at,
  legal_signoff_ref = EXCLUDED.legal_signoff_ref;

UPDATE public.legal_consent_registry
   SET status = 'retired'
 WHERE consent_type = 'curator_push_notifications'
   AND document_version <> '1.1'
   AND status = 'active';
