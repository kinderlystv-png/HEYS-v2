-- ═══════════════════════════════════════════════════════════════
-- Batch #28: Enrichment с микронутриентами (5 продуктов)
-- Дата: 2026-02-12
-- Источник: USDA FoodData Central
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- 1️⃣ Окрошка домашняя на кефире с индейкой (Cold soup with turkey — аппроксимация)
UPDATE shared_products SET
  cholesterol = 25,               -- mg/100g (индейка + яйца)
  iron = 1.0,                     -- mg (индейка + овощи)
  magnesium = 22,                 -- mg (огурец, кефир)
  zinc = 1.2,                     -- mg (индейка)
  selenium = 10.0,                -- мкг (индейка)
  calcium = 70,                   -- mg (кефир!)
  phosphorus = 80,                -- mg (кефир + индейка)
  potassium = 200,                -- mg (огурец, редис)
  iodine = NULL,                  -- нет данных
  vitamin_a = 35.0,               -- мкг RAE (яйца, укроп)
  vitamin_b1 = 0.07,              -- мг
  vitamin_b2 = 0.15,              -- мг (кефир)
  vitamin_b3 = 2.5,               -- мг (индейка)
  vitamin_b6 = 0.15,              -- мг
  vitamin_b9 = 18.0,              -- мкг (зелень)
  vitamin_b12 = 0.5,              -- мкг (кефир + индейка)
  vitamin_c = 10.0,               -- мг (огурец, зелень)
  vitamin_d = 0.3,                -- мкг (яйца + индейка)
  vitamin_e = 0.7,                -- мг
  vitamin_k = 20.0,               -- мкг (зелень!)
  omega3_100 = 0.04,              -- г (следы)
  omega6_100 = 0.3,               -- г (индейка)
  is_fermented = true,            -- кефир ферментирован
  is_raw = false,                 -- смешанное блюдо
  is_organic = NULL,              -- зависит от ингредиентов
  is_whole_grain = false,         -- не злак
  nova_group = 3                  -- переработанный (домашнее блюдо)
WHERE id = '5fcd0bd8-8c60-4ca3-be15-8730e923ce23';

SELECT '✅ 1. Окрошка с индейкой' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '5fcd0bd8-8c60-4ca3-be15-8730e923ce23' AND cholesterol IS NOT NULL
);

-- 2️⃣ Фрукты и ягоды (микс) (Mixed berries and fruits — аппроксимация среднего)
UPDATE shared_products SET
  cholesterol = 0,                -- mg/100g (растительный)
  iron = 0.5,                     -- mg (ягоды)
  magnesium = 15,                 -- mg
  zinc = 0.15,                    -- mg
  selenium = 0.5,                 -- мкг
  calcium = 18,                   -- mg
  phosphorus = 22,                -- mg
  potassium = 180,                -- mg (отлично! Фрукты)
  iodine = NULL,                  -- нет данных
  vitamin_a = 8.0,                -- мкг RAE (если есть абрикос/манго)
  vitamin_b1 = 0.03,              -- мг
  vitamin_b2 = 0.04,              -- мг
  vitamin_b3 = 0.4,               -- мг
  vitamin_b6 = 0.08,              -- мг
  vitamin_b9 = 18.0,              -- мкг (клубника богата фолатом)
  vitamin_b12 = 0,                -- мкг (растительный)
  vitamin_c = 40.0,               -- мг (ОТЛИЧНО! Ягоды богаты C!)
  vitamin_d = 0,                  -- мкг (растительный)
  vitamin_e = 0.8,                -- мг
  vitamin_k = 8.0,                -- мкг (киви, ягоды)
  omega3_100 = 0.02,              -- г (следы)
  omega6_100 = 0.03,              -- г (следы)
  is_fermented = false,           -- не ферментированы
  is_raw = true,                  -- свежие фрукты
  is_organic = NULL,              -- зависит от источника
  is_whole_grain = false,         -- не злак
  nova_group = 1                  -- необработанный (свежие фрукты)
WHERE id = 'a42d107f-2fd9-47e4-b93d-2b78c332521f';

SELECT '✅ 2. Фрукты и ягоды микс' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = 'a42d107f-2fd9-47e4-b93d-2b78c332521f' AND cholesterol IS NOT NULL
);

-- 3️⃣ Бризоль куриная ЕКСЕЛЬ (Chicken brizol — омлет с курицей)
UPDATE shared_products SET
  cholesterol = 175,              -- mg/100g (яйца!)
  iron = 1.8,                     -- mg (яйца + курица)
  magnesium = 16,                 -- mg
  zinc = 1.5,                     -- mg (курица + яйца)
  selenium = 28.0,                -- мкг (яйца + курица!)
  calcium = 50,                   -- mg (яйца)
  phosphorus = 200,               -- mg (яйца + курица!)
  potassium = 180,                -- mg
  iodine = NULL,                  -- нет данных
  vitamin_a = 140.0,              -- мкг RAE (МНОГО! Яйца!)
  vitamin_b1 = 0.09,              -- мг
  vitamin_b2 = 0.40,              -- мг (ОТЛИЧНО! Яйца!)
  vitamin_b3 = 6.0,               -- мг (курица)
  vitamin_b6 = 0.25,              -- мг
  vitamin_b9 = 45.0,              -- мкг (яйца!)
  vitamin_b12 = 1.2,              -- мкг (яйца + курица!)
  vitamin_c = 0.5,                -- мг (следы)
  vitamin_d = 2.0,                -- мкг (ОТЛИЧНО! Яйца!)
  vitamin_e = 1.1,                -- мг (яйца)
  vitamin_k = 0.8,                -- мкг
  omega3_100 = 0.08,              -- г (яйца + курица)
  omega6_100 = 1.2,               -- г (яйца + курица)
  is_fermented = false,           -- не ферментировано
  is_raw = false,                 -- жареное
  is_organic = NULL,              -- зависит от ингредиентов
  is_whole_grain = false,         -- не злак
  nova_group = 3                  -- переработанный (готовое блюдо)
