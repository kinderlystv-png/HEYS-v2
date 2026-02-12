-- ═══════════════════════════════════════════════════════════════
-- Batch #27: Enrichment с микронутриентами (5 продуктов)
-- Дата: 2026-02-12
-- Источник: USDA FoodData Central
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- 1️⃣ Куриное филе тушёное в сливках 10% (Chicken in cream sauce — аппроксимация)
UPDATE shared_products SET
  cholesterol = 65,               -- mg/100g (курица + сливки)
  iron = 0.8,                     -- mg
  magnesium = 25,                 -- mg
  zinc = 1.2,                     -- mg (курица)
  selenium = 22.0,                -- мкг (курица)
  calcium = 55,                   -- mg (сливки!)
  phosphorus = 180,               -- mg (курица)
  potassium = 240,                -- mg
  iodine = NULL,                  -- нет данных
  vitamin_a = 45.0,               -- мкг RAE (сливки)
  vitamin_b1 = 0.07,              -- мг
  vitamin_b2 = 0.14,              -- мг (сливки)
  vitamin_b3 = 8.5,               -- мг (курица)
  vitamin_b6 = 0.38,              -- мг
  vitamin_b9 = 5.0,               -- мкг
  vitamin_b12 = 0.4,              -- мкг (мясо + сливки)
  vitamin_c = 1.0,                -- мг (следы)
  vitamin_d = 0.3,                -- мкг (сливки)
  vitamin_e = 0.35,               -- мг
  vitamin_k = 0.8,                -- мкг
  omega3_100 = 0.05,              -- г (курица)
  omega6_100 = 0.7,               -- г (курица + сливки)
  is_fermented = false,           -- не ферментировано
  is_raw = false,                 -- тушёное
  is_organic = NULL,              -- зависит от ингредиентов
  is_whole_grain = false,         -- не злак
  nova_group = 3                  -- переработанный (соус + готовка)
WHERE id = '349bcb48-fe12-4faa-a939-346b314a6f09';

SELECT '✅ 1. Курица в сливках' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '349bcb48-fe12-4faa-a939-346b314a6f09' AND cholesterol IS NOT NULL
);

-- 2️⃣ Смесь орехов с розовым перцем и фундуком (Mixed nuts with hazelnuts — USDA аппроксимация)
UPDATE shared_products SET
  cholesterol = 0,                -- mg/100g (растительные)
  iron = 3.5,                     -- mg (орехи!)
  magnesium = 180,                -- mg (ОТЛИЧНО! Фундук богат магнием)
  zinc = 3.0,                     -- mg (хорошо!)
  selenium = 8.0,                 -- мкг
  calcium = 120,                  -- mg (фундук)
  phosphorus = 380,               -- mg (орехи!)
  potassium = 650,                -- mg (отлично!)
  iodine = NULL,                  -- нет данных
  vitamin_a = 2.0,                -- мкг RAE
  vitamin_b1 = 0.45,              -- мг (орехи обогащены)
  vitamin_b2 = 0.18,              -- мг
  vitamin_b3 = 2.8,               -- мг
  vitamin_b6 = 0.35,              -- мг
  vitamin_b9 = 68.0,              -- мкг (фундук богат фолатом!)
  vitamin_b12 = 0,                -- мкг (растительные)
  vitamin_c = 3.0,                -- мг (розовый перец)
  vitamin_d = 0,                  -- мкг (растительные)
  vitamin_e = 15.0,               -- мг (ОТЛИЧНО! Фундук богат E!)
  vitamin_k = 14.2,               -- мкг (фундук)
  omega3_100 = 0.09,              -- г (грецкие орехи если есть)
  omega6_100 = 8.5,               -- г (орехи)
  is_fermented = false,           -- не ферментированы
  is_raw = false,                 -- обжаренные
  is_organic = NULL,              -- зависит от бренда
  is_whole_grain = false,         -- не злак
  nova_group = 3                  -- переработанный (специи + обжарка)
WHERE id = '8c40c23c-fefd-4a03-9bc9-abc60dfd6968';

SELECT '✅ 2. Орехи с перцем' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '8c40c23c-fefd-4a03-9bc9-abc60dfd6968' AND cholesterol IS NOT NULL
);

-- 3️⃣ Овощи на гриле ЕКСЕЛЬ (Grilled vegetables mix — аппроксимация)
UPDATE shared_products SET
  cholesterol = 0,                -- mg/100g (растительные)
  iron = 0.9,                     -- mg (овощи)
  magnesium = 22,                 -- mg (кабачок, баклажан)
  zinc = 0.3,                     -- mg
  selenium = 1.5,                 -- мкг
  calcium = 28,                   -- mg
  phosphorus = 45,                -- mg
  potassium = 280,                -- mg (отлично! Кабачок, перец)
  iodine = NULL,                  -- нет данных
  vitamin_a = 55.0,               -- мкг RAE (перец, морковь)
  vitamin_b1 = 0.08,              -- мг
  vitamin_b2 = 0.05,              -- мг
  vitamin_b3 = 0.7,               -- мг
  vitamin_b6 = 0.18,              -- мг (перец)
  vitamin_b9 = 18.0,              -- мкг (овощи)
  vitamin_b12 = 0,                -- мкг (растительные)
  vitamin_c = 45.0,               -- мг (ОТЛИЧНО! Перец богат C!)
  vitamin_d = 0,                  -- мкг (растительные)
  vitamin_e = 1.2,                -- мг (масло для гриля)
  vitamin_k = 12.0,               -- мкг (кабачок, брокколи если есть)
  omega3_100 = 0.05,              -- г (масло)
  omega6_100 = 0.8,               -- г (масло)
  is_fermented = false,           -- не ферментированы
  is_raw = false,                 -- гриль
  is_organic = NULL,              -- зависит от источника
  is_whole_grain = false,         -- не злак
  nova_group = 2                  -- обработанный (гриль + масло)
