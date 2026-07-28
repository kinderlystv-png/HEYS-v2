-- HEYS legal consent registry: activate user agreement/payment oferta v1.8.
-- Forward-only follow-up to the already-applied consent proof migration № 9.
-- NO ROLLBACK: accepted consent evidence must keep its original version/hash;
-- any future legal version change must use another forward migration.

INSERT INTO public.legal_consent_registry (
  consent_type,
  document_version,
  document_sha256,
  document_path,
  status,
  effective_at,
  legal_signoff_ref
) VALUES
  ('user_agreement', '1.8', 'd7f3a02f916d84476080b53f311db869ed526b73eabe75d128ca848481c209a4', 'apps/web/public/docs/v1.8/user-agreement.md', 'active', '2026-07-28 00:00:00+03', NULL),
  ('payment_oferta', '1.8', 'd7f3a02f916d84476080b53f311db869ed526b73eabe75d128ca848481c209a4', 'apps/web/public/docs/v1.8/user-agreement.md', 'active', '2026-07-28 00:00:00+03', NULL)
ON CONFLICT (consent_type, document_version) DO UPDATE SET
  document_sha256 = EXCLUDED.document_sha256,
  document_path = EXCLUDED.document_path,
  status = EXCLUDED.status,
  effective_at = EXCLUDED.effective_at,
  legal_signoff_ref = EXCLUDED.legal_signoff_ref;

UPDATE public.legal_consent_registry
SET status = 'retired'
WHERE consent_type IN ('user_agreement', 'payment_oferta')
  AND document_version <> '1.8'
  AND status = 'active';
