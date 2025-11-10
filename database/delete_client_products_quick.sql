-- БЫСТРОЕ УДАЛЕНИЕ продуктов клиента 73a55ec7-2b48-47de-8308-06d7bec4259a
-- Скопируйте и вставьте в Supabase SQL Editor

-- Удалить все продукты (установить пустой массив)
UPDATE client_kv_store
SET 
  v = '[]'::jsonb,
  updated_at = now()
WHERE client_id = '73a55ec7-2b48-47de-8308-06d7bec4259a'
  AND k = 'heys_products';

-- Проверка результата
SELECT 
  '✅ Products deleted!' AS status,
  jsonb_array_length(v) AS remaining_products
FROM client_kv_store
WHERE client_id = '73a55ec7-2b48-47de-8308-06d7bec4259a'
  AND k = 'heys_products';
