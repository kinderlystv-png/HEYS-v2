-- audit-orphans.sql — verify no orphan client_id data exists.
-- After 2026-05-11 migration added FK with CASCADE, this should always return 0.
-- If non-zero, something bypassed the FK (e.g. data migration with constraint
-- disabled) — investigate.
--
-- Usage:
--   ./scripts/db/psql.sh -f scripts/db/audit-orphans.sql

SELECT
  'client_kv_store' AS table_name,
  count(DISTINCT kv.client_id) AS orphan_clients,
  count(*)                     AS orphan_rows,
  pg_size_pretty(sum(length(kv.v::text))::bigint) AS orphan_size
FROM client_kv_store kv
LEFT JOIN clients c ON c.id = kv.client_id
WHERE c.id IS NULL;
