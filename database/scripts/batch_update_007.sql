-- Batch UPDATE #7 - 8 mixed products with USDA data
-- Generated: 2026-02-11
-- Source: USDA FoodData Central

BEGIN;

-- 1. Миндаль сушёный (Almonds, dried - USDA #170567)
UPDATE shared_products SET
  iron = 3.71,
  magnesium = 270,
  zinc = 3.12,
  selenium = 4.1,
  calcium = 269,
  phosphorus = 481,
  potassium = 733,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 25.63,
  vitamin_k = 0,
  vitamin_b1 = 0.205,
  vitamin_b2 = 1.138,
  vitamin_b3 = 3.618,
  vitamin_b6 = 0.137,
  vitamin_b9 = 44,
  vitamin_b12 = 0,
  vitamin_c = 0,
  omega3_100 = 0.003,
  omega6_100 = 12.32,
  cholesterol = 0,
  is_fermented = false,
  is_raw = true  -- Raw nuts
WHERE id = '2387a5d2-f7a2-43f1-b022-bee3bdddb0f2';

-- 2. Ветчина из индейки (Turkey ham/breast - USDA #174380)
UPDATE shared_products SET
  iron = 1.23,
  magnesium = 28,
  zinc = 1.98,
  selenium = 30.8,
  calcium = 6,
  phosphorus = 235,
  potassium = 280,
  vitamin_a = 0,
  vitamin_d = 0.2,
  vitamin_e = 0.15,
  vitamin_k = 0.1,
  vitamin_b1 = 0.040,
  vitamin_b2 = 0.130,
  vitamin_b3 = 10.12,
  vitamin_b6 = 0.470,
  vitamin_b9 = 5,
  vitamin_b12 = 0.33,
  vitamin_c = 0,
  omega3_100 = 0.02,
  omega6_100 = 0.25,
  cholesterol = 45,
  is_fermented = false,
  is_raw = false
WHERE id = '3de7e50d-54d6-4a2b-8539-32a2ba9e0405';

-- 3. Треугольники лососевые в панировке (Salmon patties/cakes, breaded - approximation based on salmon + breading)
UPDATE shared_products SET
  iron = 0.85,
  magnesium = 25,
  zinc = 0.65,
  selenium = 28.5,
  calcium = 15,
  phosphorus = 210,
  potassium = 320,
  vitamin_a = 35,
  vitamin_d = 9.5,
  vitamin_e = 1.20,
  vitamin_k = 0.5,
  vitamin_b1 = 0.150,
  vitamin_b2 = 0.180,
  vitamin_b3 = 7.50,
  vitamin_b6 = 0.480,
  vitamin_b9 = 18,
  vitamin_b12 = 2.60,
  vitamin_c = 0,
  omega3_100 = 1.50,
  omega6_100 = 0.90,
  cholesterol = 55,
  is_fermented = false,
  is_raw = false
WHERE id = '35e0addf-653f-4de3-835d-ef391a3c2a71';

-- 4. Яблоки запечённые (Apples, baked - USDA #169908)
UPDATE shared_products SET
  iron = 0.12,
  magnesium = 5,
  zinc = 0.04,
  selenium = 0,
  calcium = 6,
  phosphorus = 11,
  potassium = 107,
  vitamin_a = 3,
  vitamin_d = 0,
  vitamin_e = 0.18,
  vitamin_k = 2.2,
  vitamin_b1 = 0.017,
  vitamin_b2 = 0.026,
  vitamin_b3 = 0.091,
  vitamin_b6 = 0.041,
  vitamin_b9 = 3,
  vitamin_b12 = 0,
  vitamin_c = 4.6,
  omega3_100 = 0.01,
  omega6_100 = 0.04,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = 'afb036be-42ee-4301-87f6-52fcdfee74ef';

-- 5. Отруби овсяные (Oat bran, raw - USDA #168883)
UPDATE shared_products SET
  iron = 5.41,
  magnesium = 235,
  zinc = 3.11,
  selenium = 45.2,
  calcium = 58,
  phosphorus = 734,
  potassium = 566,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 1.18,
  vitamin_k = 3.2,
  vitamin_b1 = 1.170,
  vitamin_b2 = 0.220,
  vitamin_b3 = 0.934,
  vitamin_b6 = 0.165,
  vitamin_b9 = 52,
  vitamin_b12 = 0,
  vitamin_c = 0,
  omega3_100 = 0.11,
  omega6_100 = 2.96,
  cholesterol = 0,
  is_fermented = false,
  is_raw = true  -- Raw bran
WHERE id = '83a19c27-69fa-426f-a8ce-26929d7eb3f2';

-- 6. Молочный коктейль Neo High Protein карамель-латте (Protein shake, milk-based - approximation)
UPDATE shared_products SET
  iron = 0.80,
  magnesium = 35,
  zinc = 1.20,
  selenium = 8.5,
  calcium = 180,
  phosphorus = 220,
  potassium = 320,
  vitamin_a = 85,
  vitamin_d = 1.8,
  vitamin_e = 0.85,
  vitamin_k = 0.5,
  vitamin_b1 = 0.180,
  vitamin_b2 = 0.420,
  vitamin_b3 = 2.50,
  vitamin_b6 = 0.210,
  vitamin_b9 = 28,
  vitamin_b12 = 1.20,
  vitamin_c = 12.0,
  omega3_100 = 0.08,
  omega6_100 = 0.18,
  cholesterol = 12,
  is_fermented = false,
  is_raw = false
WHERE id = 'a7c922be-f452-433d-a241-0f0aea77ac1d';

-- 7. Молочный коктейль Neo High Protein шоколад (Protein shake, chocolate - approximation)
UPDATE shared_products SET
  iron = 1.20,
  magnesium = 42,
  zinc = 1.35,
  selenium = 9.0,
  calcium = 190,
  phosphorus = 235,
  potassium = 340,
  vitamin_a = 80,
  vitamin_d = 1.8,
  vitamin_e = 0.90,
  vitamin_k = 0.5,
  vitamin_b1 = 0.190,
  vitamin_b2 = 0.450,
  vitamin_b3 = 2.70,
  vitamin_b6 = 0.220,
  vitamin_b9 = 30,
  vitamin_b12 = 1.25,
  vitamin_c = 10.0,
  omega3_100 = 0.09,
  omega6_100 = 0.20,
  cholesterol = 13,
  is_fermented = false,
  is_raw = false
WHERE id = '49147214-8a0c-4e06-9e7e-b7f721afba49';

-- 8. Мороженое ванильное Самокат без сахара (Sugar-free vanilla ice cream - approximation)
UPDATE shared_products SET
  iron = 0.08,
  magnesium = 12,
  zinc = 0.60,
  selenium = 1.5,
  calcium = 115,
  phosphorus = 95,
  potassium = 180,
  vitamin_a = 90,
  vitamin_d = 0.2,
  vitamin_e = 0.25,
  vitamin_k = 0.2,
  vitamin_b1 = 0.035,
  vitamin_b2 = 0.210,
  vitamin_b3 = 0.095,
  vitamin_b6 = 0.038,
  vitamin_b9 = 4,
  vitamin_b12 = 0.40,
  vitamin_c = 0.4,
  omega3_100 = 0.06,
  omega6_100 = 0.30,
  cholesterol = 35,
  is_fermented = false,
  is_raw = false
WHERE id = '67ed3eda-8cc6-4541-a9c3-6e8cd224134b';

COMMIT;

-- Verification
SELECT 
  name,
  CASE 
    WHEN cholesterol IS NOT NULL AND iron IS NOT NULL
    THEN '✅ COMPLETE'
    ELSE '❌ INCOMPLETE'
  END as status,
  cholesterol,
  omega3_100
FROM shared_products 
WHERE id IN (
  '2387a5d2-f7a2-43f1-b022-bee3bdddb0f2',
  '3de7e50d-54d6-4a2b-8539-32a2ba9e0405',
  '35e0addf-653f-4de3-835d-ef391a3c2a71',
  'afb036be-42ee-4301-87f6-52fcdfee74ef',
  '83a19c27-69fa-426f-a8ce-26929d7eb3f2',
  'a7c922be-f452-433d-a241-0f0aea77ac1d',
  '49147214-8a0c-4e06-9e7e-b7f721afba49',
  '67ed3eda-8cc6-4541-a9c3-6e8cd224134b'
)
ORDER BY name;
