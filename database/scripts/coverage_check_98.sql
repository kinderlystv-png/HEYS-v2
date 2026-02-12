-- =============================================================================
-- HEYS v2 — Product Coverage 98% Check
-- Цель: проверка заполненности всех параметров продуктов
-- Дата: 2026-02-11
-- =============================================================================

-- Список всех критичных полей для coverage 98%
-- Макро (7), Extended (10), Vitamins (12), Quality (6) = 35 полей

-- 1. Текущий coverage по полям (%)
SELECT 
  'protein100' as field,
  COUNT(*) FILTER (WHERE protein100 IS NOT NULL AND protein100 > 0) as filled,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE protein100 IS NOT NULL AND protein100 > 0) / COUNT(*), 1) as coverage_pct
FROM shared_products
UNION ALL
SELECT 'simple100', COUNT(*) FILTER (WHERE simple100 IS NOT NULL AND simple100 > 0), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE simple100 IS NOT NULL AND simple100 > 0) / COUNT(*), 1) FROM shared_products
UNION ALL
SELECT 'complex100', COUNT(*) FILTER (WHERE complex100 IS NOT NULL AND complex100 > 0), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE complex100 IS NOT NULL AND complex100 > 0) / COUNT(*), 1) FROM shared_products
UNION ALL
SELECT 'badFat100', COUNT(*) FILTER (WHERE "badFat100" IS NOT NULL AND "badFat100" > 0), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE "badFat100" IS NOT NULL AND "badFat100" > 0) / COUNT(*), 1) FROM shared_products
UNION ALL
SELECT 'goodFat100', COUNT(*) FILTER (WHERE "goodFat100" IS NOT NULL AND "goodFat100" > 0), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE "goodFat100" IS NOT NULL AND "goodFat100" > 0) / COUNT(*), 1) FROM shared_products
UNION ALL
SELECT 'trans100', COUNT(*) FILTER (WHERE trans100 IS NOT NULL), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE trans100 IS NOT NULL) / COUNT(*), 1) FROM shared_products
UNION ALL
SELECT 'fiber100', COUNT(*) FILTER (WHERE fiber100 IS NOT NULL AND fiber100 > 0), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE fiber100 IS NOT NULL AND fiber100 > 0) / COUNT(*), 1) FROM shared_products
UNION ALL
SELECT 'sodium100', COUNT(*) FILTER (WHERE sodium100 IS NOT NULL), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE sodium100 IS NOT NULL) / COUNT(*), 1) FROM shared_products
UNION ALL
SELECT 'omega3_100', COUNT(*) FILTER (WHERE omega3_100 IS NOT NULL AND omega3_100 > 0), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE omega3_100 IS NOT NULL AND omega3_100 > 0) / COUNT(*), 1) FROM shared_products
UNION ALL
SELECT 'omega6_100', COUNT(*) FILTER (WHERE omega6_100 IS NOT NULL AND omega6_100 > 0), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE omega6_100 IS NOT NULL AND omega6_100 > 0) / COUNT(*), 1) FROM shared_products
UNION ALL
SELECT 'cholesterol100', COUNT(*) FILTER (WHERE cholesterol100 IS NOT NULL AND cholesterol100 > 0), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE cholesterol100 IS NOT NULL AND cholesterol100 > 0) / COUNT(*), 1) FROM shared_products
UNION ALL
SELECT 'iron', COUNT(*) FILTER (WHERE iron IS NOT NULL AND iron > 0), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE iron IS NOT NULL AND iron > 0) / COUNT(*), 1) FROM shared_products
UNION ALL
SELECT 'magnesium', COUNT(*) FILTER (WHERE magnesium IS NOT NULL AND magnesium > 0), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE magnesium IS NOT NULL AND magnesium > 0) / COUNT(*), 1) FROM shared_products
UNION ALL
SELECT 'zinc', COUNT(*) FILTER (WHERE zinc IS NOT NULL AND zinc > 0), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE zinc IS NOT NULL AND zinc > 0) / COUNT(*), 1) FROM shared_products
UNION ALL
SELECT 'calcium', COUNT(*) FILTER (WHERE calcium IS NOT NULL AND calcium > 0), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE calcium IS NOT NULL AND calcium > 0) / COUNT(*), 1) FROM shared_products
UNION ALL
SELECT 'potassium', COUNT(*) FILTER (WHERE potassium IS NOT NULL AND potassium > 0), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE potassium IS NOT NULL AND potassium > 0) / COUNT(*), 1) FROM shared_products
UNION ALL
SELECT 'selenium', COUNT(*) FILTER (WHERE selenium IS NOT NULL AND selenium > 0), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE selenium IS NOT NULL AND selenium > 0) / COUNT(*), 1) FROM shared_products
UNION ALL
SELECT 'iodine', COUNT(*) FILTER (WHERE iodine IS NOT NULL AND iodine > 0), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE iodine IS NOT NULL AND iodine > 0) / COUNT(*), 1) FROM shared_products
UNION ALL
SELECT 'vitamin_a', COUNT(*) FILTER (WHERE vitamin_a IS NOT NULL AND vitamin_a > 0), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE vitamin_a IS NOT NULL AND vitamin_a > 0) / COUNT(*), 1) FROM shared_products
UNION ALL
SELECT 'vitamin_b1', COUNT(*) FILTER (WHERE vitamin_b1 IS NOT NULL AND vitamin_b1 > 0), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE vitamin_b1 IS NOT NULL AND vitamin_b1 > 0) / COUNT(*), 1) FROM shared_products
UNION ALL
SELECT 'vitamin_b2', COUNT(*) FILTER (WHERE vitamin_b2 IS NOT NULL AND vitamin_b2 > 0), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE vitamin_b2 IS NOT NULL AND vitamin_b2 > 0) / COUNT(*), 1) FROM shared_products
UNION ALL
SELECT 'vitamin_b3', COUNT(*) FILTER (WHERE vitamin_b3 IS NOT NULL AND vitamin_b3 > 0), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE vitamin_b3 IS NOT NULL AND vitamin_b3 > 0) / COUNT(*), 1) FROM shared_products
UNION ALL
SELECT 'vitamin_b6', COUNT(*) FILTER (WHERE vitamin_b6 IS NOT NULL AND vitamin_b6 > 0), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE vitamin_b6 IS NOT NULL AND vitamin_b6 > 0) / COUNT(*), 1) FROM shared_products
UNION ALL
SELECT 'vitamin_b9', COUNT(*) FILTER (WHERE vitamin_b9 IS NOT NULL AND vitamin_b9 > 0), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE vitamin_b9 IS NOT NULL AND vitamin_b9 > 0) / COUNT(*), 1) FROM shared_products
UNION ALL
SELECT 'vitamin_b12', COUNT(*) FILTER (WHERE vitamin_b12 IS NOT NULL AND vitamin_b12 > 0), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE vitamin_b12 IS NOT NULL AND vitamin_b12 > 0) / COUNT(*), 1) FROM shared_products
UNION ALL
SELECT 'vitamin_c', COUNT(*) FILTER (WHERE vitamin_c IS NOT NULL AND vitamin_c > 0), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE vitamin_c IS NOT NULL AND vitamin_c > 0) / COUNT(*), 1) FROM shared_products
UNION ALL
SELECT 'vitamin_d', COUNT(*) FILTER (WHERE vitamin_d IS NOT NULL AND vitamin_d > 0), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE vitamin_d IS NOT NULL AND vitamin_d > 0) / COUNT(*), 1) FROM shared_products
UNION ALL
SELECT 'vitamin_e', COUNT(*) FILTER (WHERE vitamin_e IS NOT NULL AND vitamin_e > 0), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE vitamin_e IS NOT NULL AND vitamin_e > 0) / COUNT(*), 1) FROM shared_products
UNION ALL
SELECT 'vitamin_k', COUNT(*) FILTER (WHERE vitamin_k IS NOT NULL AND vitamin_k > 0), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE vitamin_k IS NOT NULL AND vitamin_k > 0) / COUNT(*), 1) FROM shared_products
UNION ALL
SELECT 'nova_group', COUNT(*) FILTER (WHERE nova_group IS NOT NULL), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE nova_group IS NOT NULL) / COUNT(*), 1) FROM shared_products
UNION ALL
SELECT 'is_fermented', COUNT(*) FILTER (WHERE is_fermented IS NOT NULL), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE is_fermented IS NOT NULL) / COUNT(*), 1) FROM shared_products
UNION ALL
SELECT 'is_raw', COUNT(*) FILTER (WHERE is_raw IS NOT NULL), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE is_raw IS NOT NULL) / COUNT(*), 1) FROM shared_products
UNION ALL
SELECT 'is_organic', COUNT(*) FILTER (WHERE is_organic IS NOT NULL), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE is_organic IS NOT NULL) / COUNT(*), 1) FROM shared_products
UNION ALL
SELECT 'is_whole_grain', COUNT(*) FILTER (WHERE is_whole_grain IS NOT NULL), COUNT(*), ROUND(100.0 * COUNT(*) FILTER (WHERE is_whole_grain IS NOT NULL) / COUNT(*), 1) FROM shared_products
ORDER BY coverage_pct ASC, field;

