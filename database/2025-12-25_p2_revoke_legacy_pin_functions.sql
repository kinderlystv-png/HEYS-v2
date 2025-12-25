-- ============================================================================
-- P2 Security Hardening: REVOKE legacy PIN verification functions
-- Date: 2025-12-25
-- Purpose: Remove heys_rpc access to legacy verify_client_pin and verify_client_pin_v2
-- 
-- CRITICAL: verify_client_pin_v2 returns plaintext PIN which is a security risk!
-- Only verify_client_pin_v3 (with IP rate-limiting) should be used.
-- ============================================================================

-- Make idempotent with DO blocks

-- 1. REVOKE FROM PUBLIC (PostgreSQL default grant)
DO $$ 
BEGIN
  REVOKE EXECUTE ON FUNCTION public.verify_client_pin(text, text) FROM PUBLIC;
  RAISE NOTICE 'Revoked PUBLIC EXECUTE on verify_client_pin';
EXCEPTION 
  WHEN undefined_function THEN 
    RAISE NOTICE 'Function verify_client_pin(text, text) does not exist - skipping';
  WHEN OTHERS THEN 
    RAISE NOTICE 'Error revoking verify_client_pin from PUBLIC: %', SQLERRM;
END $$;

DO $$ 
BEGIN
  REVOKE EXECUTE ON FUNCTION public.verify_client_pin_v2(text, text) FROM PUBLIC;
  RAISE NOTICE 'Revoked PUBLIC EXECUTE on verify_client_pin_v2';
EXCEPTION 
  WHEN undefined_function THEN 
    RAISE NOTICE 'Function verify_client_pin_v2(text, text) does not exist - skipping';
  WHEN OTHERS THEN 
    RAISE NOTICE 'Error revoking verify_client_pin_v2 from PUBLIC: %', SQLERRM;
END $$;

-- 2. REVOKE FROM heys_rpc
DO $$ 
BEGIN
  REVOKE EXECUTE ON FUNCTION public.verify_client_pin(text, text) FROM heys_rpc;
  RAISE NOTICE 'Revoked EXECUTE on verify_client_pin from heys_rpc';
EXCEPTION 
  WHEN undefined_function THEN 
    RAISE NOTICE 'Function verify_client_pin(text, text) does not exist - skipping';
  WHEN OTHERS THEN 
    RAISE NOTICE 'Error revoking verify_client_pin: %', SQLERRM;
END $$;

DO $$ 
BEGIN
  REVOKE EXECUTE ON FUNCTION public.verify_client_pin_v2(text, text) FROM heys_rpc;
  RAISE NOTICE 'Revoked EXECUTE on verify_client_pin_v2 from heys_rpc';
EXCEPTION 
  WHEN undefined_function THEN 
    RAISE NOTICE 'Function verify_client_pin_v2(text, text) does not exist - skipping';
  WHEN OTHERS THEN 
    RAISE NOTICE 'Error revoking verify_client_pin_v2: %', SQLERRM;
END $$;

-- Verification query (run after migration):
-- SELECT p.proname 
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname='public' 
-- AND p.proname LIKE 'verify_client_pin%'
-- AND has_function_privilege('heys_rpc', p.oid, 'EXECUTE');
-- 
-- Expected result: only verify_client_pin_v3 should be listed
