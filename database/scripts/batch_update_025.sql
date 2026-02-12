-- ═══════════════════════════════════════════════════════════════
-- Batch #25: Enrichment с микронутриентами (5 продуктов)
-- Дата: 2026-02-12
-- Источник: USDA FoodData Central
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- 1️⃣ Семечки подсолнечные жареные (Sunflower seeds, dry roasted — USDA FDC ID: 170562)
UPDATE shared_products SET
  cholesterol = 0,                -- mg/100g (растительный)
  iron = 3.80,                    -- mg (отлично!)
  magnesium = 129,                -- mg (супер! 32% суточной нормы)
  zinc = 5.29,                    -- mg (рекорд!)
  selenium = 79.3,                -- мкг (РЕКОРД! 144% суточной нормы!)
  calcium = 70,                   -- mg
  phosphorus = 1158,              -- mg (НЕВЕРОЯТНО! 166% нормы!)
  potassium = 850,                -- mg (отлично!)
  iodine = NULL,                  -- нет данных
  vitamin_a = 1.0,                -- мкг RAE
  vitamin_b1 = 0.106,             -- мг
  vitamin_b2 = 0.251,             -- мг
  vitamin_b3 = 7.042,             -- мг (отлично!)
  vitamin_b6 = 0.805,             -- мг (много!)
  vitamin_b9 = 237.0,             -- мкг (РЕКОРД! Фолат!)
  vitamin_b12 = 0,                -- мкг (растительный)
  vitamin_c = 1.4,                -- мг
  vitamin_d = 0,                  -- мкг (растительный)
  vitamin_e = 26.10,              -- мг (РЕКОРД! 174% нормы!)
  vitamin_k = 0,                  -- мкг (нет)
  omega3_100 = 0.03,              -- г (следы)
  omega6_100 = 23.0,              -- г (ОЧЕНЬ МНОГО!)
  is_fermented = false,           -- не ферментированы
  is_raw = false,                 -- жареные
  is_organic = NULL,              -- зависит от бренда
  is_whole_grain = false,         -- не злак
  nova_group = 2                  -- обработанный (сухая обжарка)
WHERE id = 'e3a2393c-6bc1-40f5-a73e-4d6c650048e2';

SELECT '✅ 1. Семечки подсолнечные' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = 'e3a2393c-6bc1-40f5-a73e-4d6c650048e2' AND cholesterol IS NOT NULL
);

-- 2️⃣ Люля куриные на гриле (Chicken kebab, grilled — аппроксимация)
UPDATE shared_products SET
  cholesterol = 85,               -- mg/100g (курица + жир)
  iron = 1.1,                     -- mg
  magnesium = 26,                 -- mg
  zinc = 2.0,                     -- mg
  selenium = 22.0,                -- мкг (курица)
  calcium = 18,                   -- mg (специи)
  phosphorus = 190,               -- mg (мясо)
  potassium = 280,                -- mg
  iodine = NULL,                  -- нет данных
  vitamin_a = 15.0,               -- мкг RAE (специи)
  vitamin_b1 = 0.09,              -- мг
  vitamin_b2 = 0.15,              -- мг
  vitamin_b3 = 7.8,               -- мг (курица)
  vitamin_b6 = 0.42,              -- мг
  vitamin_b9 = 6.0,               -- мкг
  vitamin_b12 = 0.35,             -- мкг (мясо)
  vitamin_c = 2.0,                -- мг (лук)
  vitamin_d = 0.15,               -- мкг (курица)
  vitamin_e = 0.30,               -- мг
  vitamin_k = 1.5,                -- мкг (специи)
  omega3_100 = 0.06,              -- г (курица)
  omega6_100 = 1.2,               -- г (курица + жир)
  is_fermented = false,           -- не ферментировано
  is_raw = false,                 -- гриль
  is_organic = NULL,              -- зависит от источника
  is_whole_grain = false,         -- не злак
  nova_group = 3                  -- переработанный (фарш + специи)
WHERE id = '407be700-7f2c-4732-9346-21e8f0e2f501';

SELECT '✅ 2. Люля куриные' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '407be700-7f2c-4732-9346-21e8f0e2f501' AND cholesterol IS NOT NULL
);

-- 3️⃣ Урбеч из мякоти кокоса (Coconut butter, raw — USDA FDC ID: 170165)
UPDATE shared_products SET
  cholesterol = 0,                -- mg/100g (растительный)
  iron = 2.43,                    -- mg (хорошо!)
  magnesium = 32,                 -- mg
  zinc = 1.10,                    -- mg
  selenium = 10.1,                -- мкг
  calcium = 14,                   -- mg
  phosphorus = 113,               -- mg
  potassium = 356,                -- mg (отлично!)
  iodine = NULL,                  -- нет данных
  vitamin_a = 0,                  -- мкг RAE
  vitamin_b1 = 0.066,             -- мг
  vitamin_b2 = 0.020,             -- мг
  vitamin_b3 = 0.540,             -- мг
  vitamin_b6 = 0.054,             -- мг
  vitamin_b9 = 26.0,              -- мкг
  vitamin_b12 = 0,                -- мкг (растительный)
  vitamin_c = 3.3,                -- мг
  vitamin_d = 0,                  -- мкг (растительный)
  vitamin_e = 0.24,               -- мг
  vitamin_k = 0.2,                -- мкг
  omega3_100 = 0,                 -- г (нет)
  omega6_100 = 0.37,              -- г (минимум)
  is_fermented = false,           -- не ферментирован
  is_raw = true,                  -- сырой урбеч
  is_organic = NULL,              -- зависит от бренда
  is_whole_grain = false,         -- не злак
  nova_group = 1                  -- необработанный (100% кокос)
