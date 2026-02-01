-- ✅ Grant write access for heys_rest to shared_products (REST upsert)
-- Date: 2026-01-31

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'heys_rest'
  ) THEN
    GRANT INSERT, UPDATE ON TABLE public.shared_products TO heys_rest;
    RAISE NOTICE '✅ GRANT INSERT, UPDATE ON shared_products TO heys_rest';
  ELSE
    RAISE NOTICE '⚠️ Role heys_rest not found, skipping';
  END IF;
END $$;