WHERE id = '1ce653e2-e78f-4491-ba22-c75ce9cddf96';

SELECT '✅ 3. Овощи на гриле' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '1ce653e2-e78f-4491-ba22-c75ce9cddf96' AND cholesterol IS NOT NULL
);

-- 4️⃣ Котлеты паровые (говядина 40%, индейка 40%, курица 20%) (Mixed meat patties — аппроксимация)
UPDATE shared_products SET
  cholesterol = 90,               -- mg/100g (смесь мяса)
  iron = 2.0,                     -- mg (говядина + индейка!)
  magnesium = 24,                 -- mg
  zinc = 3.8,                     -- mg (отлично! Говядина + индейка)
  selenium = 28.0,                -- мкг (отлично! Индейка)
  calcium = 25,                   -- mg (хлеб в фарше)
  phosphorus = 200,               -- mg (мясо!)
  potassium = 280,                -- mg
  iodine = NULL,                  -- нет данных
  vitamin_a = 8.0,                -- мкг RAE (яйца если есть)
  vitamin_b1 = 0.08,              -- мг
  vitamin_b2 = 0.20,              -- мг
  vitamin_b3 = 5.5,               -- мг (мясо)
  vitamin_b6 = 0.35,              -- мг
  vitamin_b9 = 8.0,               -- мкг
  vitamin_b12 = 1.5,              -- мкг (говядина + индейка!)
  vitamin_c = 0.5,                -- мг (лук следы)
  vitamin_d = 0.25,               -- мкг (мясо)
  vitamin_e = 0.35,               -- мг
  vitamin_k = 1.0,                -- мкг
  omega3_100 = 0.06,              -- г (мясо)
  omega6_100 = 0.9,               -- г (мясо)
  is_fermented = false,           -- не ферментировано
  is_raw = false,                 -- паровые
  is_organic = NULL,              -- зависит от источника
  is_whole_grain = false,         -- белый хлеб обычно
  nova_group = 3                  -- переработанный (фарш смешанный)
WHERE id = '3511b614-33a2-46fa-92cc-3b7d94c99811';

SELECT '✅ 4. Котлеты паровые' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '3511b614-33a2-46fa-92cc-3b7d94c99811' AND cholesterol IS NOT NULL
);

-- 5️⃣ Сердца куриные в сметане 15% (Chicken hearts in sour cream — USDA FDC ID: 171069 + сметана)
UPDATE shared_products SET
  cholesterol = 185,              -- mg/100g (СУБПРОДУКТЫ ОЧЕНЬ ВЫСОКО!)
  iron = 5.8,                     -- mg (РЕКОРД! Субпродукты богаты железом!)
  magnesium = 18,                 -- mg
  zinc = 3.2,                     -- mg (хорошо!)
  selenium = 39.0,                -- мкг (ОТЛИЧНО! Субпродукты)
  calcium = 45,                   -- mg (сметана)
  phosphorus = 180,               -- mg (мясо)
  potassium = 175,                -- mg
  iodine = NULL,                  -- нет данных
  vitamin_a = 55.0,               -- мкг RAE (субпродукты + сметана)
  vitamin_b1 = 0.22,              -- мг (субпродукты!)
  vitamin_b2 = 0.85,              -- мг (МНОГО! Субпродукты!)
  vitamin_b3 = 4.8,               -- мг
  vitamin_b6 = 0.28,              -- мг
  vitamin_b9 = 48.0,              -- мкг (субпродукты богаты фолатом!)
  vitamin_b12 = 7.3,              -- мкг (РЕКОРД! Субпродукты!)
  vitamin_c = 3.5,                -- мг (субпродукты)
  vitamin_d = 0.4,                -- мкг (сметана)
  vitamin_e = 0.40,               -- мг
  vitamin_k = 1.5,                -- мкг
  omega3_100 = 0.08,              -- г (курица)
  omega6_100 = 1.5,               -- г (курица + сметана)
  is_fermented = true,            -- сметана ферментирована
  is_raw = false,                 -- тушёные
  is_organic = NULL,              -- зависит от источника
  is_whole_grain = false,         -- не злак
  nova_group = 3                  -- переработанный (тушёные с соусом)
WHERE id = '8415aad8-0feb-4f9a-9dcf-80efbcdee6f7';

SELECT '✅ 5. Сердца куриные' AS status WHERE EXISTS (
  SELECT 1 FROM shared_products WHERE id = '8415aad8-0feb-4f9a-9dcf-80efbcdee6f7' AND cholesterol IS NOT NULL
);

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- Статистика покрытия после batch #27
-- ═══════════════════════════════════════════════════════════════
SELECT 
  count(*) FILTER (WHERE cholesterol IS NOT NULL) AS enriched,
  count(*) AS total,
  round(100.0 * count(*) FILTER (WHERE cholesterol IS NOT NULL) / count(*), 1) AS coverage_pct
FROM shared_products;
