-- =============================================================================
-- SEC-015 — Pin search_path на всех SECURITY DEFINER функциях public.
--
-- Зачем: L2-аудит (2026-06-08) показал 70 SECDEF-функций без явного search_path,
-- включая crown-jewels (client_pin_auth, create_client_with_pin, admin_set_client_pin,
-- encrypt/decrypt_health_data, get_encryption_key, safe_upsert_client_kv,
-- get_client_salt, verify_client_pin). Без зафиксированного search_path резолв
-- неполноквалифицированных имён зависит от search_path вызывающего → классический
-- риск hijack (CWE-426/427).
--
-- Безопасность: правка ПОВЕДЕНИЕ НЕ МЕНЯЕТ — просто пиннит резолв туда же, куда он
-- и так идёт при дефолтном search_path. Идемпотентна (берёт только функции без
-- search_path). pg_temp идёт ПОСЛЕДНИМ — temp-объекты не могут перехватить резолв.
--
-- Apply:
--   bash scripts/db/psql.sh --single-transaction -f database/2026-06-08_harden_secdef_search_path.sql
--
-- Примечание: ALTER требует владельца функции. Подключение psql.sh идёт под
-- heys_admin (владелец app-функций). Если какая-то функция чужая — DO упадёт, и
-- при --single-transaction вся миграция откатится (ничего частично не применится).
-- =============================================================================

DO $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE p.prosecdef
      AND nsp.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) c
        WHERE c LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
    n := n + 1;
    RAISE NOTICE 'search_path pinned: %', r.sig;
  END LOOP;
  RAISE NOTICE 'SEC-015 done — functions hardened: %', n;
END$$;

-- Verify: должно вернуть 0 строк.
SELECT p.proname AS still_unpinned
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE p.prosecdef
  AND nsp.nspname = 'public'
  AND NOT EXISTS (
    SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) c
    WHERE c LIKE 'search_path=%'
  );
