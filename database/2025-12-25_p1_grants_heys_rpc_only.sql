-- ═══════════════════════════════════════════════════════════════════
-- 🔐 P1: GRANT'ы для runtime user heys_rpc
-- ═══════════════════════════════════════════════════════════════════
-- Предполагается, что роль heys_rpc уже создана через Yandex Cloud Console
-- Применять ПОСЛЕ создания пользователя в YC Console
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- 1) Schema access
-- ═══════════════════════════════════════════════════════════════════
GRANT USAGE ON SCHEMA public TO heys_rpc;

-- ═══════════════════════════════════════════════════════════════════
-- 2) AUTH (public RPC)
-- ═══════════════════════════════════════════════════════════════════

-- Безопасные функции аутентификации
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_client_salt(TEXT) TO heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- 🔐 P2: REMOVED - legacy function without rate-limit
-- DO $$ BEGIN
--   GRANT EXECUTE ON FUNCTION public.verify_client_pin(TEXT, TEXT) TO heys_rpc;
-- EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.client_pin_auth(TEXT, TEXT) TO heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.create_client_with_pin(TEXT, TEXT, TEXT, TEXT) TO heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- 🔐 P2: REMOVED - returned plaintext PIN (security risk!)
-- DO $$ BEGIN
--   GRANT EXECUTE ON FUNCTION public.verify_client_pin_v2(TEXT, TEXT) TO heys_rpc;
-- EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- 🔐 P1: С rate-limit по IP
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.verify_client_pin_v3(TEXT, TEXT, TEXT) TO heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.revoke_session(TEXT) TO heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 3) SUBSCRIPTION (public RPC)
-- ═══════════════════════════════════════════════════════════════════

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_subscription_status_by_session(TEXT) TO heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.start_trial_by_session(TEXT) TO heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 4) SESSION-SAFE ENDPOINTS (IDOR fixed!)
-- ═══════════════════════════════════════════════════════════════════

-- 🔐 P1: Session-версии — client_id извлекается из сессии, не от клиента
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_client_data_by_session(TEXT) TO heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.create_pending_product_by_session(TEXT, TEXT, JSONB) TO heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 5) KV STORAGE (session-safe версия)
-- ═══════════════════════════════════════════════════════════════════

-- 🔐 P1: upsert_client_kv_by_session — единственная KV функция для runtime
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.upsert_client_kv_by_session(TEXT, TEXT, JSONB) TO heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- ⚠️ UUID-версии KV НЕ грантуем — это IDOR!
-- get_client_kv(UUID, TEXT) — НЕТ
-- save_client_kv(UUID, TEXT, JSONB) — НЕТ
-- delete_client_kv(UUID, TEXT) — НЕТ
-- upsert_client_kv(UUID, TEXT, JSONB) — НЕТ
-- batch_upsert_client_kv(UUID, JSONB) — НЕТ

-- ═══════════════════════════════════════════════════════════════════
-- 6) PRODUCTS (public read-only)
-- ═══════════════════════════════════════════════════════════════════

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_shared_products() TO heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 7) CONSENTS
-- ═══════════════════════════════════════════════════════════════════

-- ⚠️ Эти функции принимают UUID — потенциальный IDOR
-- TODO: Создать session-версии consent функций
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.log_consents(UUID, JSONB, TEXT, TEXT) TO heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.check_required_consents(UUID) TO heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.revoke_consent(UUID, TEXT) TO heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_client_consents(UUID) TO heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 8) REVOKE: internal helpers (НЕ должны быть доступны runtime!)
-- ═══════════════════════════════════════════════════════════════════

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.issue_client_session(UUID, INT) FROM heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.subscription_can_write(UUID) FROM heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.check_pin_rate_limit(TEXT, INET) FROM heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.increment_pin_attempt(TEXT, INET) FROM heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.reset_pin_attempts(TEXT, INET) FROM heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.require_client_id(TEXT) FROM heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.check_subscription_status(UUID) FROM heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.log_security_event(TEXT, TEXT, UUID, TEXT, TEXT, JSONB) FROM heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 9) Явный REVOKE на UUID-версии (IDOR prevention)
-- ═══════════════════════════════════════════════════════════════════

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.get_client_data(UUID) FROM heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.get_client_kv(UUID, TEXT) FROM heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.save_client_kv(UUID, TEXT, JSONB) FROM heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.delete_client_kv(UUID, TEXT) FROM heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.upsert_client_kv(UUID, TEXT, JSONB) FROM heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.batch_upsert_client_kv(UUID, JSONB) FROM heys_rpc;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════
-- Проверка: что доступно heys_rpc?
-- ═══════════════════════════════════════════════════════════════════

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ GRANT''ы для heys_rpc применены!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE 'Проверьте доступные функции:';
  RAISE NOTICE '';
  RAISE NOTICE 'SELECT p.proname, pg_get_function_identity_arguments(p.oid)';
  RAISE NOTICE 'FROM pg_proc p';
  RAISE NOTICE 'JOIN pg_namespace n ON n.oid = p.pronamespace';
  RAISE NOTICE 'WHERE n.nspname=''public''';
  RAISE NOTICE 'AND has_function_privilege(''heys_rpc'', p.oid, ''EXECUTE'')';
  RAISE NOTICE 'ORDER BY 1;';
  RAISE NOTICE '';
END $$;