-- 2. Продукты с lowest coverage (нужно заполнить в первую очередь)
SELECT 
  id,
  name,
  category,
  -- Считаем заполненность (35 полей)
  (
    CASE WHEN protein100 IS NOT NULL AND protein100 > 0 THEN 1 ELSE 0 END +
    CASE WHEN simple100 IS NOT NULL AND simple100 > 0 THEN 1 ELSE 0 END +
    CASE WHEN complex100 IS NOT NULL AND complex100 > 0 THEN 1 ELSE 0 END +
    CASE WHEN "badFat100" IS NOT NULL AND "badFat100" > 0 THEN 1 ELSE 0 END +
    CASE WHEN "goodFat100" IS NOT NULL AND "goodFat100" > 0 THEN 1 ELSE 0 END +
    CASE WHEN trans100 IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN fiber100 IS NOT NULL AND fiber100 > 0 THEN 1 ELSE 0 END +
    CASE WHEN sodium100 IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN omega3_100 IS NOT NULL AND omega3_100 > 0 THEN 1 ELSE 0 END +
    CASE WHEN omega6_100 IS NOT NULL AND omega6_100 > 0 THEN 1 ELSE 0 END +
    CASE WHEN cholesterol100 IS NOT NULL AND cholesterol100 > 0 THEN 1 ELSE 0 END +
    CASE WHEN iron IS NOT NULL AND iron > 0 THEN 1 ELSE 0 END +
    CASE WHEN magnesium IS NOT NULL AND magnesium > 0 THEN 1 ELSE 0 END +
    CASE WHEN zinc IS NOT NULL AND zinc > 0 THEN 1 ELSE 0 END +
    CASE WHEN calcium IS NOT NULL AND calcium > 0 THEN 1 ELSE 0 END +
    CASE WHEN potassium IS NOT NULL AND potassium > 0 THEN 1 ELSE 0 END +
    CASE WHEN selenium IS NOT NULL AND selenium > 0 THEN 1 ELSE 0 END +
    CASE WHEN iodine IS NOT NULL AND iodine > 0 THEN 1 ELSE 0 END +
    CASE WHEN vitamin_a IS NOT NULL AND vitamin_a > 0 THEN 1 ELSE 0 END +
    CASE WHEN vitamin_b1 IS NOT NULL AND vitamin_b1 > 0 THEN 1 ELSE 0 END +
    CASE WHEN vitamin_b2 IS NOT NULL AND vitamin_b2 > 0 THEN 1 ELSE 0 END +
    CASE WHEN vitamin_b3 IS NOT NULL AND vitamin_b3 > 0 THEN 1 ELSE 0 END +
    CASE WHEN vitamin_b6 IS NOT NULL AND vitamin_b6 > 0 THEN 1 ELSE 0 END +
    CASE WHEN vitamin_b9 IS NOT NULL AND vitamin_b9 > 0 THEN 1 ELSE 0 END +
    CASE WHEN vitamin_b12 IS NOT NULL AND vitamin_b12 > 0 THEN 1 ELSE 0 END +
    CASE WHEN vitamin_c IS NOT NULL AND vitamin_c > 0 THEN 1 ELSE 0 END +
    CASE WHEN vitamin_d IS NOT NULL AND vitamin_d > 0 THEN 1 ELSE 0 END +
    CASE WHEN vitamin_e IS NOT NULL AND vitamin_e > 0 THEN 1 ELSE 0 END +
    CASE WHEN vitamin_k IS NOT NULL AND vitamin_k > 0 THEN 1 ELSE 0 END +
    CASE WHEN nova_group IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN is_fermented IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN is_raw IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN is_organic IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN is_whole_grain IS NOT NULL THEN 1 ELSE 0 END
  ) as filled_fields,
  ROUND(100.0 * (
    CASE WHEN protein100 IS NOT NULL AND protein100 > 0 THEN 1 ELSE 0 END +
    CASE WHEN simple100 IS NOT NULL AND simple100 > 0 THEN 1 ELSE 0 END +
    CASE WHEN complex100 IS NOT NULL AND complex100 > 0 THEN 1 ELSE 0 END +
    CASE WHEN "badFat100" IS NOT NULL AND "badFat100" > 0 THEN 1 ELSE 0 END +
    CASE WHEN "goodFat100" IS NOT NULL AND "goodFat100" > 0 THEN 1 ELSE 0 END +
    CASE WHEN trans100 IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN fiber100 IS NOT NULL AND fiber100 > 0 THEN 1 ELSE 0 END +
    CASE WHEN sodium100 IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN omega3_100 IS NOT NULL AND omega3_100 > 0 THEN 1 ELSE 0 END +
    CASE WHEN omega6_100 IS NOT NULL AND omega6_100 > 0 THEN 1 ELSE 0 END +
    CASE WHEN cholesterol100 IS NOT NULL AND cholesterol100 > 0 THEN 1 ELSE 0 END +
    CASE WHEN iron IS NOT NULL AND iron > 0 THEN 1 ELSE 0 END +
    CASE WHEN magnesium IS NOT NULL AND magnesium > 0 THEN 1 ELSE 0 END +
    CASE WHEN zinc IS NOT NULL AND zinc > 0 THEN 1 ELSE 0 END +
    CASE WHEN calcium IS NOT NULL AND calcium > 0 THEN 1 ELSE 0 END +
    CASE WHEN potassium IS NOT NULL AND potassium > 0 THEN 1 ELSE 0 END +
    CASE WHEN selenium IS NOT NULL AND selenium > 0 THEN 1 ELSE 0 END +
    CASE WHEN iodine IS NOT NULL AND iodine > 0 THEN 1 ELSE 0 END +
    CASE WHEN vitamin_a IS NOT NULL AND vitamin_a > 0 THEN 1 ELSE 0 END +
    CASE WHEN vitamin_b1 IS NOT NULL AND vitamin_b1 > 0 THEN 1 ELSE 0 END +
    CASE WHEN vitamin_b2 IS NOT NULL AND vitamin_b2 > 0 THEN 1 ELSE 0 END +
    CASE WHEN vitamin_b3 IS NOT NULL AND vitamin_b3 > 0 THEN 1 ELSE 0 END +
    CASE WHEN vitamin_b6 IS NOT NULL AND vitamin_b6 > 0 THEN 1 ELSE 0 END +
    CASE WHEN vitamin_b9 IS NOT NULL AND vitamin_b9 > 0 THEN 1 ELSE 0 END +
    CASE WHEN vitamin_b12 IS NOT NULL AND vitamin_b12 > 0 THEN 1 ELSE 0 END +
    CASE WHEN vitamin_c IS NOT NULL AND vitamin_c > 0 THEN 1 ELSE 0 END +
    CASE WHEN vitamin_d IS NOT NULL AND vitamin_d > 0 THEN 1 ELSE 0 END +
    CASE WHEN vitamin_e IS NOT NULL AND vitamin_e > 0 THEN 1 ELSE 0 END +
    CASE WHEN vitamin_k IS NOT NULL AND vitamin_k > 0 THEN 1 ELSE 0 END +
    CASE WHEN nova_group IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN is_fermented IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN is_raw IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN is_organic IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN is_whole_grain IS NOT NULL THEN 1 ELSE 0 END
  ) / 35.0, 1) as completeness_pct
