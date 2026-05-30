-- 2026-05-30: fix TZ quirk в audit_logs.created_at default
--
-- Was: timezone('utc', now()) — возвращает naive timestamp, при вставке
-- в TIMESTAMPTZ интерпретируется server TZ как локальное → stored UTC
-- off by server TZ offset (3h for MSK). Все existing rows displayed
-- 3 часа в прошлом vs реальное событие.
--
-- Fix: plain now() возвращает timestamptz с правильным TZ. Только новые
-- INSERTS get correct time; existing rows остаются с прежними значениями.
--
-- Rollback: ALTER TABLE public.audit_logs
--   ALTER COLUMN created_at SET DEFAULT timezone('utc'::text, now());

BEGIN;

ALTER TABLE public.audit_logs
  ALTER COLUMN created_at SET DEFAULT now();

COMMIT;

-- Verify after apply (информационно):
-- SELECT column_default FROM information_schema.columns
-- WHERE table_name='audit_logs' AND column_name='created_at';
-- Expected: 'now()'
