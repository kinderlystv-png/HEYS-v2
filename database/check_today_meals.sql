-- Check today's meals for Poplanton
-- Run in Supabase SQL Editor

-- 1. Get today's day data with meals
SELECT 
  k,
  updated_at,
  jsonb_array_length(v->'meals') as meal_count,
  v->'meals' as meals
FROM client_kv_store 
WHERE client_id = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a'
  AND k = 'heys_dayv2_2025-12-11';

-- 2. Check each meal's items (look for "Майонез")
SELECT 
  meal_idx,
  meal->>'name' as meal_name,
  meal->>'time' as meal_time,
  jsonb_array_length(meal->'items') as item_count,
  meal->'items' as items
FROM client_kv_store,
     jsonb_array_elements(v->'meals') WITH ORDINALITY AS t(meal, meal_idx)
WHERE client_id = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a'
  AND k = 'heys_dayv2_2025-12-11';

-- 3. Search for "Майонез" specifically in items
SELECT 
  meal->>'name' as meal_name,
  item->>'name' as item_name,
  item->>'grams' as grams
FROM client_kv_store,
     jsonb_array_elements(v->'meals') AS meal,
     jsonb_array_elements(meal->'items') AS item
WHERE client_id = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a'
  AND k = 'heys_dayv2_2025-12-11'
  AND (item->>'name') ILIKE '%майонез%';
