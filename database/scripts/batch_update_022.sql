-- ═══════════════════════════════════════════════════════════════
-- Batch #22: Enrichment с микронутриентами (5 продуктов)
-- Дата: 2026-02-12
-- Источник: USDA FoodData Central
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- 1️⃣ Огурец свежий (Cucumber, raw — USDA FDC ID: 168409)
UPDATE shared_products SET
  cholesterol = 0,                -- mg/100g
  iron = 0.28,                    -- mg (низкое, овощ)
  magnesium = 13,                 -- mg
  zinc = 0.20,                    -- mg
  selenium = 0.3,                 -- мкг
  calcium = 16,                   -- mg
  phosphorus = 24,                -- mg
  potassium = 147,                -- mg
  iodine = NULL,                  -- нет данных
  vitamin_a = 5.0,                -- мкг RAE (немного)
  vitamin_b1 = 0.027,             -- мг (тиамин)
  vitamin_b2 = 0.033,             -- мг (рибофлавин)
  vitamin_b3 = 0.098,             -- мг (ниацин)
  vitamin_b6 = 0.040,             -- мг
  vitamin_b9 = 7.0,               -- мкг (фолат)
  vitamin_b12 = 0,                -- мкг (растительный)
  vitamin_c = 2.8,                -- мг
  vitamin_d = 0,                  -- мкг (растительный)
  vitamin_e = 0.03,               -- мг
  vitamin_k = 16.4,               -- мкг
  omega3_100 = 0,                 -- г (следы)
  omega6_100 = 0,                 -- г (следы)
  is_fermented = false,           -- свежий
  is_raw = true,                  -- сырой овощ
  is_organic = NULL,              -- зависит от источника
  is_whole_grain = false,         -- не злак
  nova_group = 1                  -- необработанный
WHERE id = 'c259e9ef-bffc-4ec3-9e5c-e2eb72ae9eca';

SELECT '✅ 1. Огурец свежий' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = 'c259e9ef-bffc-4ec3-9e5c-e2eb72ae9eca' AND cholesterol IS NOT NULL
);

-- 2️⃣ Морс сладкий (Cranberry juice cocktail — USDA FDC ID: 174687)
UPDATE shared_products SET
  cholesterol = 0,                -- mg/100g (растительный)
  iron = 0.13,                    -- mg (обогащён)
  magnesium = 2,                  -- mg
  zinc = 0.08,                    -- mg
  selenium = 0.1,                 -- мкг
  calcium = 4,                    -- mg
  phosphorus = 2,                 -- mg
  potassium = 18,                 -- mg
  iodine = NULL,                  -- нет данных
  vitamin_a = 0,                  -- мкг RAE
  vitamin_b1 = 0.005,             -- мг
  vitamin_b2 = 0.008,             -- мг
  vitamin_b3 = 0.05,              -- мг
  vitamin_b6 = 0.015,             -- мг
  vitamin_b9 = 0,                 -- мкг (минимум)
  vitamin_b12 = 0,                -- мкг (растительный)
  vitamin_c = 38.0,               -- мг (обогащён!)
  vitamin_d = 0,                  -- мкг
  vitamin_e = 0.57,               -- мг
  vitamin_k = 2.6,                -- мкг
  omega3_100 = 0,                 -- г
  omega6_100 = 0.02,              -- г
  is_fermented = false,           -- не ферментирован
  is_raw = false,                 -- пастеризован
  is_organic = NULL,              -- зависит от бренда
  is_whole_grain = false,         -- не злак
  nova_group = 4                  -- ультрапереработанный (добавлен сахар)
WHERE id = '496334f3-bdd2-4a29-a61d-0602dac8131b';

SELECT '✅ 2. Морс сладкий' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '496334f3-bdd2-4a29-a61d-0602dac8131b' AND cholesterol IS NOT NULL
);

-- 3️⃣ Плов с курицей (Rice with chicken, mixed dish — аппроксимация)
UPDATE shared_products SET
  cholesterol = 35,               -- mg/100g (курица)
  iron = 1.2,                     -- mg (рис + курица)
  magnesium = 28,                 -- mg
  zinc = 1.5,                     -- mg (курица)
  selenium = 15.0,                -- мкг (курица)
  calcium = 20,                   -- mg
  phosphorus = 110,               -- mg (курица)
  potassium = 180,                -- mg
  iodine = NULL,                  -- нет данных
  vitamin_a = 12.0,               -- мкг RAE (морковь в плове)
  vitamin_b1 = 0.08,              -- мг
  vitamin_b2 = 0.09,              -- мг
  vitamin_b3 = 3.5,               -- мг (курица)
  vitamin_b6 = 0.25,              -- мг
  vitamin_b9 = 8.0,               -- мкг
  vitamin_b12 = 0.3,              -- мкг (курица)
  vitamin_c = 2.0,                -- мг (овощи)
  vitamin_d = 0.1,                -- мкг (курица)
  vitamin_e = 0.5,                -- мг
  vitamin_k = 3.5,                -- мкг
  omega3_100 = 0.05,              -- г (курица)
  omega6_100 = 0.9,               -- г (курица)
  is_fermented = false,           -- не ферментирован
  is_raw = false,                 -- приготовленное блюдо
  is_organic = NULL,              -- зависит от ингредиентов
  is_whole_grain = false,         -- белый рис обычно
  nova_group = 3                  -- переработанный (смешанное блюдо)
