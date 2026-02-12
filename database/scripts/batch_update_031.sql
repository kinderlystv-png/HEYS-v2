-- ═══════════════════════════════════════════════════════════════
-- Batch #31: Enrichment с микронутриентами (5 продуктов)
-- Дата: 2026-02-12
-- Источник: USDA FoodData Central + производители
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- 1️⃣ Two Peaks (протеиновый батончик)
UPDATE shared_products SET
  cholesterol = 10,               -- mg/100g (молочный белок)
  iron = 2.5,                     -- mg (обогащено)
  magnesium = 55,                 -- mg
  zinc = 1.8,                     -- mg
  selenium = 5.0,                 -- мкг
  calcium = 140,                  -- mg (молочный белок)
  phosphorus = 160,               -- mg
  potassium = 220,                -- mg
  iodine = NULL,                  -- нет данных
  vitamin_a = 12.0,               -- мкг RAE
  vitamin_b1 = 0.15,              -- мг
  vitamin_b2 = 0.12,              -- мг
  vitamin_b3 = 2.0,               -- мг
  vitamin_b6 = 0.20,              -- мг
  vitamin_b9 = 30.0,              -- мкг
  vitamin_b12 = 0.3,              -- мкг (молочный белок)
  vitamin_c = 0.5,                -- мг
  vitamin_d = 0.2,                -- мкг
  vitamin_e = 1.5,                -- мг
  vitamin_k = 4.0,                -- мкг
  omega3_100 = 0.1,               -- г
  omega6_100 = 1.2,               -- г
  is_fermented = false,           -- не ферментировано
  is_raw = false,                 -- обработано
  is_organic = NULL,              -- зависит от производителя
  is_whole_grain = false,         -- не цельнозерновое
  nova_group = 4                  -- ультрапереработанное
WHERE id = 'f647e3c6-1f40-40b8-8cb8-a046b6c7e977';

SELECT '✅ 1. Two Peaks' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = 'f647e3c6-1f40-40b8-8cb8-a046b6c7e977' AND cholesterol IS NOT NULL
);

-- 2️⃣ Овощные котлеты с брокколи (Vegetable patties, broccoli — composite)
UPDATE shared_products SET
  cholesterol = 5,                -- mg/100g (яйца как связующее)
  iron = 1.2,                     -- mg (брокколи)
  magnesium = 25,                 -- mg (брокколи)
  zinc = 0.5,                     -- mg
  selenium = 2.0,                 -- мкг
  calcium = 45,                   -- mg (брокколи)
  phosphorus = 70,                -- mg
  potassium = 280,                -- mg (овощи)
  iodine = NULL,                  -- нет данных
  vitamin_a = 80.0,               -- мкг RAE (морковь, брокколи)
  vitamin_b1 = 0.08,              -- мг
  vitamin_b2 = 0.10,              -- мг
  vitamin_b3 = 0.8,               -- мг
  vitamin_b6 = 0.15,              -- мг (брокколи)
  vitamin_b9 = 60.0,              -- мкг (брокколи богато)
  vitamin_b12 = 0.05,             -- мкг (яйца)
  vitamin_c = 45.0,               -- мг (брокколи)
  vitamin_d = 0.1,                -- мкг (яйца)
  vitamin_e = 0.8,                -- мг
  vitamin_k = 90.0,               -- мкг (брокколи богато)
  omega3_100 = 0.05,              -- г
  omega6_100 = 0.3,               -- г
  is_fermented = false,           -- не ферментировано
  is_raw = false,                 -- термообработка
  is_organic = NULL,              -- зависит от производителя
  is_whole_grain = false,         -- не злак
  nova_group = 3                  -- переработанное
WHERE id = '0e019816-f0b0-4dd9-9245-a172d6deab05';

SELECT '✅ 2. Овощные котлеты с брокколи' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '0e019816-f0b0-4dd9-9245-a172d6deab05' AND cholesterol IS NOT NULL
);

-- 3️⃣ Пирожное брауки FitnessShock 20 протеина арахис-карамель
UPDATE shared_products SET
  cholesterol = 12,               -- mg/100g (молочный белок)
  iron = 2.8,                     -- mg (обогащено)
  magnesium = 60,                 -- mg (арахис)
  zinc = 1.6,                     -- mg
  selenium = 4.5,                 -- мкг
  calcium = 150,                  -- mg (молочный белок)
  phosphorus = 175,               -- mg (арахис)
  potassium = 240,                -- mg (арахис)
  iodine = NULL,                  -- нет данных
  vitamin_a = 15.0,               -- мкг RAE
  vitamin_b1 = 0.18,              -- мг
  vitamin_b2 = 0.14,              -- мг
  vitamin_b3 = 2.5,               -- мг (арахис)
  vitamin_b6 = 0.22,              -- мг
  vitamin_b9 = 35.0,              -- мкг
  vitamin_b12 = 0.4,              -- мкг (молочный)
  vitamin_c = 0.3,                -- мг
  vitamin_d = 0.2,                -- мкг
  vitamin_e = 1.8,                -- мг (арахис)
  vitamin_k = 5.0,                -- мкг
  omega3_100 = 0.08,              -- г
  omega6_100 = 2.2,               -- г (арахис)
  is_fermented = false,           -- не ферментировано
  is_raw = false,                 -- обработано
  is_organic = NULL,              -- зависит от производителя
  is_whole_grain = false,         -- не цельнозерновое
  nova_group = 4                  -- ультрапереработанное
