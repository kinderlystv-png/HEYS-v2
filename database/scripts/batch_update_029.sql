-- ═══════════════════════════════════════════════════════════════
-- Batch #29: Enrichment с микронутриентами (5 продуктов)
-- Дата: 2026-02-12
-- Источник: USDA FoodData Central
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- 1️⃣ Кролик тушёный в сметане (Rabbit stewed in sour cream — USDA FDC ID: 172875 + сметана)
UPDATE shared_products SET
  cholesterol = 85,               -- mg/100g (кролик + сметана)
  iron = 2.5,                     -- mg (ОТЛИЧНО! Кролик богат железом!)
  magnesium = 25,                 -- mg
  zinc = 2.4,                     -- mg (хорошо!)
  selenium = 38.0,                -- мкг (ОТЛИЧНО! Кролик!)
  calcium = 45,                   -- mg (сметана)
  phosphorus = 240,               -- mg (ОТЛИЧНО! Диетическое мясо!)
  potassium = 330,                -- mg (отлично!)
  iodine = NULL,                  -- нет данных
  vitamin_a = 50.0,               -- мкг RAE (сметана)
  vitamin_b1 = 0.08,              -- мг
  vitamin_b2 = 0.18,              -- мг
  vitamin_b3 = 6.8,               -- мг (кролик)
  vitamin_b6 = 0.42,              -- мг
  vitamin_b9 = 8.0,               -- мкг
  vitamin_b12 = 7.1,              -- мкг (РЕКОРД! Кролик богат B12!)
  vitamin_c = 0.5,                -- мг (следы)
  vitamin_d = 0.4,                -- мкг (сметана)
  vitamin_e = 0.50,               -- мг
  vitamin_k = 1.2,                -- мкг
  omega3_100 = 0.15,              -- г (кролик богаче чем курица)
  omega6_100 = 0.55,              -- г (низко! Диетическое мясо)
  is_fermented = true,            -- сметана ферментирована
  is_raw = false,                 -- тушёное
  is_organic = NULL,              -- зависит от источника
  is_whole_grain = false,         -- не злак
  nova_group = 3                  -- переработанный (тушёное с соусом)
WHERE id = 'e1a42653-2dee-4deb-ac6f-cc7501ea7ba3';

SELECT '✅ 1. Кролик в сметане' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = 'e1a42653-2dee-4deb-ac6f-cc7501ea7ba3' AND cholesterol IS NOT NULL
);

-- 2️⃣ Котлеты из чечевицы без муки (Lentil patties — USDA FDC ID: 172420 аппроксимация)
UPDATE shared_products SET
  cholesterol = 0,                -- mg/100g (растительный)
  iron = 3.3,                     -- mg (ОТЛИЧНО! Чечевица богата железом!)
  magnesium = 36,                 -- mg (чечевица)
  zinc = 1.3,                     -- mg (чечевица)
  selenium = 2.8,                 -- мкг
  calcium = 35,                   -- mg
  phosphorus = 180,               -- mg (бобовые!)
  potassium = 370,                -- mg (ОТЛИЧНО! Чечевица!)
  iodine = NULL,                  -- нет данных
  vitamin_a = 8.0,                -- мкг RAE (морковь если есть)
  vitamin_b1 = 0.17,              -- мг (чечевица)
  vitamin_b2 = 0.07,              -- мг
  vitamin_b3 = 1.1,               -- мг
  vitamin_b6 = 0.18,              -- мг (чечевица)
  vitamin_b9 = 180.0,             -- мкг (РЕКОРД! Чечевица богатейший источник фолата!)
  vitamin_b12 = 0,                -- мкг (растительный)
  vitamin_c = 2.0,                -- мг (лук если есть)
  vitamin_d = 0,                  -- мкг (растительный)
  vitamin_e = 0.5,                -- мг
  vitamin_k = 5.0,                -- мкг
  omega3_100 = 0.08,              -- г (чечевица)
  omega6_100 = 0.18,              -- г (низко!)
  is_fermented = false,           -- не ферментировано
  is_raw = false,                 -- жареные котлеты
  is_organic = NULL,              -- зависит от ингредиентов
  is_whole_grain = false,         -- бобовые, не злак
  nova_group = 3                  -- переработанный (домашнее приготовление)
WHERE id = '0e90be0b-8049-4e1e-93b4-8cc4197d8f2c';

SELECT '✅ 2. Котлеты из чечевицы' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '0e90be0b-8049-4e1e-93b4-8cc4197d8f2c' AND cholesterol IS NOT NULL
);

-- 3️⃣ Печенье ПП из кураги и овсянки (Healthy cookies with apricots and oats — аппроксимация)
UPDATE shared_products SET
  cholesterol = 15,               -- mg/100g (яйца если есть)
  iron = 1.8,                     -- mg (овсянка + курага)
  magnesium = 45,                 -- mg (овсянка!)
  zinc = 1.2,                     -- mg (овсянка)
  selenium = 10.0,                -- мкг (овсянка)
  calcium = 35,                   -- mg
  phosphorus = 140,               -- mg (овсянка)
  potassium = 280,                -- mg (курага богата калием!)
  iodine = NULL,                  -- нет данных
  vitamin_a = 32.0,               -- мкг RAE (курага!)
  vitamin_b1 = 0.18,              -- мг (овсянка)
  vitamin_b2 = 0.08,              -- мг
  vitamin_b3 = 1.2,               -- мг
  vitamin_b6 = 0.10,              -- мг
  vitamin_b9 = 28.0,              -- мкг (овсянка)
  vitamin_b12 = 0,                -- мкг (растительное если без яиц)
  vitamin_c = 0.8,                -- мг (курага)
  vitamin_d = 0.1,                -- мкг (яйца если есть)
  vitamin_e = 0.8,                -- мг (овсянка)
  vitamin_k = 2.0,                -- мкг
  omega3_100 = 0.12,              -- г (овсянка)
  omega6_100 = 1.5,               -- г (овсянка)
  is_fermented = false,           -- не ферментировано
  is_raw = false,                 -- запечённое
  is_organic = NULL,              -- зависит от ингредиентов
  is_whole_grain = true,          -- цельнозерновая овсянка!
  nova_group = 3                  -- переработанный (домашнее, но с обработкой)
