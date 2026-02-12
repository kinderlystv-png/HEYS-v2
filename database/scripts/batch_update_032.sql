-- ═══════════════════════════════════════════════════════════════
-- Batch #32: Enrichment с микронутриентами (5 продуктов)
-- Дата: 2026-02-12
-- Источник: USDA FoodData Central + производители
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- 1️⃣ Смесь "Настин Сластин" (усреднённо) — орехово-сухофруктовая смесь
UPDATE shared_products SET
  cholesterol = 0,                -- mg/100g (растительное)
  iron = 2.5,                     -- mg (сухофрукты)
  magnesium = 80,                 -- mg (орехи)
  zinc = 1.5,                     -- mg (орехи)
  selenium = 5.0,                 -- мкг
  calcium = 70,                   -- mg
  phosphorus = 180,               -- mg (орехи)
  potassium = 500,                -- mg (сухофрукты богато)
  iodine = NULL,                  -- нет данных
  vitamin_a = 20.0,               -- мкг RAE (курага)
  vitamin_b1 = 0.20,              -- мг (орехи)
  vitamin_b2 = 0.15,              -- мг
  vitamin_b3 = 1.5,               -- мг (орехи)
  vitamin_b6 = 0.25,              -- мг
  vitamin_b9 = 35.0,              -- мкг
  vitamin_b12 = 0,                -- мкг (растительное)
  vitamin_c = 2.0,                -- мг (сухофрукты)
  vitamin_d = 0,                  -- мкг (растительное)
  vitamin_e = 3.5,                -- мг (орехи богато)
  vitamin_k = 8.0,                -- мкг
  omega3_100 = 0.5,               -- г (орехи)
  omega6_100 = 3.5,               -- г (орехи)
  is_fermented = false,           -- не ферментировано
  is_raw = true,                  -- сырые орехи + сухофрукты
  is_organic = NULL,              -- зависит от производителя
  is_whole_grain = false,         -- не злак
  nova_group = 1                  -- минимально обработанное
WHERE id = '223c48f0-f857-44af-84ef-a18afc2bcc3f';

SELECT '✅ 1. Смесь "Настин Сластин"' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '223c48f0-f857-44af-84ef-a18afc2bcc3f' AND cholesterol IS NOT NULL
);

-- 2️⃣ Напиток «Шорле яблочный» (Apple spritzer — USDA FDC ID: 174683)
UPDATE shared_products SET
  cholesterol = 0,                -- mg/100g (растительное)
  iron = 0.1,                     -- mg (низкое)
  magnesium = 3,                  -- mg
  zinc = 0.05,                    -- mg
  selenium = 0.1,                 -- мкг
  calcium = 8,                    -- mg
  phosphorus = 10,                -- mg
  potassium = 80,                 -- mg (яблочный сок)
  iodine = NULL,                  -- нет данных
  vitamin_a = 0.5,                -- мкг RAE
  vitamin_b1 = 0.01,              -- мг
  vitamin_b2 = 0.01,              -- мг
  vitamin_b3 = 0.05,              -- мг
  vitamin_b6 = 0.02,              -- мг
  vitamin_b9 = 2.0,               -- мкг
  vitamin_b12 = 0,                -- мкг (растительное)
  vitamin_c = 1.5,                -- мг (яблочный сок)
  vitamin_d = 0,                  -- мкг (растительное)
  vitamin_e = 0.05,               -- мг
  vitamin_k = 0.5,                -- мкг
  omega3_100 = 0,                 -- г
  omega6_100 = 0,                 -- г
  is_fermented = false,           -- не ферментировано
  is_raw = false,                 -- пастеризовано
  is_organic = NULL,              -- зависит от производителя
  is_whole_grain = false,         -- не злак
  nova_group = 3                  -- переработанное (сок + газировка)
WHERE id = '7959d75f-52d5-4ee3-b4d6-4995f4b9733a';

SELECT '✅ 2. Напиток «Шорле яблочный»' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '7959d75f-52d5-4ee3-b4d6-4995f4b9733a' AND cholesterol IS NOT NULL
);

-- 3️⃣ Печенье финиковое с миндальной мукой и овсянкой
UPDATE shared_products SET
  cholesterol = 0,                -- mg/100g (растительное)
  iron = 1.8,                     -- mg (финики, миндаль)
  magnesium = 65,                 -- mg (миндаль богато)
  zinc = 1.2,                     -- mg (миндаль)
  selenium = 3.5,                 -- мкг
  calcium = 90,                   -- mg (миндаль)
  phosphorus = 160,               -- mg (миндаль)
  potassium = 350,                -- mg (финики богато)
  iodine = NULL,                  -- нет данных
  vitamin_a = 5.0,                -- мкг RAE
  vitamin_b1 = 0.12,              -- мг (овсянка)
  vitamin_b2 = 0.18,              -- мг (миндаль)
  vitamin_b3 = 1.0,               -- мг
  vitamin_b6 = 0.15,              -- мг
  vitamin_b9 = 20.0,              -- мкг
  vitamin_b12 = 0,                -- мкг (растительное)
  vitamin_c = 0.5,                -- мг (финики)
  vitamin_d = 0,                  -- мкг (растительное)
  vitamin_e = 4.0,                -- мг (миндаль богато)
  vitamin_k = 8.0,                -- мкг
  omega3_100 = 0.1,               -- г (овсянка)
  omega6_100 = 2.5,               -- г (миндаль)
  is_fermented = false,           -- не ферментировано
  is_raw = false,                 -- выпечка
  is_organic = NULL,              -- зависит от производителя
  is_whole_grain = true,          -- овсянка цельнозерновая
  nova_group = 3                  -- переработанное
