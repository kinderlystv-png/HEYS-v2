-- Revoke the 15.08 migration-stamped curator push consent 1.0 row.
--
-- The gate checks granted=true AND revoked_at IS NULL; it does not look at
-- version. After block 3 of 2026-08-16_activate_curator_push_consent_v1_1.sql
-- the owner has a real paper_act row under 1.1. Leaving the migration row live
-- would mean push is authorized by a script-stamped 1.0 signature the lawyer
-- rejected — not by the signed act.
--
-- Document 1.0 stays in legal_consent_registry as retired (archival proof).
-- Only the false live consent row is revoked.
--
-- Apply: bash scripts/db/psql.sh -f database/2026-08-16_revoke_curator_push_consent_v1_0_migration_stamp.sql

UPDATE public.curator_consents
   SET revoked_at = now()
 WHERE consent_type = 'curator_push_notifications'
   AND document_version = '1.0'
   AND signature_method = 'migration'
   AND revoked_at IS NULL;
