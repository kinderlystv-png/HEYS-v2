-- Activate push-notifications consent 1.2.
--
-- Lawyer sign-off 16.08.2026: docs/release/vychitka-push-1.2-2026-08-16.md.
-- Text: docs/legal/push-notifications-consent.md == the v1.2 snapshot, byte for
-- byte. sha256 b1b03ad2… is recomputed from that signed text (the earlier
-- draft hash fba4df9d… is dead, do not resurrect it).
--
-- DEPLOY ORDER IS INVERTED HERE — read before applying.
-- The general rule is registry first, frontend second, because frontend ahead
-- of registry gives consent_version_not_allowed. On 16.08 the frontend went
-- first anyway (0552c9a5 bumped LegalVersions.push_notifications to 1.2 and
-- shipped), so prod is already asking for 1.2 while the registry is on 1.1:
-- nobody can sign, and nobody has signed 1.2.
-- In that state applying this SQL BEFORE the corrected text reaches prod is
-- the worse failure: the client would sign the old draft on screen while
-- enforce_consent_document_proof stamps the hash of the new text. False proof.
-- So, this once:
--   1) ship the text (docs/legal + apps/web/public/docs/v1.2) and let the
--      deploy go green;
--   2) verify prod bytes:
--      curl -s https://app.heyslab.ru/docs/v1.2/push-notifications-consent.md | sha256sum
--      == b1b03ad270746c73af93a60cc36fbcf19a0e8bbacbe5766969a5ad83b9d29108
--   3) only then apply this file.
-- Until step 3 signing stays broken exactly as it is now — nothing degrades.
--
-- Do not rewrite 1.1: its hash (99433c270c3432dd…) is registered proof.
--
-- File keeps its 2026-08-15 name (it was never applied); content finalized 16.08.
-- Apply: bash scripts/db/psql.sh -f database/2026-08-15_activate_push_consent_v1_2.sql

INSERT INTO public.legal_consent_registry (
  consent_type,
  document_version,
  document_sha256,
  document_path,
  status,
  effective_at,
  legal_signoff_ref
) VALUES
  ('push_notifications', '1.2', 'b1b03ad270746c73af93a60cc36fbcf19a0e8bbacbe5766969a5ad83b9d29108', 'apps/web/public/docs/v1.2/push-notifications-consent.md', 'active', '2026-08-16 00:00:00+03', 'docs/release/vychitka-push-1.2-2026-08-16.md')
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
