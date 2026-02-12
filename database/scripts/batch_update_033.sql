-- ═══════════════════════════════════════════════════════════════
-- Batch #33: Enrichment с микронутриентами (5 продуктов)
-- Дата: 2026-02-12
-- Источник: USDA FoodData Central + производители
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- 1️⃣ Bakalář пиво (Beer, lager — USDA FDC ID: 174318)
UPDATE shared_products SET
  cholesterol = 0,                -- mg/100g (растительное)
  iron = 0.02,                    -- mg (низкое)
  magnesium = 6,                  -- mg (из ячменя)
  zinc = 0.01,                    -- mg
  selenium = 0.6,                 -- мкг
  calcium = 4,                    -- mg
  phosphorus = 14,                -- mg (ячмень)
  potassium = 27,                 -- mg
  iodine = NULL,                  -- нет данных
  vitamin_a = 0,                  -- мкг RAE
  vitamin_b1 = 0.005,             -- мг
  vitamin_b2 = 0.025,             -- мг
  vitamin_b3 = 0.513,             -- мг (ячмень)
  vitamin_b6 = 0.046,             -- мг
  vitamin_b9 = 6.0,               -- мкг
  vitamin_b12 = 0.02,             -- мкг (дрожжи)
  vitamin_c = 0,                  -- мг
  vitamin_d = 0,                  -- мкг
  vitamin_e = 0,                  -- мг
  vitamin_k = 0.4,                -- мкг
  omega3_100 = 0,                 -- г
  omega6_100 = 0,                 -- г
  is_fermented = true,            -- пиво — ферментированное
  is_raw = false,                 -- пастеризовано
  is_organic = NULL,              -- зависит от производителя
  is_whole_grain = false,         -- не злак напрямую
  nova_group = 4                  -- ультрапереработанное (алкоголь)
WHERE id = 'cb77557e-55c0-43c2-ae49-4484c3707214';

SELECT '✅ 1. Bakalář пиво' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = 'cb77557e-55c0-43c2-ae49-4484c3707214' AND cholesterol IS NOT NULL
);

-- 2️⃣ Шампиньоны на гриле (в майонезе) — Grilled mushrooms with mayonnaise
UPDATE shared_products SET
  cholesterol = 15,               -- mg/100g (майонез с яйцами)
  iron = 0.5,                     -- mg (грибы)
  magnesium = 12,                 -- mg (грибы)
  zinc = 0.6,                     -- mg (грибы)
  selenium = 9.0,                 -- мкг (грибы богато)
  calcium = 10,                   -- mg
  phosphorus = 110,               -- mg (грибы)
  potassium = 320,                -- mg (грибы)
  iodine = NULL,                  -- нет данных
  vitamin_a = 5.0,                -- мкг RAE (майонез)
  vitamin_b1 = 0.08,              -- мг (грибы)
  vitamin_b2 = 0.40,              -- мг (грибы богато)
  vitamin_b3 = 3.6,               -- мг (грибы богато)
  vitamin_b6 = 0.10,              -- мг
  vitamin_b9 = 18.0,              -- мкг (грибы)
  vitamin_b12 = 0.05,             -- мкг (майонез)
  vitamin_c = 2.0,                -- мг
  vitamin_d = 0.2,                -- мкг (грибы)
  vitamin_e = 1.2,                -- мг (майонез)
  vitamin_k = 5.0,                -- мкг
  omega3_100 = 0.05,              -- г
  omega6_100 = 2.5,               -- г (майонез)
  is_fermented = false,           -- не ферментировано
  is_raw = false,                 -- гриль
  is_organic = NULL,              -- зависит от производителя
  is_whole_grain = false,         -- не злак
  nova_group = 3                  -- переработанное
WHERE id = '34e2ab1d-7b73-4383-b56a-880ba026ae84';

SELECT '✅ 2. Шампиньоны на гриле (в майонезе)' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '34e2ab1d-7b73-4383-b56a-880ba026ae84' AND cholesterol IS NOT NULL
);

-- 3️⃣ Котлеты растительные со вкусом курицы Hi (Plant-based chicken patties)
UPDATE shared_products SET
  cholesterol = 0,                -- mg/100g (растительное)
  iron = 2.0,                     -- mg (обогащено)
  magnesium = 35,                 -- mg (соя/горох)
  zinc = 1.0,                     -- mg (обогащено)
  selenium = 5.0,                 -- мкг
  calcium = 80,                   -- mg (обогащено)
  phosphorus = 120,               -- mg (растительный белок)
  potassium = 250,                -- mg
  iodine = NULL,                  -- нет данных
  vitamin_a = 0,                  -- мкг RAE (немного)
  vitamin_b1 = 0.15,              -- мг (обогащено)
  vitamin_b2 = 0.12,              -- мг
  vitamin_b3 = 1.5,               -- мг
  vitamin_b6 = 0.18,              -- мг
  vitamin_b9 = 40.0,              -- мкг
  vitamin_b12 = 1.2,              -- мкг (обогащено B12)
  vitamin_c = 0.5,                -- мг
  vitamin_d = 0.8,                -- мкг (обогащено)
  vitamin_e = 0.8,                -- мг
  vitamin_k = 4.0,                -- мкг
  omega3_100 = 0.2,               -- г (льняное масло)
  omega6_100 = 1.0,               -- г
  is_fermented = false,           -- не ферментировано
  is_raw = false,                 -- обработано
  is_organic = NULL,              -- зависит от производителя
  is_whole_grain = false,         -- не цельнозерновое
  nova_group = 4                  -- ультрапереработанное
