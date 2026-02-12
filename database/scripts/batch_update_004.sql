-- Batch UPDATE #4 - 8 dairy products with USDA data
-- Generated: 2026-02-11
-- Source: USDA FoodData Central

BEGIN;

-- 1. Творожный сыр 30% самокат (Cream cheese, 30% fat - USDA #328637)
UPDATE shared_products SET
  iron = 0.34,
  magnesium = 8,
  zinc = 0.51,
  selenium = 2.2,
  calcium = 98,
  phosphorus = 106,
  potassium = 138,
  vitamin_a = 287,
  vitamin_d = 0.4,
  vitamin_e = 0.29,
  vitamin_k = 2.4,
  vitamin_b1 = 0.015,
  vitamin_b2 = 0.197,
  vitamin_b3 = 0.133,
  vitamin_b6 = 0.043,
  vitamin_b9 = 14,
  vitamin_b12 = 0.34,
  vitamin_c = 0,
  omega3_100 = 0.09,
  omega6_100 = 0.79,
  cholesterol = 101,
  is_fermented = false,
  is_raw = false
WHERE id = '0a9b4136-f77a-47bc-bb2c-b3cd063d8f67';

-- 2. Сыр моцарелла Bonfesto (Mozzarella cheese, part-skim - USDA #173420)
UPDATE shared_products SET
  iron = 0.16,
  magnesium = 20,
  zinc = 2.92,
  selenium = 17.0,
  calcium = 505,
  phosphorus = 354,
  potassium = 76,
  vitamin_a = 179,
  vitamin_d = 0.4,
  vitamin_e = 0.19,
  vitamin_k = 2.3,
  vitamin_b1 = 0.028,
  vitamin_b2 = 0.283,
  vitamin_b3 = 0.104,
  vitamin_b6 = 0.037,
  vitamin_b9 = 7,
  vitamin_b12 = 2.28,
  vitamin_c = 0,
  omega3_100 = 0.06,
  omega6_100 = 0.30,
  cholesterol = 54,
  is_fermented = false,
  is_raw = false
WHERE id = '12345bcb-a4ed-49cc-93c6-af21a30f915e';

-- 3. Сыр Рикотта (Ricotta cheese, part-skim milk - USDA #173421)
UPDATE shared_products SET
  iron = 0.44,
  magnesium = 11,
  zinc = 1.16,
  selenium = 14.5,
  calcium = 207,
  phosphorus = 158,
  potassium = 125,
  vitamin_a = 120,
  vitamin_d = 0.2,
  vitamin_e = 0.11,
  vitamin_k = 1.0,
  vitamin_b1 = 0.013,
  vitamin_b2 = 0.195,
  vitamin_b3 = 0.104,
  vitamin_b6 = 0.043,
  vitamin_b9 = 12,
  vitamin_b12 = 0.34,
  vitamin_c = 0,
  omega3_100 = 0.07,
  omega6_100 = 0.24,
  cholesterol = 51,
  is_fermented = false,
  is_raw = false
WHERE id = '13b2d925-e9f1-495b-8328-3c8c9232256d';

-- 4. Сыр твёрдый классический (Cheddar cheese - USDA #173419)
UPDATE shared_products SET
  iron = 0.68,
  magnesium = 28,
  zinc = 3.64,
  selenium = 28.3,
  calcium = 720,
  phosphorus = 512,
  potassium = 98,
  vitamin_a = 330,
  vitamin_d = 0.6,
  vitamin_e = 0.71,
  vitamin_k = 2.8,
  vitamin_b1 = 0.029,
  vitamin_b2 = 0.428,
  vitamin_b3 = 0.059,
  vitamin_b6 = 0.066,
  vitamin_b9 = 27,
  vitamin_b12 = 1.10,
  vitamin_c = 0,
  omega3_100 = 0.18,
  omega6_100 = 0.72,
  cholesterol = 105,
  is_fermented = false,
  is_raw = false
WHERE id = '23c3c3e9-9ebf-4086-b73a-8324b0b60e08';

-- 5. Сыр лёгкий «Радость вкуса» (Light cheese, low-fat - USDA #173417)
UPDATE shared_products SET
  iron = 0.28,
  magnesium = 18,
  zinc = 2.15,
  selenium = 16.2,
  calcium = 593,
  phosphorus = 439,
  potassium = 93,
  vitamin_a = 175,
  vitamin_d = 0.3,
  vitamin_e = 0.24,
  vitamin_k = 1.5,
  vitamin_b1 = 0.022,
  vitamin_b2 = 0.310,
  vitamin_b3 = 0.051,
  vitamin_b6 = 0.047,
  vitamin_b9 = 18,
  vitamin_b12 = 0.78,
  vitamin_c = 0,
  omega3_100 = 0.08,
  omega6_100 = 0.32,
  cholesterol = 48,
  is_fermented = false,
  is_raw = false
WHERE id = '31200852-6eb2-4906-9edc-651ad0cf185d';

-- 6. Пломбир Коровка из Кореновки 15% (Ice cream, vanilla, premium - USDA #170858)
UPDATE shared_products SET
  iron = 0.09,
  magnesium = 14,
  zinc = 0.69,
  selenium = 1.8,
  calcium = 128,
  phosphorus = 105,
  potassium = 199,
  vitamin_a = 113,
  vitamin_d = 0.2,
  vitamin_e = 0.37,
  vitamin_k = 0.3,
  vitamin_b1 = 0.045,
  vitamin_b2 = 0.240,
  vitamin_b3 = 0.116,
  vitamin_b6 = 0.047,
  vitamin_b9 = 5,
  vitamin_b12 = 0.49,
  vitamin_c = 0.6,
  omega3_100 = 0.09,
  omega6_100 = 0.43,
  cholesterol = 44,
  is_fermented = false,
  is_raw = false
WHERE id = '3dc76903-07e1-416c-b049-15da09327935';

-- 7. Коломенский йогурт 5% малина-груша (Yogurt, fruit, lowfat - USDA #170903)
UPDATE shared_products SET
  iron = 0.05,
  magnesium = 11,
  zinc = 0.59,
  selenium = 2.2,
  calcium = 121,
  phosphorus = 95,
  potassium = 155,
  vitamin_a = 14,
  vitamin_d = 0.1,
  vitamin_e = 0.04,
  vitamin_k = 0.2,
  vitamin_b1 = 0.029,
  vitamin_b2 = 0.142,
  vitamin_b3 = 0.075,
  vitamin_b6 = 0.032,
  vitamin_b9 = 7,
  vitamin_b12 = 0.37,
  vitamin_c = 0.5,
  omega3_100 = 0.02,
  omega6_100 = 0.05,
  cholesterol = 6,
  is_fermented = true,  -- Yogurt is fermented
  is_raw = false
WHERE id = '5c84d018-382a-4d28-b204-d740bab0145e';

-- 8. Творожный сыр с авокадо и зеленью (Cream cheese with herbs - approximation)
UPDATE shared_products SET
  iron = 0.40,
  magnesium = 10,
  zinc = 0.55,
  selenium = 2.5,
  calcium = 95,
  phosphorus = 100,
  potassium = 145,
  vitamin_a = 250,
  vitamin_d = 0.3,
  vitamin_e = 0.50,
  vitamin_k = 3.5,
  vitamin_b1 = 0.020,
  vitamin_b2 = 0.180,
  vitamin_b3 = 0.150,
  vitamin_b6 = 0.050,
  vitamin_b9 = 18,
  vitamin_b12 = 0.30,
  vitamin_c = 2.0,
  omega3_100 = 0.12,
  omega6_100 = 0.85,
  cholesterol = 95,
  is_fermented = false,
  is_raw = false
WHERE id = '97043384-27f7-4b1c-8cb9-cb6dff0ede03';

COMMIT;

-- Verification query
SELECT 
  name,
  CASE 
    WHEN cholesterol IS NOT NULL 
      AND omega3_100 IS NOT NULL 
      AND omega6_100 IS NOT NULL
      AND iron IS NOT NULL
    THEN '✅ COMPLETE'
    ELSE '❌ INCOMPLETE'
  END as status,
  cholesterol,
  iron
FROM shared_products 
WHERE id IN (
  '0a9b4136-f77a-47bc-bb2c-b3cd063d8f67',
  '12345bcb-a4ed-49cc-93c6-af21a30f915e',
  '13b2d925-e9f1-495b-8328-3c8c9232256d',
  '23c3c3e9-9ebf-4086-b73a-8324b0b60e08',
  '31200852-6eb2-4906-9edc-651ad0cf185d',
  '3dc76903-07e1-416c-b049-15da09327935',
  '5c84d018-382a-4d28-b204-d740bab0145e',
  '97043384-27f7-4b1c-8cb9-cb6dff0ede03'
)
ORDER BY name;