WHERE id = 'bfd5fe6b-0f3b-4eb3-94ab-ee2be2e6770e';

SELECT '✅ 3. Печенье финиковое с миндальной мукой и овсянкой' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = 'bfd5fe6b-0f3b-4eb3-94ab-ee2be2e6770e' AND cholesterol IS NOT NULL
);

-- 4️⃣ Паска 1 (Easter bread — традиционная выпечка)
UPDATE shared_products SET
  cholesterol = 95,               -- mg/100g (яйца + масло)
  iron = 1.2,                     -- mg
  magnesium = 18,                 -- mg
  zinc = 0.8,                     -- mg (яйца)
  selenium = 8.0,                 -- мкг (яйца)
  calcium = 65,                   -- mg (молоко)
  phosphorus = 90,                -- mg
  potassium = 120,                -- mg
  iodine = NULL,                  -- нет данных
  vitamin_a = 85.0,               -- мкг RAE (яйца + масло)
  vitamin_b1 = 0.10,              -- мг
  vitamin_b2 = 0.18,              -- мг (яйца)
  vitamin_b3 = 0.8,               -- мг
  vitamin_b6 = 0.06,              -- мг
  vitamin_b9 = 25.0,              -- мкг
  vitamin_b12 = 0.5,              -- мкг (яйца)
  vitamin_c = 0.5,                -- мг (изюм)
  vitamin_d = 0.8,                -- мкг (яйца)
  vitamin_e = 1.2,                -- мг
  vitamin_k = 5.0,                -- мкг
  omega3_100 = 0.1,               -- г
  omega6_100 = 1.5,               -- г
  is_fermented = true,            -- дрожжевое тесто
  is_raw = false,                 -- выпечка
  is_organic = NULL,              -- зависит от производителя
  is_whole_grain = false,         -- рафинированная мука
  nova_group = 3                  -- переработанное
WHERE id = 'f1e98ce4-aae1-40c5-bb06-985c65f7eb95';

SELECT '✅ 4. Паска 1' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = 'f1e98ce4-aae1-40c5-bb06-985c65f7eb95' AND cholesterol IS NOT NULL
);

-- 5️⃣ Солёные палочки Lorenz Saltletts (Pretzel sticks — USDA FDC ID: 174987)
UPDATE shared_products SET
  cholesterol = 0,                -- mg/100g (растительное)
  iron = 1.5,                     -- mg (обогащено)
  magnesium = 20,                 -- mg
  zinc = 0.6,                     -- mg
  selenium = 8.0,                 -- мкг (пшеница)
  calcium = 25,                   -- mg
  phosphorus = 80,                -- mg
  potassium = 120,                -- mg
  iodine = NULL,                  -- нет данных
  vitamin_a = 0,                  -- мкг RAE
  vitamin_b1 = 0.15,              -- мг (обогащено)
  vitamin_b2 = 0.10,              -- мг
  vitamin_b3 = 1.5,               -- мг
  vitamin_b6 = 0.05,              -- мг
  vitamin_b9 = 25.0,              -- мкг (обогащено)
  vitamin_b12 = 0,                -- мкг (растительное)
  vitamin_c = 0,                  -- мг
  vitamin_d = 0,                  -- мкг (растительное)
  vitamin_e = 0.3,                -- мг
  vitamin_k = 2.0,                -- мкг
  omega3_100 = 0.05,              -- г
  omega6_100 = 0.8,               -- г
  is_fermented = false,           -- не ферментировано
  is_raw = false,                 -- выпечка
  is_organic = NULL,              -- зависит от производителя
  is_whole_grain = false,         -- рафинированная мука
  nova_group = 4                  -- ультрапереработанное
WHERE id = '26c8d820-3205-43b2-a628-73755644b5fc';

SELECT '✅ 5. Солёные палочки Lorenz Saltletts' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '26c8d820-3205-43b2-a628-73755644b5fc' AND cholesterol IS NOT NULL
);

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- Итоги batch #32:
-- • Обогащено: 5 продуктов (273/292 = 93.5% покрытие)
-- • Категории: снеки (2), напиток (1), выпечка (2)
-- • Качество данных: USDA + производители + традиционные рецепты
-- ═══════════════════════════════════════════════════════════════
