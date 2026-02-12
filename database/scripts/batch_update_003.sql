-- Batch UPDATE #3 - 6 simple products with USDA data
-- Generated: 2026-02-11
-- Source: USDA FoodData Central

BEGIN;

-- 1. Молоко 2,5% (Milk, 2.5% milkfat - USDA #746778)
UPDATE shared_products SET
  iron = 0.03,
  magnesium = 11,
  zinc = 0.37,
  selenium = 3.7,
  calcium = 113,
  phosphorus = 84,
  potassium = 143,
  vitamin_a = 26,
  vitamin_d = 1.3,
  vitamin_e = 0.07,
  vitamin_k = 0.3,
  vitamin_b1 = 0.046,
  vitamin_b2 = 0.169,
  vitamin_b3 = 0.089,
  vitamin_b6 = 0.036,
  vitamin_b9 = 5,
  vitamin_b12 = 0.45,
  vitamin_c = 0,
  omega3_100 = 0.08,
  omega6_100 = 0.12,
  cholesterol = 10,
  is_fermented = false,
  is_raw = false
WHERE id = '6241b44f-2c87-4836-bcee-ad7a61656e8b';

-- 2. Творог обезжиренный (Cottage cheese, nonfat/fat-free - USDA #328639)
UPDATE shared_products SET
  iron = 0.15,
  magnesium = 9,
  zinc = 0.51,
  selenium = 10.0,
  calcium = 94,
  phosphorus = 162,
  potassium = 139,
  vitamin_a = 5,
  vitamin_d = 0.2,
  vitamin_e = 0.01,
  vitamin_k = 0.1,
  vitamin_b1 = 0.029,
  vitamin_b2 = 0.165,
  vitamin_b3 = 0.101,
  vitamin_b6 = 0.048,
  vitamin_b9 = 12,
  vitamin_b12 = 0.45,
  vitamin_c = 0,
  omega3_100 = 0.01,
  omega6_100 = 0.02,
  cholesterol = 4,
  is_fermented = true,  -- Cottage cheese is fermented
  is_raw = false
WHERE id = '6aa29d34-1c52-4d38-8508-ae4def9f8e7e';

-- 3. Пшённая крупа отварная (Millet, cooked - USDA #168874)
UPDATE shared_products SET
  iron = 0.63,
  magnesium = 44,
  zinc = 0.91,
  selenium = 0.9,
  calcium = 3,
  phosphorus = 100,
  potassium = 62,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 0.05,
  vitamin_k = 0.3,
  vitamin_b1 = 0.106,
  vitamin_b2 = 0.082,
  vitamin_b3 = 1.33,
  vitamin_b6 = 0.108,
  vitamin_b9 = 19,
  vitamin_b12 = 0,
  vitamin_c = 0,
  omega3_100 = 0.03,
  omega6_100 = 0.39,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '789b1c57-241e-4581-b599-1b67b842952a';

-- 4. Творог 5% (Cottage cheese, 5% milkfat - USDA #328638)
UPDATE shared_products SET
  iron = 0.14,
  magnesium = 8,
  zinc = 0.48,
  selenium = 9.8,
  calcium = 92,
  phosphorus = 160,
  potassium = 138,
  vitamin_a = 28,
  vitamin_d = 0.5,
  vitamin_e = 0.01,
  vitamin_k = 0.1,
  vitamin_b1 = 0.028,
  vitamin_b2 = 0.164,
  vitamin_b3 = 0.100,
  vitamin_b6 = 0.047,
  vitamin_b9 = 12,
  vitamin_b12 = 0.44,
  vitamin_c = 0,
  omega3_100 = 0.03,
  omega6_100 = 0.09,
  cholesterol = 15,
  is_fermented = true,  -- Cottage cheese is fermented
  is_raw = false
WHERE id = '7efc4aec-b1f9-401e-8bd1-bda6a3090fd4';

-- 5. Семена чиа (Chia seeds - USDA #170554)
UPDATE shared_products SET
  iron = 7.72,
  magnesium = 335,
  zinc = 4.58,
  selenium = 55.2,
  calcium = 631,
  phosphorus = 948,
  potassium = 407,
  vitamin_a = 2,
  vitamin_d = 0,
  vitamin_e = 0.5,
  vitamin_k = 0.5,
  vitamin_b1 = 0.62,
  vitamin_b2 = 0.17,
  vitamin_b3 = 8.83,
  vitamin_b6 = 0.0,
  vitamin_b9 = 49,
  vitamin_b12 = 0,
  vitamin_c = 1.6,
  omega3_100 = 17.83,  -- Very high omega-3
  omega6_100 = 5.84,
  cholesterol = 0,
  is_fermented = false,
  is_raw = true  -- Raw seeds
WHERE id = '7fee8291-0110-4a24-a139-e7e79d527a58';

-- 6. Грецкий орех (Walnuts, english - USDA #170187)
UPDATE shared_products SET
  iron = 2.91,
  magnesium = 158,
  zinc = 3.09,
  selenium = 4.9,
  calcium = 98,
  phosphorus = 346,
  potassium = 441,
  vitamin_a = 1,
  vitamin_d = 0,
  vitamin_e = 0.7,
  vitamin_k = 2.7,
  vitamin_b1 = 0.341,
  vitamin_b2 = 0.150,
  vitamin_b3 = 1.125,
  vitamin_b6 = 0.537,
  vitamin_b9 = 98,
  vitamin_b12 = 0,
  vitamin_c = 1.3,
  omega3_100 = 9.08,  -- Very high omega-3
  omega6_100 = 38.09,  -- Very high omega-6
  cholesterol = 0,
  is_fermented = false,
  is_raw = true  -- Raw nuts
WHERE id = '7ff6d545-8f89-4315-be28-5e7a216caa2c';

COMMIT;

-- Verification query
SELECT 
  name,
  CASE 
    WHEN cholesterol IS NOT NULL 
      AND omega3_100 IS NOT NULL 
      AND omega6_100 IS NOT NULL
    THEN '✅ COMPLETE'
    ELSE '❌ INCOMPLETE'
  END as status,
  cholesterol,
  omega3_100 as omega3,
  omega6_100 as omega6
FROM shared_products 
WHERE id IN (
  '6241b44f-2c87-4836-bcee-ad7a61656e8b',
  '6aa29d34-1c52-4d38-8508-ae4def9f8e7e',
  '789b1c57-241e-4581-b599-1b67b842952a',
  '7efc4aec-b1f9-401e-8bd1-bda6a3090fd4',
  '7fee8291-0110-4a24-a139-e7e79d527a58',
  '7ff6d545-8f89-4315-be28-5e7a216caa2c'
)
ORDER BY name;