FROM shared_products
ORDER BY completeness_pct ASC, name
LIMIT 50;

-- 3. Summary — overall coverage
SELECT 
  COUNT(*) as total_products,
  COUNT(*) FILTER (WHERE (
    CASE WHEN protein100 IS NOT NULL AND protein100 > 0 THEN 1 ELSE 0 END +
    CASE WHEN simple100 IS NOT NULL AND simple100 > 0 THEN 1 ELSE 0 END +
    CASE WHEN nova_group IS NOT NULL THEN 1 ELSE 0 END
  ) = 3) as products_with_basic_fields,
  COUNT(*) FILTER (WHERE (
    -- Полный набор 35 полей
    (CASE WHEN protein100 IS NOT NULL AND protein100 > 0 THEN 1 ELSE 0 END +
     CASE WHEN simple100 IS NOT NULL AND simple100 > 0 THEN 1 ELSE 0 END +
     CASE WHEN complex100 IS NOT NULL AND complex100 > 0 THEN 1 ELSE 0 END +
     CASE WHEN "badFat100" IS NOT NULL AND "badFat100" > 0 THEN 1 ELSE 0 END +
     CASE WHEN "goodFat100" IS NOT NULL AND "goodFat100" > 0 THEN 1 ELSE 0 END +
     CASE WHEN trans100 IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN fiber100 IS NOT NULL AND fiber100 > 0 THEN 1 ELSE 0 END +
     CASE WHEN sodium100 IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN omega3_100 IS NOT NULL AND omega3_100 > 0 THEN 1 ELSE 0 END +
     CASE WHEN omega6_100 IS NOT NULL AND omega6_100 > 0 THEN 1 ELSE 0 END +
     CASE WHEN cholesterol100 IS NOT NULL AND cholesterol100 > 0 THEN 1 ELSE 0 END +
     CASE WHEN iron IS NOT NULL AND iron > 0 THEN 1 ELSE 0 END +
     CASE WHEN magnesium IS NOT NULL AND magnesium > 0 THEN 1 ELSE 0 END +
     CASE WHEN zinc IS NOT NULL AND zinc > 0 THEN 1 ELSE 0 END +
     CASE WHEN calcium IS NOT NULL AND calcium > 0 THEN 1 ELSE 0 END +
     CASE WHEN potassium IS NOT NULL AND potassium > 0 THEN 1 ELSE 0 END +
     CASE WHEN selenium IS NOT NULL AND selenium > 0 THEN 1 ELSE 0 END +
     CASE WHEN iodine IS NOT NULL AND iodine > 0 THEN 1 ELSE 0 END +
     CASE WHEN vitamin_a IS NOT NULL AND vitamin_a > 0 THEN 1 ELSE 0 END +
     CASE WHEN vitamin_b1 IS NOT NULL AND vitamin_b1 > 0 THEN 1 ELSE 0 END +
     CASE WHEN vitamin_b2 IS NOT NULL AND vitamin_b2 > 0 THEN 1 ELSE 0 END +
     CASE WHEN vitamin_b3 IS NOT NULL AND vitamin_b3 > 0 THEN 1 ELSE 0 END +
     CASE WHEN vitamin_b6 IS NOT NULL AND vitamin_b6 > 0 THEN 1 ELSE 0 END +
     CASE WHEN vitamin_b9 IS NOT NULL AND vitamin_b9 > 0 THEN 1 ELSE 0 END +
     CASE WHEN vitamin_b12 IS NOT NULL AND vitamin_b12 > 0 THEN 1 ELSE 0 END +
     CASE WHEN vitamin_c IS NOT NULL AND vitamin_c > 0 THEN 1 ELSE 0 END +
     CASE WHEN vitamin_d IS NOT NULL AND vitamin_d > 0 THEN 1 ELSE 0 END +
     CASE WHEN vitamin_e IS NOT NULL AND vitamin_e > 0 THEN 1 ELSE 0 END +
     CASE WHEN vitamin_k IS NOT NULL AND vitamin_k > 0 THEN 1 ELSE 0 END +
     CASE WHEN nova_group IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN is_fermented IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN is_raw IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN is_organic IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN is_whole_grain IS NOT NULL THEN 1 ELSE 0 END
    ) >= 34 -- 98% от 35 полей = минимум 34 поля
  )) as products_with_98pct_coverage,
  ROUND(100.0 * COUNT(*) FILTER (WHERE (
    -- Полный набор 35 полей
    (CASE WHEN protein100 IS NOT NULL AND protein100 > 0 THEN 1 ELSE 0 END +
     CASE WHEN simple100 IS NOT NULL AND simple100 > 0 THEN 1 ELSE 0 END +
     CASE WHEN complex100 IS NOT NULL AND complex100 > 0 THEN 1 ELSE 0 END +
     CASE WHEN "badFat100" IS NOT NULL AND "badFat100" > 0 THEN 1 ELSE 0 END +
     CASE WHEN "goodFat100" IS NOT NULL AND "goodFat100" > 0 THEN 1 ELSE 0 END +
     CASE WHEN trans100 IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN fiber100 IS NOT NULL AND fiber100 > 0 THEN 1 ELSE 0 END +
     CASE WHEN sodium100 IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN omega3_100 IS NOT NULL AND omega3_100 > 0 THEN 1 ELSE 0 END +
     CASE WHEN omega6_100 IS NOT NULL AND omega6_100 > 0 THEN 1 ELSE 0 END +
     CASE WHEN cholesterol100 IS NOT NULL AND cholesterol100 > 0 THEN 1 ELSE 0 END +
     CASE WHEN iron IS NOT NULL AND iron > 0 THEN 1 ELSE 0 END +
     CASE WHEN magnesium IS NOT NULL AND magnesium > 0 THEN 1 ELSE 0 END +
     CASE WHEN zinc IS NOT NULL AND zinc > 0 THEN 1 ELSE 0 END +
     CASE WHEN calcium IS NOT NULL AND calcium > 0 THEN 1 ELSE 0 END +
     CASE WHEN potassium IS NOT NULL AND potassium > 0 THEN 1 ELSE 0 END +
     CASE WHEN selenium IS NOT NULL AND selenium > 0 THEN 1 ELSE 0 END +
     CASE WHEN iodine IS NOT NULL AND iodine > 0 THEN 1 ELSE 0 END +
     CASE WHEN vitamin_a IS NOT NULL AND vitamin_a > 0 THEN 1 ELSE 0 END +
     CASE WHEN vitamin_b1 IS NOT NULL AND vitamin_b1 > 0 THEN 1 ELSE 0 END +
     CASE WHEN vitamin_b2 IS NOT NULL AND vitamin_b2 > 0 THEN 1 ELSE 0 END +
     CASE WHEN vitamin_b3 IS NOT NULL AND vitamin_b3 > 0 THEN 1 ELSE 0 END +
     CASE WHEN vitamin_b6 IS NOT NULL AND vitamin_b6 > 0 THEN 1 ELSE 0 END +
     CASE WHEN vitamin_b9 IS NOT NULL AND vitamin_b9 > 0 THEN 1 ELSE 0 END +
     CASE WHEN vitamin_b12 IS NOT NULL AND vitamin_b12 > 0 THEN 1 ELSE 0 END +
     CASE WHEN vitamin_c IS NOT NULL AND vitamin_c > 0 THEN 1 ELSE 0 END +
     CASE WHEN vitamin_d IS NOT NULL AND vitamin_d > 0 THEN 1 ELSE 0 END +
     CASE WHEN vitamin_e IS NOT NULL AND vitamin_e > 0 THEN 1 ELSE 0 END +
     CASE WHEN vitamin_k IS NOT NULL AND vitamin_k > 0 THEN 1 ELSE 0 END +
     CASE WHEN nova_group IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN is_fermented IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN is_raw IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN is_organic IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN is_whole_grain IS NOT NULL THEN 1 ELSE 0 END
    ) >= 34
  )) / COUNT(*), 1) as overall_coverage_pct
FROM shared_products;
