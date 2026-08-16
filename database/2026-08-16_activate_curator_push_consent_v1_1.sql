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
-- Block 3 stamps ONE signature row, for the owner-curator only
-- (poplanton@mail.ru), on the basis of the signed paper act
-- docs/release/подписано в реальности/act-curator-push-consent-1.1-2026-08-16.md.
-- Do not widen it to
-- all active curators: a hired curator must sign 1.1 himself, and there is no
-- signing screen yet (curator_consents is server-side only). Building that
-- screen is a prerequisite for the first hire — consent obtained under threat
-- of losing access to work is not freely given (lawyer, 16.08).
--
-- Apply block 3 only after the act is physically signed. Order matters inside
-- this file: the registry row must exist first, because
-- enforce_consent_document_proof stamps document_sha256 from the registry.
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

-- Block 3: owner-curator signature under 1.1, basis — the signed paper act.
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
  '1.1',
  true,
  'paper_act',
  'paper'
FROM public.curators c
WHERE c.email = 'poplanton@mail.ru'
  AND c.is_active IS TRUE
  AND NOT EXISTS (
    SELECT 1
      FROM public.curator_consents cc
     WHERE cc.curator_id = c.id
       AND cc.consent_type = 'curator_push_notifications'
       AND cc.document_version = '1.1'
       AND cc.granted = true
       AND cc.revoked_at IS NULL
  );
