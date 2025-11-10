-- Проверка клиента 73a55ec7-2b48-47de-8308-06d7bec4259a после удаления
-- Дата: 2025-11-10

-- 1. Найти имя клиента
SELECT 
  id,
  name
FROM clients
WHERE id = '73a55ec7-2b48-47de-8308-06d7bec4259a';

-- 2. Проверить продукты (должно быть 0)
SELECT 
  client_id,
  k AS key_name,
  jsonb_array_length(v) AS products_count,
  pg_size_pretty(pg_column_size(v)::bigint) AS data_size,
  updated_at
FROM client_kv_store
WHERE client_id = '73a55ec7-2b48-47de-8308-06d7bec4259a'
  AND k = 'heys_products';

-- 3. Все данные клиента
SELECT 
  k AS key_name,
  CASE 
    WHEN k = 'heys_products' THEN jsonb_array_length(v)::text || ' products'
    WHEN k LIKE '%_dayv2_%' THEN 'Day data (' || substring(k from '(\d{4}-\d{2}-\d{2})') || ')'
    WHEN k LIKE '%_profile' THEN 'Profile'
    WHEN k LIKE '%_norms' THEN 'Norms'
    WHEN k LIKE '%_hr_zones' THEN 'HR Zones'
    WHEN k = 'heys_client_current' THEN 'Current client ID'
    ELSE 'Other'
  END AS content_type,
  pg_size_pretty(pg_column_size(v)::bigint) AS size,
  updated_at
FROM client_kv_store
WHERE client_id = '73a55ec7-2b48-47de-8308-06d7bec4259a'
ORDER BY updated_at DESC;
