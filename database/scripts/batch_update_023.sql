-- ═══════════════════════════════════════════════════════════════
-- Batch #23: Enrichment с микронутриентами (5 продуктов)
-- Дата: 2026-02-12
-- Источник: USDA FoodData Central
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- 1️⃣ Миндаль жареный (Almonds, dry roasted — USDA FDC ID: 170567)
UPDATE shared_products SET
  cholesterol = 0,                -- mg/100g (растительный)
  iron = 3.72,                    -- mg (хорошо!)
  magnesium = 286,                -- mg (ОТЛИЧНО! 72% суточной нормы)
  zinc = 3.31,                    -- mg (хорошо)
  selenium = 2.5,                 -- мкг
  calcium = 264,                  -- mg (много!)
  phosphorus = 508,               -- mg (очень много!)
  potassium = 728,                -- mg (отлично!)
  iodine = NULL,                  -- нет данных
  vitamin_a = 1.0,                -- мкг RAE
  vitamin_b1 = 0.047,             -- мг
  vitamin_b2 = 1.014,             -- мг (МНОГО!)
  vitamin_b3 = 3.385,             -- мг
  vitamin_b6 = 0.143,             -- мг
  vitamin_b9 = 29.0,              -- мкг
  vitamin_b12 = 0,                -- мкг (растительный)
  vitamin_c = 0,                  -- мг (нет)
  vitamin_d = 0,                  -- мкг (растительный)
  vitamin_e = 26.22,              -- мг (РЕКОРД! 175% суточной нормы!)
  vitamin_k = 0,                  -- мкг (нет)
  omega3_100 = 0.003,             -- г (минимум)
  omega6_100 = 12.32,             -- г (много!)
  is_fermented = false,           -- не ферментирован
  is_raw = false,                 -- жареный
  is_organic = NULL,              -- зависит от бренда
  is_whole_grain = false,         -- не злак
  nova_group = 2                  -- обработанный (обжарка)
WHERE id = 'a6d498e0-9f9e-44af-a6b1-4c2adf583645';

SELECT '✅ 1. Миндаль жареный' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = 'a6d498e0-9f9e-44af-a6b1-4c2adf583645' AND cholesterol IS NOT NULL
);

-- 2️⃣ Макароны «паутина» отварные (Pasta, cooked — USDA FDC ID: 169757)
UPDATE shared_products SET
  cholesterol = 0,                -- mg/100g (растительный)
  iron = 0.5,                     -- mg (немного)
  magnesium = 18,                 -- mg
  zinc = 0.51,                    -- mg
  selenium = 26.4,                -- мкг (обогащена мука!)
  calcium = 7,                    -- mg
  phosphorus = 58,                -- mg
  potassium = 44,                 -- mg
  iodine = NULL,                  -- нет данных
  vitamin_a = 0,                  -- мкг RAE
  vitamin_b1 = 0.020,             -- мг (обогащена)
  vitamin_b2 = 0.017,             -- мг
  vitamin_b3 = 0.400,             -- мг
  vitamin_b6 = 0.042,             -- мг
  vitamin_b9 = 7.0,               -- мкг
  vitamin_b12 = 0,                -- мкг (растительный)
  vitamin_c = 0,                  -- мг (нет)
  vitamin_d = 0,                  -- мкг (растительный)
  vitamin_e = 0.06,               -- мг
  vitamin_k = 0.1,                -- мкг
  omega3_100 = 0.004,             -- г (следы)
  omega6_100 = 0.08,              -- г (следы)
  is_fermented = false,           -- не ферментированы
  is_raw = false,                 -- отварные
  is_organic = NULL,              -- зависит от бренда
  is_whole_grain = false,         -- обычно белая мука
  nova_group = 1                  -- базовый продукт (без добавок)
WHERE id = '26aaadc4-015c-4cd3-86ff-6f43ccc940d9';

SELECT '✅ 2. Макароны отварные' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '26aaadc4-015c-4cd3-86ff-6f43ccc940d9' AND cholesterol IS NOT NULL
);

-- 3️⃣ Грудка копчёная Орион (Smoked chicken breast — аппроксимация)
UPDATE shared_products SET
  cholesterol = 70,               -- mg/100g (курица)
  iron = 0.8,                     -- mg
  magnesium = 28,                 -- mg
  zinc = 1.1,                     -- mg (курица)
  selenium = 24.0,                -- мкг (отлично!)
  calcium = 10,                   -- mg
  phosphorus = 220,               -- mg (мясо!)
  potassium = 360,                -- mg
  iodine = NULL,                  -- нет данных
  vitamin_a = 5.0,                -- мкг RAE
  vitamin_b1 = 0.08,              -- мг
  vitamin_b2 = 0.12,              -- мг
  vitamin_b3 = 10.5,              -- мг (много!)
  vitamin_b6 = 0.50,              -- мг
  vitamin_b9 = 4.0,               -- мкг
  vitamin_b12 = 0.35,             -- мкг (мясо)
  vitamin_c = 0,                  -- мг (нет)
  vitamin_d = 0.1,                -- мкг
  vitamin_e = 0.20,               -- мг
  vitamin_k = 0.3,                -- мкг
  omega3_100 = 0.04,              -- г (курица)
  omega6_100 = 0.6,               -- г (курица)
  is_fermented = false,           -- копчёное
  is_raw = false,                 -- готовое к употреблению
  is_organic = NULL,              -- зависит от линейки
  is_whole_grain = false,         -- не злак
  nova_group = 3                  -- переработанный (копчение, соль)
