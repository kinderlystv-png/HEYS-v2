-- ═══════════════════════════════════════════════════════════════════════════════
-- ➕ ADD COLUMN: clients.created_at — для daily/weekly reports
-- ═══════════════════════════════════════════════════════════════════════════════
-- Дата: 2026-05-26
-- Контекст: heys-maintenance daily_report + weekly_report падали с
--   `column "createdat" does not exist` (pg-driver lowercase'ит идентификатор;
--   physical column отсутствует в таблице clients). Подтверждено:
--   SELECT column_name FROM information_schema.columns WHERE table_name='clients'
--     AND column_name LIKE '%creat%';
--   → 0 строк.
--
-- Подход: ADD COLUMN с `DEFAULT NOW()` — applied только при INSERT.
-- Existing rows получают NULL (Postgres не backfill'ит default для существующих
-- строк). Это **корректно** для отчёта: запрос
--   `WHERE created_at > now() - interval '24 hours'`
-- исключает NULL → existing клиенты не считаются «новыми». Новые после миграции
-- получат точный timestamp создания.
--
-- НЕ делаем backfill через `COALESCE(trial_starts_at, pin_updated_at, ...)`:
-- эти прокси могут быть позже реальной даты создания клиента → дадут
-- "ложно-новых" в отчёте за первые 24 часа. NULL безопаснее.
--
-- Apply:
--   bash scripts/db/psql.sh -f database/2026-05-26_clients_add_created_at.sql
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

COMMENT ON COLUMN public.clients.created_at IS
  'Created at (PG default NOW()). NULL for rows existed before 2026-05-26 migration. Used by heys-maintenance daily/weekly reports.';

-- Verification
DO $$
DECLARE
  v_total INTEGER;
  v_with_created_at INTEGER;
BEGIN
  SELECT count(*) INTO v_total FROM public.clients;
  SELECT count(*) INTO v_with_created_at FROM public.clients WHERE created_at IS NOT NULL;

  RAISE NOTICE 'clients: total=%, with created_at=% (new rows after this migration will auto-populate)',
    v_total, v_with_created_at;
END$$;

COMMIT;
