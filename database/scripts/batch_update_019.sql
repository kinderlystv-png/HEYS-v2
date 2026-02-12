-- Batch UPDATE #19 - 5 products
-- Generated: 2026-02-12
-- Source: USDA FoodData Central + best-fit approximations

BEGIN;

-- 1. Рисовая мука (Rice flour, white - USDA #20061)
UPDATE shared_products SET
  iron = 0.35,
  magnesium = 35,
  zinc = 0.80,
  selenium = 15.1,
  calcium = 10,
  phosphorus = 98,
  potassium = 76,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 0.11,
  vitamin_k = 0.1,
  vitamin_b1 = 0.138,
  vitamin_b2 = 0.021,
  vitamin_b3 = 2.590,
  vitamin_b6 = 0.436,
  vitamin_b9 = 4,
  vitamin_b12 = 0,
  vitamin_c = 0,
  omega3_100 = 0.0,
  omega6_100 = 0.15,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = 'def43cb8-8667-4fe0-8162-9cdae077821a';

-- 2. Салат из огурцов и помидоров с маслом (Mixed salad approximation)
-- Weighted avg: 50% cucumber + 40% tomato + 10% oil
UPDATE shared_products SET
  iron = 0.35,
  magnesium = 14,
  zinc = 0.18,
  selenium = 0.3,
  calcium = 15,
  phosphorus = 20,
  potassium = 210,
  vitamin_a = 45,
  vitamin_d = 0,
  vitamin_e = 1.20,
  vitamin_k = 10.0,
  vitamin_b1 = 0.040,
  vitamin_b2 = 0.025,
  vitamin_b3 = 0.480,
  vitamin_b6 = 0.055,
  vitamin_b9 = 12,
  vitamin_b12 = 0,
  vitamin_c = 10.0,
  omega3_100 = 0.05,
  omega6_100 = 0.80,
  cholesterol = 0,
  is_fermented = false,
  is_raw = true
WHERE id = 'f2bdd8ed-9985-4161-9d8a-ec84e8d6d12e';

-- 3. Свинина шашлык (шея) (Pork shoulder, cooked - USDA #168243)
UPDATE shared_products SET
  iron = 1.15,
  magnesium = 23,
  zinc = 3.47,
  selenium = 32.5,
  calcium = 18,
  phosphorus = 213,
  potassium = 318,
  vitamin_a = 2,
  vitamin_d = 0.5,
  vitamin_e = 0.24,
  vitamin_k = 0,
  vitamin_b1 = 0.548,
  vitamin_b2 = 0.258,
  vitamin_b3 = 4.580,
  vitamin_b6 = 0.420,
  vitamin_b9 = 3,
  vitamin_b12 = 0.67,
  vitamin_c = 0,
  omega3_100 = 0.08,
  omega6_100 = 2.10,
  cholesterol = 95,
  is_fermented = false,
  is_raw = false
WHERE id = '6bb84773-9788-4a40-bff3-85bbf0633300';

-- 4. Сёмга на пару (Salmon, cooked, dry heat - USDA #175168)
UPDATE shared_products SET
  iron = 0.34,
  magnesium = 31,
  zinc = 0.64,
  selenium = 46.8,
  calcium = 15,
  phosphorus = 289,
  potassium = 628,
  vitamin_a = 12,
  vitamin_d = 14.6,
  vitamin_e = 0.63,
  vitamin_k = 0.5,
  vitamin_b1 = 0.275,
  vitamin_b2 = 0.443,
  vitamin_b3 = 10.085,
  vitamin_b6 = 0.944,
  vitamin_b9 = 29,
  vitamin_b12 = 3.05,
  vitamin_c = 0,
  omega3_100 = 2.40,
  omega6_100 = 0.67,
  cholesterol = 71,
  is_fermented = false,
  is_raw = false
WHERE id = '61374e8a-5897-4de7-88ad-70393d959f8d';

-- 5. Сыр «Российский молодой» (Russian cheese ~ Swiss cheese - USDA #1040)
UPDATE shared_products SET
  iron = 0.20,
  magnesium = 38,
  zinc = 4.36,
  selenium = 14.5,
  calcium = 791,
  phosphorus = 567,
  potassium = 77,
  vitamin_a = 267,
  vitamin_d = 0.5,
  vitamin_e = 0.28,
  vitamin_k = 2.7,
  vitamin_b1 = 0.060,
  vitamin_b2 = 0.365,
  vitamin_b3 = 0.060,
  vitamin_b6 = 0.083,
  vitamin_b9 = 6,
  vitamin_b12 = 3.34,
  vitamin_c = 0,
  omega3_100 = 0.21,
  omega6_100 = 0.77,
  cholesterol = 92,
  is_fermented = true,
  is_raw = false
WHERE id = 'da76cbb2-c9e3-429f-b411-8b4071276b3c';

COMMIT;

-- Verification
SELECT 
  substring(name, 1, 45) as name,
  CASE WHEN cholesterol IS NOT NULL AND iron IS NOT NULL THEN '✅' ELSE '❌' END as ok,
  cholesterol,
  is_fermented
FROM shared_products 
WHERE id IN (
  'def43cb8-8667-4fe0-8162-9cdae077821a',
  'f2bdd8ed-9985-4161-9d8a-ec84e8d6d12e',
  '6bb84773-9788-4a40-bff3-85bbf0633300',
  '61374e8a-5897-4de7-88ad-70393d959f8d',
  'da76cbb2-c9e3-429f-b411-8b4071276b3c'
)
ORDER BY name;
