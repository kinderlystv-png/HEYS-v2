-- Batch UPDATE #8 - 10 diverse products with USDA data
-- Generated: 2026-02-11
-- Source: USDA FoodData Central

BEGIN;

-- 1. Томаты в собственном соку (Tomatoes, canned - USDA #170560)
UPDATE shared_products SET
  iron = 0.57,
  magnesium = 11,
  zinc = 0.17,
  selenium = 0.4,
  calcium = 10,
  phosphorus = 24,
  potassium = 218,
  vitamin_a = 36,
  vitamin_d = 0,
  vitamin_e = 0.66,
  vitamin_k = 3.8,
  vitamin_b1 = 0.036,
  vitamin_b2 = 0.040,
  vitamin_b3 = 0.641,
  vitamin_b6 = 0.082,
  vitamin_b9 = 9,
  vitamin_b12 = 0,
  vitamin_c = 9.7,
  omega3_100 = 0.002,
  omega6_100 = 0.07,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = 'e49de476-59b8-4ee9-a789-5f2c7c17e648';

-- 2. Снежный краб (Snow crab, cooked - USDA #175180)
UPDATE shared_products SET
  iron = 0.52,
  magnesium = 59,
  zinc = 7.62,
  selenium = 51.0,
  calcium = 59,
  phosphorus = 238,
  potassium = 181,
  vitamin_a = 9,
  vitamin_d = 0,
  vitamin_e = 2.04,
  vitamin_k = 0.2,
  vitamin_b1 = 0.060,
  vitamin_b2 = 0.080,
  vitamin_b3 = 2.05,
  vitamin_b6 = 0.154,
  vitamin_b9 = 42,
  vitamin_b12 = 10.38,
  vitamin_c = 7.6,
  omega3_100 = 0.35,
  omega6_100 = 0.02,
  cholesterol = 55,
  is_fermented = false,
  is_raw = false
WHERE id = '128dd9e1-107b-4514-b06e-385204885443';

-- 3. Куриная голень на мангале (Chicken drumstick, grilled - USDA #174502)
UPDATE shared_products SET
  iron = 1.05,
  magnesium = 20,
  zinc = 2.55,
  selenium = 19.5,
  calcium = 11,
  phosphorus = 180,
  potassium = 230,
  vitamin_a = 16,
  vitamin_d = 0.1,
  vitamin_e = 0.20,
  vitamin_k = 2.5,
  vitamin_b1 = 0.070,
  vitamin_b2 = 0.180,
  vitamin_b3 = 5.80,
  vitamin_b6 = 0.310,
  vitamin_b9 = 6,
  vitamin_b12 = 0.34,
  vitamin_c = 0,
  omega3_100 = 0.06,
  omega6_100 = 1.20,
  cholesterol = 93,
  is_fermented = false,
  is_raw = false
WHERE id = '537d0c5e-6adc-4611-9bd1-06e695129a52';

-- 4. Сахар белый (Sugar, granulated - USDA #169655)
UPDATE shared_products SET
  iron = 0.01,
  magnesium = 0,
  zinc = 0.01,
  selenium = 0.6,
  calcium = 1,
  phosphorus = 0,
  potassium = 2,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 0,
  vitamin_k = 0,
  vitamin_b1 = 0,
  vitamin_b2 = 0.019,
  vitamin_b3 = 0,
  vitamin_b6 = 0,
  vitamin_b9 = 0,
  vitamin_b12 = 0,
  vitamin_c = 0,
  omega3_100 = 0,
  omega6_100 = 0,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = 'ca3b3129-e624-4e7b-8286-7e11fd9b8bd2';

-- 5. Напиток соевый с фисташкой и кешью (Soy milk with nuts - approximation)
UPDATE shared_products SET
  iron = 0.85,
  magnesium = 45,
  zinc = 0.70,
  selenium = 4.5,
  calcium = 25,
  phosphorus = 120,
  potassium = 180,
  vitamin_a = 8,
  vitamin_d = 2.0,
  vitamin_e = 1.80,
  vitamin_k = 1.5,
  vitamin_b1 = 0.150,
  vitamin_b2 = 0.110,
  vitamin_b3 = 0.850,
  vitamin_b6 = 0.090,
  vitamin_b9 = 22,
  vitamin_b12 = 1.20,
  vitamin_c = 0,
  omega3_100 = 0.15,
  omega6_100 = 2.50,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = 'c0db955f-3d3a-4ce0-a03e-cc2ec3741f01';

-- 6. Томатный соус Arrabbiata (Tomato pasta sauce, spicy - USDA #170584)
UPDATE shared_products SET
  iron = 0.85,
  magnesium = 18,
  zinc = 0.25,
  selenium = 0.8,
  calcium = 22,
  phosphorus = 32,
  potassium = 320,
  vitamin_a = 45,
  vitamin_d = 0,
  vitamin_e = 1.80,
  vitamin_k = 5.5,
  vitamin_b1 = 0.045,
  vitamin_b2 = 0.055,
  vitamin_b3 = 1.15,
  vitamin_b6 = 0.120,
  vitamin_b9 = 12,
  vitamin_b12 = 0,
  vitamin_c = 8.5,
  omega3_100 = 0.05,
  omega6_100 = 0.85,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = 'f5053710-01ce-4c5b-b436-45b13e7da42c';

-- 7. Картофель жареный на костре (Potato, grilled - USDA #170032)
UPDATE shared_products SET
  iron = 0.78,
  magnesium = 23,
  zinc = 0.30,
  selenium = 0.4,
  calcium = 8,
  phosphorus = 56,
  potassium = 379,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 0.01,
  vitamin_k = 2.2,
  vitamin_b1 = 0.080,
  vitamin_b2 = 0.032,
  vitamin_b3 = 1.44,
  vitamin_b6 = 0.298,
  vitamin_b9 = 10,
  vitamin_b12 = 0,
  vitamin_c = 12.6,
  omega3_100 = 0.01,
  omega6_100 = 0.05,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = 'f3f59c8a-9bc8-4133-b160-b4200bfacf2d';

-- 8. Сосиски «Вязанка Сливочные» (Frankfurter/Sausage - USDA #174582)
UPDATE shared_products SET
  iron = 1.50,
  magnesium = 13,
  zinc = 2.10,
  selenium = 15.8,
  calcium = 11,
  phosphorus = 100,
  potassium = 180,
  vitamin_a = 0,
  vitamin_d = 0.4,
  vitamin_e = 0.20,
  vitamin_k = 1.8,
  vitamin_b1 = 0.240,
  vitamin_b2 = 0.150,
  vitamin_b3 = 2.80,
  vitamin_b6 = 0.120,
  vitamin_b9 = 2,
  vitamin_b12 = 1.20,
  vitamin_c = 0,
  omega3_100 = 0.08,
  omega6_100 = 2.20,
  cholesterol = 60,
  is_fermented = false,
  is_raw = false
WHERE id = '0d389499-e882-4a60-85a3-56d92d359667';

-- 9. Капуста тушёная в томате (Cabbage, braised with tomato - approximation)
UPDATE shared_products SET
  iron = 0.55,
  magnesium = 15,
  zinc = 0.20,
  selenium = 0.5,
  calcium = 45,
  phosphorus = 28,
  potassium = 195,
  vitamin_a = 28,
  vitamin_d = 0,
  vitamin_e = 0.40,
  vitamin_k = 65.0,
  vitamin_b1 = 0.050,
  vitamin_b2 = 0.045,
  vitamin_b3 = 0.380,
  vitamin_b6 = 0.150,
  vitamin_b9 = 18,
  vitamin_b12 = 0,
  vitamin_c = 32.5,
  omega3_100 = 0.02,
  omega6_100 = 0.08,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '245954a6-c613-4562-80eb-9cc2c55cf0a1';

-- 10. Лосось-ролл с творожным сыром (Salmon roll - approximation: 50% salmon + 40% rice + 10% cream cheese)
UPDATE shared_products SET
  iron = 0.65,
  magnesium = 22,
  zinc = 0.55,
  selenium = 20.5,
  calcium = 18,
  phosphorus = 165,
  potassium = 240,
  vitamin_a = 35,
  vitamin_d = 5.5,
  vitamin_e = 0.90,
  vitamin_k = 0.8,
  vitamin_b1 = 0.095,
  vitamin_b2 = 0.145,
  vitamin_b3 = 4.80,
  vitamin_b6 = 0.320,
  vitamin_b9 = 15,
  vitamin_b12 = 1.85,
  vitamin_c = 0,
  omega3_100 = 0.85,
  omega6_100 = 0.55,
  cholesterol = 38,
  is_fermented = false,
  is_raw = false
WHERE id = '1c77955c-d0c0-45db-8328-10ef38b5eff9';

COMMIT;

-- Verification
SELECT 
  name,
  CASE 
    WHEN cholesterol IS NOT NULL AND iron IS NOT NULL
    THEN '✅'
    ELSE '❌'
  END as ok,
  cholesterol,
  vitamin_c
FROM shared_products 
WHERE id IN (
  'e49de476-59b8-4ee9-a789-5f2c7c17e648',
  '128dd9e1-107b-4514-b06e-385204885443',
  '537d0c5e-6adc-4611-9bd1-06e695129a52',
  'ca3b3129-e624-4e7b-8286-7e11fd9b8bd2',
  'c0db955f-3d3a-4ce0-a03e-cc2ec3741f01',
  'f5053710-01ce-4c5b-b436-45b13e7da42c',
  'f3f59c8a-9bc8-4133-b160-b4200bfacf2d',
  '0d389499-e882-4a60-85a3-56d92d359667',
  '245954a6-c613-4562-80eb-9cc2c55cf0a1',
  '1c77955c-d0c0-45db-8328-10ef38b5eff9'
)
ORDER BY name;
