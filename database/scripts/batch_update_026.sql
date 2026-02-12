-- ═══════════════════════════════════════════════════════════════
-- Batch #26: Enrichment с микронутриентами (5 продуктов)
-- Дата: 2026-02-12
-- Источник: USDA FoodData Central
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- 1️⃣ Куриное филе запечённое (Chicken breast, roasted — USDA FDC ID: 171477)
UPDATE shared_products SET
  cholesterol = 84,               -- mg/100g (белое мясо)
  iron = 0.9,                     -- mg
  magnesium = 29,                 -- mg
  zinc = 1.0,                     -- mg
  selenium = 30.6,                -- мкг (отлично!)
  calcium = 15,                   -- mg
  phosphorus = 228,               -- mg (отлично!)
  potassium = 256,                -- mg
  iodine = NULL,                  -- нет данных
  vitamin_a = 8.0,                -- мкг RAE
  vitamin_b1 = 0.07,              -- мг
  vitamin_b2 = 0.12,              -- мг
  vitamin_b3 = 13.7,              -- мг (ОЧЕНЬ МНОГО!)
  vitamin_b6 = 0.60,              -- мг (отлично!)
  vitamin_b9 = 4.0,               -- мкг
  vitamin_b12 = 0.34,             -- мкг (мясо)
  vitamin_c = 0,                  -- мг (нет)
  vitamin_d = 0.2,                -- мкг
  vitamin_e = 0.27,               -- мг
  vitamin_k = 0.4,                -- мкг
  omega3_100 = 0.04,              -- г (курица)
  omega6_100 = 0.5,               -- г (курица)
  is_fermented = false,           -- не ферментировано
  is_raw = false,                 -- запечённое
  is_organic = NULL,              -- зависит от источника
  is_whole_grain = false,         -- не злак
  nova_group = 1                  -- необработанный (только мясо)
WHERE id = 'a9f5e515-d01b-4fd8-af99-b9a561d1d1b6';

SELECT '✅ 1. Куриное филе' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = 'a9f5e515-d01b-4fd8-af99-b9a561d1d1b6' AND cholesterol IS NOT NULL
);

-- 2️⃣ Сырок творожный глазированный Б.Ю. Александров (Glazed curd cheese — аппроксимация)
UPDATE shared_products SET
  cholesterol = 35,               -- mg/100g (творог + масло какао)
  iron = 0.3,                     -- mg
  magnesium = 15,                 -- mg (творог)
  zinc = 0.6,                     -- mg (творог)
  selenium = 5.5,                 -- мкг
  calcium = 95,                   -- mg (творог!)
  phosphorus = 140,               -- mg (творог)
  potassium = 120,                -- mg
  iodine = NULL,                  -- нет данных
  vitamin_a = 42.0,               -- мкг RAE (молоко)
  vitamin_b1 = 0.05,              -- мг
  vitamin_b2 = 0.22,              -- мг (творог)
  vitamin_b3 = 0.3,               -- мг
  vitamin_b6 = 0.08,              -- мг
  vitamin_b9 = 12.0,              -- мкг
  vitamin_b12 = 0.7,              -- мкг (молочный!)
  vitamin_c = 0.5,                -- мг (следы)
  vitamin_d = 0.4,                -- мкг (обогащён)
  vitamin_e = 0.35,               -- мг
  vitamin_k = 2.5,                -- мкг
  omega3_100 = 0.02,              -- г (следы)
  omega6_100 = 0.15,              -- г (следы)
  is_fermented = true,            -- творог ферментирован
  is_raw = false,                 -- глазированный
  is_organic = NULL,              -- зависит от линейки
  is_whole_grain = false,         -- не злак
  nova_group = 4                  -- ультрапереработанный (сахар, глазурь)
WHERE id = '2b33cbe7-04d8-4d5b-9bd0-ff485f8b43da';

SELECT '✅ 2. Сырок глазированный' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '2b33cbe7-04d8-4d5b-9bd0-ff485f8b43da' AND cholesterol IS NOT NULL
);

-- 3️⃣ Тефтели классические (Meatballs, beef — USDA FDC ID: 172851)
UPDATE shared_products SET
  cholesterol = 75,               -- mg/100g (говядина + яйца)
  iron = 2.2,                     -- mg (говядина!)
  magnesium = 22,                 -- mg
  zinc = 3.5,                     -- mg (отлично!)
  selenium = 18.0,                -- мкг
  calcium = 35,                   -- mg (хлеб в фарше)
  phosphorus = 150,               -- mg (мясо)
  potassium = 270,                -- mg
  iodine = NULL,                  -- нет данных
  vitamin_a = 12.0,               -- мкг RAE (яйца)
  vitamin_b1 = 0.08,              -- мг
  vitamin_b2 = 0.18,              -- мг
  vitamin_b3 = 4.5,               -- мг (мясо)
  vitamin_b6 = 0.25,              -- мг
  vitamin_b9 = 10.0,              -- мкг (мука обогащена)
  vitamin_b12 = 1.8,              -- мкг (говядина!)
  vitamin_c = 1.5,                -- мг (лук)
  vitamin_d = 0.3,                -- мкг (яйца)
  vitamin_e = 0.40,               -- мг
  vitamin_k = 1.2,                -- мкг
  omega3_100 = 0.06,              -- г (говядина)
  omega6_100 = 0.35,              -- г (говядина)
  is_fermented = false,           -- не ферментировано
  is_raw = false,                 -- приготовленное
  is_organic = NULL,              -- зависит от ингредиентов
  is_whole_grain = false,         -- белый хлеб обычно
  nova_group = 3                  -- переработанный (фарш + хлеб + специи)
