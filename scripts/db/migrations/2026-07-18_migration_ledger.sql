-- 2026-07-18: canonical migration ledger for post-cutover database changes.
-- Historical SQL is catalogued as a legacy baseline and is never replayed.
-- ROLLBACK: DROP TABLE public.heys_schema_migrations only after retiring the runner.

CREATE TABLE IF NOT EXISTS public.heys_schema_migrations (
  id text PRIMARY KEY,
  migration_order integer NOT NULL UNIQUE CHECK (migration_order > 0),
  path text NOT NULL UNIQUE,
  checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  description text NOT NULL DEFAULT '',
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by text NOT NULL DEFAULT current_user
);

COMMENT ON TABLE public.heys_schema_migrations IS
  'Canonical ledger for HEYS schema migrations created after the 2026-07-18 cutover.';
