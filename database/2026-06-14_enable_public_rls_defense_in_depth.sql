-- SEC-017: enable RLS on all public ordinary tables as defense-in-depth.
--
-- Current Cloud Functions use PG_USER=heys_admin; table owners bypass RLS unless
-- FORCE ROW LEVEL SECURITY is set. This migration intentionally does NOT force
-- RLS, so the current server runtime remains compatible while non-owner direct
-- grants become fail-closed unless a table has explicit policies.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = false
    ORDER BY c.relname
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.schema_name, r.table_name);
    RAISE NOTICE 'RLS enabled on %.%', r.schema_name, r.table_name;
  END LOOP;
END$$;

COMMENT ON SCHEMA public IS
  'HEYS public schema; SEC-017 enables RLS on ordinary tables. Owner/runtime heys_admin bypasses unless FORCE is introduced later.';
