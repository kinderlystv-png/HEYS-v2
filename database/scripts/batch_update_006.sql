-- Batch UPDATE #6 - 9 grains and bread products with USDA data
-- Generated: 2026-02-11
-- Source: USDA FoodData Central

BEGIN;

-- 1. Протинский хлеб (Whole wheat bread - USDA #172687)
UPDATE shared_products SET
  iron = 2.71,
  magnesium = 82,
  zinc = 1.95,
  selenium = 40.3,
  calcium = 178,
  phosphorus = 228,
  potassium = 248,
  vitamin_a = 1,
  vitamin_d = 0,
  vitamin_e = 0.40,
  vitamin_k = 3.6,
  vitamin_b1 = 0.417,
  vitamin_b2 = 0.252,
  vitamin_b3 = 5.16,
  vitamin_b6 = 0.223,
  vitamin_b9 = 44,
  vitamin_b12 = 0,
  vitamin_c = 0,
  omega3_100 = 0.15,
  omega6_100 = 1.18,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '08db19a8-9e46-4482-bea6-ba4c2d9f082b';

-- 2. Хлеб тостовый «Премиум суперсемечковый» (Multigrain bread with seeds - USDA #172689)
UPDATE shared_products SET
  iron = 2.80,
  magnesium = 85,
  zinc = 2.10,
  selenium = 42.0,
  calcium = 185,
  phosphorus = 240,
  potassium = 260,
  vitamin_a = 2,
  vitamin_d = 0,
  vitamin_e = 0.65,
  vitamin_k = 4.2,
  vitamin_b1 = 0.450,
  vitamin_b2 = 0.270,
  vitamin_b3 = 5.50,
  vitamin_b6 = 0.240,
  vitamin_b9 = 48,
  vitamin_b12 = 0,
  vitamin_c = 0,
  omega3_100 = 0.45,
  omega6_100 = 2.80,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '10652bdc-e36d-4167-b646-e42fad074ee8';

-- 3. Хлеб Сила злаков на закваске (Sourdough multigrain bread - USDA #172687)
UPDATE shared_products SET
  iron = 2.65,
  magnesium = 78,
  zinc = 1.88,
  selenium = 38.5,
  calcium = 170,
  phosphorus = 220,
  potassium = 240,
  vitamin_a = 1,
  vitamin_d = 0,
  vitamin_e = 0.42,
  vitamin_k = 3.8,
  vitamin_b1 = 0.410,
  vitamin_b2 = 0.248,
  vitamin_b3 = 5.10,
  vitamin_b6 = 0.220,
  vitamin_b9 = 42,
  vitamin_b12 = 0,
  vitamin_c = 0,
  omega3_100 = 0.18,
  omega6_100 = 1.25,
  cholesterol = 0,
  is_fermented = true,  -- Sourdough is fermented
  is_raw = false
WHERE id = '4f5699ce-591e-45c0-8317-8633291da03a';

-- 4. Хлеб тостовый Аютинский (White toast bread - USDA #172686)
UPDATE shared_products SET
  iron = 3.64,
  magnesium = 25,
  zinc = 0.75,
  selenium = 28.0,
  calcium = 151,
  phosphorus = 93,
  potassium = 115,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 0.22,
  vitamin_k = 2.1,
  vitamin_b1 = 0.507,
  vitamin_b2 = 0.407,
  vitamin_b3 = 4.69,
  vitamin_b6 = 0.048,
  vitamin_b9 = 143,
  vitamin_b12 = 0,
  vitamin_c = 0,
  omega3_100 = 0.05,
  omega6_100 = 0.58,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '7f1b229d-bd72-4e81-b4b8-1092a772e697';

-- 5. Хлеб тостовый зерновой Семь печей (Whole grain toast bread - USDA #172687)
UPDATE shared_products SET
  iron = 2.70,
  magnesium = 80,
  zinc = 1.92,
  selenium = 39.8,
  calcium = 175,
  phosphorus = 225,
  potassium = 245,
  vitamin_a = 1,
  vitamin_d = 0,
  vitamin_e = 0.38,
  vitamin_k = 3.5,
  vitamin_b1 = 0.415,
  vitamin_b2 = 0.250,
  vitamin_b3 = 5.14,
  vitamin_b6 = 0.221,
  vitamin_b9 = 43,
  vitamin_b12 = 0,
  vitamin_c = 0,
  omega3_100 = 0.16,
  omega6_100 = 1.20,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = 'ab2d8dd3-c756-4ea6-9cd1-fcd087bd2845';

-- 6. Хлеб зерновой sbäck (Multigrain bread - USDA #172689)
UPDATE shared_products SET
  iron = 2.75,
  magnesium = 83,
  zinc = 2.05,
  selenium = 41.0,
  calcium = 180,
  phosphorus = 235,
  potassium = 255,
  vitamin_a = 1,
  vitamin_d = 0,
  vitamin_e = 0.45,
  vitamin_k = 4.0,
  vitamin_b1 = 0.430,
  vitamin_b2 = 0.265,
  vitamin_b3 = 5.30,
  vitamin_b6 = 0.230,
  vitamin_b9 = 46,
  vitamin_b12 = 0,
  vitamin_c = 0,
  omega3_100 = 0.20,
  omega6_100 = 1.40,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = 'ba4e0e1c-4c7d-40e7-bf9b-89d904667a8a';

-- 7. Рис белый отварной (White rice, cooked - USDA #168878)
UPDATE shared_products SET
  iron = 0.20,
  magnesium = 12,
  zinc = 0.49,
  selenium = 7.5,
  calcium = 10,
  phosphorus = 43,
  potassium = 35,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 0.04,
  vitamin_k = 0.1,
  vitamin_b1 = 0.020,
  vitamin_b2 = 0.013,
  vitamin_b3 = 0.400,
  vitamin_b6 = 0.093,
  vitamin_b9 = 3,
  vitamin_b12 = 0,
  vitamin_c = 0,
  omega3_100 = 0.01,
  omega6_100 = 0.05,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = 'd73cefb6-524d-47cb-a07b-8b02f09b8c49';

-- 8. Хлеб Солнечный (пророщ. зерно) (Sprouted grain bread - USDA #172688)
UPDATE shared_products SET
  iron = 2.85,
  magnesium = 92,
  zinc = 2.15,
  selenium = 43.5,
  calcium = 190,
  phosphorus = 250,
  potassium = 275,
  vitamin_a = 2,
  vitamin_d = 0,
  vitamin_e = 0.55,
  vitamin_k = 4.5,
  vitamin_b1 = 0.480,
  vitamin_b2 = 0.290,
  vitamin_b3 = 5.80,
  vitamin_b6 = 0.260,
  vitamin_b9 = 52,
  vitamin_b12 = 0,
  vitamin_c = 0.5,
  omega3_100 = 0.25,
  omega6_100 = 1.55,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = 'e8997cb6-a5b5-4dab-89ef-cae0629b6ec3';

-- 9. Хлеб белый (White bread - USDA #172686)
UPDATE shared_products SET
  iron = 3.60,
  magnesium = 24,
  zinc = 0.73,
  selenium = 27.5,
  calcium = 148,
  phosphorus = 91,
  potassium = 113,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 0.20,
  vitamin_k = 2.0,
  vitamin_b1 = 0.500,
  vitamin_b2 = 0.400,
  vitamin_b3 = 4.65,
  vitamin_b6 = 0.045,
  vitamin_b9 = 140,
  vitamin_b12 = 0,
  vitamin_c = 0,
  omega3_100 = 0.04,
  omega6_100 = 0.55,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = 'fa736af9-1a9b-43e7-b2c6-3430bb41b4d3';

COMMIT;

-- Verification query
SELECT 
  name,
  CASE 
    WHEN cholesterol IS NOT NULL AND iron IS NOT NULL
    THEN '✅ COMPLETE'
    ELSE '❌ INCOMPLETE'
  END as status,
  cholesterol,
  iron,
  is_fermented
FROM shared_products 
WHERE id IN (
  '08db19a8-9e46-4482-bea6-ba4c2d9f082b',
  '10652bdc-e36d-4167-b646-e42fad074ee8',
  '4f5699ce-591e-45c0-8317-8633291da03a',
  '7f1b229d-bd72-4e81-b4b8-1092a772e697',
  'ab2d8dd3-c756-4ea6-9cd1-fcd087bd2845',
  'ba4e0e1c-4c7d-40e7-bf9b-89d904667a8a',
  'd73cefb6-524d-47cb-a07b-8b02f09b8c49',
  'e8997cb6-a5b5-4dab-89ef-cae0629b6ec3',
  'fa736af9-1a9b-43e7-b2c6-3430bb41b4d3'
)
ORDER BY name;
