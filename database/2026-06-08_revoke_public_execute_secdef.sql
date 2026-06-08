-- =============================================================================
-- SEC-016 — Отзыв дефолтного PUBLIC EXECUTE на SECURITY DEFINER функциях.
--
-- Зачем: L2-аудит (2026-06-08) показал, что ~210 функций (вкл. admin_*, crypto,
-- internal-helpers) исполнимы ролью PUBLIC. Миграция p1_grants_heys_rpc_only.sql
-- раздала точечные GRANT'ы heys_rpc, но НЕ сделала REVOKE ... FROM PUBLIC, поэтому
-- least-privilege неэффективен: роль heys_rest (эндпоинт REST, ей явно выданы 4
-- функции) через PUBLIC может звать admin/crypto. Это ломает blast-radius при
-- компрометации backend-роли.
--
-- ⚠️  ВНИМАНИЕ — ЭТО МЕНЯЕТ ПРАВА В ПРОДЕ. Перед apply:
--   • прогнать на staging ИЛИ применить с готовым rollback (внизу) и сразу
--     проверить все cloud functions (smoke-test + ручной прогон PIN-входа,
--     curator-sync, REST KV, messages, payments, photos);
--   • держать rollback под рукой.
--
-- Конструкция БЕЗ ПОЛОМКИ:
--   1) heys_rpc получает явный EXECUTE на ВСЕ SECDEF (раньше он держал их через
--      PUBLIC — его эффективные права НЕ меняются);
--   2) heys_rest получает SECDEF-функции, которые реально вызывает в коде
--      (validate_write_context — уже есть; safe_upsert_client_kv — добавляем тут;
--      его прежние явные гранты на weekly-snapshot сохраняются);
--   3) PUBLIC теряет EXECUTE на SECDEF → admin/crypto/internal больше не вызвать
--      ролью без явного гранта.
--
-- Остаточный риск: если какая-то backend-функция подключается под РОЛЬЮ, отличной
-- от heys_rpc/heys_rest, и полагалась на PUBLIC — она сломается. По L2 §3 явные
-- гранты есть только у heys_rpc и heys_rest, поэтому риск низкий, но проверить
-- после apply ОБЯЗАТЕЛЬНО.
--
-- NB: heys_rpc остаётся с доступом ко ВСЕМ SECDEF (полный least-privilege по
-- heys_rpc — отдельная задача P2, требует анализа реальных вызовов из кода).
--
-- Apply:
--   bash scripts/db/psql.sh --single-transaction -f database/2026-06-08_revoke_public_execute_secdef.sql
-- =============================================================================

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE p.prosecdef
      AND nsp.nspname = 'public'
  LOOP
    -- 1) сделать текущий (через PUBLIC) доступ heys_rpc явным
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO heys_rpc', r.sig);
    -- 3) убрать дефолтный PUBLIC
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
  END LOOP;
END$$;

-- 2) heys_rest: подтверждённые SECDEF-вызовы из yandex-cloud-functions/heys-api-rest/index.js
--    (validate_write_context — уже было; safe_upsert_client_kv — line 917).
GRANT EXECUTE ON FUNCTION public.safe_upsert_client_kv(uuid, text, jsonb) TO heys_rest;

-- Verify: PUBLIC больше не держит EXECUTE на SECDEF — должно вернуть 0 строк.
SELECT p.proname AS still_public_execute
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE p.prosecdef
  AND nsp.nspname = 'public'
  AND has_function_privilege('public', p.oid, 'EXECUTE');

-- =============================================================================
-- ROLLBACK (если что-то сломалось — вернуть PUBLIC на SECDEF):
--
-- DO $$
-- DECLARE r record;
-- BEGIN
--   FOR r IN SELECT p.oid::regprocedure AS sig
--            FROM pg_proc p JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
--            WHERE p.prosecdef AND nsp.nspname = 'public'
--   LOOP
--     EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', r.sig);
--   END LOOP;
-- END$$;
-- =============================================================================
