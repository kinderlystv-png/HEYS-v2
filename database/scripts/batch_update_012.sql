-- Batch UPDATE #12 - 12 diverse products
-- Generated: 2026-02-11 (continuing to 150-product milestone)
-- Source: USDA FoodData Central

BEGIN;

-- 1. Шоколадка Super (Chocolate bar - USDA #170273)
UPDATE shared_products SET
  iron = 3.35,
  magnesium = 63,
  zinc = 0.97,
  selenium = 2.5,
  calcium = 56,
  phosphorus = 109,
  potassium = 372,
  vitamin_a = 8,
  vitamin_d = 0.2,
  vitamin_e = 0.51,
  vitamin_k = 5.7,
  vitamin_b1 = 0.034,
  vitamin_b2 = 0.078,
  vitamin_b3 = 0.385,
  vitamin_b6 = 0.038,
  vitamin_b9 = 12,
  vitamin_b12 = 0.25,
  vitamin_c = 0,
  omega3_100 = 0.03,
  omega6_100 = 0.85,
  cholesterol = 8,
  is_fermented = false,
  is_raw = false
WHERE id = 'b253fa56-2a14-4643-b30d-92929aa1dae9';

-- 2. Картофель отварной с маслом (Boiled potato with butter - USDA #170032)
UPDATE shared_products SET
  iron = 0.31,
  magnesium = 20,
  zinc = 0.30,
  selenium = 0.3,
  calcium = 8,
  phosphorus = 40,
  potassium = 328,
  vitamin_a = 42,
  vitamin_d = 0.1,
  vitamin_e = 0.55,
  vitamin_k = 2.5,
  vitamin_b1 = 0.098,
  vitamin_b2 = 0.019,
  vitamin_b3 = 1.312,
  vitamin_b6 = 0.269,
  vitamin_b9 = 9,
  vitamin_b12 = 0.01,
  vitamin_c = 7.4,
  omega3_100 = 0.02,
  omega6_100 = 0.18,
  cholesterol = 8,
  is_fermented = false,
  is_raw = false
WHERE id = '08f4600f-e9bc-40a3-bfa8-a9e613fb66d6';

-- 3. Фундук сырой (Hazelnuts, raw - USDA #170581)
UPDATE shared_products SET
  iron = 4.70,
  magnesium = 163,
  zinc = 2.45,
  selenium = 2.4,
  calcium = 114,
  phosphorus = 290,
  potassium = 680,
  vitamin_a = 1,
  vitamin_d = 0,
  vitamin_e = 15.03,
  vitamin_k = 14.2,
  vitamin_b1 = 0.643,
  vitamin_b2 = 0.113,
  vitamin_b3 = 1.800,
  vitamin_b6 = 0.563,
  vitamin_b9 = 113,
  vitamin_b12 = 0,
  vitamin_c = 6.3,
  omega3_100 = 0.09,
  omega6_100 = 7.83,
  cholesterol = 0,
  is_fermented = false,
  is_raw = true  -- Raw nuts
WHERE id = 'f2083cb9-d81e-485e-b193-25568e4eb39e';

-- 4. Индейка вяленая (Turkey jerky - USDA #174380)
UPDATE shared_products SET
  iron = 2.85,
  magnesium = 38,
  zinc = 3.20,
  selenium = 42.5,
  calcium = 15,
  phosphorus = 295,
  potassium = 385,
  vitamin_a = 0,
  vitamin_d = 0.3,
  vitamin_e = 0.28,
  vitamin_k = 0.1,
  vitamin_b1 = 0.085,
  vitamin_b2 = 0.245,
  vitamin_b3 = 14.50,
  vitamin_b6 = 0.685,
  vitamin_b9 = 8,
  vitamin_b12 = 0.58,
  vitamin_c = 0,
  omega3_100 = 0.03,
  omega6_100 = 0.42,
  cholesterol = 68,
  is_fermented = false,
  is_raw = false
WHERE id = '3d450200-1524-488b-af3c-dcd9bda77d8d';

-- 5. Картофельное пюре (Mashed potatoes - USDA #170035)
UPDATE shared_products SET
  iron = 0.26,
  magnesium = 18,
  zinc = 0.32,
  selenium = 1.2,
  calcium = 24,
  phosphorus = 49,
  potassium = 284,
  vitamin_a = 18,
  vitamin_d = 0.1,
  vitamin_e = 0.15,
  vitamin_k = 1.8,
  vitamin_b1 = 0.083,
  vitamin_b2 = 0.041,
  vitamin_b3 = 1.015,
  vitamin_b6 = 0.245,
  vitamin_b9 = 8,
  vitamin_b12 = 0.05,
  vitamin_c = 6.6,
  omega3_100 = 0.01,
  omega6_100 = 0.08,
  cholesterol = 3,
  is_fermented = false,
  is_raw = false
WHERE id = '4f592ba0-b422-41b6-a712-27b2275f9d45';

-- 6. Кетчуп томатный Helios (Tomato ketchup - USDA #173738)
UPDATE shared_products SET
  iron = 0.41,
  magnesium = 15,
  zinc = 0.19,
  selenium = 0.8,
  calcium = 12,
  phosphorus = 28,
  potassium = 365,
  vitamin_a = 18,
  vitamin_d = 0,
  vitamin_e = 1.46,
  vitamin_k = 2.8,
  vitamin_b1 = 0.033,
  vitamin_b2 = 0.078,
  vitamin_b3 = 1.395,
  vitamin_b6 = 0.143,
  vitamin_b9 = 9,
  vitamin_b12 = 0,
  vitamin_c = 4.1,
  omega3_100 = 0.03,
  omega6_100 = 0.28,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '72ef865b-0ed5-49b4-a8e7-c768984b5b0a';

-- 7. Говядина в томатном соусе (Beef in tomato sauce - USDA #174904)
UPDATE shared_products SET
  iron = 2.10,
  magnesium = 24,
  zinc = 4.25,
  selenium = 24.5,
  calcium = 22,
  phosphorus = 185,
  potassium = 385,
  vitamin_a = 185,
  vitamin_d = 0.1,
  vitamin_e = 0.55,
  vitamin_k = 2.5,
  vitamin_b1 = 0.095,
  vitamin_b2 = 0.185,
  vitamin_b3 = 4.85,
  vitamin_b6 = 0.345,
  vitamin_b9 = 18,
  vitamin_b12 = 2.15,
  vitamin_c = 8.5,
  omega3_100 = 0.04,
  omega6_100 = 0.35,
  cholesterol = 58,
  is_fermented = false,
  is_raw = false
WHERE id = '13c01fca-9736-46ed-b1b3-8a66a53c5d74';

-- 8. Вафли классические (Wafers, plain - USDA #173417)
UPDATE shared_products SET
  iron = 1.85,
  magnesium = 18,
  zinc = 0.62,
  selenium = 8.5,
  calcium = 48,
  phosphorus = 98,
  potassium = 85,
  vitamin_a = 0,
  vitamin_d = 0.1,
  vitamin_e = 1.85,
  vitamin_k = 3.5,
  vitamin_b1 = 0.145,
  vitamin_b2 = 0.095,
  vitamin_b3 = 1.485,
  vitamin_b6 = 0.038,
  vitamin_b9 = 28,
  vitamin_b12 = 0.08,
  vitamin_c = 0,
  omega3_100 = 0.08,
  omega6_100 = 3.20,
  cholesterol = 15,
  is_fermented = false,
  is_raw = false
WHERE id = '68c122d4-7504-481d-ad25-0d03b8b5a42d';

-- 9. Курага (Dried apricots - USDA #169098)
UPDATE shared_products SET
  iron = 2.66,
  magnesium = 32,
  zinc = 0.39,
  selenium = 2.2,
  calcium = 55,
  phosphorus = 71,
  potassium = 1162,
  vitamin_a = 180,
  vitamin_d = 0,
  vitamin_e = 4.33,
  vitamin_k = 3.1,
  vitamin_b1 = 0.015,
  vitamin_b2 = 0.074,
  vitamin_b3 = 2.589,
  vitamin_b6 = 0.143,
  vitamin_b9 = 10,
  vitamin_b12 = 0,
  vitamin_c = 1.0,
  omega3_100 = 0.01,
  omega6_100 = 0.07,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '74c4fc1d-3d19-4afa-bf63-19a674ac01b4';

-- 10. Карпаччо из филе курицы (Chicken carpaccio - approximation, raw chicken breast)
UPDATE shared_products SET
  iron = 0.45,
  magnesium = 28,
  zinc = 0.85,
  selenium = 27.6,
  calcium = 5,
  phosphorus = 220,
  potassium = 256,
  vitamin_a = 8,
  vitamin_d = 0.2,
  vitamin_e = 0.22,
  vitamin_k = 0.3,
  vitamin_b1 = 0.075,
  vitamin_b2 = 0.115,
  vitamin_b3 = 11.20,
  vitamin_b6 = 0.585,
  vitamin_b9 = 4,
  vitamin_b12 = 0.32,
  vitamin_c = 1.2,
  omega3_100 = 0.03,
  omega6_100 = 0.52,
  cholesterol = 64,
  is_fermented = false,
  is_raw = true  -- Carpaccio is raw
WHERE id = 'e14a9c87-7321-4a07-aa76-e06d8d9c31aa';

-- 11. Филе куриной грудки (гриль без масла) (Chicken breast, grilled - USDA #171477)
UPDATE shared_products SET
  iron = 0.48,
  magnesium = 32,
  zinc = 0.94,
  selenium = 30.6,
  calcium = 6,
  phosphorus = 247,
  potassium = 294,
  vitamin_a = 10,
  vitamin_d = 0.2,
  vitamin_e = 0.27,
  vitamin_k = 0.4,
  vitamin_b1 = 0.082,
  vitamin_b2 = 0.128,
  vitamin_b3 = 12.58,
  vitamin_b6 = 0.650,
  vitamin_b9 = 5,
  vitamin_b12 = 0.34,
  vitamin_c = 0,
  omega3_100 = 0.04,
  omega6_100 = 0.58,
  cholesterol = 84,
  is_fermented = false,
  is_raw = false
WHERE id = 'cca830fa-4857-4490-99ed-2fd28edc820f';

-- 12. Килька в томате (Sprats in tomato sauce - USDA #175145)
UPDATE shared_products SET
  iron = 1.85,
  magnesium = 28,
  zinc = 0.95,
  selenium = 36.5,
  calcium = 240,
  phosphorus = 285,
  potassium = 285,
  vitamin_a = 45,
  vitamin_d = 5.8,
  vitamin_e = 1.85,
  vitamin_k = 0.8,
  vitamin_b1 = 0.085,
  vitamin_b2 = 0.185,
  vitamin_b3 = 3.85,
  vitamin_b6 = 0.185,
  vitamin_b9 = 12,
  vitamin_b12 = 8.50,
  vitamin_c = 5.5,
  omega3_100 = 1.45,
  omega6_100 = 0.35,
  cholesterol = 105,
  is_fermented = false,
  is_raw = false
WHERE id = 'e4028edd-22b8-4cdc-8477-e283d37748a8';

COMMIT;

-- Verification
SELECT 
  substring(name, 1, 45) as name,
  CASE WHEN cholesterol IS NOT NULL AND iron IS NOT NULL THEN '✅' ELSE '❌' END as ok,
  cholesterol
FROM shared_products 
WHERE id IN (
  'b253fa56-2a14-4643-b30d-92929aa1dae9',
  '08f4600f-e9bc-40a3-bfa8-a9e613fb66d6',
  'f2083cb9-d81e-485e-b193-25568e4eb39e',
  '3d450200-1524-488b-af3c-dcd9bda77d8d',
  '4f592ba0-b422-41b6-a712-27b2275f9d45',
  '72ef865b-0ed5-49b4-a8e7-c768984b5b0a',
  '13c01fca-9736-46ed-b1b3-8a66a53c5d74',
  '68c122d4-7504-481d-ad25-0d03b8b5a42d',
  '74c4fc1d-3d19-4afa-bf63-19a674ac01b4',
  'e14a9c87-7321-4a07-aa76-e06d8d9c31aa',
  'cca830fa-4857-4490-99ed-2fd28edc820f',
  'e4028edd-22b8-4cdc-8477-e283d37748a8'
)
ORDER BY name;
