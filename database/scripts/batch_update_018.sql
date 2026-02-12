-- Batch UPDATE #18 - 5 products
-- Generated: 2026-02-12
-- Source: USDA FoodData Central + best-fit approximations

BEGIN;

-- 1. Авокадо (Avocados, raw - USDA #171705)
UPDATE shared_products SET
  iron = 0.55,
  magnesium = 29,
  zinc = 0.64,
  selenium = 0.4,
  calcium = 12,
  phosphorus = 52,
  potassium = 485,
  vitamin_a = 7,
  vitamin_d = 0,
  vitamin_e = 2.07,
  vitamin_k = 21.0,
  vitamin_b1 = 0.067,
  vitamin_b2 = 0.130,
  vitamin_b3 = 1.738,
  vitamin_b6 = 0.257,
  vitamin_b9 = 81,
  vitamin_b12 = 0,
  vitamin_c = 10.0,
  omega3_100 = 0.11,
  omega6_100 = 1.67,
  cholesterol = 0,
  is_fermented = false,
  is_raw = true
WHERE id = '9a7f296a-04b7-4bd1-b81d-733c2aeae8b8';

-- 2. Груша (Pears, raw - USDA #169118)
UPDATE shared_products SET
  iron = 0.18,
  magnesium = 7,
  zinc = 0.10,
  selenium = 0.1,
  calcium = 9,
  phosphorus = 12,
  potassium = 116,
  vitamin_a = 1,
  vitamin_d = 0,
  vitamin_e = 0.12,
  vitamin_k = 4.4,
  vitamin_b1 = 0.012,
  vitamin_b2 = 0.026,
  vitamin_b3 = 0.161,
  vitamin_b6 = 0.029,
  vitamin_b9 = 7,
  vitamin_b12 = 0,
  vitamin_c = 4.3,
  omega3_100 = 0.0,
  omega6_100 = 0.05,
  cholesterol = 0,
  is_fermented = false,
  is_raw = true
WHERE id = '96baa1e2-4301-486f-b054-c072abafa9c8';

-- 3. Изюм (Raisins, seedless - USDA #169868)
UPDATE shared_products SET
  iron = 1.88,
  magnesium = 32,
  zinc = 0.22,
  selenium = 0.6,
  calcium = 50,
  phosphorus = 101,
  potassium = 749,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 0.12,
  vitamin_k = 3.5,
  vitamin_b1 = 0.106,
  vitamin_b2 = 0.125,
  vitamin_b3 = 0.766,
  vitamin_b6 = 0.174,
  vitamin_b9 = 5,
  vitamin_b12 = 0,
  vitamin_c = 2.3,
  omega3_100 = 0.0,
  omega6_100 = 0.03,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '6030bf10-feb0-4a3a-9a46-2e52fcafa782';

-- 4. Капуста квашеная (Sauerkraut, canned - USDA #169994)
UPDATE shared_products SET
  iron = 1.47,
  magnesium = 13,
  zinc = 0.19,
  selenium = 0.6,
  calcium = 30,
  phosphorus = 20,
  potassium = 170,
  vitamin_a = 1,
  vitamin_d = 0,
  vitamin_e = 0.14,
  vitamin_k = 13.0,
  vitamin_b1 = 0.021,
  vitamin_b2 = 0.022,
  vitamin_b3 = 0.143,
  vitamin_b6 = 0.130,
  vitamin_b9 = 24,
  vitamin_b12 = 0,
  vitamin_c = 14.7,
  omega3_100 = 0.08,
  omega6_100 = 0.06,
  cholesterol = 0,
  is_fermented = true,
  is_raw = true
WHERE id = 'f050987c-f20f-4d4a-b094-1b86678f69e6';

-- 5. Масло сливочное 82,5% (Butter, salted - USDA #172178)
UPDATE shared_products SET
  iron = 0.02,
  magnesium = 2,
  zinc = 0.09,
  selenium = 1.0,
  calcium = 24,
  phosphorus = 24,
  potassium = 24,
  vitamin_a = 684,
  vitamin_d = 1.5,
  vitamin_e = 2.32,
  vitamin_k = 7.0,
  vitamin_b1 = 0.005,
  vitamin_b2 = 0.034,
  vitamin_b3 = 0.042,
  vitamin_b6 = 0.003,
  vitamin_b9 = 3,
  vitamin_b12 = 0.17,
  vitamin_c = 0,
  omega3_100 = 0.32,
  omega6_100 = 2.17,
  cholesterol = 215,
  is_fermented = false,
  is_raw = false
WHERE id = '815ee6b4-9572-43e0-9dcc-74fa72c66454';

COMMIT;

-- Verification
SELECT 
  substring(name, 1, 45) as name,
  CASE WHEN cholesterol IS NOT NULL AND iron IS NOT NULL THEN '✅' ELSE '❌' END as ok,
  cholesterol
FROM shared_products 
WHERE id IN (
  '9a7f296a-04b7-4bd1-b81d-733c2aeae8b8',
  '96baa1e2-4301-486f-b054-c072abafa9c8',
  '6030bf10-feb0-4a3a-9a46-2e52fcafa782',
  'f050987c-f20f-4d4a-b094-1b86678f69e6',
  '815ee6b4-9572-43e0-9dcc-74fa72c66454'
)
ORDER BY name;
