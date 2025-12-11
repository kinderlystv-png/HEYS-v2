-- ═══════════════════════════════════════════════════════════════
-- FIX PRODUCTS FINAL — Полное исправление базы продуктов
-- Дата: 2025-12-11
-- ═══════════════════════════════════════════════════════════════

-- 1. УДАЛЯЕМ записи с client_id в ключе (это баг, ключ должен быть чистым)
DELETE FROM client_kv_store
WHERE client_id = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a'
  AND k LIKE '%ccfe6ea3%';

-- 2. УДАЛЯЕМ heys_dayv2_date из client_kv_store (это глобальный ключ)
DELETE FROM client_kv_store
WHERE k = 'heys_dayv2_date';

-- 3. ПРОВЕРЯЕМ текущее состояние продуктов
SELECT 
  k,
  jsonb_array_length(v::jsonb) as count,
  LEFT(v::text, 100) as preview
FROM client_kv_store
WHERE client_id = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a'
  AND k = 'heys_products';

-- 4. Если продуктов < 200, выполни отдельно update_products.sql
-- (там уже есть 56 базовых продуктов)

-- 5. ПРОВЕРКА после очистки — какие ключи остались
SELECT k, jsonb_array_length(v::jsonb) as count
FROM client_kv_store
WHERE client_id = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a'
  AND jsonb_typeof(v::jsonb) = 'array'
ORDER BY k;
