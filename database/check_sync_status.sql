-- Проверка состояния данных для клиента Poplanton
-- Выполни в Supabase SQL Editor

-- 1. Все ключи dayv2 для сегодня
SELECT 
  k,
  updated_at,
  jsonb_array_length(v->'meals') as meals_count,
  (
    SELECT string_agg(
      (m->>'time') || ': ' || jsonb_array_length(m->'items') || ' items',
      ' | '
    )
    FROM jsonb_array_elements(v->'meals') as m
  ) as meals_summary
FROM client_kv_store
WHERE client_id = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a'
  AND k LIKE '%dayv2_2025-12-11%'
ORDER BY updated_at DESC;

-- 2. Проверка: есть ли дублирующие ключи?
SELECT 
  k,
  CASE 
    WHEN k LIKE '%ccfe6ea3%ccfe6ea3%' THEN '❌ DOUBLE client_id'
    WHEN k LIKE 'heys_ccfe6ea3%' THEN '⚠️ OLD format (has client_id)'
    ELSE '✅ NEW format (normalized)'
  END as status,
  updated_at
FROM client_kv_store
WHERE client_id = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a'
  AND k LIKE '%dayv2%'
ORDER BY k;