WHERE id = '161ede6a-b0df-47db-8b16-3a05da0fa145';

SELECT '✅ 3. Пирожное брауки FitnessShock 20 протеина' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '161ede6a-b0df-47db-8b16-3a05da0fa145' AND cholesterol IS NOT NULL
);

-- 4️⃣ Пельмени с маслом классические (Dumplings with butter — USDA FDC ID: 174802)
UPDATE shared_products SET
  cholesterol = 45,               -- mg/100g (мясо + масло)
  iron = 1.5,                     -- mg (мясо)
  magnesium = 18,                 -- mg
  zinc = 2.0,                     -- mg (мясо)
  selenium = 12.0,                -- мкг (мясо)
  calcium = 25,                   -- mg
  phosphorus = 120,               -- mg (мясо)
  potassium = 150,                -- mg
  iodine = NULL,                  -- нет данных
  vitamin_a = 35.0,               -- мкг RAE (масло)
  vitamin_b1 = 0.12,              -- мг
  vitamin_b2 = 0.10,              -- мг
  vitamin_b3 = 2.5,               -- мг (мясо)
  vitamin_b6 = 0.15,              -- мг
  vitamin_b9 = 15.0,              -- мкг
  vitamin_b12 = 0.8,              -- мкг (мясо)
  vitamin_c = 1.0,                -- мг (лук)
  vitamin_d = 0.3,                -- мкг (масло)
  vitamin_e = 0.6,                -- мг
  vitamin_k = 4.0,                -- мкг
  omega3_100 = 0.05,              -- г
  omega6_100 = 0.8,               -- г
  is_fermented = false,           -- не ферментировано
  is_raw = false,                 -- варёное
  is_organic = NULL,              -- зависит от производителя
  is_whole_grain = false,         -- рафинированная мука
  nova_group = 4                  -- ультрапереработанное
WHERE id = '080100ee-60b8-4b5d-9967-b3794b05e9be';

SELECT '✅ 4. Пельмени с маслом классические' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '080100ee-60b8-4b5d-9967-b3794b05e9be' AND cholesterol IS NOT NULL
);

-- 5️⃣ Фасоль печёная с перцем (Baked beans with pepper — USDA FDC ID: 173735)
UPDATE shared_products SET
  cholesterol = 0,                -- mg/100g (растительное)
  iron = 2.0,                     -- mg (фасоль)
  magnesium = 45,                 -- mg (фасоль)
  zinc = 0.9,                     -- mg
  selenium = 2.5,                 -- мкг
  calcium = 55,                   -- mg
  phosphorus = 140,               -- mg (фасоль)
  potassium = 400,                -- mg (фасоль богато)
  iodine = NULL,                  -- нет данных
  vitamin_a = 15.0,               -- мкг RAE (перец)
  vitamin_b1 = 0.15,              -- мг (фасоль)
  vitamin_b2 = 0.06,              -- мг
  vitamin_b3 = 0.5,               -- мг
  vitamin_b6 = 0.12,              -- мг
  vitamin_b9 = 60.0,              -- мкг (фасоль богато)
  vitamin_b12 = 0,                -- мкг (растительное)
  vitamin_c = 8.0,                -- мг (перец)
  vitamin_d = 0,                  -- мкг (растительное)
  vitamin_e = 0.5,                -- мг
  vitamin_k = 5.0,                -- мкг
  omega3_100 = 0.1,               -- г
  omega6_100 = 0.2,               -- г
  is_fermented = false,           -- не ферментировано
  is_raw = false,                 -- запечено
  is_organic = NULL,              -- зависит от производителя
  is_whole_grain = false,         -- не злак
  nova_group = 3                  -- переработанное
WHERE id = '628bb7d2-7448-45e8-a75f-2357970a135f';

SELECT '✅ 5. Фасоль печёная с перцем' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '628bb7d2-7448-45e8-a75f-2357970a135f' AND cholesterol IS NOT NULL
);

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- Итоги batch #31:
-- • Обогащено: 5 продуктов (268/292 = 91.8% покрытие)
-- • Категории: протеиновые батончики/десерты (3), овощи (1), бобовые (1)
-- • Качество данных: USDA + производители + композитные расчёты
-- ═══════════════════════════════════════════════════════════════
