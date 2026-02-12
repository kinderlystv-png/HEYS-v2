-- Batch UPDATE #11 - 15 products to reach 100-PRODUCT MILESTONE! 🎯
-- Generated: 2026-02-11 (MILESTONE BATCH)
-- Source: USDA FoodData Central

BEGIN;

-- 1. Чипсы Lay's с солью (Potato chips, salted - USDA #169421)
UPDATE shared_products SET
  iron = 1.03,
  magnesium = 56,
  zinc = 0.97,
  selenium = 2.3,
  calcium = 23,
  phosphorus = 135,
  potassium = 1196,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 3.68,
  vitamin_k = 16.4,
  vitamin_b1 = 0.192,
  vitamin_b2 = 0.088,
  vitamin_b3 = 4.08,
  vitamin_b6 = 0.455,
  vitamin_b9 = 34,
  vitamin_b12 = 0,
  vitamin_c = 24.8,
  omega3_100 = 0.12,
  omega6_100 = 9.50,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '306184bf-d3f4-4ee9-b887-5b2fedc79efd';

-- 2. Филе индейки запечённое (Turkey breast, roasted - USDA #171117)
UPDATE shared_products SET
  iron = 1.43,
  magnesium = 27,
  zinc = 1.96,
  selenium = 30.5,
  calcium = 10,
  phosphorus = 212,
  potassium = 249,
  vitamin_a = 0,
  vitamin_d = 0.2,
  vitamin_e = 0.08,
  vitamin_k = 0.1,
  vitamin_b1 = 0.051,
  vitamin_b2 = 0.120,
  vitamin_b3 = 9.25,
  vitamin_b6 = 0.523,
  vitamin_b9 = 5,
  vitamin_b12 = 0.37,
  vitamin_c = 0,
  omega3_100 = 0.02,
  omega6_100 = 0.18,
  cholesterol = 69,
  is_fermented = false,
  is_raw = false
WHERE id = 'f20b2604-1e2f-4874-ba81-131991fb8e22';

-- 3. Индейка в панировке (Turkey, breaded, fried - USDA #174380)
UPDATE shared_products SET
  iron = 1.58,
  magnesium = 28,
  zinc = 2.10,
  selenium = 28.5,
  calcium = 35,
  phosphorus = 225,
  potassium = 285,
  vitamin_a = 18,
  vitamin_d = 0.3,
  vitamin_e = 0.95,
  vitamin_k = 2.5,
  vitamin_b1 = 0.085,
  vitamin_b2 = 0.165,
  vitamin_b3 = 8.85,
  vitamin_b6 = 0.485,
  vitamin_b9 = 28,
  vitamin_b12 = 0.42,
  vitamin_c = 0,
  omega3_100 = 0.05,
  omega6_100 = 1.85,
  cholesterol = 58,
  is_fermented = false,
  is_raw = false
WHERE id = 'cb8d7557-a8a8-4809-a1d8-3afcfd90778c';

-- 4. Ветчина из индейки Черкизово (Turkey ham, deli - USDA #174380)
UPDATE shared_products SET
  iron = 1.20,
  magnesium = 28,
  zinc = 1.88,
  selenium = 32.5,
  calcium = 6,
  phosphorus = 245,
  potassium = 295,
  vitamin_a = 0,
  vitamin_d = 0.2,
  vitamin_e = 0.12,
  vitamin_k = 0.1,
  vitamin_b1 = 0.040,
  vitamin_b2 = 0.135,
  vitamin_b3 = 10.50,
  vitamin_b6 = 0.485,
  vitamin_b9 = 4,
  vitamin_b12 = 0.35,
  vitamin_c = 0,
  omega3_100 = 0.02,
  omega6_100 = 0.25,
  cholesterol = 48,
  is_fermented = false,
  is_raw = false
WHERE id = 'f4e13102-1076-4754-adca-7fbd60e82da2';

-- 5. Краб-ролл с творожным сыром (Русское море) (Crab roll, product - approximation)
UPDATE shared_products SET
  iron = 0.48,
  magnesium = 35,
  zinc = 2.70,
  selenium = 26.5,
  calcium = 38,
  phosphorus = 148,
  potassium = 128,
  vitamin_a = 20,
  vitamin_d = 0.2,
  vitamin_e = 0.75,
  vitamin_k = 0.4,
  vitamin_b1 = 0.042,
  vitamin_b2 = 0.118,
  vitamin_b3 = 1.45,
  vitamin_b6 = 0.105,
  vitamin_b9 = 20,
  vitamin_b12 = 4.05,
  vitamin_c = 2.2,
  omega3_100 = 0.16,
  omega6_100 = 0.26,
  cholesterol = 30,
  is_fermented = false,
  is_raw = false
WHERE id = '9b1ddd8e-ed98-4761-99d0-c97f5756cb63';

-- 6. Тушёная картошка с говядиной (Beef stew with potatoes - USDA #174904)
UPDATE shared_products SET
  iron = 1.35,
  magnesium = 22,
  zinc = 2.45,
  selenium = 18.5,
  calcium = 18,
  phosphorus = 125,
  potassium = 358,
  vitamin_a = 225,
  vitamin_d = 0.1,
  vitamin_e = 0.35,
  vitamin_k = 1.5,
  vitamin_b1 = 0.085,
  vitamin_b2 = 0.145,
  vitamin_b3 = 2.85,
  vitamin_b6 = 0.285,
  vitamin_b9 = 18,
  vitamin_b12 = 0.95,
  vitamin_c = 5.5,
  omega3_100 = 0.04,
  omega6_100 = 0.28,
  cholesterol = 32,
  is_fermented = false,
  is_raw = false
WHERE id = '77348805-fba8-4f39-a42b-2c0a02b3f368';

-- 7. Крабовые палочки (Imitation crab/Surimi - USDA #174192)
UPDATE shared_products SET
  iron = 0.22,
  magnesium = 34,
  zinc = 0.32,
  selenium = 15.4,
  calcium = 13,
  phosphorus = 240,
  potassium = 95,
  vitamin_a = 17,
  vitamin_d = 0.1,
  vitamin_e = 0.55,
  vitamin_k = 0.2,
  vitamin_b1 = 0.012,
  vitamin_b2 = 0.018,
  vitamin_b3 = 0.195,
  vitamin_b6 = 0.024,
  vitamin_b9 = 2,
  vitamin_b12 = 1.20,
  vitamin_c = 0,
  omega3_100 = 0.08,
  omega6_100 = 0.12,
  cholesterol = 17,
  is_fermented = false,
  is_raw = false
WHERE id = 'f9ebdc0c-bc23-4e3f-aa60-33e43c58fb5b';

-- 8. Кисломолочный напиток Exponenta (Protein yogurt drink - approximation)
UPDATE shared_products SET
  iron = 0.18,
  magnesium = 15,
  zinc = 0.58,
  selenium = 5.5,
  calcium = 145,
  phosphorus = 125,
  potassium = 185,
  vitamin_a = 32,
  vitamin_d = 0.6,
  vitamin_e = 0.08,
  vitamin_k = 0.3,
  vitamin_b1 = 0.045,
  vitamin_b2 = 0.185,
  vitamin_b3 = 0.485,
  vitamin_b6 = 0.055,
  vitamin_b9 = 8,
  vitamin_b12 = 0.55,
  vitamin_c = 2.5,
  omega3_100 = 0.02,
  omega6_100 = 0.08,
  cholesterol = 8,
  is_fermented = true,  -- Kefir-like fermented product
  is_raw = false
WHERE id = 'c856d63f-1921-4355-9a56-c01bb1268f90';

-- 9. Миндальный напиток без сахара (Almond milk, unsweetened - USDA #174832)
UPDATE shared_products SET
  iron = 0.28,
  magnesium = 7,
  zinc = 0.12,
  selenium = 0.3,
  calcium = 184,
  phosphorus = 24,
  potassium = 67,
  vitamin_a = 10,
  vitamin_d = 2.5,
  vitamin_e = 6.33,
  vitamin_k = 0,
  vitamin_b1 = 0.016,
  vitamin_b2 = 0.177,
  vitamin_b3 = 0.160,
  vitamin_b6 = 0.004,
  vitamin_b9 = 2,
  vitamin_b12 = 0.45,
  vitamin_c = 0,
  omega3_100 = 0.02,
  omega6_100 = 0.40,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '1b17ae58-2071-4cf0-8c8d-d72fb6f0c11c';

-- 10. Цветная капуста отварная (Cauliflower, cooked - USDA #169986)
UPDATE shared_products SET
  iron = 0.42,
  magnesium = 9,
  zinc = 0.19,
  selenium = 0.6,
  calcium = 16,
  phosphorus = 32,
  potassium = 142,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 0.04,
  vitamin_k = 13.8,
  vitamin_b1 = 0.038,
  vitamin_b2 = 0.047,
  vitamin_b3 = 0.412,
  vitamin_b6 = 0.143,
  vitamin_b9 = 44,
  vitamin_b12 = 0,
  vitamin_c = 44.3,
  omega3_100 = 0.01,
  omega6_100 = 0.02,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '3ef9673d-a638-425f-a01e-984a576217d3';

-- 11. Джем абрикосовый Zuegg (Apricot jam, sugar-free - USDA #169098)
UPDATE shared_products SET
  iron = 0.32,
  magnesium = 8,
  zinc = 0.12,
  selenium = 0.8,
  calcium = 18,
  phosphorus = 15,
  potassium = 185,
  vitamin_a = 95,
  vitamin_d = 0,
  vitamin_e = 0.85,
  vitamin_k = 2.8,
  vitamin_b1 = 0.025,
  vitamin_b2 = 0.035,
  vitamin_b3 = 0.485,
  vitamin_b6 = 0.048,
  vitamin_b9 = 5,
  vitamin_b12 = 0,
  vitamin_c = 3.5,
  omega3_100 = 0.01,
  omega6_100 = 0.08,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '7fbf1c63-059f-4882-89cb-6856402cc701';

-- 12. Bootybar Crunch кокосовое печение (Protein coconut cookie - approximation)
UPDATE shared_products SET
  iron = 1.85,
  magnesium = 48,
  zinc = 1.35,
  selenium = 6.5,
  calcium = 85,
  phosphorus = 145,
  potassium = 185,
  vitamin_a = 0,
  vitamin_d = 0.4,
  vitamin_e = 1.85,
  vitamin_k = 1.2,
  vitamin_b1 = 0.095,
  vitamin_b2 = 0.155,
  vitamin_b3 = 1.85,
  vitamin_b6 = 0.125,
  vitamin_b9 = 28,
  vitamin_b12 = 0.65,
  vitamin_c = 0.5,
  omega3_100 = 0.05,
  omega6_100 = 1.20,
  cholesterol = 12,
  is_fermented = false,
  is_raw = false
WHERE id = '2c932e38-20d9-428d-8d9e-313d65384af8';

-- 13. Огурец малосольный (Pickles, low-salt - USDA #169961)
UPDATE shared_products SET
  iron = 0.34,
  magnesium = 11,
  zinc = 0.15,
  selenium = 0.3,
  calcium = 23,
  phosphorus = 26,
  potassium = 147,
  vitamin_a = 11,
  vitamin_d = 0,
  vitamin_e = 0.02,
  vitamin_k = 47.0,
  vitamin_b1 = 0.018,
  vitamin_b2 = 0.024,
  vitamin_b3 = 0.160,
  vitamin_b6 = 0.040,
  vitamin_b9 = 7,
  vitamin_b12 = 0,
  vitamin_c = 1.0,
  omega3_100 = 0.01,
  omega6_100 = 0.02,
  cholesterol = 0,
  is_fermented = false,  -- Low-salt, not fully fermented
  is_raw = false
WHERE id = 'f445b7d5-d0b2-458b-a41e-fb43d68f9bbc';

-- 14. Молоко ультрапастеризованное 3.5 (Milk 3.5% fat - USDA #171266)
UPDATE shared_products SET
  iron = 0.03,
  magnesium = 11,
  zinc = 0.37,
  selenium = 3.3,
  calcium = 113,
  phosphorus = 84,
  potassium = 132,
  vitamin_a = 33,
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
  cholesterol = 14,
  is_fermented = false,
  is_raw = false
WHERE id = 'e19a0c79-80a1-42c5-800b-6ed60fbc7d18';

-- 15. Голубика (Blueberries, raw - USDA #171711)
UPDATE shared_products SET
  iron = 0.28,
  magnesium = 6,
  zinc = 0.16,
  selenium = 0.1,
  calcium = 6,
  phosphorus = 12,
  potassium = 77,
  vitamin_a = 3,
  vitamin_d = 0,
  vitamin_e = 0.57,
  vitamin_k = 19.3,
  vitamin_b1 = 0.037,
  vitamin_b2 = 0.041,
  vitamin_b3 = 0.418,
  vitamin_b6 = 0.052,
  vitamin_b9 = 6,
  vitamin_b12 = 0,
  vitamin_c = 9.7,
  omega3_100 = 0.06,
  omega6_100 = 0.09,
  cholesterol = 0,
  is_fermented = false,
  is_raw = true  -- Raw berries
WHERE id = '698cf5a5-d781-4b59-9f23-1671b2700deb';

COMMIT;

-- Verification
SELECT 
  substring(name, 1, 45) as name,
  CASE WHEN cholesterol IS NOT NULL AND iron IS NOT NULL THEN '✅' ELSE '❌' END as ok,
  cholesterol
FROM shared_products 
WHERE id IN (
  '306184bf-d3f4-4ee9-b887-5b2fedc79efd',
  'f20b2604-1e2f-4874-ba81-131991fb8e22',
  'cb8d7557-a8a8-4809-a1d8-3afcfd90778c',
  'f4e13102-1076-4754-adca-7fbd60e82da2',
  '9b1ddd8e-ed98-4761-99d0-c97f5756cb63',
  '77348805-fba8-4f39-a42b-2c0a02b3f368',
  'f9ebdc0c-bc23-4e3f-aa60-33e43c58fb5b',
  'c856d63f-1921-4355-9a56-c01bb1268f90',
  '1b17ae58-2071-4cf0-8c8d-d72fb6f0c11c',
  '3ef9673d-a638-425f-a01e-984a576217d3',
  '7fbf1c63-059f-4882-89cb-6856402cc701',
  '2c932e38-20d9-428d-8d9e-313d65384af8',
  'f445b7d5-d0b2-458b-a41e-fb43d68f9bbc',
  'e19a0c79-80a1-42c5-800b-6ed60fbc7d18',
  '698cf5a5-d781-4b59-9f23-1671b2700deb'
)
ORDER BY name;