WHERE id = '294f3706-f0c5-4c0b-a4bd-51a8a4511d62';

SELECT '✅ 3. Котлеты растительные со вкусом курицы Hi' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '294f3706-f0c5-4c0b-a4bd-51a8a4511d62' AND cholesterol IS NOT NULL
);

-- 4️⃣ Soj Marshick Marshmallow 20 протеина солёная карамель
UPDATE shared_products SET
  cholesterol = 8,                -- mg/100g (молочный белок)
  iron = 2.2,                     -- mg (обогащено)
  magnesium = 50,                 -- mg
  zinc = 1.5,                     -- mg
  selenium = 4.5,                 -- мкг
  calcium = 130,                  -- mg (молочный белок)
  phosphorus = 145,               -- mg
  potassium = 200,                -- mg
  iodine = NULL,                  -- нет данных
  vitamin_a = 12.0,               -- мкг RAE
  vitamin_b1 = 0.14,              -- мг
  vitamin_b2 = 0.12,              -- мг
  vitamin_b3 = 2.0,               -- мг
  vitamin_b6 = 0.20,              -- мг
  vitamin_b9 = 28.0,              -- мкг
  vitamin_b12 = 0.3,              -- мкг (молочный)
  vitamin_c = 0.3,                -- мг
  vitamin_d = 0.2,                -- мкг
  vitamin_e = 1.0,                -- мг
  vitamin_k = 3.5,                -- мкг
  omega3_100 = 0.05,              -- г
  omega6_100 = 0.8,               -- г
  is_fermented = false,           -- не ферментировано
  is_raw = false,                 -- обработано
  is_organic = NULL,              -- зависит от производителя
  is_whole_grain = false,         -- не цельнозерновое
  nova_group = 4                  -- ультрапереработанное
WHERE id = '5b261f17-a815-4a9b-8197-8a964708b661';

SELECT '✅ 4. Soj Marshick Marshmallow 20 протеина' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '5b261f17-a815-4a9b-8197-8a964708b661' AND cholesterol IS NOT NULL
);

-- 5️⃣ Кузя кукурузные палочки сладкие (Sweet corn puffs — USDA FDC ID: 168918)
UPDATE shared_products SET
  cholesterol = 0,                -- mg/100g (растительное)
  iron = 0.8,                     -- mg (кукуруза)
  magnesium = 15,                 -- mg
  zinc = 0.4,                     -- mg
  selenium = 2.0,                 -- мкг
  calcium = 12,                   -- mg
  phosphorus = 40,                -- mg
  potassium = 60,                 -- mg
  iodine = NULL,                  -- нет данных
  vitamin_a = 5.0,                -- мкг RAE (кукуруза)
  vitamin_b1 = 0.08,              -- мг
  vitamin_b2 = 0.05,              -- мг
  vitamin_b3 = 0.6,               -- мг
  vitamin_b6 = 0.04,              -- мг
  vitamin_b9 = 10.0,              -- мкг
  vitamin_b12 = 0,                -- мкг (растительное)
  vitamin_c = 0.5,                -- мг
  vitamin_d = 0,                  -- мкг (растительное)
  vitamin_e = 0.5,                -- мг
  vitamin_k = 1.5,                -- мкг
  omega3_100 = 0,                 -- г
  omega6_100 = 0.5,               -- г
  is_fermented = false,           -- не ферментировано
  is_raw = false,                 -- экструдировано
  is_organic = NULL,              -- зависит от производителя
  is_whole_grain = false,         -- рафинированная кукуруза
  nova_group = 4                  -- ультрапереработанное
WHERE id = 'c95c29e6-c261-4fcd-affb-a4ff759d0f85';

SELECT '✅ 5. Кузя кукурузные палочки сладкие' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = 'c95c29e6-c261-4fcd-affb-a4ff759d0f85' AND cholesterol IS NOT NULL
);

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- Итоги batch #33:
-- • Обогащено: 5 продуктов (278/292 = 95.2% покрытие)
-- • Категории: напитки (1), грибы (1), растительное мясо (1), протеиновые снеки (2)
-- • Качество данных: USDA + производители
-- ═══════════════════════════════════════════════════════════════
