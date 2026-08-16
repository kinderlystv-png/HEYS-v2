-- Curator Web Push consent gate (152-FZ).
-- Table: public.curator_consents (already exists). New type:
-- curator_push_notifications — not client push_notifications, because
-- enforce_consent_document_proof stamps document_sha256 from
-- legal_consent_registry by (consent_type, document_version). Mixing the
-- client document onto curator rows would be false proof.
--
-- Owner/current curators: explicit INSERT for every currently active
-- curator. No UUID exception in send path (prompt-internal-account 12.08).
-- Prod 15.08.2026: two active rows are the same person (kinderlystv@gmail.com
-- and poplanton@mail.ru). Inactive capacity-test@heys.invalid was not granted.
-- Hired curators must sign this document themselves — do not stamp for them.
--
-- Apply: bash scripts/db/psql.sh -f scripts/db/migrations/2026-08-15_curator_push_consent_gate_v1.sql

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'curator_consents_consent_type_check'
  ) THEN
    ALTER TABLE public.curator_consents
      DROP CONSTRAINT curator_consents_consent_type_check;
  END IF;

  ALTER TABLE public.curator_consents
    ADD CONSTRAINT curator_consents_consent_type_check
    CHECK (consent_type IN ('speech_transcription', 'curator_push_notifications'));
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
  ('curator_push_notifications', '1.0', '13d4f89332b96eb073934ec8213f8287be88e47f5e52908cf4ccf2359a3700ce', 'apps/web/public/docs/v1.0/curator-push-notifications-consent.md', 'active', '2026-08-15 00:00:00+03', 'docs/release/audit-push-support-2026-08-15.md')
ON CONFLICT (consent_type, document_version) DO UPDATE SET
  document_sha256 = EXCLUDED.document_sha256,
  document_path = EXCLUDED.document_path,
  status = EXCLUDED.status,
  effective_at = EXCLUDED.effective_at,
  legal_signoff_ref = EXCLUDED.legal_signoff_ref;

INSERT INTO public.curator_consents (
  curator_id,
  consent_type,
  document_version,
  granted,
  consent_method,
  signature_method
)
SELECT
  c.id,
  'curator_push_notifications',
  '1.0',
  true,
  'migration_active_curators',
  'migration'
FROM public.curators c
WHERE c.is_active IS TRUE
  AND NOT EXISTS (
    SELECT 1
      FROM public.curator_consents cc
     WHERE cc.curator_id = c.id
       AND cc.consent_type = 'curator_push_notifications'
       AND cc.granted = true
       AND cc.revoked_at IS NULL
  );

COMMENT ON TABLE public.curator_consents IS
  'Curator consent proof: speech_transcription and curator_push_notifications. Push send is skipped without a live curator_push_notifications row.';
