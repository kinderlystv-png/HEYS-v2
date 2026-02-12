-- Batch UPDATE #9 - 12 diverse products with USDA data
-- Generated: 2026-02-11 (MEGA-BATCH for acceleration)
-- Source: USDA FoodData Central

BEGIN;

-- 1. Оладьи классические (Pancakes - USDA #173411)
UPDATE shared_products SET
  iron = 1.92,
  magnesium = 16,
  zinc = 0.51,
  selenium = 16.0,
  calcium = 121,
  phosphorus = 220,
  potassium = 126,
  vitamin_a = 49,
  vitamin_d = 0.2,
  vitamin_e = 0.40,
  vitamin_k = 1.5,
  vitamin_b1 = 0.273,
  vitamin_b2 = 0.335,
  vitamin_b3 = 2.26,
  vitamin_b6 = 0.045,
  vitamin_b9 = 65,
  vitamin_b12 = 0.26,
  vitamin_c = 0.2,
  omega3_100 = 0.04,
  omega6_100 = 0.90,
  cholesterol = 48,
  is_fermented = false,
  is_raw = false
WHERE id = '75cf049c-544b-4d2f-a94e-31c530905ab5';

-- 2. Блины классические (Crepes/Thin pancakes - USDA #173412)
UPDATE shared_products SET
  iron = 1.45,
  magnesium = 12,
  zinc = 0.48,
  selenium = 14.2,
  calcium = 75,
  phosphorus = 125,
  potassium = 91,
  vitamin_a = 62,
  vitamin_d = 0.3,
  vitamin_e = 0.55,
  vitamin_k = 1.8,
  vitamin_b1 = 0.150,
  vitamin_b2 = 0.260,
  vitamin_b3 = 1.35,
  vitamin_b6 = 0.038,
  vitamin_b9 = 38,
  vitamin_b12 = 0.32,
  vitamin_c = 0,
  omega3_100 = 0.06,
  omega6_100 = 1.10,
  cholesterol = 65,
  is_fermented = false,
  is_raw = false
WHERE id = '8951c6b4-97db-498a-8915-e72d33c61331';

-- 3. Сёмга на мангале (Salmon, grilled - USDA #175168)
UPDATE shared_products SET
  iron = 0.34,
  magnesium = 29,
  zinc = 0.44,
  selenium = 38.5,
  calcium = 13,
  phosphorus = 252,
  potassium = 384,
  vitamin_a = 12,
  vitamin_d = 11.0,
  vitamin_e = 0.55,
  vitamin_k = 0.1,
  vitamin_b1 = 0.226,
  vitamin_b2 = 0.380,
  vitamin_b3 = 8.57,
  vitamin_b6 = 0.818,
  vitamin_b9 = 29,
  vitamin_b12 = 3.18,
  vitamin_c = 0,
  omega3_100 = 2.06,
  omega6_100 = 0.68,
  cholesterol = 63,
  is_fermented = false,
  is_raw = false
WHERE id = '0f7f76bb-fcb6-4fbf-8a0e-858689fac0ba';

-- 4. Филе бедра индейки сыровяленое (Turkey ham, cured - USDA #174380)
UPDATE shared_products SET
  iron = 1.48,
  magnesium = 32,
  zinc = 2.20,
  selenium = 35.5,
  calcium = 8,
  phosphorus = 265,
  potassium = 310,
  vitamin_a = 0,
  vitamin_d = 0.2,
  vitamin_e = 0.18,
  vitamin_k = 0.1,
  vitamin_b1 = 0.050,
  vitamin_b2 = 0.145,
  vitamin_b3 = 11.50,
  vitamin_b6 = 0.520,
  vitamin_b9 = 6,
  vitamin_b12 = 0.38,
  vitamin_c = 0,
  omega3_100 = 0.03,
  omega6_100 = 0.32,
  cholesterol = 52,
  is_fermented = false,
  is_raw = false
WHERE id = '1af7f0a6-e2fd-458d-a22f-5af306fc7328';

-- 5. Желток яйца (Egg yolk, raw - USDA #172185)
UPDATE shared_products SET
  iron = 2.73,
  magnesium = 5,
  zinc = 2.30,
  selenium = 56.0,
  calcium = 129,
  phosphorus = 390,
  potassium = 109,
  vitamin_a = 381,
  vitamin_d = 5.4,
  vitamin_e = 2.58,
  vitamin_k = 0.7,
  vitamin_b1 = 0.176,
  vitamin_b2 = 0.528,
  vitamin_b3 = 0.024,
  vitamin_b6 = 0.350,
  vitamin_b9 = 146,
  vitamin_b12 = 1.95,
  vitamin_c = 0,
  omega3_100 = 0.12,
  omega6_100 = 3.25,
  cholesterol = 1085,
  is_fermented = false,
  is_raw = true  -- Raw yolk
WHERE id = 'b8d53e3a-7bec-4b40-8a30-6896e7b9129c';

-- 6. Гречка отварная (Buckwheat, cooked - USDA #168871)
UPDATE shared_products SET
  iron = 0.80,
  magnesium = 51,
  zinc = 0.61,
  selenium = 2.8,
  calcium = 7,
  phosphorus = 70,
  potassium = 88,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 0.05,
  vitamin_k = 1.9,
  vitamin_b1 = 0.040,
  vitamin_b2 = 0.039,
  vitamin_b3 = 0.940,
  vitamin_b6 = 0.077,
  vitamin_b9 = 14,
  vitamin_b12 = 0,
  vitamin_c = 0,
  omega3_100 = 0.04,
  omega6_100 = 0.24,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '3f027213-84ab-4b7d-b814-9d2dd1617847';

-- 7. Краб-ролл с творожным сыром (Crab roll - approximation)
UPDATE shared_products SET
  iron = 0.45,
  magnesium = 38,
  zinc = 2.85,
  selenium = 28.5,
  calcium = 35,
  phosphorus = 155,
  potassium = 135,
  vitamin_a = 18,
  vitamin_d = 0.2,
  vitamin_e = 0.85,
  vitamin_k = 0.3,
  vitamin_b1 = 0.045,
  vitamin_b2 = 0.125,
  vitamin_b3 = 1.50,
  vitamin_b6 = 0.110,
  vitamin_b9 = 22,
  vitamin_b12 = 4.20,
  vitamin_c = 2.5,
  omega3_100 = 0.18,
  omega6_100 = 0.28,
  cholesterol = 32,
  is_fermented = false,
  is_raw = false
WHERE id = '42c7832f-c9be-4de3-8a3d-737f088ab113';

-- 8. Аджика неострая (Adjika sauce/paste - approximation based on tomato + spices)
UPDATE shared_products SET
  iron = 1.20,
  magnesium = 22,
  zinc = 0.35,
  selenium = 1.2,
  calcium = 28,
  phosphorus = 38,
  potassium = 385,
  vitamin_a = 65,
  vitamin_d = 0,
  vitamin_e = 2.50,
  vitamin_k = 8.5,
  vitamin_b1 = 0.085,
  vitamin_b2 = 0.095,
  vitamin_b3 = 1.85,
  vitamin_b6 = 0.285,
  vitamin_b9 = 18,
  vitamin_b12 = 0,
  vitamin_c = 22.5,
  omega3_100 = 0.08,
  omega6_100 = 1.20,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '22c618a5-3e62-4f00-9dc4-4033bac0b5f4';

-- 9. Доширак, говядина (Instant ramen, beef flavor - USDA #168878 + seasonings)
UPDATE shared_products SET
  iron = 1.85,
  magnesium = 18,
  zinc = 0.55,
  selenium = 12.5,
  calcium = 22,
  phosphorus = 58,
  potassium = 115,
  vitamin_a = 8,
  vitamin_d = 0,
  vitamin_e = 0.15,
  vitamin_k = 0.8,
  vitamin_b1 = 0.185,
  vitamin_b2 = 0.075,
  vitamin_b3 = 2.10,
  vitamin_b6 = 0.045,
  vitamin_b9 = 28,
  vitamin_b12 = 0.15,
  vitamin_c = 0,
  omega3_100 = 0.02,
  omega6_100 = 1.85,
  cholesterol = 5,
  is_fermented = false,
  is_raw = false
WHERE id = 'cd4662ce-ddb1-4593-8c9d-d7d819f2d875';

-- 10. Сырные палочки в кляре (Mozzarella sticks, breaded, fried - USDA #173447)
UPDATE shared_products SET
  iron = 0.72,
  magnesium = 22,
  zinc = 1.88,
  selenium = 15.5,
  calcium = 420,
  phosphorus = 275,
  potassium = 95,
  vitamin_a = 145,
  vitamin_d = 0.3,
  vitamin_e = 0.85,
  vitamin_k = 2.5,
  vitamin_b1 = 0.055,
  vitamin_b2 = 0.245,
  vitamin_b3 = 0.485,
  vitamin_b6 = 0.042,
  vitamin_b9 = 18,
  vitamin_b12 = 1.15,
  vitamin_c = 0,
  omega3_100 = 0.08,
  omega6_100 = 1.50,
  cholesterol = 48,
  is_fermented = false,
  is_raw = false
WHERE id = '08ef05ad-d5f3-41bb-a719-2b32a776eda1';

-- 11. Chikalab шоколадно-ореховый десерт (Protein chocolate dessert - approximation)
UPDATE shared_products SET
  iron = 2.20,
  magnesium = 65,
  zinc = 1.85,
  selenium = 8.5,
  calcium = 155,
  phosphorus = 195,
  potassium = 285,
  vitamin_a = 45,
  vitamin_d = 0.8,
  vitamin_e = 2.80,
  vitamin_k = 1.2,
  vitamin_b1 = 0.145,
  vitamin_b2 = 0.485,
  vitamin_b3 = 2.85,
  vitamin_b6 = 0.185,
  vitamin_b9 = 35,
  vitamin_b12 = 1.45,
  vitamin_c = 1.5,
  omega3_100 = 0.12,
  omega6_100 = 3.85,
  cholesterol = 18,
  is_fermented = false,
  is_raw = false
WHERE id = '3f525987-fa48-43f2-b737-bc27c7dfa4aa';

-- 12. Chika Layers фундук и карамель (Protein bar with hazelnuts - approximation)
UPDATE shared_products SET
  iron = 1.95,
  magnesium = 58,
  zinc = 1.55,
  selenium = 7.8,
  calcium = 125,
  phosphorus = 175,
  potassium = 245,
  vitamin_a = 35,
  vitamin_d = 0.6,
  vitamin_e = 4.50,
  vitamin_k = 1.8,
  vitamin_b1 = 0.165,
  vitamin_b2 = 0.285,
  vitamin_b3 = 2.45,
  vitamin_b6 = 0.155,
  vitamin_b9 = 38,
  vitamin_b12 = 0.95,
  vitamin_c = 0.8,
  omega3_100 = 0.08,
  omega6_100 = 5.50,
  cholesterol = 12,
  is_fermented = false,
  is_raw = false
WHERE id = '2dcdf3d5-245b-4ec7-99e1-3f6339398748';

COMMIT;

-- Verification
SELECT 
  substring(name, 1, 40) as name,
  CASE WHEN cholesterol IS NOT NULL AND iron IS NOT NULL THEN '✅' ELSE '❌' END as ok,
  cholesterol
FROM shared_products 
WHERE id IN (
  '75cf049c-544b-4d2f-a94e-31c530905ab5',
  '8951c6b4-97db-498a-8915-e72d33c61331',
  '0f7f76bb-fcb6-4fbf-8a0e-858689fac0ba',
  '1af7f0a6-e2fd-458d-a22f-5af306fc7328',
  'b8d53e3a-7bec-4b40-8a30-6896e7b9129c',
  '3f027213-84ab-4b7d-b814-9d2dd1617847',
  '42c7832f-c9be-4de3-8a3d-737f088ab113',
  '22c618a5-3e62-4f00-9dc4-4033bac0b5f4',
  'cd4662ce-ddb1-4593-8c9d-d7d819f2d875',
  '08ef05ad-d5f3-41bb-a719-2b32a776eda1',
  '3f525987-fa48-43f2-b737-bc27c7dfa4aa',
  '2dcdf3d5-245b-4ec7-99e1-3f6339398748'
)
ORDER BY name;
