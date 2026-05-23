-- 2026-05-24: DROP sync_shared_products_by_session (plan F17)
--
-- Rationale: функция определена в 2025-01-09_sync_products_function.sql,
-- replace'ит весь heys_products через UPSERT БЕЗ tombstone-diff. Это тот же
-- класс «тихое удаление продуктов», который снёс 366→28 продуктов в инциденте
-- 2026-05-11 (cloud cleanup destruction; см. apps/web/BUGS_HISTORY.md
-- «Orphan-баннер + cleanup hardening (2026-05-24)»).
--
-- Audit (24 мая 2026): grep по apps/ не нашёл ни одного caller'а. Функция была
-- только в whitelist heys-api-rpc/index.js — удалена в том же коммите. Если
-- понадобится массовый импорт shared→personal — есть scripts/db/safe-wipe-
-- products.sh (F16) с tombstone-trail и API HEYS.products.addFromShared
-- для интерактивного добавления.
--
-- Apply:
--   bash scripts/db/psql.sh -f database/2026-05-24_drop_sync_shared_products_by_session.sql

DROP FUNCTION IF EXISTS public.sync_shared_products_by_session(TEXT);

-- Проверка: функция должна отсутствовать
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.proname = 'sync_shared_products_by_session'
    ) THEN '❌ Функция всё ещё существует — DROP не прошёл'
    ELSE '✅ Функция удалена'
  END AS status;
