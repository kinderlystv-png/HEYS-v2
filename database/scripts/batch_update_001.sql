-- Batch UPDATE #1 - 6 simple products with USDA data
-- Generated: 2026-02-11
-- Source: USDA FoodData Central

BEGIN;

-- 1. Яйцо отварное (Egg, whole, cooked, hard-boiled - USDA #748967)
UPDATE shared_products SET
  iron = 1.19,
  magnesium = 10,
  zinc = 1.05,
  selenium = 30.8,
  calcium = 50,
  phosphorus = 172,
  potassium = 126,
  vitamin_a = 149,
  vitamin_d = 1.1,
  vitamin_e = 1.03,
  vitamin_k = 0.3,
  vitamin_b1 = 0.066,
  vitamin_b2 = 0.513,
  vitamin_b3 = 0.064,
  vitamin_b6 = 0.121,
  vitamin_b9 = 44,
  vitamin_b12 = 1.11,
  vitamin_c = 0,
  omega3_100 = 0.04,
  omega6_100 = 1.41,
  cholesterol = 373,
  is_fermented = false,
  is_raw = false
WHERE id = '0771599a-71f5-463d-b7f5-3741adb3cdc7';

-- 2. Сгущённое молоко (Milk, condensed, sweetened - USDA #749861)
UPDATE shared_products SET
  iron = 0.17,
  magnesium = 19,
  zinc = 0.73,
  selenium = 2.6,
  calcium = 216,
  phosphorus = 166,
  potassium = 267,
  vitamin_a = 96,
  vitamin_d = 0.3,
  vitamin_e = 0.19,
  vitamin_k = 0.5,
  vitamin_b1 = 0.069,
  vitamin_b2 = 0.342,
  vitamin_b3 = 0.189,
  vitamin_b6 = 0.046,
  vitamin_b9 = 8,
  vitamin_b12 = 0.37,
  vitamin_c = 2.0,
  omega3_100 = 0.06,
  omega6_100 = 0.24,
  cholesterol = 26,
  is_fermented = false,
  is_raw = false
WHERE id = '1504afca-72c0-4110-9144-78a34ef67511';

-- 3. Творог Простоквашино 2% (Cottage cheese, lowfat, 2% milkfat - USDA #328637)
UPDATE shared_products SET
  iron = 0.14,
  magnesium = 8,
  zinc = 0.47,
  selenium = 9.7,
  calcium = 91,
  phosphorus = 159,
  potassium = 137,
  vitamin_a = 22,
  vitamin_d = 0.4,
  vitamin_e = 0.01,
  vitamin_k = 0.1,
  vitamin_b1 = 0.027,
  vitamin_b2 = 0.163,
  vitamin_b3 = 0.099,
  vitamin_b6 = 0.046,
  vitamin_b9 = 12,
  vitamin_b12 = 0.43,
  vitamin_c = 0,
  omega3_100 = 0.02,
  omega6_100 = 0.07,
  cholesterol = 9,
  is_fermented = true,  -- Cottage cheese is fermented
  is_raw = false
WHERE id = '18ec3571-68c1-48a3-89d1-2abc20c99516';

-- 4. Говяжий антрекот на мангале (Beef, ribeye steak, grilled - USDA #174032)
UPDATE shared_products SET
  iron = 2.4,
  magnesium = 23,
  zinc = 5.7,
  selenium = 27.6,
  calcium = 13,
  phosphorus = 184,
  potassium = 302,
  vitamin_a = 5,
  vitamin_d = 0.3,
  vitamin_e = 0.28,
  vitamin_k = 1.5,
  vitamin_b1 = 0.063,
  vitamin_b2 = 0.212,
  vitamin_b3 = 5.78,
  vitamin_b6 = 0.55,
  vitamin_b9 = 7,
  vitamin_b12 = 2.18,
  vitamin_c = 0,
  omega3_100 = 0.03,
  omega6_100 = 0.47,
  cholesterol = 78,
  is_fermented = false,
  is_raw = false
WHERE id = '25313728-9a60-4a9b-99b9-ce6d36387548';

-- 5. Банан (Banana, raw - USDA #173944)
UPDATE shared_products SET
  iron = 0.26,
  magnesium = 27,
  zinc = 0.15,
  selenium = 1.0,
  calcium = 5,
  phosphorus = 22,
  potassium = 358,
  vitamin_a = 3,
  vitamin_d = 0,
  vitamin_e = 0.10,
  vitamin_k = 0.5,
  vitamin_b1 = 0.031,
  vitamin_b2 = 0.073,
  vitamin_b3 = 0.665,
  vitamin_b6 = 0.367,
  vitamin_b9 = 20,
  vitamin_b12 = 0,
  vitamin_c = 8.7,
  omega3_100 = 0.03,
  omega6_100 = 0.05,
  cholesterol = 0,
  is_fermented = false,
  is_raw = true  -- Raw fruit
WHERE id = '3f654aa9-5509-47fa-aa32-02fc44f662b6';

-- 6. Брокколи на пару (Broccoli, cooked, steamed - USDA #170393)
UPDATE shared_products SET
  iron = 0.67,
  magnesium = 21,
  zinc = 0.45,
  selenium = 2.3,
  calcium = 40,
  phosphorus = 67,
  potassium = 293,
  vitamin_a = 77,
  vitamin_d = 0,
  vitamin_e = 1.45,
  vitamin_k = 141.1,
  vitamin_b1 = 0.063,
  vitamin_b2 = 0.123,
  vitamin_b3 = 0.553,
  vitamin_b6 = 0.200,
  vitamin_b9 = 108,
  vitamin_b12 = 0,
  vitamin_c = 64.9,
  omega3_100 = 0.13,
  omega6_100 = 0.08,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '428f828d-6c8c-44db-b10e-d5567e0761f8';

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
  omega3_100,
  omega6_100
FROM shared_products 
WHERE id IN (
  '0771599a-71f5-463d-b7f5-3741adb3cdc7',
  '1504afca-72c0-4110-9144-78a34ef67511',
  '18ec3571-68c1-48a3-89d1-2abc20c99516',
  '25313728-9a60-4a9b-99b9-ce6d36387548',
  '3f654aa9-5509-47fa-aa32-02fc44f662b6',
  '428f828d-6c8c-44db-b10e-d5567e0761f8'
);