WHERE id = 'eff27aaa-7bde-490a-978c-8419cc09f939';

SELECT '✅ 3. Грудка копчёная' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = 'eff27aaa-7bde-490a-978c-8419cc09f939' AND cholesterol IS NOT NULL
);

-- 4️⃣ Окрошка с колбасой на кефире (Mixed cold soup — аппроксимация)
UPDATE shared_products SET
  cholesterol = 15,               -- mg/100g (колбаса + яйца)
  iron = 0.7,                     -- mg (овощи + колбаса)
  magnesium = 18,                 -- mg (огурец, кефир)
  zinc = 0.6,                     -- mg (колбаса)
  selenium = 4.0,                 -- мкг
  calcium = 60,                   -- mg (кефир!)
  phosphorus = 70,                -- mg (кефир + колбаса)
  potassium = 180,                -- mg (огурец, редис)
  iodine = NULL,                  -- нет данных
  vitamin_a = 25.0,               -- мкг RAE (яйца, укроп)
  vitamin_b1 = 0.05,              -- мг
  vitamin_b2 = 0.12,              -- мг (кефир)
  vitamin_b3 = 0.8,               -- мг
  vitamin_b6 = 0.10,              -- мг
  vitamin_b9 = 12.0,              -- мкг (зелень)
  vitamin_b12 = 0.3,              -- мкг (кефир + колбаса)
  vitamin_c = 8.0,                -- мг (огурец, зелень)
  vitamin_d = 0.2,                -- мкг (яйца)
  vitamin_e = 0.5,                -- мг
  vitamin_k = 15.0,               -- мкг (зелень!)
  omega3_100 = 0.02,              -- г (следы)
  omega6_100 = 0.3,               -- г (колбаса)
  is_fermented = true,            -- кефир ферментирован
  is_raw = false,                 -- смешанное блюдо
  is_organic = NULL,              -- зависит от ингредиентов
  is_whole_grain = false,         -- не злак
  nova_group = 3                  -- переработанный (колбаса NOVA 4, но блюдо = 3)
WHERE id = '748c1b74-7efe-48e6-a61b-bdd48c507abc';

SELECT '✅ 4. Окрошка на кефире' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '748c1b74-7efe-48e6-a61b-bdd48c507abc' AND cholesterol IS NOT NULL
);

-- 5️⃣ Гранола EXTRASI шоколад и карамель (Granola with chocolate — аппроксимация)
UPDATE shared_products SET
  cholesterol = 5,                -- mg/100g (молоко в шоколаде)
  iron = 2.8,                     -- mg (обогащена + какао)
  magnesium = 95,                 -- mg (овёс + какао)
  zinc = 2.0,                     -- mg (овёс)
  selenium = 12.0,                -- мкг
  calcium = 55,                   -- mg (молоко)
  phosphorus = 280,               -- mg (овёс)
  potassium = 320,                -- mg (овёс)
  iodine = NULL,                  -- нет данных
  vitamin_a = 8.0,                -- мкг RAE
  vitamin_b1 = 0.35,              -- мг (обогащена!)
  vitamin_b2 = 0.15,              -- мг
  vitamin_b3 = 1.8,               -- мг
  vitamin_b6 = 0.12,              -- мг
  vitamin_b9 = 28.0,              -- мкг (овёс)
  vitamin_b12 = 0.2,              -- мкг (обогащена)
  vitamin_c = 0.5,                -- мг (следы)
  vitamin_d = 0.3,                -- мкг (обогащена)
  vitamin_e = 2.5,                -- мг (орехи)
  vitamin_k = 2.0,                -- мкг
  omega3_100 = 0.15,              -- г (овёс)
  omega6_100 = 2.8,               -- г (орехи, масло)
  is_fermented = false,           -- не ферментирована
  is_raw = false,                 -- запечённая
  is_organic = NULL,              -- зависит от линейки
  is_whole_grain = true,          -- цельнозерновой овёс!
  nova_group = 4                  -- ультрапереработанная (сахар, масло)
WHERE id = '436eb6b5-f783-45c0-96f4-ae11fb016315';

SELECT '✅ 5. Гранола EXTRASI' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '436eb6b5-f783-45c0-96f4-ae11fb016315' AND cholesterol IS NOT NULL
);

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- Статистика покрытия после batch #23
-- ═══════════════════════════════════════════════════════════════
SELECT 
  count(*) FILTER (WHERE cholesterol IS NOT NULL) AS enriched,
  count(*) AS total,
  round(100.0 * count(*) FILTER (WHERE cholesterol IS NOT NULL) / count(*), 1) AS coverage_pct
FROM shared_products;
