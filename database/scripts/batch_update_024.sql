-- ═══════════════════════════════════════════════════════════════
-- Batch #24: Enrichment с микронутриентами (5 продуктов)
-- Дата: 2026-02-12
-- Источник: USDA FoodData Central
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- 1️⃣ Манго сушёный без сахара (Mango, dried — USDA FDC ID: 168200)
UPDATE shared_products SET
  cholesterol = 0,                -- mg/100g (растительный)
  iron = 0.5,                     -- mg
  magnesium = 18,                 -- mg
  zinc = 0.08,                    -- mg
  selenium = 1.6,                 -- мкг
  calcium = 22,                   -- mg
  phosphorus = 42,                -- mg
  potassium = 341,                -- mg (хорошо!)
  iodine = NULL,                  -- нет данных
  vitamin_a = 38.0,               -- мкг RAE (бета-каротин!)
  vitamin_b1 = 0.008,             -- мг
  vitamin_b2 = 0.025,             -- мг
  vitamin_b3 = 0.500,             -- мг
  vitamin_b6 = 0.134,             -- мг
  vitamin_b9 = 11.0,              -- мкг
  vitamin_b12 = 0,                -- мкг (растительный)
  vitamin_c = 1.2,                -- мг (теряется при сушке)
  vitamin_d = 0,                  -- мкг (растительный)
  vitamin_e = 1.26,               -- мг
  vitamin_k = 3.6,                -- мкг
  omega3_100 = 0.05,              -- г (минимум)
  omega6_100 = 0.02,              -- г (минимум)
  is_fermented = false,           -- не ферментирован
  is_raw = false,                 -- сушёный
  is_organic = NULL,              -- зависит от бренда
  is_whole_grain = false,         -- не злак
  nova_group = 1                  -- необработанный (только сушка)
WHERE id = 'ab4acba0-b665-4281-8633-86b0cc3f3f0a';

SELECT '✅ 1. Манго сушёный' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = 'ab4acba0-b665-4281-8633-86b0cc3f3f0a' AND cholesterol IS NOT NULL
);

-- 2️⃣ Куриная голень на мангале без кожи (Chicken drumstick, grilled — USDA FDC ID: 171116)
UPDATE shared_products SET
  cholesterol = 93,               -- mg/100g (темное мясо выше чем грудка)
  iron = 1.2,                     -- mg
  magnesium = 24,                 -- mg
  zinc = 2.8,                     -- mg (хорошо!)
  selenium = 24.0,                -- мкг (отлично!)
  calcium = 14,                   -- mg
  phosphorus = 180,               -- mg
  potassium = 250,                -- mg
  iodine = NULL,                  -- нет данных
  vitamin_a = 18.0,               -- мкг RAE (темное мясо)
  vitamin_b1 = 0.09,              -- мг
  vitamin_b2 = 0.23,              -- мг
  vitamin_b3 = 6.2,               -- мг
  vitamin_b6 = 0.35,              -- мг
  vitamin_b9 = 6.0,               -- мкг
  vitamin_b12 = 0.4,              -- мкг (мясо)
  vitamin_c = 0,                  -- мг (нет)
  vitamin_d = 0.2,                -- мкг
  vitamin_e = 0.25,               -- мг
  vitamin_k = 2.8,                -- мкг
  omega3_100 = 0.08,              -- г (курица)
  omega6_100 = 1.8,               -- г (курица)
  is_fermented = false,           -- не ферментировано
  is_raw = false,                 -- приготовленное на гриле
  is_organic = NULL,              -- зависит от источника
  is_whole_grain = false,         -- не злак
  nova_group = 1                  -- необработанный (только мясо + гриль)
WHERE id = '41abd71d-f537-4b94-a670-76f7fc085b5f';

SELECT '✅ 2. Куриная голень гриль' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '41abd71d-f537-4b94-a670-76f7fc085b5f' AND cholesterol IS NOT NULL
);

-- 3️⃣ Оливье с колбасой без майонеза (Russian salad, low-fat — аппроксимация)
UPDATE shared_products SET
  cholesterol = 25,               -- mg/100g (яйца + колбаса)
  iron = 1.1,                     -- mg (яйца + горошек)
  magnesium = 22,                 -- mg (картофель)
  zinc = 0.8,                     -- mg (яйца + мясо)
  selenium = 8.0,                 -- мкг
  calcium = 25,                   -- mg (йогурт в заправке)
  phosphorus = 85,                -- mg (яйца + мясо)
  potassium = 280,                -- mg (картофель!)
  iodine = NULL,                  -- нет данных
  vitamin_a = 45.0,               -- мкг RAE (морковь + яйца)
  vitamin_b1 = 0.10,              -- мг (горошек)
  vitamin_b2 = 0.12,              -- мг (яйца)
  vitamin_b3 = 1.2,               -- мг
  vitamin_b6 = 0.20,              -- мг (картофель)
  vitamin_b9 = 18.0,              -- мкг (горошек)
  vitamin_b12 = 0.4,              -- мкг (яйца + колбаса)
  vitamin_c = 8.0,                -- мг (огурец маринованный)
  vitamin_d = 0.5,                -- мкг (яйца)
  vitamin_e = 0.8,                -- мг
  vitamin_k = 10.0,               -- мкг (горошек)
  omega3_100 = 0.03,              -- г (следы)
  omega6_100 = 0.5,               -- г (колбаса)
  is_fermented = false,           -- не ферментирован (огурцы маринованные ≠ ферментированные)
  is_raw = false,                 -- отварное + смешанное
  is_organic = NULL,              -- зависит от ингредиентов
  is_whole_grain = false,         -- не злак
  nova_group = 3                  -- переработанный (колбаса NOVA 4, но блюдо = 3)
