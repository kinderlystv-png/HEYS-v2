-- DEBUG: Проверка синхронизации данных poplanton за сегодня
-- Запускать в Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- ═══════════════════════════════════════════════════════════════════
-- 1. НАЙТИ КЛИЕНТА poplanton
-- ═══════════════════════════════════════════════════════════════════
SELECT 
  c.id AS client_id,
  c.name,
  c.curator_id,
  u.email AS curator_email
FROM clients c
LEFT JOIN auth.users u ON u.id = c.curator_id
WHERE c.name ILIKE '%poplanton%' 
   OR c.name ILIKE '%поплавск%'
   OR c.name ILIKE '%антон%'
   OR u.email ILIKE '%poplanton%';

-- ═══════════════════════════════════════════════════════════════════
-- 2. ВСЕ ДАННЫЕ КЛИЕНТА ЗА СЕГОДНЯ (heys_dayv2_2025-12-11)
-- Замени client_id на UUID из запроса выше!
-- ═══════════════════════════════════════════════════════════════════

-- Если знаешь client_id:
-- SELECT k, v, updated_at 
-- FROM client_kv_store 
-- WHERE client_id = '<вставь UUID>'
--   AND k LIKE 'heys_dayv2_2025-12-11%';

-- Или универсальный вариант (найдёт по имени клиента):
SELECT 
  ckv.k AS key,
  ckv.updated_at,
  -- Показываем калории из dayv2
  (ckv.v->>'dayTot')::int AS day_total_kcal,
  (ckv.v->>'normAbs')::int AS norm_abs_kcal,
  -- Сколько приёмов пищи
  jsonb_array_length(ckv.v->'meals') AS meals_count,
  -- Последний meal (для диагностики)
  ckv.v->'meals'->-1->>'id' AS last_meal_id,
  ckv.v->'meals'->-1->>'time' AS last_meal_time,
  -- Количество items в последнем приёме
  jsonb_array_length(ckv.v->'meals'->-1->'items') AS last_meal_items
FROM client_kv_store ckv
JOIN clients c ON c.id = ckv.client_id
WHERE (c.name ILIKE '%poplanton%' OR c.name ILIKE '%поплавск%')
  AND ckv.k LIKE 'heys_dayv2_2025-12-11%'
ORDER BY ckv.updated_at DESC;

-- ═══════════════════════════════════════════════════════════════════
-- 3. ПОСЛЕДНИЕ 5 ЗАПИСЕЙ КЛИЕНТА (любые ключи) — для проверки sync
-- ═══════════════════════════════════════════════════════════════════
SELECT 
  ckv.k AS key,
  ckv.updated_at,
  pg_size_pretty(length(ckv.v::text)::bigint) AS data_size
FROM client_kv_store ckv
JOIN clients c ON c.id = ckv.client_id
WHERE c.name ILIKE '%poplanton%' OR c.name ILIKE '%поплавск%'
ORDER BY ckv.updated_at DESC
LIMIT 10;

-- ═══════════════════════════════════════════════════════════════════
-- 4. ПОЛНЫЕ ДАННЫЕ ЗА СЕГОДНЯ (детали meals)
-- ═══════════════════════════════════════════════════════════════════
SELECT 
  ckv.v
FROM client_kv_store ckv
JOIN clients c ON c.id = ckv.client_id
WHERE (c.name ILIKE '%poplanton%' OR c.name ILIKE '%поплавск%')
  AND ckv.k LIKE 'heys_dayv2_2025-12-11%';

-- ═══════════════════════════════════════════════════════════════════
-- 5. СРАВНЕНИЕ: Вчера vs Сегодня (для понимания паттерна sync)
-- ═══════════════════════════════════════════════════════════════════
SELECT 
  ckv.k AS date_key,
  ckv.updated_at,
  (ckv.v->>'dayTot')::int AS total_kcal,
  jsonb_array_length(ckv.v->'meals') AS meals_count
FROM client_kv_store ckv
JOIN clients c ON c.id = ckv.client_id
WHERE (c.name ILIKE '%poplanton%' OR c.name ILIKE '%поплавск%')
  AND (ckv.k LIKE 'heys_dayv2_2025-12-10%' OR ckv.k LIKE 'heys_dayv2_2025-12-11%')
ORDER BY ckv.k;

-- ═══════════════════════════════════════════════════════════════════
-- 6. ПРОВЕРКА: Продукты клиента (если sync работает, должны быть свежие)
-- ═══════════════════════════════════════════════════════════════════
SELECT 
  c.id AS client_id,
  c.name AS client_name,
  ckv.updated_at,
  jsonb_array_length(ckv.v) AS products_count
