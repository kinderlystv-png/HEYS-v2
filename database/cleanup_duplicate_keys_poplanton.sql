-- Cleanup duplicate keys for Poplanton (ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a)
-- Problem: Both old and new format keys exist, causing sync issues
-- Run this in Supabase SQL Editor

-- 1. First, check what duplicate keys exist
SELECT k, 
       LENGTH(v::text) as value_size,
       updated_at
FROM client_kv_store 
WHERE client_id = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a'
  AND (
    -- Old format keys (with embedded client_id)
    k LIKE 'heys_ccfe6ea3%'
    OR
    -- New format keys that might conflict
    k IN ('heys_products', 'heys_dayv2_date', 'heys_grams_history', 'heys_game')
  )
ORDER BY k;

-- 2. Check products specifically - which has more data?
SELECT k, 
       jsonb_array_length(v) as product_count,
       updated_at
FROM client_kv_store 
WHERE client_id = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a'
  AND (k = 'heys_products' OR k LIKE 'heys_ccfe6ea3%products%')
ORDER BY updated_at DESC;

-- 3. DELETE all duplicate keys (both old and new format for products/game/grams_history/dayv2_date)
-- This will force a fresh sync from localStorage
DELETE FROM client_kv_store 
WHERE client_id = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a'
  AND (
    -- All old format keys
    k LIKE 'heys_ccfe6ea3%'
    OR
    -- Specific new format keys that have duplicates
    k IN ('heys_products', 'heys_dayv2_date', 'heys_grams_history', 'heys_game')
  );

-- 4. Verify cleanup - should return 0 rows for these patterns
SELECT k, updated_at
FROM client_kv_store 
WHERE client_id = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a'
  AND (k LIKE 'heys_ccfe6ea3%' OR k = 'heys_products')
ORDER BY k;

-- 5. Show remaining keys (should be clean dayv2 dates only)
SELECT k, 
       CASE 
         WHEN k LIKE '%dayv2%' THEN 'day'
         WHEN k LIKE '%products%' THEN 'products'
         ELSE 'other'
       END as type,
       updated_at
FROM client_kv_store 
WHERE client_id = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a'
ORDER BY k;
