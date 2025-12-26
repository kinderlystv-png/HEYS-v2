-- ============================================================================
-- 🔐 GRANT: heys_rest access to client_kv_store for curator sync
-- ============================================================================
-- 
-- ISSUE: REST API has client_kv_store in ALLOWED_TABLES but heys_rest has no permissions
-- FIX: Grant SELECT, INSERT, UPDATE for curator sync operations
-- 
-- Related files:
--   - yandex-cloud-functions/heys-api-rest/index.js (ALLOWED_TABLES, WRITE_ALLOWED_TABLES)
--   - database/2025-12-26_p3_grants_heys_rest.sql (original REVOKE without GRANT)
--
-- Date: 2025-12-26
-- ============================================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- Проверка что пользователь существует
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_rest') THEN
    RAISE EXCEPTION '[FATAL] User heys_rest does not exist! Create it via YC Console first.';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- GRANT: client_kv_store (SELECT, INSERT, UPDATE для upsert)
-- ═══════════════════════════════════════════════════════════════════════════
-- Куратор использует REST API для sync данных клиентов через client_kv_store
-- POST с upsert=true требует INSERT + UPDATE (ON CONFLICT DO UPDATE)

DO $$ BEGIN
  GRANT SELECT, INSERT, UPDATE ON TABLE public.client_kv_store TO heys_rest;
  RAISE NOTICE '✅ GRANT SELECT, INSERT, UPDATE ON client_kv_store TO heys_rest';
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE '⚠️ Table client_kv_store does not exist, skipping GRANT';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- GRANT: shared_products_pending (SELECT для куратора review)
-- ═══════════════════════════════════════════════════════════════════════════
-- Added in previous session but may need re-application

DO $$ BEGIN
  GRANT SELECT ON TABLE public.shared_products_pending TO heys_rest;
  RAISE NOTICE '✅ GRANT SELECT ON shared_products_pending TO heys_rest';
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE '⚠️ Table shared_products_pending does not exist, skipping GRANT';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Verification
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  can_select BOOLEAN;
  can_insert BOOLEAN;
  can_update BOOLEAN;
BEGIN
  SELECT has_table_privilege('heys_rest', 'public.client_kv_store', 'SELECT') INTO can_select;
  SELECT has_table_privilege('heys_rest', 'public.client_kv_store', 'INSERT') INTO can_insert;
  SELECT has_table_privilege('heys_rest', 'public.client_kv_store', 'UPDATE') INTO can_update;
  
  IF NOT can_select OR NOT can_insert OR NOT can_update THEN
    RAISE EXCEPTION '[SECURITY] heys_rest should have SELECT, INSERT, UPDATE on client_kv_store! Got: SELECT=%, INSERT=%, UPDATE=%', can_select, can_insert, can_update;
  END IF;
  
  RAISE NOTICE '✅ client_kv_store grants verified: SELECT=%, INSERT=%, UPDATE=%', can_select, can_insert, can_update;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Verification query (run manually after COMMIT)
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT 
--   relname as table_name,
--   has_table_privilege('heys_rest', c.oid, 'SELECT') as can_select,
--   has_table_privilege('heys_rest', c.oid, 'INSERT') as can_insert,
--   has_table_privilege('heys_rest', c.oid, 'UPDATE') as can_update
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public'
--   AND c.relkind IN ('r', 'v')
--   AND c.relname IN ('client_kv_store', 'shared_products_pending')
-- ORDER BY relname;
