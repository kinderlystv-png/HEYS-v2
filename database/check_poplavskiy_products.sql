-- Проверка продуктов для клиента "Поплавский Антон"
-- Дата: 2025-11-10

-- 1. Найти ID клиента "Поплавский Антон"
SELECT 
  id,
  name
FROM clients
WHERE name ILIKE '%поплавск%' OR name ILIKE '%poplavsk%';

-- 2. Проверить продукты в client_kv_store (по известному ID)
SELECT 
  client_id,
  k AS key_name,
  jsonb_array_length(v) AS products_count,
  pg_size_pretty(pg_column_size(v)::bigint) AS data_size,
  updated_at
FROM client_kv_store
WHERE client_id = '30d49097-1af4-4873-9dfa-09c78fc12397'  -- ID Поплавского Антона
  AND k = 'heys_products';

-- 3. Показать первые 5 продуктов (для проверки содержимого)
SELECT 
  jsonb_array_elements(v)->>'name' AS product_name,
  jsonb_array_elements(v)->>'kcal100' AS kcal_per_100g
FROM client_kv_store
WHERE client_id = '30d49097-1af4-4873-9dfa-09c78fc12397'
  AND k = 'heys_products'
LIMIT 5;

-- 4. Полная статистика по всем данным клиента
SELECT 
  k AS key_name,
  CASE 
    WHEN jsonb_typeof(v) = 'array' THEN jsonb_array_length(v)::text
    WHEN jsonb_typeof(v) = 'object' THEN 'object'
    ELSE jsonb_typeof(v)
  END AS content_info,
  pg_size_pretty(pg_column_size(v)::bigint) AS size,
  updated_at
FROM client_kv_store
WHERE client_id = '30d49097-1af4-4873-9dfa-09c78fc12397'
ORDER BY updated_at DESC;

-- 5. Альтернативный поиск (если ID неизвестен, ищем через curator_id)
SELECT 
  c.id AS client_id,
  c.name AS client_name,
  ckv.k AS key_name,
  CASE 
    WHEN ckv.k = 'heys_products' THEN jsonb_array_length(ckv.v)
    ELSE NULL
  END AS products_count
FROM clients c
LEFT JOIN client_kv_store ckv ON c.id = ckv.client_id AND ckv.k = 'heys_products'
WHERE c.name ILIKE '%поплавск%'
   OR c.name ILIKE '%poplavsk%';
