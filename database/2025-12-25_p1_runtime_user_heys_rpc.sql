-- ═══════════════════════════════════════════════════════════════════
-- 🔐 P1-3: Runtime User heys_rpc (минимальные привилегии)
-- Дата: 2025-12-25
-- Версия: 1.0.0
-- ═══════════════════════════════════════════════════════════════════
-- 
-- ЦЕЛЬ: Cloud Function должна работать под heys_rpc, а не heys_admin!
-- heys_rpc имеет только EXECUTE на нужные RPC функции.
--
-- ⚠️ ВАЖНО: Этот скрипт выполняется от имени heys_admin!
-- Пароль для heys_rpc нужно сгенерировать и положить в Yandex Lockbox.
--
-- ═══════════════════════════════════════════════════════════════════

-- 1) Создаём пользователя heys_rpc (если не существует)
-- ⚠️ Пароль генерируется случайно, его нужно сохранить в Lockbox!
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'heys_rpc') THEN
    -- ПАРОЛЬ ГЕНЕРИРУЕТСЯ В Yandex Cloud Console!
    -- Здесь placeholder, реальный пароль будет установлен через ALTER ROLE
    CREATE ROLE heys_rpc WITH LOGIN PASSWORD 'PLACEHOLDER_CHANGE_ME';
    RAISE NOTICE 'Created role heys_rpc';
  ELSE
    RAISE NOTICE 'Role heys_rpc already exists';
  END IF;
END $$;

-- 2) Отзываем ВСЁ по умолчанию
REVOKE ALL ON DATABASE heys_production FROM heys_rpc;
REVOKE ALL ON SCHEMA public FROM heys_rpc;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM heys_rpc;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM heys_rpc;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM heys_rpc;

-- 3) Базовые права: подключение к БД и использование схемы
GRANT CONNECT ON DATABASE heys_production TO heys_rpc;
GRANT USAGE ON SCHEMA public TO heys_rpc;

-- ═══════════════════════════════════════════════════════════════════
-- 📊 4) EXECUTE права только на публичные RPC функции
-- ═══════════════════════════════════════════════════════════════════

-- === AUTH ===
GRANT EXECUTE ON FUNCTION public.get_client_salt(TEXT) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.verify_client_pin(TEXT, TEXT) TO heys_rpc;
-- v2 может отсутствовать — try/catch
DO $$ BEGIN
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.verify_client_pin_v2(TEXT, TEXT) TO heys_rpc';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'verify_client_pin_v2 not found, skipping';
END $$;
-- v3 с rate-limit (p_ip как TEXT, кастится внутри функции)
DO $$ BEGIN
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.verify_client_pin_v3(TEXT, TEXT, TEXT) TO heys_rpc';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'verify_client_pin_v3 not found, skipping';
END $$;

GRANT EXECUTE ON FUNCTION public.client_pin_auth(TEXT, TEXT) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.create_client_with_pin(TEXT, TEXT, TEXT, TEXT) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.revoke_session(TEXT) TO heys_rpc;

-- ❌ УБРАНО из public (internal helpers, oracle токенов):
-- require_client_id(TEXT) — oracle валидности токенов (полезен атакующему)
-- issue_client_session(UUID, INT) — internal, вызывается из SECURITY DEFINER
-- subscription_can_write(UUID) — internal, вызывается из SECURITY DEFINER
-- check_pin_rate_limit, increment_pin_attempt, reset_pin_attempts — internal
-- log_security_event — DoS риск, логируем внутри SECURITY DEFINER

-- === SUBSCRIPTION ===
DO $$ BEGIN
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_subscription_status_by_session(TEXT) TO heys_rpc';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'get_subscription_status_by_session not found, skipping';
END $$;

DO $$ BEGIN
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.start_trial_by_session(TEXT) TO heys_rpc';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'start_trial_by_session not found, skipping';
END $$;

-- ❌ check_subscription_status(UUID) — убрано, принимает UUID без проверки владельца

-- === KV STORAGE ===
-- 🔐 P1: get_client_data заменён на session-версию (IDOR fix)
DO $$ BEGIN
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_client_data_by_session(TEXT) TO heys_rpc';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'get_client_data_by_session not found, skipping';
END $$;

GRANT EXECUTE ON FUNCTION public.save_client_kv(UUID, TEXT, JSONB) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.get_client_kv(UUID, TEXT) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.delete_client_kv(UUID, TEXT) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.upsert_client_kv(UUID, TEXT, JSONB) TO heys_rpc;

DO $$ BEGIN
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.batch_upsert_client_kv(UUID, JSONB) TO heys_rpc';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'batch_upsert_client_kv not found, skipping';
END $$;

-- === PRODUCTS ===
GRANT EXECUTE ON FUNCTION public.get_shared_products() TO heys_rpc;

-- 🔐 P1: create_pending_product заменён на session-версию (IDOR fix)
DO $$ BEGIN
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.create_pending_product_by_session(TEXT, TEXT, JSONB) TO heys_rpc';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'create_pending_product_by_session not found, skipping';
END $$;

-- === CONSENTS ===
DO $$ BEGIN
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.log_consents(UUID, JSONB, TEXT, TEXT) TO heys_rpc';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'log_consents not found, skipping';
END $$;

DO $$ BEGIN
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.check_required_consents(UUID) TO heys_rpc';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'check_required_consents not found, skipping';
END $$;


DO $$ BEGIN
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.revoke_consent(UUID, TEXT) TO heys_rpc';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'revoke_consent not found, skipping';
END $$;

DO $$ BEGIN
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_client_consents(UUID) TO heys_rpc';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'get_client_consents not found, skipping';
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 🔐 5) НЕТ прямого доступа к таблицам!
-- Функции работают с SECURITY DEFINER (от имени heys_admin).
-- heys_rpc не может напрямую SELECT/INSERT/UPDATE/DELETE таблицы!
-- ═══════════════════════════════════════════════════════════════════

-- Явно запрещаем (перестраховка)
REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM heys_rpc;

-- ═══════════════════════════════════════════════════════════════════
-- ✅ Готово
-- ═══════════════════════════════════════════════════════════════════

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ Runtime user heys_rpc создан!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '🔐 Привилегии heys_rpc:';
  RAISE NOTICE '   • CONNECT к heys_production';
  RAISE NOTICE '   • USAGE на public schema';
  RAISE NOTICE '   • EXECUTE на ~18 публичных RPC функций';
  RAISE NOTICE '   • ❌ НЕТ доступа к таблицам напрямую!';
  RAISE NOTICE '   • ❌ НЕТ доступа к internal helpers!';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️ СЛЕДУЮЩИЕ ШАГИ:';
  RAISE NOTICE '   1. Сгенерируй пароль для heys_rpc: openssl rand -base64 32';
  RAISE NOTICE '   2. ALTER ROLE heys_rpc WITH PASSWORD ''<новый_пароль>'';';
  RAISE NOTICE '   3. Создай секрет в Yandex Lockbox: heys-rpc-password';
  RAISE NOTICE '   4. Обнови Cloud Function: PG_USER=heys_rpc, пароль из Lockbox';
  RAISE NOTICE '';
END $$;
