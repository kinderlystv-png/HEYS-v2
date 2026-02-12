-- Batch UPDATE #2 - 7 simple products with USDA data
-- Generated: 2026-02-11
-- Source: USDA FoodData Central

BEGIN;

-- 1. Тунец консервированный жёлтопёрый (Tuna, yellowfin, canned in water - USDA #175165)
UPDATE shared_products SET
  iron = 1.0,
  magnesium = 27,
  zinc = 0.78,
  selenium = 76.0,
  calcium = 7,
  phosphorus = 217,
  potassium = 237,
  vitamin_a = 17,
  vitamin_d = 3.9,
  vitamin_e = 0.24,
  vitamin_k = 0.1,
  vitamin_b1 = 0.013,
  vitamin_b2 = 0.034,
  vitamin_b3 = 11.06,
  vitamin_b6 = 0.52,
  vitamin_b9 = 4,
  vitamin_b12 = 2.08,
  vitamin_c = 0,
  omega3_100 = 0.22,
  omega6_100 = 0.02,
  cholesterol = 39,
  is_fermented = false,
  is_raw = false
WHERE id = '4829cff6-5e89-417d-b590-e4b30b23befc';

-- 2. Греческий йогурт Простоквашино 2% (Greek yogurt, plain, lowfat - USDA #170903)
UPDATE shared_products SET
  iron = 0.04,
  magnesium = 11,
  zinc = 0.52,
  selenium = 9.7,
  calcium = 110,
  phosphorus = 135,
  potassium = 141,
  vitamin_a = 15,
  vitamin_d = 0.1,
  vitamin_e = 0.01,
  vitamin_k = 0.2,
  vitamin_b1 = 0.023,
  vitamin_b2 = 0.278,
  vitamin_b3 = 0.197,
  vitamin_b6 = 0.055,
  vitamin_b9 = 7,
  vitamin_b12 = 0.52,
  vitamin_c = 0.8,
  omega3_100 = 0.02,
  omega6_100 = 0.05,
  cholesterol = 5,
  is_fermented = true,  -- Yogurt is fermented
  is_raw = false
WHERE id = '4f298899-3dd2-4298-8811-56d7dc4bd25e';

-- 3. Творог 5% (Cottage cheese, lowfat, 5% milkfat - USDA #328638)
UPDATE shared_products SET
  iron = 0.14,
  magnesium = 8,
  zinc = 0.48,
  selenium = 9.8,
  calcium = 92,
  phosphorus = 160,
  potassium = 138,
  vitamin_a = 28,
  vitamin_d = 0.5,
  vitamin_e = 0.01,
  vitamin_k = 0.1,
  vitamin_b1 = 0.028,
  vitamin_b2 = 0.164,
  vitamin_b3 = 0.100,
  vitamin_b6 = 0.047,
  vitamin_b9 = 12,
  vitamin_b12 = 0.44,
  vitamin_c = 0,
  omega3_100 = 0.03,
  omega6_100 = 0.09,
  cholesterol = 15,
  is_fermented = true,  -- Cottage cheese is fermented
  is_raw = false
WHERE id = '58b3b175-361c-4d60-bd84-3b6d4a2bea88';

-- 4. Рис бурый с диким (отварной) (Brown rice + wild rice, cooked - USDA #168880 + 168942 averaged)
UPDATE shared_products SET
  iron = 0.56,
  magnesium = 39,
  zinc = 0.77,
  selenium = 11.7,
  calcium = 10,
  phosphorus = 103,
  potassium = 86,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 0.04,
  vitamin_k = 0.5,
  vitamin_b1 = 0.10,
  vitamin_b2 = 0.02,
  vitamin_b3 = 1.53,
  vitamin_b6 = 0.15,
  vitamin_b9 = 4,
  vitamin_b12 = 0,
  vitamin_c = 0,
  omega3_100 = 0.04,
  omega6_100 = 0.14,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '5cdaac8a-b459-4a9d-8396-d2f1038bf55f';

-- 5. Кабачки на гриле (Zucchini, grilled - USDA #169291)
UPDATE shared_products SET
  iron = 0.35,
  magnesium = 18,
  zinc = 0.29,
  selenium = 0.2,
  calcium = 15,
  phosphorus = 38,
  potassium = 264,
  vitamin_a = 11,
  vitamin_d = 0,
  vitamin_e = 0.12,
  vitamin_k = 4.3,
  vitamin_b1 = 0.045,
  vitamin_b2 = 0.094,
  vitamin_b3 = 0.451,
  vitamin_b6 = 0.163,
  vitamin_b9 = 24,
  vitamin_b12 = 0,
  vitamin_c = 17.9,
  omega3_100 = 0.05,
  omega6_100 = 0.05,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '4c74c273-c6ae-4a76-88bd-c0a6d9666aaa';

-- 6. Кабачки и перец сладкий на гриле (70/30) (Mixed: 70% zucchini + 30% bell pepper, grilled)
-- Weighted average: USDA #169291 (zucchini) + #170108 (bell pepper grilled)
UPDATE shared_products SET
  iron = 0.41,
  magnesium = 16,
  zinc = 0.25,
  selenium = 0.3,
  calcium = 13,
  phosphorus = 34,
  potassium = 237,
  vitamin_a = 38,
  vitamin_d = 0,
  vitamin_e = 0.45,
  vitamin_k = 3.8,
  vitamin_b1 = 0.042,
  vitamin_b2 = 0.076,
  vitamin_b3 = 0.450,
  vitamin_b6 = 0.181,
  vitamin_b9 = 20,
  vitamin_b12 = 0,
  vitamin_c = 44.5,
  omega3_100 = 0.04,
  omega6_100 = 0.06,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '44d63ffb-ba42-4b0d-a734-2e8ab7dc149e';

-- 7. Сырники с сахаром (творог 5%) (Cottage cheese pancakes - based on 80% cottage cheese + 20% egg/flour)
-- Approximation based on main ingredient (cottage cheese)
UPDATE shared_products SET
  iron = 0.50,
  magnesium = 10,
  zinc = 0.60,
  selenium = 12.0,
  calcium = 85,
  phosphorus = 145,
  potassium = 130,
  vitamin_a = 35,
  vitamin_d = 0.6,
  vitamin_e = 0.15,
  vitamin_k = 0.3,
  vitamin_b1 = 0.040,
  vitamin_b2 = 0.180,
  vitamin_b3 = 0.200,
  vitamin_b6 = 0.060,
  vitamin_b9 = 15,
  vitamin_b12 = 0.50,
  vitamin_c = 0,
  omega3_100 = 0.03,
  omega6_100 = 0.25,
  cholesterol = 45,
  is_fermented = false,  -- Cooked, fermentation stopped
  is_raw = false
WHERE id = '20a83021-0073-4a42-8dcb-891c550902fe';

COMMIT;

-- Verification query
SELECT 
  name,
  CASE 
    WHEN cholesterol IS NOT NULL 
      AND omega3_100 IS NOT NULL 
      AND omega6_100 IS NOT NULL
      AND iron IS NOT NULL
      AND vitamin_b12 IS NOT NULL
    THEN '✅ COMPLETE'
    ELSE '❌ INCOMPLETE'
  END as status,
  cholesterol,
  omega3_100 as omega3,
  omega6_100 as omega6
FROM shared_products 
WHERE id IN (
  '4829cff6-5e89-417d-b590-e4b30b23befc',
  '4f298899-3dd2-4298-8811-56d7dc4bd25e',
  '58b3b175-361c-4d60-bd84-3b6d4a2bea88',
  '5cdaac8a-b459-4a9d-8396-d2f1038bf55f',
  '4c74c273-c6ae-4a76-88bd-c0a6d9666aaa',
  '44d63ffb-ba42-4b0d-a734-2e8ab7dc149e',
  '20a83021-0073-4a42-8dcb-891c550902fe'
)
ORDER BY name;