WHERE id = 'fc3e71db-7715-4401-92b0-f903d02b94d5';

SELECT '✅ 3. Оливье без майонеза' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = 'fc3e71db-7715-4401-92b0-f903d02b94d5' AND cholesterol IS NOT NULL
);

-- 4️⃣ Бедро индейки запеченное без кожи (Turkey thigh, roasted — USDA FDC ID: 171485)
UPDATE shared_products SET
  cholesterol = 125,              -- mg/100g (темное мясо индейки выше чем курицы!)
  iron = 2.3,                     -- mg (темное мясо богато железом!)
  magnesium = 27,                 -- mg
  zinc = 4.3,                     -- mg (отлично!)
  selenium = 41.0,                -- мкг (РЕКОРД среди мяса!)
  calcium = 32,                   -- mg
  phosphorus = 230,               -- mg (отлично!)
  potassium = 290,                -- mg
  iodine = NULL,                  -- нет данных
  vitamin_a = 0,                  -- мкг RAE
  vitamin_b1 = 0.06,              -- мг
  vitamin_b2 = 0.25,              -- мг
  vitamin_b3 = 4.1,               -- мг
  vitamin_b6 = 0.38,              -- мг
  vitamin_b9 = 10.0,              -- мкг
  vitamin_b12 = 2.0,              -- мкг (отлично!)
  vitamin_c = 0,                  -- мг (нет)
  vitamin_d = 0.3,                -- мкг
  vitamin_e = 0.40,               -- мг
  vitamin_k = 1.0,                -- мкг
  omega3_100 = 0.08,              -- г (индейка)
  omega6_100 = 1.3,               -- г (индейка)
  is_fermented = false,           -- не ферментировано
  is_raw = false,                 -- запечённое
  is_organic = NULL,              -- зависит от источника
  is_whole_grain = false,         -- не злак
  nova_group = 1                  -- необработанный (только мясо)
WHERE id = '10bd82f5-1430-4c6a-ab13-c0062bb240f8';

SELECT '✅ 4. Бедро индейки' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '10bd82f5-1430-4c6a-ab13-c0062bb240f8' AND cholesterol IS NOT NULL
);

-- 5️⃣ Фасоль в томатном соусе (Beans in tomato sauce — USDA FDC ID: 175196)
UPDATE shared_products SET
  cholesterol = 0,                -- mg/100g (растительный)
  iron = 1.95,                    -- mg (бобовые!)
  magnesium = 38,                 -- mg (отлично!)
  zinc = 0.85,                    -- mg
  selenium = 3.2,                 -- мкг
  calcium = 48,                   -- mg
  phosphorus = 105,               -- mg (бобовые)
  potassium = 340,                -- mg (отлично!)
  iodine = NULL,                  -- нет данных
  vitamin_a = 8.0,                -- мкг RAE (томаты)
  vitamin_b1 = 0.08,              -- мг
  vitamin_b2 = 0.05,              -- мг
  vitamin_b3 = 0.5,               -- мг
  vitamin_b6 = 0.12,              -- мг
  vitamin_b9 = 38.0,              -- мкг (фасоль богата фолатом!)
  vitamin_b12 = 0,                -- мкг (растительный)
  vitamin_c = 2.8,                -- мг (томаты)
  vitamin_d = 0,                  -- мкг (растительный)
  vitamin_e = 0.35,               -- мг
  vitamin_k = 3.5,                -- мкг
  omega3_100 = 0.18,              -- г (бобовые)
  omega6_100 = 0.15,              -- г (бобовые)
  is_fermented = false,           -- не ферментирована
  is_raw = false,                 -- консервированная
  is_organic = NULL,              -- зависит от бренда
  is_whole_grain = false,         -- бобовые, не злак
  nova_group = 3                  -- переработанный (консервированный)
WHERE id = '0f858296-acc4-4a02-8b08-26da424c2faa';

SELECT '✅ 5. Фасоль в томате' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '0f858296-acc4-4a02-8b08-26da424c2faa' AND cholesterol IS NOT NULL
);

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- Статистика покрытия после batch #24
-- ═══════════════════════════════════════════════════════════════
SELECT 
  count(*) FILTER (WHERE cholesterol IS NOT NULL) AS enriched,
  count(*) AS total,
  round(100.0 * count(*) FILTER (WHERE cholesterol IS NOT NULL) / count(*), 1) AS coverage_pct
FROM shared_products;
