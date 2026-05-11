-- audit-clients.sql — per-client storage statistics.
-- Shows total keys, size, and last update for every client_id that has data
-- in client_kv_store. Useful to spot orphan/inactive clients.
--
-- Usage:
--   ./scripts/db/psql.sh -f scripts/db/audit-clients.sql

SELECT
  client_id,
  count(*)                                       AS keys,
  pg_size_pretty(sum(length(v::text))::bigint)   AS total_size,
  to_char(max(updated_at), 'YYYY-MM-DD HH24:MI') AS last_update
FROM client_kv_store
GROUP BY client_id
ORDER BY max(updated_at) DESC;
