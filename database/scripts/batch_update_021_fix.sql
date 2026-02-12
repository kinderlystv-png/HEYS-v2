-- Batch UPDATE #21 FIX - 1 product
-- Generated: 2026-02-12
-- Source: USDA FoodData Central

BEGIN;

-- Шпинат (Spinach, raw - USDA #11457)
UPDATE shared_products SET
  iron = 2.71,
  magnesium = 79,
  zinc = 0.53,
  selenium = 1.0,
  calcium = 99,
  phosphorus = 49,
  potassium = 558,
  vitamin_a = 469,
  vitamin_d = 0,
  vitamin_e = 2.03,
  vitamin_k = 482.9,
  vitamin_b1 = 0.078,
  vitamin_b2 = 0.189,
  vitamin_b3 = 0.724,
  vitamin_b6 = 0.195,
  vitamin_b9 = 194,
  vitamin_b12 = 0,
  vitamin_c = 28.1,
  omega3_100 = 0.14,
  omega6_100 = 0.03,
  cholesterol = 0,
  is_fermented = false,
  is_raw = true
WHERE id = 'e9fb06ce-86e9-4321-8f23-cff44faca8c1';

COMMIT;

-- Verification
SELECT 
  name,
  CASE WHEN cholesterol IS NOT NULL AND iron IS NOT NULL THEN '✅' ELSE '❌' END as ok,
  cholesterol,
  vitamin_k,
  is_raw
FROM shared_products 
WHERE id = 'e9fb06ce-86e9-4321-8f23-cff44faca8c1';