WHERE id = '849f2dcd-f78f-410e-8b2c-890b292a6ca8';

SELECT '✅ 3. Плов с курицей' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '849f2dcd-f78f-410e-8b2c-890b292a6ca8' AND cholesterol IS NOT NULL
);

-- 4️⃣ Краковская колбаса (Polish sausage, kielbasa — USDA FDC ID: 173870)
UPDATE shared_products SET
  cholesterol = 67,               -- mg/100g
  iron = 1.1,                     -- mg
  magnesium = 14,                 -- mg
  zinc = 2.0,                     -- mg (свинина)
  selenium = 18.5,                -- мкг
  calcium = 11,                   -- mg
  phosphorus = 140,               -- mg (мясо)
  potassium = 230,                -- mg
  iodine = NULL,                  -- нет данных
  vitamin_a = 0,                  -- мкг RAE (нет)
  vitamin_b1 = 0.45,              -- мг (обогащена)
  vitamin_b2 = 0.15,              -- мг
  vitamin_b3 = 3.2,               -- мг
  vitamin_b6 = 0.20,              -- мг
  vitamin_b9 = 2.0,               -- мкг
  vitamin_b12 = 1.5,              -- мкг (мясо)
  vitamin_c = 0,                  -- мг (нет)
  vitamin_d = 0.4,                -- мкг (мясо)
  vitamin_e = 0.15,               -- мг
  vitamin_k = 1.8,                -- мкг
  omega3_100 = 0.08,              -- г (свинина)
  omega6_100 = 2.1,               -- г (свинина)
  is_fermented = true,            -- копчёно-вареная
  is_raw = false,                 -- готова к употреблению
  is_organic = NULL,              -- зависит от бренда
  is_whole_grain = false,         -- не злак
  nova_group = 4                  -- ультрапереработанная (нитриты, консерванты)
WHERE id = '38d1d51d-5c0c-4a08-9543-13ccdd1e59d0';

SELECT '✅ 4. Краковская колбаса' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '38d1d51d-5c0c-4a08-9543-13ccdd1e59d0' AND cholesterol IS NOT NULL
);

-- 5️⃣ Киндер Сюрприз (Milk chocolate — USDA FDC ID: 170273)
UPDATE shared_products SET
  cholesterol = 23,               -- mg/100g (молоко)
  iron = 2.4,                     -- mg (обогащён какао)
  magnesium = 63,                 -- mg (какао!)
  zinc = 1.0,                     -- mg
  selenium = 4.5,                 -- мкг
  calcium = 189,                  -- mg (молоко!)
  phosphorus = 208,               -- mg
  potassium = 372,                -- mg (какао)
  iodine = NULL,                  -- нет данных
  vitamin_a = 51.0,               -- мкг RAE (молоко)
  vitamin_b1 = 0.09,              -- мг
  vitamin_b2 = 0.30,              -- мг (молоко)
  vitamin_b3 = 0.39,              -- мг
  vitamin_b6 = 0.04,              -- мг
  vitamin_b9 = 10.0,              -- мкг
  vitamin_b12 = 0.8,              -- мкг (молоко)
  vitamin_c = 0,                  -- мг (нет)
  vitamin_d = 0.3,                -- мкг (молоко)
  vitamin_e = 0.51,               -- мг
  vitamin_k = 5.7,                -- мкг
  omega3_100 = 0.04,              -- г
  omega6_100 = 0.6,               -- г
  is_fermented = false,           -- не ферментирован
  is_raw = false,                 -- обработан
  is_organic = NULL,              -- зависит от линейки
  is_whole_grain = false,         -- не злак
  nova_group = 4                  -- ультрапереработанный (сахар, эмульгаторы)
WHERE id = 'f52be98a-d14d-44ce-82c1-008c7ee8ee89';

SELECT '✅ 5. Киндер Сюрприз' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = 'f52be98a-d14d-44ce-82c1-008c7ee8ee89' AND cholesterol IS NOT NULL
);

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- Статистика покрытия после batch #22
-- ═══════════════════════════════════════════════════════════════
SELECT 
  count(*) FILTER (WHERE cholesterol IS NOT NULL) AS enriched,
  count(*) AS total,
  round(100.0 * count(*) FILTER (WHERE cholesterol IS NOT NULL) / count(*), 1) AS coverage_pct
FROM shared_products;
