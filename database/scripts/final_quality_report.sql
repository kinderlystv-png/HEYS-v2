-- ═══════════════════════════════════════════════════════════════
-- Финальная комплексная проверка качества обогащения
-- Дата: 2026-02-12
-- ═══════════════════════════════════════════════════════════════

-- 1️⃣ Общее покрытие всех критических полей
SELECT 
  'Критические поля (должны быть 100%)' AS check_category,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE cholesterol IS NOT NULL) AS cholesterol,
  COUNT(*) FILTER (WHERE iron IS NOT NULL) AS iron,
  COUNT(*) FILTER (WHERE magnesium IS NOT NULL) AS magnesium,
  COUNT(*) FILTER (WHERE zinc IS NOT NULL) AS zinc,
  COUNT(*) FILTER (WHERE selenium IS NOT NULL) AS selenium,
  COUNT(*) FILTER (WHERE calcium IS NOT NULL) AS calcium,
  COUNT(*) FILTER (WHERE phosphorus IS NOT NULL) AS phosphorus,
  COUNT(*) FILTER (WHERE potassium IS NOT NULL) AS potassium
FROM shared_products;

-- 2️⃣ Покрытие витаминов
SELECT 
  'Витамины (должны быть 100%)' AS check_category,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE vitamin_a IS NOT NULL) AS vitamin_a,
  COUNT(*) FILTER (WHERE vitamin_b1 IS NOT NULL) AS vitamin_b1,
  COUNT(*) FILTER (WHERE vitamin_b2 IS NOT NULL) AS vitamin_b2,
  COUNT(*) FILTER (WHERE vitamin_b3 IS NOT NULL) AS vitamin_b3,
  COUNT(*) FILTER (WHERE vitamin_b6 IS NOT NULL) AS vitamin_b6,
  COUNT(*) FILTER (WHERE vitamin_b9 IS NOT NULL) AS vitamin_b9,
  COUNT(*) FILTER (WHERE vitamin_b12 IS NOT NULL) AS vitamin_b12,
  COUNT(*) FILTER (WHERE vitamin_c IS NOT NULL) AS vitamin_c,
  COUNT(*) FILTER (WHERE vitamin_d IS NOT NULL) AS vitamin_d,
  COUNT(*) FILTER (WHERE vitamin_e IS NOT NULL) AS vitamin_e,
  COUNT(*) FILTER (WHERE vitamin_k IS NOT NULL) AS vitamin_k
FROM shared_products;

-- 3️⃣ Жирные кислоты и качественные флаги
SELECT 
  'Жирные кислоты и качество' AS check_category,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE omega3_100 IS NOT NULL) AS omega3,
  COUNT(*) FILTER (WHERE omega6_100 IS NOT NULL) AS omega6,
  COUNT(*) FILTER (WHERE nova_group IS NOT NULL) AS nova_group,
  COUNT(*) FILTER (WHERE is_raw IS NOT NULL) AS is_raw,
  COUNT(*) FILTER (WHERE is_fermented IS NOT NULL) AS is_fermented,
  COUNT(*) FILTER (WHERE is_whole_grain IS NOT NULL) AS is_whole_grain,
  COUNT(*) FILTER (WHERE is_organic IS NOT NULL) AS is_organic
FROM shared_products;

-- 4️⃣ Распределение по NOVA группам
SELECT 
  'NOVA группы (1=необработанное, 4=ультрапереработанное)' AS distribution,
  nova_group,
  COUNT(*) AS count,
  ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM shared_products), 1) AS percent
FROM shared_products 
WHERE nova_group IS NOT NULL
GROUP BY nova_group 
ORDER BY nova_group;

-- 5️⃣ Ферментированные продукты
SELECT 
  'Ферментированные продукты' AS category,
  is_fermented,
  COUNT(*) AS count
FROM shared_products 
WHERE is_fermented IS NOT NULL
GROUP BY is_fermented 
ORDER BY is_fermented DESC;

-- 6️⃣ Цельнозерновые продукты
SELECT 
  'Цельнозерновые продукты' AS category,
  is_whole_grain,
  COUNT(*) AS count
FROM shared_products 
WHERE is_whole_grain IS NOT NULL
GROUP BY is_whole_grain 
ORDER BY is_whole_grain DESC;

-- 7️⃣ Финальная сводка
SELECT 
  '🎉 ИТОГОВАЯ СТАТИСТИКА' AS summary,
  COUNT(*) AS total_products,
  COUNT(*) FILTER (WHERE cholesterol IS NOT NULL 
                   AND iron IS NOT NULL 
                   AND vitamin_b12 IS NOT NULL 
                   AND omega3_100 IS NOT NULL 
                   AND nova_group IS NOT NULL) AS fully_enriched,
  ROUND(100.0 * COUNT(*) FILTER (WHERE cholesterol IS NOT NULL) / COUNT(*), 1) AS coverage_percent
FROM shared_products;
