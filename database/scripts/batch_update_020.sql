-- Batch UPDATE #20 - 5 products
-- Generated: 2026-02-12
-- Source: USDA FoodData Central + best-fit approximations

BEGIN;

-- 1. Творожный сыр 60% (Cream cheese 60% fat - USDA #1017)
UPDATE shared_products SET
  iron = 0.38,
  magnesium = 6,
  zinc = 0.51,
  selenium = 2.8,
  calcium = 98,
  phosphorus = 95,
  potassium = 119,
  vitamin_a = 365,
  vitamin_d = 0.2,
  vitamin_e = 0.29,
  vitamin_k = 2.4,
  vitamin_b1 = 0.015,
  vitamin_b2 = 0.182,
  vitamin_b3 = 0.120,
  vitamin_b6 = 0.043,
  vitamin_b9 = 14,
  vitamin_b12 = 0.27,
  vitamin_c = 0,
  omega3_100 = 0.13,
  omega6_100 = 0.94,
  cholesterol = 110,
  is_fermented = false,
  is_raw = false
WHERE id = 'ce509fc1-2ae1-4e85-9f6e-ede05b15ef91';

-- 2. Гавайский микс (Hawaiian mix - rice & vegetables approximation)
-- Weighted: 40% rice + 30% pineapple + 20% bell pepper + 10% onion
UPDATE shared_products SET
  iron = 0.80,
  magnesium = 28,
  zinc = 0.65,
  selenium = 8.5,
  calcium = 18,
  phosphorus = 85,
  potassium = 180,
  vitamin_a = 25,
  vitamin_d = 0,
  vitamin_e = 0.35,
  vitamin_k = 2.5,
  vitamin_b1 = 0.120,
  vitamin_b2 = 0.035,
  vitamin_b3 = 1.850,
  vitamin_b6 = 0.185,
  vitamin_b9 = 12,
  vitamin_b12 = 0,
  vitamin_c = 28.0,
  omega3_100 = 0.02,
  omega6_100 = 0.18,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '7cca9ede-26cf-4ae2-bb0f-7b5cce63d6ff';

-- 3. Икра рыбная (Fish roe, mixed species - USDA #15095)
UPDATE shared_products SET
  iron = 1.44,
  magnesium = 300,
  zinc = 0.95,
  selenium = 65.5,
  calcium = 275,
  phosphorus = 415,
  potassium = 181,
  vitamin_a = 146,
  vitamin_d = 5.9,
  vitamin_e = 7.00,
  vitamin_k = 0.3,
  vitamin_b1 = 0.190,
  vitamin_b2 = 0.620,
  vitamin_b3 = 0.020,
  vitamin_b6 = 0.320,
  vitamin_b9 = 50,
  vitamin_b12 = 20.00,
  vitamin_c = 16.0,
  omega3_100 = 6.80,
  omega6_100 = 0.22,
  cholesterol = 374,
  is_fermented = false,
  is_raw = true
WHERE id = 'e99b9506-5af1-42dc-b45c-ba1aa4f2ee4b';

-- 4. Горбуша копченая (Smoked pink salmon - USDA #175141)
UPDATE shared_products SET
  iron = 0.85,
  magnesium = 29,
  zinc = 0.82,
  selenium = 42.5,
  calcium = 11,
  phosphorus = 289,
  potassium = 431,
  vitamin_a = 42,
  vitamin_d = 11.1,
  vitamin_e = 1.01,
  vitamin_k = 0.1,
  vitamin_b1 = 0.026,
  vitamin_b2 = 0.114,
  vitamin_b3 = 8.675,
  vitamin_b6 = 0.350,
  vitamin_b9 = 5,
  vitamin_b12 = 3.26,
  vitamin_c = 0,
  omega3_100 = 1.85,
  omega6_100 = 0.35,
  cholesterol = 23,
  is_fermented = false,
  is_raw = false
WHERE id = '18e1e02e-8d25-4c6f-a7e4-e21f1c0ce29b';

-- 5. Грудка копченая куриная (Smoked chicken breast - USDA #172857)
UPDATE shared_products SET
  iron = 0.76,
  magnesium = 28,
  zinc = 0.91,
  selenium = 24.8,
  calcium = 13,
  phosphorus = 246,
  potassium = 292,
  vitamin_a = 15,
  vitamin_d = 0.1,
  vitamin_e = 0.18,
  vitamin_k = 0.7,
  vitamin_b1 = 0.068,
  vitamin_b2 = 0.118,
  vitamin_b3 = 13.712,
  vitamin_b6 = 0.600,
  vitamin_b9 = 4,
  vitamin_b12 = 0.34,
  vitamin_c = 0,
  omega3_100 = 0.04,
  omega6_100 = 0.63,
  cholesterol = 70,
  is_fermented = false,
  is_raw = false
WHERE id = '8a5c84f9-bcd5-4b9d-b1b6-1b4c3e2c73bc';

COMMIT;

-- Verification
SELECT 
  substring(name, 1, 45) as name,
  CASE WHEN cholesterol IS NOT NULL AND iron IS NOT NULL THEN '✅' ELSE '❌' END as ok,
  cholesterol,
  CASE WHEN omega3_100 > 1 THEN 'High Ω3' ELSE '' END as omega3_note
FROM shared_products 
WHERE id IN (
  'ce509fc1-2ae1-4e85-9f6e-ede05b15ef91',
  '7cca9ede-26cf-4ae2-bb0f-7b5cce63d6ff',
  'e99b9506-5af1-42dc-b45c-ba1aa4f2ee4b',
  '18e1e02e-8d25-4c6f-a7e4-e21f1c0ce29b',
  '8a5c84f9-bcd5-4b9d-b1b6-1b4c3e2c73bc'
)
ORDER BY name;
