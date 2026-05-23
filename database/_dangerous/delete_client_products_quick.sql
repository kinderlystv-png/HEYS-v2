-- ⚠️ DANGEROUS: WIPE без tombstone — см. database/_dangerous/README.md
-- БЫСТРОЕ УДАЛЕНИЕ продуктов клиента <CLIENT_ID> (замени плейсхолдер ниже)
-- Скопируйте и вставьте в Supabase SQL Editor

-- Удалить все продукты (установить пустой массив)
UPDATE client_kv_store
SET 
  v = '[]'::jsonb,
  updated_at = now()
WHERE client_id = '<CLIENT_ID>'
  AND k = 'heys_products';

-- Проверка результата
SELECT 
  '✅ Products deleted!' AS status,
  jsonb_array_length(v) AS remaining_products
FROM client_kv_store
WHERE client_id = '<CLIENT_ID>'
  AND k = 'heys_products';
