-- ⚠️ DANGEROUS: DELETE из client_kv_store без tombstone-trail.
-- См. database/_dangerous/README.md
-- ═══════════════════════════════════════════════════════════════
-- FIX PRODUCTS FINAL — Полное исправление базы продуктов
-- Дата создания: 2025-12-11 (перемещено в _dangerous: 2026-05-24, F15)
-- Замени <CLIENT_ID> и <CID_PREFIX> ниже на нужные значения.
-- ═══════════════════════════════════════════════════════════════

-- 1. УДАЛЯЕМ записи с client_id в ключе (это баг, ключ должен быть чистым)
DELETE FROM client_kv_store
WHERE client_id = '<CLIENT_ID>'
  AND k LIKE '%<CID_PREFIX>%';

-- 2. УДАЛЯЕМ heys_dayv2_date из client_kv_store (это глобальный ключ)
DELETE FROM client_kv_store
WHERE k = 'heys_dayv2_date';

-- 3. ПРОВЕРЯЕМ текущее состояние продуктов
SELECT 
  k,
  jsonb_array_length(v::jsonb) as count,
  LEFT(v::text, 100) as preview
FROM client_kv_store
WHERE client_id = '<CLIENT_ID>'
  AND k = 'heys_products';

-- 4. Если продуктов < 200, выполни отдельно update_products.sql
-- (там уже есть 56 базовых продуктов)

-- 5. ПРОВЕРКА после очистки — какие ключи остались
SELECT k, jsonb_array_length(v::jsonb) as count
FROM client_kv_store
WHERE client_id = '<CLIENT_ID>'
  AND jsonb_typeof(v::jsonb) = 'array'
ORDER BY k;