WHERE id = 'd6210a4b-6b16-4a17-99e1-6d6573906714';

SELECT '✅ 3. Урбеч кокосовый' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = 'd6210a4b-6b16-4a17-99e1-6d6573906714' AND cholesterol IS NOT NULL
);

-- 4️⃣ Хлебцы Dr.Korner кукурузно-рисовые с прованскими травами (Rice cakes — USDA FDC ID: 168878)
UPDATE shared_products SET
  cholesterol = 0,                -- mg/100g (растительный)
  iron = 0.8,                     -- mg
  magnesium = 23,                 -- mg
  zinc = 0.45,                    -- mg
  selenium = 5.8,                 -- мкг
  calcium = 3,                    -- mg
  phosphorus = 88,                -- mg
  potassium = 86,                 -- mg
  iodine = NULL,                  -- нет данных
  vitamin_a = 0,                  -- мкг RAE
  vitamin_b1 = 0.115,             -- мг (обогащены!)
  vitamin_b2 = 0.033,             -- мг
  vitamin_b3 = 1.700,             -- мг (обогащены)
  vitamin_b6 = 0.045,             -- мг
  vitamin_b9 = 3.0,               -- мкг
  vitamin_b12 = 0,                -- мкг (растительный)
  vitamin_c = 0,                  -- мг (нет)
  vitamin_d = 0,                  -- мкг (растительный)
  vitamin_e = 0.10,               -- мг
  vitamin_k = 0.6,                -- мкг
  omega3_100 = 0.01,              -- г (следы)
  omega6_100 = 0.15,              -- г (следы)
  is_fermented = false,           -- не ферментированы
  is_raw = false,                 -- воздушные/запечённые
  is_organic = NULL,              -- зависит от линейки
  is_whole_grain = false,         -- белый рис обычно
  nova_group = 3                  -- переработанный (специи, вкусоароматические добавки)
WHERE id = '61c31219-7b37-4ba0-adaf-851aa4d18ad4';

SELECT '✅ 4. Хлебцы Dr.Korner' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '61c31219-7b37-4ba0-adaf-851aa4d18ad4' AND cholesterol IS NOT NULL
);

-- 5️⃣ Кабачковые оладьи (Zucchini fritters — аппроксимация)
UPDATE shared_products SET
  cholesterol = 55,               -- mg/100g (яйца)
  iron = 0.9,                     -- mg (мука + яйца)
  magnesium = 18,                 -- mg (кабачок)
  zinc = 0.6,                     -- mg (яйца)
  selenium = 8.5,                 -- мкг (яйца)
  calcium = 35,                   -- mg (яйца)
  phosphorus = 95,                -- mg (яйца)
  potassium = 210,                -- mg (кабачок!)
  iodine = NULL,                  -- нет данных
  vitamin_a = 48.0,               -- мкг RAE (яйца + кабачок)
  vitamin_b1 = 0.08,              -- мг (мука)
  vitamin_b2 = 0.15,              -- мг (яйца)
  vitamin_b3 = 0.6,               -- мг
  vitamin_b6 = 0.12,              -- мг (кабачок)
  vitamin_b9 = 22.0,              -- мкг (мука обогащена)
  vitamin_b12 = 0.4,              -- мкг (яйца)
  vitamin_c = 10.0,               -- мг (кабачок!)
  vitamin_d = 0.6,                -- мкг (яйца)
  vitamin_e = 0.7,                -- мг (масло для жарки)
  vitamin_k = 5.0,                -- мкг (кабачок)
  omega3_100 = 0.08,              -- г (яйца)
  omega6_100 = 1.2,               -- г (масло для жарки)
  is_fermented = false,           -- не ферментировано
  is_raw = false,                 -- жареное
  is_organic = NULL,              -- зависит от ингредиентов
  is_whole_grain = false,         -- обычная мука
  nova_group = 3                  -- переработанный (домашнее приготовление)
WHERE id = '45438443-98c5-4a78-89d6-50b4cac93f77';

SELECT '✅ 5. Кабачковые оладьи' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '45438443-98c5-4a78-89d6-50b4cac93f77' AND cholesterol IS NOT NULL
);

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- Статистика покрытия после batch #25
-- ═══════════════════════════════════════════════════════════════
SELECT 
  count(*) FILTER (WHERE cholesterol IS NOT NULL) AS enriched,
  count(*) AS total,
  round(100.0 * count(*) FILTER (WHERE cholesterol IS NOT NULL) / count(*), 1) AS coverage_pct
FROM shared_products;
