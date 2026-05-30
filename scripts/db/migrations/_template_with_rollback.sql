-- YYYY-MM-DD: <one-line summary>
--
-- Context: <why это нужно — что фиксит/добавляет>
-- Rollback: см. ===== ROLLBACK ===== в конце файла.
-- Apply: bash scripts/db/psql.sh -f scripts/db/migrations/YYYY-MM-DD_<name>.sql
-- Rollback: вручную скопировать ROLLBACK секцию (раскомментировать) → apply.

BEGIN;

-- ===== FORWARD =====
-- TODO: replace with actual migration SQL

COMMIT;


-- ===== ROLLBACK =====
-- BEGIN;
-- TODO: reverse statements (DROP what FORWARD added, restore prev state)
-- COMMIT;
