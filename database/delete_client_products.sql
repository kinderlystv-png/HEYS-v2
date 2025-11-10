-- Удаление продуктов для клиента 73a55ec7-2b48-47de-8308-06d7bec4259a
-- Дата: 2025-11-10

-- 1. ПРОВЕРКА: Посмотреть текущие продукты клиента
SELECT 
  c.name AS client_name,
  ckv.k AS key_name,
  jsonb_array_length(ckv.v) AS products_count,
  pg_size_pretty(pg_column_size(ckv.v)) AS data_size,
  ckv.updated_at
FROM clients c
JOIN client_kv_store ckv ON c.id = ckv.client_id
WHERE c.id = '73a55ec7-2b48-47de-8308-06d7bec4259a'
  AND ckv.k = 'heys_products';

-- 2. УДАЛЕНИЕ: Очистить продукты (установить пустой массив)
UPDATE client_kv_store
SET 
  v = '[]'::jsonb,
  updated_at = now()
WHERE client_id = '73a55ec7-2b48-47de-8308-06d7bec4259a'
  AND k = 'heys_products';

-- 3. ПРОВЕРКА: Убедиться что продукты удалены
SELECT 
  client_id,
  k AS key_name,
  jsonb_array_length(v) AS products_count,
  v AS products_data,
  updated_at
FROM client_kv_store
WHERE client_id = '73a55ec7-2b48-47de-8308-06d7bec4259a'
  AND k = 'heys_products';

-- Ожидаемый результат: products_count = 0, products_data = []
