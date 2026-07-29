-- Forward-only correction for the released v1.9 legal document hash.
-- The activation migration remains byte-identical to the version recorded in
-- the production migration ledger.

INSERT INTO public.legal_consent_registry (
  consent_type,
  document_version,
  document_sha256,
  document_path,
  status,
  effective_at,
  legal_signoff_ref
) VALUES
  ('user_agreement', '1.9', 'd3b992efe78793774a3e609e7ca7d65a1f5f70510529264d5c2d8b52b2a45802', 'apps/web/public/docs/v1.9/user-agreement.md', 'active', '2026-07-29 00:00:00+03', NULL),
  ('payment_oferta', '1.9', 'd3b992efe78793774a3e609e7ca7d65a1f5f70510529264d5c2d8b52b2a45802', 'apps/web/public/docs/v1.9/user-agreement.md', 'active', '2026-07-29 00:00:00+03', NULL)
ON CONFLICT (consent_type, document_version) DO UPDATE SET
  document_sha256 = EXCLUDED.document_sha256,
  document_path = EXCLUDED.document_path,
  status = EXCLUDED.status,
  effective_at = EXCLUDED.effective_at,
  legal_signoff_ref = EXCLUDED.legal_signoff_ref;
