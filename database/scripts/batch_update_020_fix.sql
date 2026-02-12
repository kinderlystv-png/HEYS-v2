-- Batch UPDATE #20 FIX - 3 remaining products
-- Generated: 2026-02-12
-- Source: USDA FoodData Central

BEGIN;

-- 1. Икра красная лососевая солёная (Salmon roe - USDA #175139)
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
WHERE id = '40c86d5b-1690-4c77-90de-bf8c77067388';

-- 2. Горбуша горячего копчения (Hot smoked pink salmon - USDA #175141)
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
WHERE id = '51d550e1-cb4f-41cb-bc19-a0196181bc24';

-- 3. Финик (Dates, deglet noor - USDA #168191)
UPDATE shared_products SET
  iron = 0.90,
  magnesium = 54,
  zinc = 0.44,
  selenium = 3.0,
  calcium = 64,
  phosphorus = 62,
  potassium = 696,
  vitamin_a = 7,
  vitamin_d = 0,
  vitamin_e = 0.05,
  vitamin_k = 2.7,
  vitamin_b1 = 0.050,
  vitamin_b2 = 0.060,
  vitamin_b3 = 1.610,
  vitamin_b6 = 0.249,
  vitamin_b9 = 15,
  vitamin_b12 = 0,
  vitamin_c = 0,
  omega3_100 = 0.0,
  omega6_100 = 0.0,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '7387436b-7575-4445-b442-ac9387d48d28';

COMMIT;

-- Verification
SELECT 
  substring(name, 1, 45) as name,
  CASE WHEN cholesterol IS NOT NULL AND iron IS NOT NULL THEN '✅' ELSE '❌' END as ok,
  cholesterol,
  CASE WHEN omega3_100 > 1 THEN 'High Ω3' ELSE '' END as omega3_note
FROM shared_products 
WHERE id IN (
  '40c86d5b-1690-4c77-90de-bf8c77067388',
  '51d550e1-cb4f-41cb-bc19-a0196181bc24',
  '7387436b-7575-4445-b442-ac9387d48d28'
)
ORDER BY name;