WHERE id = '7a9af9b4-ea8d-45f0-8e04-e47ce5707f11';

SELECT '✅ 3. Тефтели классические' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '7a9af9b4-ea8d-45f0-8e04-e47ce5707f11' AND cholesterol IS NOT NULL
);

-- 4️⃣ Окрошка с курицей на кефире (Cold soup with chicken — аппроксимация)
UPDATE shared_products SET
  cholesterol = 20,               -- mg/100g (курица + яйца)
  iron = 0.8,                     -- mg (курица + овощи)
  magnesium = 20,                 -- mg (огурец, кефир)
  zinc = 0.7,                     -- mg (курица)
  selenium = 6.0,                 -- мкг (курица)
  calcium = 65,                   -- mg (кефир!)
  phosphorus = 75,                -- mg (кефир + курица)
  potassium = 190,                -- mg (огурец, редис)
  iodine = NULL,                  -- нет данных
  vitamin_a = 30.0,               -- мкг RAE (яйца, укроп)
  vitamin_b1 = 0.06,              -- мг
  vitamin_b2 = 0.14,              -- мг (кефир)
  vitamin_b3 = 2.0,               -- мг (курица)
  vitamin_b6 = 0.12,              -- мг
  vitamin_b9 = 15.0,              -- мкг (зелень)
  vitamin_b12 = 0.35,             -- мкг (кефир + курица)
  vitamin_c = 9.0,                -- мг (огурец, зелень)
  vitamin_d = 0.25,               -- мкг (яйца + курица)
  vitamin_e = 0.6,                -- мг
  vitamin_k = 18.0,               -- мкг (зелень!)
  omega3_100 = 0.03,              -- г (следы)
  omega6_100 = 0.25,              -- г (курица)
  is_fermented = true,            -- кефир ферментирован
  is_raw = false,                 -- смешанное блюдо
  is_organic = NULL,              -- зависит от ингредиентов
  is_whole_grain = false,         -- не злак
  nova_group = 3                  -- переработанный (домашнее блюдо)
WHERE id = '28790fea-ce5d-4033-84c8-df726ae54f92';

SELECT '✅ 4. Окрошка с курицей' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '28790fea-ce5d-4033-84c8-df726ae54f92' AND cholesterol IS NOT NULL
);

-- 5️⃣ Брускетта из вяленых томатов и оливок (Bruschetta — аппроксимация)
UPDATE shared_products SET
  cholesterol = 0,                -- mg/100g (растительные ингредиенты)
  iron = 1.2,                     -- mg (томаты + хлеб)
  magnesium = 28,                 -- mg (цельнозерновой хлеб)
  zinc = 0.6,                     -- mg (хлеб)
  selenium = 8.5,                 -- мкг (хлеб)
  calcium = 45,                   -- mg (хлеб)
  phosphorus = 88,                -- mg (хлеб)
  potassium = 320,                -- mg (томаты + оливки!)
  iodine = NULL,                  -- нет данных
  vitamin_a = 35.0,               -- мкг RAE (томаты)
  vitamin_b1 = 0.12,              -- мг (хлеб)
  vitamin_b2 = 0.08,              -- мг
  vitamin_b3 = 1.5,               -- мг (хлеб)
  vitamin_b6 = 0.10,              -- мг
  vitamin_b9 = 22.0,              -- мкг (хлеб обогащён)
  vitamin_b12 = 0,                -- мкг (растительный)
  vitamin_c = 12.0,               -- мг (томаты!)
  vitamin_d = 0,                  -- мкг (растительный)
  vitamin_e = 1.8,                -- мг (оливки + масло!)
  vitamin_k = 8.0,                -- мкг (базилик)
  omega3_100 = 0.08,              -- г (оливковое масло)
  omega6_100 = 1.2,               -- г (оливковое масло)
  is_fermented = false,           -- не ферментировано (томаты вяленые ≠ ферментированные)
  is_raw = false,                 -- хлеб запечён, томаты вяленые
  is_organic = NULL,              -- зависит от ингредиентов
  is_whole_grain = NULL,          -- зависит от хлеба
  nova_group = 3                  -- переработанный (вяленые томаты + масло)
WHERE id = '394d18d7-175f-4bd8-b509-3cfb99bf78a4';

SELECT '✅ 5. Брускетта' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '394d18d7-175f-4bd8-b509-3cfb99bf78a4' AND cholesterol IS NOT NULL
);

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- Статистика покрытия после batch #26
-- ═══════════════════════════════════════════════════════════════
SELECT 
  count(*) FILTER (WHERE cholesterol IS NOT NULL) AS enriched,
  count(*) AS total,
  round(100.0 * count(*) FILTER (WHERE cholesterol IS NOT NULL) / count(*), 1) AS coverage_pct
FROM shared_products;