WHERE id = '02900471-3705-44c0-b366-25977f25279b';

SELECT '✅ 3. Печенье ПП курага' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '02900471-3705-44c0-b366-25977f25279b' AND cholesterol IS NOT NULL
);

-- 4️⃣ Запеканка картофельная с куриной грудкой, сметаной и сыром (Potato casserole — аппроксимация)
UPDATE shared_products SET
  cholesterol = 50,               -- mg/100g (курица + сыр + сметана)
  iron = 0.9,                     -- mg
  magnesium = 28,                 -- mg (картофель)
  zinc = 1.5,                     -- mg (курица + сыр)
  selenium = 18.0,                -- мкг (курица)
  calcium = 120,                  -- mg (сыр + сметана!)
  phosphorus = 170,               -- mg (курица + сыр)
  potassium = 380,                -- mg (ОТЛИЧНО! Картофель!)
  iodine = NULL,                  -- нет данных
  vitamin_a = 65.0,               -- мкг RAE (сметана + сыр)
  vitamin_b1 = 0.10,              -- мг (картофель)
  vitamin_b2 = 0.18,              -- мг (молочные продукты)
  vitamin_b3 = 4.5,               -- мг (курица)
  vitamin_b6 = 0.28,              -- мг (картофель!)
  vitamin_b9 = 18.0,              -- мкг
  vitamin_b12 = 0.6,              -- мкг (курица + молочное)
  vitamin_c = 8.0,                -- мг (картофель)
  vitamin_d = 0.3,                -- мкг (сметана + сыр)
  vitamin_e = 0.4,                -- мг
  vitamin_k = 2.5,                -- мкг
  omega3_100 = 0.04,              -- г (курица)
  omega6_100 = 0.6,               -- г (курица)
  is_fermented = true,            -- сметана + сыр ферментированы
  is_raw = false,                 -- запечённое
  is_organic = NULL,              -- зависит от ингредиентов
  is_whole_grain = false,         -- не злак
  nova_group = 3                  -- переработанный (домашнее сложное блюдо)
WHERE id = 'be1d42f7-56fc-45cf-898a-0022cfe4bdfa';

SELECT '✅ 4. Запеканка картофельная' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = 'be1d42f7-56fc-45cf-898a-0022cfe4bdfa' AND cholesterol IS NOT NULL
);

-- 5️⃣ Творожный продукт обезжиренный с вишней (Fat-free cottage cheese dessert — аппроксимация)
UPDATE shared_products SET
  cholesterol = 5,                -- mg/100g (обезжиренный!)
  iron = 0.2,                     -- mg (следы)
  magnesium = 12,                 -- mg (творог)
  zinc = 0.5,                     -- mg (творог)
  selenium = 6.0,                 -- мкг
  calcium = 110,                  -- mg (творог!)
  phosphorus = 150,               -- mg (творог)
  potassium = 140,                -- mg (творог + вишня)
  iodine = NULL,                  -- нет данных
  vitamin_a = 15.0,               -- мкг RAE (если обогащён)
  vitamin_b1 = 0.04,              -- мг
  vitamin_b2 = 0.20,              -- мг (творог!)
  vitamin_b3 = 0.2,               -- мг
  vitamin_b6 = 0.06,              -- мг
  vitamin_b9 = 10.0,              -- мкг
  vitamin_b12 = 0.5,              -- мкг (молочный)
  vitamin_c = 3.0,                -- мг (вишня)
  vitamin_d = 0.2,                -- мкг (обогащён)
  vitamin_e = 0.10,               -- мг
  vitamin_k = 1.5,                -- мкг (вишня)
  omega3_100 = 0.01,              -- г (следы)
  omega6_100 = 0.02,              -- г (следы)
  is_fermented = true,            -- творог ферментирован
  is_raw = false,                 -- готовый продукт
  is_organic = NULL,              -- зависит от бренда
  is_whole_grain = false,         -- не злак
  nova_group = 4                  -- ультрапереработанный (сахар + вкусовые добавки)
WHERE id = 'ac841ebb-c4d4-42b9-9bc5-5c4ee72415f0';

SELECT '✅ 5. Творожный десерт' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = 'ac841ebb-c4d4-42b9-9bc5-5c4ee72415f0' AND cholesterol IS NOT NULL
);

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- Статистика покрытия после batch #29
-- ═══════════════════════════════════════════════════════════════
SELECT 
  count(*) FILTER (WHERE cholesterol IS NOT NULL) AS enriched,
  count(*) AS total,
  round(100.0 * count(*) FILTER (WHERE cholesterol IS NOT NULL) / count(*), 1) AS coverage_pct
FROM shared_products;
