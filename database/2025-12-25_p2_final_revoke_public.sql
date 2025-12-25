-- ═══════════════════════════════════════════════════════════════════════════
-- P2 SECURITY: Final REVOKE FROM PUBLIC (IDEMPOTENT)
-- Date: 2025-12-25
-- Purpose: Ensure NO sensitive functions have PUBLIC EXECUTE
-- 
-- This is a "catch-all" fix for any functions that were created
-- with default PUBLIC EXECUTE and not properly revoked.
-- 
-- IDEMPOTENT: Uses DO/EXCEPTION to handle missing functions gracefully
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- 🔒 REVOKE FROM PUBLIC on all sensitive functions (idempotent)
-- ═══════════════════════════════════════════════════════════════════

DO $$ 
DECLARE
  func_signatures TEXT[] := ARRAY[
    -- Legacy PIN functions
    'public.verify_client_pin(text, text)',
    'public.verify_client_pin_v2(text, text)',
    'public.verify_client_pin_v3(text, text, text, text)',
    
    -- Rate-limit functions  
    'public.check_pin_rate_limit(text, inet)',
    'public.increment_pin_attempt(text, inet)',
    'public.reset_pin_attempts(text, inet)',
    
    -- KV functions (UUID-based = IDOR risk)
    'public.save_client_kv(uuid, text, jsonb)',
    'public.upsert_client_kv(uuid, text, jsonb)',
    'public.batch_upsert_client_kv(uuid, jsonb)',
    'public.batch_upsert_client_kv(uuid, jsonb[])',
    
    -- Other UUID-based functions
    'public.get_client_data(uuid)',
    'public.create_pending_product(uuid, jsonb, text, text)',
    'public.create_pending_product(uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, integer, integer, text, jsonb, text)',
    'public.create_client_with_pin(text, text, text, text, uuid)',
    
    -- Internal functions
    'public.log_security_event(text, text, uuid, text, text, jsonb)',
    'public.cleanup_security_logs(integer)'
  ];
  sig TEXT;
BEGIN
  FOREACH sig IN ARRAY func_signatures LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
      RAISE NOTICE 'REVOKED: %', sig;
    EXCEPTION 
      WHEN undefined_function THEN
        RAISE NOTICE 'SKIPPED (not found): %', sig;
    END;
  END LOOP;
  
  RAISE NOTICE '✅ All REVOKE operations completed (idempotent)';
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- ✅ Verification query
-- ═══════════════════════════════════════════════════════════════════

/*
SELECT p.proname, 
       pg_get_function_identity_arguments(p.oid) AS args,
       has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'verify_client_pin','verify_client_pin_v2','verify_client_pin_v3',
    'save_client_kv','batch_upsert_client_kv','upsert_client_kv',
    'get_client_data','create_pending_product','create_client_with_pin',
    'increment_pin_attempt','check_pin_rate_limit','log_security_event',
    'reset_pin_attempts','cleanup_security_logs'
  )
ORDER BY 1;

-- Expected: ALL rows should have public_exec = f
*/
