-- ============================================================================
-- 🔐 P3 Security: Create heys_rest user with read-only access
-- ============================================================================
-- ВАЖНО: Пользователь heys_rest должен быть создан ПЕРЕД запуском этого скрипта!
-- 
-- Создание пользователя (YC Console или yc cli):
--   yc managed-postgresql user create heys_rest \
--     --cluster-id <CLUSTER_ID> \
--     --password '<STRONG_PASSWORD>'
--
-- Или через Yandex Cloud Console:
--   1. Managed PostgreSQL → Кластер → Пользователи
--   2. Создать пользователя: heys_rest
--   3. Выбрать базу: heys_production
--   4. Установить сильный пароль
-- ============================================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- Проверка что пользователь существует (defensive)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_rest') THEN
    RAISE EXCEPTION '[FATAL] User heys_rest does not exist! Create it via YC Console first.';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- REVOKE: Явно убираем любые права (defensive, если что-то было)
-- ═══════════════════════════════════════════════════════════════════════════

-- Таблицы с PII — НИКАКОГО доступа
DO $$ BEGIN
  REVOKE ALL ON TABLE public.clients FROM heys_rest;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- KV таблицы — только через RPC by_session
DO $$ BEGIN
  REVOKE ALL ON TABLE public.client_kv_store FROM heys_rest;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE ALL ON TABLE public.kv_store FROM heys_rest;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Pending products — только через RPC
DO $$ BEGIN
  REVOKE ALL ON TABLE public.shared_products_pending FROM heys_rest;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Consents — чувствительные, только через RPC by_session
DO $$ BEGIN
  REVOKE ALL ON TABLE public.consents FROM heys_rest;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Security tables — НИКАКОГО доступа
DO $$ BEGIN
  REVOKE ALL ON TABLE public.security_events FROM heys_rest;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE ALL ON TABLE public.pin_login_attempts FROM heys_rest;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE ALL ON TABLE public.client_sessions FROM heys_rest;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Subscriptions — только через RPC
DO $$ BEGIN
  REVOKE ALL ON TABLE public.subscriptions FROM heys_rest;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- GRANT: Только SELECT на разрешённые таблицы
-- ═══════════════════════════════════════════════════════════════════════════

-- Schema usage (required)
GRANT USAGE ON SCHEMA public TO heys_rest;

-- ✅ shared_products — основная база продуктов (используется как "public view" через API whitelist)
DO $$ BEGIN
  GRANT SELECT ON TABLE public.shared_products TO heys_rest;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table shared_products does not exist, skipping GRANT';
END $$;

-- ❌ shared_products_public — REMOVED from REST: VIEW uses auth.uid() which doesn't exist in YC
-- API использует shared_products + column whitelist вместо VIEW

-- ✅ shared_products_blocklist — для фильтрации заблокированных
DO $$ BEGIN
  GRANT SELECT ON TABLE public.shared_products_blocklist TO heys_rest;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table shared_products_blocklist does not exist, skipping GRANT';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Проверка результата
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  has_clients BOOLEAN;
  has_shared_products BOOLEAN;
BEGIN
  -- Проверяем что НЕТ доступа к clients
  SELECT has_table_privilege('heys_rest', 'public.clients', 'SELECT') INTO has_clients;
  IF has_clients THEN
    RAISE EXCEPTION '[SECURITY] heys_rest should NOT have access to clients!';
  END IF;
  
  -- Проверяем что ЕСТЬ доступ к shared_products
  SELECT has_table_privilege('heys_rest', 'public.shared_products', 'SELECT') INTO has_shared_products;
  IF NOT has_shared_products THEN
    RAISE EXCEPTION '[SECURITY] heys_rest should have SELECT on shared_products!';
  END IF;
  
  RAISE NOTICE '✅ heys_rest grants verified: clients=%, shared_products=%', has_clients, has_shared_products;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Verification query (run after COMMIT)
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT 
--   relname as table_name,
--   has_table_privilege('heys_rest', c.oid, 'SELECT') as can_select,
--   has_table_privilege('heys_rest', c.oid, 'INSERT') as can_insert,
--   has_table_privilege('heys_rest', c.oid, 'UPDATE') as can_update,
--   has_table_privilege('heys_rest', c.oid, 'DELETE') as can_delete
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public'
--   AND c.relkind IN ('r', 'v')
--   AND c.relname IN ('clients', 'shared_products', 'shared_products_public', 
--                     'shared_products_blocklist', 'client_kv_store', 'consents')
-- ORDER BY relname;