FROM client_kv_store ckv
JOIN clients c ON c.id = ckv.client_id
WHERE (c.name ILIKE '%poplanton%' OR c.name ILIKE '%поплавск%' OR c.name ILIKE '%антон%')
  AND ckv.k = 'heys_products';

-- ═══════════════════════════════════════════════════════════════════
-- 7. ДЕТАЛИ: Какие клиенты найдены и их последние sync
-- ═══════════════════════════════════════════════════════════════════
SELECT 
  c.id AS client_id,
  c.name AS client_name,
  u.email AS curator_email,
  (SELECT MAX(ckv.updated_at) FROM client_kv_store ckv WHERE ckv.client_id = c.id) AS last_sync
FROM clients c
LEFT JOIN auth.users u ON u.id = c.curator_id
WHERE c.name ILIKE '%poplanton%' 
   OR c.name ILIKE '%поплавск%'
   OR c.name ILIKE '%антон%'
   OR u.email ILIKE '%poplanton%';

-- ═══════════════════════════════════════════════════════════════════
-- 8. ДАННЫЕ ЗА СЕГОДНЯ ДЛЯ КАЖДОГО КЛИЕНТА (с именем клиента)
-- ═══════════════════════════════════════════════════════════════════
SELECT 
  c.name AS client_name,
  ckv.k AS date_key,
  ckv.updated_at,
  jsonb_array_length(ckv.v->'meals') AS meals_count,
  -- Суммируем калории из items
  (
    SELECT COALESCE(SUM(
      (item->>'grams')::numeric * 
      COALESCE((item->>'kcal100')::numeric, 0) / 100
    ), 0)::int
    FROM jsonb_array_elements(ckv.v->'meals') AS meal,
         jsonb_array_elements(meal->'items') AS item
  ) AS total_kcal_calculated
FROM client_kv_store ckv
JOIN clients c ON c.id = ckv.client_id
WHERE (c.name ILIKE '%poplanton%' OR c.name ILIKE '%поплавск%' OR c.name ILIKE '%антон%')
  AND ckv.k LIKE 'heys_dayv2_2025-12-11%'
ORDER BY c.name, ckv.updated_at DESC;

-- ═══════════════════════════════════════════════════════════════════
-- 9. ТОЧНЫЙ АНАЛИЗ: Данные по конкретным client_id
-- ═══════════════════════════════════════════════════════════════════

-- Клиент "Poplanton" (на телефоне?) — ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a
SELECT 
  'Poplanton (ccfe6ea3)' AS who,
  ckv.k AS key,
  ckv.updated_at,
  CASE 
    WHEN ckv.k = 'heys_products' THEN jsonb_array_length(ckv.v)::text || ' products'
    WHEN ckv.k LIKE 'heys_dayv2_%' THEN jsonb_array_length(ckv.v->'meals')::text || ' meals'
    ELSE 'other'
  END AS info
FROM client_kv_store ckv
WHERE ckv.client_id = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a'
ORDER BY ckv.updated_at DESC
LIMIT 10;

-- Клиент "Поплавский Антон" (основной?) — 73a55ec7-2b48-47de-8308-06d7bec4259a
SELECT 
  'Поплавский Антон (73a55ec7)' AS who,
  ckv.k AS key,
  ckv.updated_at,
  CASE 
    WHEN ckv.k = 'heys_products' THEN jsonb_array_length(ckv.v)::text || ' products'
    WHEN ckv.k LIKE 'heys_dayv2_%' THEN jsonb_array_length(ckv.v->'meals')::text || ' meals'
    ELSE 'other'
  END AS info
FROM client_kv_store ckv
WHERE ckv.client_id = '73a55ec7-2b48-47de-8308-06d7bec4259a'
ORDER BY ckv.updated_at DESC
LIMIT 10;

-- ═══════════════════════════════════════════════════════════════════
-- 10. СРАВНЕНИЕ: Meals за сегодня для обоих клиентов
-- ═══════════════════════════════════════════════════════════════════
SELECT 
  c.name AS client_name,
  c.id AS client_id,
  ckv.updated_at,
  jsonb_array_length(ckv.v->'meals') AS meals_count,
  -- Показываем время всех meals
  (
    SELECT string_agg(meal->>'time', ', ' ORDER BY meal->>'time')
    FROM jsonb_array_elements(ckv.v->'meals') AS meal
  ) AS meal_times
FROM client_kv_store ckv
JOIN clients c ON c.id = ckv.client_id
WHERE c.id IN (
  'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a',  -- Poplanton
  '73a55ec7-2b48-47de-8308-06d7bec4259a'   -- Поплавский Антон
)
AND ckv.k = 'heys_dayv2_2025-12-11';
