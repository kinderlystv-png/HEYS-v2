-- Batch UPDATE #21 - 5 products
-- Generated: 2026-02-12
-- Source: USDA FoodData Central + approximations

BEGIN;

-- 1. Кофе Латте (Coffee latte ~ 8oz milk + espresso)
-- Base: whole milk (USDA #1077) with dilution
UPDATE shared_products SET
  iron = 0.05,
  magnesium = 13,
  zinc = 0.37,
  selenium = 3.7,
  calcium = 113,
  phosphorus = 84,
  potassium = 143,
  vitamin_a = 46,
  vitamin_d = 1.3,
  vitamin_e = 0.07,
  vitamin_k = 0.3,
  vitamin_b1 = 0.038,
  vitamin_b2 = 0.169,
  vitamin_b3 = 0.089,
  vitamin_b6 = 0.036,
  vitamin_b9 = 5,
  vitamin_b12 = 0.45,
  vitamin_c = 0,
  omega3_100 = 0.08,
  omega6_100 = 0.12,
  cholesterol = 12,
  is_fermented = false,
  is_raw = false
WHERE id = '0d764e7f-a46d-4e2f-9f67-51bcf6afd5fe';

-- 2. Кофе американо (Coffee, brewed - USDA #14209)
UPDATE shared_products SET
  iron = 0.01,
  magnesium = 7,
  zinc = 0.05,
  selenium = 0.1,
  calcium = 2,
  phosphorus = 7,
  potassium = 49,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 0.01,
  vitamin_k = 0.1,
  vitamin_b1 = 0.014,
  vitamin_b2 = 0.076,
  vitamin_b3 = 0.191,
  vitamin_b6 = 0.001,
  vitamin_b9 = 5,
  vitamin_b12 = 0,
  vitamin_c = 0,
  omega3_100 = 0.0,
  omega6_100 = 0.0,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '0c04c07d-9e8a-40e0-93e9-5ec72528f10c';

-- 3. Молочный коктейль Neo High Protein карамель (Protein shake approximation)
-- High protein drink with added vitamins/minerals
UPDATE shared_products SET
  iron = 1.80,
  magnesium = 45,
  zinc = 1.50,
  selenium = 8.5,
  calcium = 150,
  phosphorus = 130,
  potassium = 220,
  vitamin_a = 90,
  vitamin_d = 2.5,
  vitamin_e = 1.50,
  vitamin_k = 5.0,
  vitamin_b1 = 0.165,
  vitamin_b2 = 0.255,
  vitamin_b3 = 2.400,
  vitamin_b6 = 0.255,
  vitamin_b9 = 60,
  vitamin_b12 = 0.85,
  vitamin_c = 12.0,
  omega3_100 = 0.10,
  omega6_100 = 0.35,
  cholesterol = 8,
  is_fermented = false,
  is_raw = false
WHERE id = 'ed463132-c4a4-4023-9630-1cd37b61f328';

-- 4. Флэт уайт (150 мл молока 3,5% + espresso)
-- Base: whole milk 3.5% fat
UPDATE shared_products SET
  iron = 0.03,
  magnesium = 18,
  zinc = 0.53,
  selenium = 5.1,
  calcium = 165,
  phosphorus = 123,
  potassium = 208,
  vitamin_a = 52,
  vitamin_d = 1.9,
  vitamin_e = 0.10,
  vitamin_k = 0.4,
  vitamin_b1 = 0.056,
  vitamin_b2 = 0.247,
  vitamin_b3 = 0.130,
  vitamin_b6 = 0.053,
  vitamin_b9 = 7,
  vitamin_b12 = 0.66,
  vitamin_c = 0,
  omega3_100 = 0.11,
  omega6_100 = 0.17,
  cholesterol = 17,
  is_fermented = false,
  is_raw = false
WHERE id = 'cfb26d08-3b12-4347-95b0-af57ad22b018';

-- 5. Chika Layers арахис карамель (Protein bar approximation - NOVA 4)
-- Processed protein bar with nuts
UPDATE shared_products SET
  iron = 2.10,
  magnesium = 65,
  zinc = 2.00,
  selenium = 12.0,
  calcium = 110,
  phosphorus = 180,
  potassium = 280,
  vitamin_a = 15,
  vitamin_d = 0.8,
  vitamin_e = 2.50,
  vitamin_k = 2.0,
  vitamin_b1 = 0.180,
  vitamin_b2 = 0.210,
  vitamin_b3 = 3.500,
  vitamin_b6 = 0.310,
  vitamin_b9 = 45,
  vitamin_b12 = 0.60,
  vitamin_c = 0,
  omega3_100 = 0.05,
  omega6_100 = 3.80,
  cholesterol = 5,
  is_fermented = false,
  is_raw = false
WHERE id = '4e5f8a44-6863-4b4c-b1fb-bfe23a7b1567';

COMMIT;

-- Verification
SELECT 
  substring(name, 1, 45) as name,
  CASE WHEN cholesterol IS NOT NULL AND iron IS NOT NULL THEN '✅' ELSE '❌' END as ok,
  cholesterol,
  category
FROM shared_products 
WHERE id IN (
  '0d764e7f-a46d-4e2f-9f67-51bcf6afd5fe',
  '0c04c07d-9e8a-40e0-93e9-5ec72528f10c',
  'ed463132-c4a4-4023-9630-1cd37b61f328',
  'cfb26d08-3b12-4347-95b0-af57ad22b018',
  '4e5f8a44-6863-4b4c-b1fb-bfe23a7b1567'
)
ORDER BY name;
