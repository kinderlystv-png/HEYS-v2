-- HEYS legal consent registry: activate user agreement/payment oferta v1.9.
-- Forward-only follow-up to v1.8. Historical consent evidence and immutable
-- snapshots keep their original version/hash.
-- Applying this migration triggers re-consent for user_agreement/payment_oferta
-- consumers that require the active registry version. Do not apply separately
-- from the matching frontend/payment release.

INSERT INTO public.legal_consent_registry (
  consent_type,
  document_version,
  document_sha256,
  document_path,
  status,
  effective_at,
  legal_signoff_ref
) VALUES
  ('user_agreement', '1.9', 'b4168eb64d94cdab5ae8a717f2391ed8b3c9c65f5e1937a306ad017c471ba8bc', 'apps/web/public/docs/v1.9/user-agreement.md', 'active', '2026-07-29 00:00:00+03', NULL),
  ('payment_oferta', '1.9', 'b4168eb64d94cdab5ae8a717f2391ed8b3c9c65f5e1937a306ad017c471ba8bc', 'apps/web/public/docs/v1.9/user-agreement.md', 'active', '2026-07-29 00:00:00+03', NULL)
ON CONFLICT (consent_type, document_version) DO UPDATE SET
  document_sha256 = EXCLUDED.document_sha256,
  document_path = EXCLUDED.document_path,
  status = EXCLUDED.status,
  effective_at = EXCLUDED.effective_at,
  legal_signoff_ref = EXCLUDED.legal_signoff_ref;

UPDATE public.legal_consent_registry
SET status = 'retired'
WHERE consent_type IN ('user_agreement', 'payment_oferta')
  AND document_version <> '1.9'
  AND status = 'active';