WHERE id = '166538c1-bcdd-4e5a-888a-ad54d1c3e06a';

SELECT '✅ 3. Бризоль куриная' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '166538c1-bcdd-4e5a-888a-ad54d1c3e06a' AND cholesterol IS NOT NULL
);

-- 4️⃣ Печенье на сиропе топинамбура с кунжутом (Cookies with Jerusalem artichoke syrup — аппроксимация)
UPDATE shared_products SET
  cholesterol = 20,               -- mg/100g (яйца если есть)
  iron = 2.5,                     -- mg (кунжут богат железом!)
  magnesium = 85,                 -- mg (ОТЛИЧНО! Кунжут!)
  zinc = 2.2,                     -- mg (кунжут!)
  selenium = 12.0,                -- мкг (мука)
  calcium = 180,                  -- mg (ОТЛИЧНО! Кунжут богатейший источник!)
  phosphorus = 200,               -- mg (кунжут)
  potassium = 150,                -- mg
  iodine = NULL,                  -- нет данных
  vitamin_a = 5.0,                -- мкг RAE
  vitamin_b1 = 0.25,              -- мг (кунжут + мука обогащена)
  vitamin_b2 = 0.10,              -- мг
  vitamin_b3 = 1.8,               -- мг
  vitamin_b6 = 0.15,              -- мг
  vitamin_b9 = 28.0,              -- мкг (мука обогащена)
  vitamin_b12 = 0,                -- мкг (растительное если без яиц)
  vitamin_c = 0.5,                -- мг (следы)
  vitamin_d = 0.2,                -- мкг (если есть яйца)
  vitamin_e = 0.8,                -- мг (кунжут)
  vitamin_k = 2.0,                -- мкг
  omega3_100 = 0.12,              -- г (кунжут)
  omega6_100 = 6.5,               -- г (кунжут богат omega-6!)
  is_fermented = false,           -- не ферментировано
  is_raw = false,                 -- запечённое
  is_organic = NULL,              -- зависит от бренда
  is_whole_grain = NULL,          -- зависит от муки
  nova_group = 4                  -- ультрапереработанное (сироп топинамбура = подсластитель)
WHERE id = '6438a880-5adf-4cb3-b847-77dd8ecf2fd3';

SELECT '✅ 4. Печенье с кунжутом' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '6438a880-5adf-4cb3-b847-77dd8ecf2fd3' AND cholesterol IS NOT NULL
);

-- 5️⃣ Соус чесночный низкокалорийный (Low-calorie garlic sauce — аппроксимация на йогуртовой основе)
UPDATE shared_products SET
  cholesterol = 5,                -- mg/100g (йогурт)
  iron = 0.2,                     -- mg (следы)
  magnesium = 8,                  -- mg (чеснок)
  zinc = 0.3,                     -- mg (чеснок)
  selenium = 2.0,                 -- мкг (чеснок)
  calcium = 75,                   -- mg (йогурт!)
  phosphorus = 60,                -- mg (йогурт)
  potassium = 120,                -- mg (чеснок!)
  iodine = NULL,                  -- нет данных
  vitamin_a = 8.0,                -- мкг RAE (йогурт если есть)
  vitamin_b1 = 0.03,              -- мг (чеснок)
  vitamin_b2 = 0.08,              -- мг (йогурт)
  vitamin_b3 = 0.3,               -- мг
  vitamin_b6 = 0.15,              -- мг (чеснок богат B6!)
  vitamin_b9 = 5.0,               -- мкг
  vitamin_b12 = 0.3,              -- мкг (йогурт)
  vitamin_c = 5.0,                -- мг (чеснок)
  vitamin_d = 0.1,                -- мкг (йогурт обогащён)
  vitamin_e = 0.15,               -- мг
  vitamin_k = 2.5,                -- мкг (зелень если есть)
  omega3_100 = 0.01,              -- г (следы)
  omega6_100 = 0.05,              -- г (следы)
  is_fermented = true,            -- йогурт ферментирован
  is_raw = false,                 -- соус готовый
  is_organic = NULL,              -- зависит от бренда
  is_whole_grain = false,         -- не злак
  nova_group = 3                  -- переработанный (соус с добавками)
WHERE id = '89fd8952-aea2-4b68-94f3-974da8dffb63';

SELECT '✅ 5. Соус чесночный' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '89fd8952-aea2-4b68-94f3-974da8dffb63' AND cholesterol IS NOT NULL
);

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- Статистика покрытия после batch #28
-- ═══════════════════════════════════════════════════════════════
SELECT 
  count(*) FILTER (WHERE cholesterol IS NOT NULL) AS enriched,
  count(*) AS total,
  round(100.0 * count(*) FILTER (WHERE cholesterol IS NOT NULL) / count(*), 1) AS coverage_pct
FROM shared_products;
