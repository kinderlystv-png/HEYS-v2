-- audit-products.sql — compare overlay vs legacy product counts across clients.
-- Helps spot stale legacy mirrors that may pollute React state during boot.
--
-- After Phase 3 retirement, only `heys_products_overlay_v2` should remain.
--
-- Usage:
--   ./scripts/db/psql.sh -f scripts/db/audit-products.sql

SELECT
  substring(client_id::text, 1, 8) AS cid8,
  max(CASE WHEN k = 'heys_products_overlay_v2' AND jsonb_typeof(v) = 'array' THEN jsonb_array_length(v) END) AS overlay_len,
  max(CASE WHEN k = 'heys_products' AND jsonb_typeof(v) = 'array'            THEN jsonb_array_length(v) END) AS legacy_arr_len,
  max(CASE WHEN k = 'heys_products' AND jsonb_typeof(v) = 'string'           THEN length(v::text) END)       AS legacy_compressed_bytes,
  max(CASE WHEN k = 'heys_hidden_products' AND jsonb_typeof(v) = 'array'     THEN jsonb_array_length(v) END) AS hidden_len,
  to_char(max(updated_at), 'YYYY-MM-DD') AS last_any_update
FROM client_kv_store
WHERE k IN ('heys_products', 'heys_products_overlay_v2', 'heys_hidden_products')
GROUP BY client_id
ORDER BY max(updated_at) DESC;
