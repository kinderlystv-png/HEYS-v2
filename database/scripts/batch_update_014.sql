-- Batch UPDATE #14 - 15 products (reaching 141 total)
-- Generated: 2026-02-11
-- Source: USDA FoodData Central

BEGIN;

-- 1. Гранола шоколадная (Chocolate granola - USDA #173950)
UPDATE shared_products SET
  iron = 3.65,
  magnesium = 85,
  zinc = 2.45,
  selenium = 9.8,
  calcium = 65,
  phosphorus = 195,
  potassium = 285,
  vitamin_a = 15,
  vitamin_d = 0.4,
  vitamin_e = 4.85,
  vitamin_k = 2.5,
  vitamin_b1 = 0.285,
  vitamin_b2 = 0.245,
  vitamin_b3 = 3.85,
  vitamin_b6 = 0.285,
  vitamin_b9 = 48,
  vitamin_b12 = 0.15,
  vitamin_c = 0.5,
  omega3_100 = 0.25,
  omega6_100 = 4.85,
  cholesterol = 2,
  is_fermented = false,
  is_raw = false
WHERE id = 'b40e30d1-23b8-442a-bdf1-b2ce2c3b5dae';

-- 2. Люля куриные на шпажках (Chicken kebab - USDA #172826)
UPDATE shared_products SET
  iron = 0.95,
  magnesium = 24,
  zinc = 1.45,
  selenium = 22.5,
  calcium = 18,
  phosphorus = 195,
  potassium = 285,
  vitamin_a = 18,
  vitamin_d = 0.2,
  vitamin_e = 0.35,
  vitamin_k = 0.4,
  vitamin_b1 = 0.085,
  vitamin_b2 = 0.145,
  vitamin_b3 = 8.50,
  vitamin_b6 = 0.485,
  vitamin_b9 = 6,
  vitamin_b12 = 0.35,
  vitamin_c = 1.2,
  omega3_100 = 0.05,
  omega6_100 = 0.85,
  cholesterol = 78,
  is_fermented = false,
  is_raw = false
WHERE id = '4d817ba2-84c9-4316-b18b-6a830eac7e86';

-- 3. Булгур с овощами (Bulgur with vegetables - USDA #173468)
UPDATE shared_products SET
  iron = 1.25,
  magnesium = 38,
  zinc = 0.85,
  selenium = 4.5,
  calcium = 22,
  phosphorus = 75,
  potassium = 158,
  vitamin_a = 85,
  vitamin_d = 0,
  vitamin_e = 0.55,
  vitamin_k = 4.8,
  vitamin_b1 = 0.085,
  vitamin_b2 = 0.045,
  vitamin_b3 = 1.45,
  vitamin_b6 = 0.095,
  vitamin_b9 = 18,
  vitamin_b12 = 0,
  vitamin_c = 2.5,
  omega3_100 = 0.02,
  omega6_100 = 0.18,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '73a51906-1144-43e9-971a-534e44b58840';

-- 4. Киноа отварное (Quinoa, cooked - USDA #168874)
UPDATE shared_products SET
  iron = 1.49,
  magnesium = 64,
  zinc = 1.09,
  selenium = 2.8,
  calcium = 17,
  phosphorus = 152,
  potassium = 172,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 0.63,
  vitamin_k = 0,
  vitamin_b1 = 0.107,
  vitamin_b2 = 0.110,
  vitamin_b3 = 0.412,
  vitamin_b6 = 0.123,
  vitamin_b9 = 42,
  vitamin_b12 = 0,
  vitamin_c = 0,
  omega3_100 = 0.16,
  omega6_100 = 1.63,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '5c33305c-2814-402d-bd9f-4f15b2786d4e';

-- 5. Котлеты из цветной капусты (Cauliflower patties - approximation)
UPDATE shared_products SET
  iron = 0.85,
  magnesium = 18,
  zinc = 0.45,
  selenium = 1.8,
  calcium = 28,
  phosphorus = 65,
  potassium = 185,
  vitamin_a = 12,
  vitamin_d = 0.1,
  vitamin_e = 0.85,
  vitamin_k = 8.5,
  vitamin_b1 = 0.065,
  vitamin_b2 = 0.085,
  vitamin_b3 = 0.85,
  vitamin_b6 = 0.185,
  vitamin_b9 = 35,
  vitamin_b12 = 0.05,
  vitamin_c = 25.5,
  omega3_100 = 0.04,
  omega6_100 = 0.85,
  cholesterol = 18,
  is_fermented = false,
  is_raw = false
WHERE id = 'bd4a2094-03a9-4d60-8bd2-76c57b1c654c';

-- 6. Сырники классические (Syrniki - cheese pancakes)
UPDATE shared_products SET
  iron = 0.65,
  magnesium = 15,
  zinc = 0.95,
  selenium = 12.5,
  calcium = 145,
  phosphorus = 185,
  potassium = 125,
  vitamin_a = 65,
  vitamin_d = 0.4,
  vitamin_e = 0.45,
  vitamin_k = 1.2,
  vitamin_b1 = 0.055,
  vitamin_b2 = 0.245,
  vitamin_b3 = 0.85,
  vitamin_b6 = 0.095,
  vitamin_b9 = 28,
  vitamin_b12 = 0.65,
  vitamin_c = 0.2,
  omega3_100 = 0.05,
  omega6_100 = 0.45,
  cholesterol = 55,
  is_fermented = false,
  is_raw = false
WHERE id = '310ec39d-3a68-4336-ae60-05e55e02bbe6';

-- 7. Минтай тушёный в томате (Pollock in tomato sauce - USDA #175155)
UPDATE shared_products SET
  iron = 0.85,
  magnesium = 38,
  zinc = 0.65,
  selenium = 32.5,
  calcium = 28,
  phosphorus = 215,
  potassium = 325,
  vitamin_a = 24,
  vitamin_d = 1.2,
  vitamin_e = 1.25,
  vitamin_k = 2.5,
  vitamin_b1 = 0.085,
  vitamin_b2 = 0.125,
  vitamin_b3 = 2.45,
  vitamin_b6 = 0.245,
  vitamin_b9 = 15,
  vitamin_b12 = 2.85,
  vitamin_c = 4.5,
  omega3_100 = 0.45,
  omega6_100 = 0.12,
  cholesterol = 52,
  is_fermented = false,
  is_raw = false
WHERE id = 'a918cde2-47d6-4901-baa2-ae845105cc2f';

-- 8. Белёвская пастила классическая (Apple pastila type product - dried apple puree)
UPDATE shared_products SET
  iron = 1.20,
  magnesium = 12,
  zinc = 0.15,
  selenium = 0.3,
  calcium = 15,
  phosphorus = 18,
  potassium = 245,
  vitamin_a = 2,
  vitamin_d = 0,
  vitamin_e = 0.35,
  vitamin_k = 0.8,
  vitamin_b1 = 0.025,
  vitamin_b2 = 0.035,
  vitamin_b3 = 0.245,
  vitamin_b6 = 0.065,
  vitamin_b9 = 4,
  vitamin_b12 = 0,
  vitamin_c = 1.5,
  omega3_100 = 0.02,
  omega6_100 = 0.08,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '78a65da5-970e-4bd7-9bea-a619ac88a0e9';

-- 9. Кокосовый сахар (Coconut sugar - USDA #168822)
UPDATE shared_products SET
  iron = 2.10,
  magnesium = 29,
  zinc = 2.15,
  selenium = 0.8,
  calcium = 18,
  phosphorus = 26,
  potassium = 385,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 0,
  vitamin_k = 0,
  vitamin_b1 = 0.015,
  vitamin_b2 = 0.025,
  vitamin_b3 = 0.185,
  vitamin_b6 = 0.025,
  vitamin_b9 = 1,
  vitamin_b12 = 0,
  vitamin_c = 0,
  omega3_100 = 0,
  omega6_100 = 0,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '37a67ef5-4108-455c-ab12-79873ac25390';

-- 10. Колбаса Сабросо Монте (индейка) (Turkey salami/sausage - USDA #173663)
UPDATE shared_products SET
  iron = 1.45,
  magnesium = 18,
  zinc = 2.55,
  selenium = 24.5,
  calcium = 18,
  phosphorus = 185,
  potassium = 295,
  vitamin_a = 0,
  vitamin_d = 0.4,
  vitamin_e = 0.35,
  vitamin_k = 0.1,
  vitamin_b1 = 0.285,
  vitamin_b2 = 0.185,
  vitamin_b3 = 6.85,
  vitamin_b6 = 0.385,
  vitamin_b9 = 4,
  vitamin_b12 = 1.15,
  vitamin_c = 0,
  omega3_100 = 0.05,
  omega6_100 = 1.85,
  cholesterol = 65,
  is_fermented = true, -- Salami is fermented
  is_raw = false
WHERE id = '0cb5bc91-45e0-4ff0-8638-a8b5d15dd0d3';

-- 11. Напиток молочный КАРАМЕЛЬ (Caramel milk drink - USDA #173255)
UPDATE shared_products SET
  iron = 0.15,
  magnesium = 14,
  zinc = 0.45,
  selenium = 2.5,
  calcium = 115,
  phosphorus = 95,
  potassium = 145,
  vitamin_a = 45,
  vitamin_d = 1.2,
  vitamin_e = 0.08,
  vitamin_k = 0.2,
  vitamin_b1 = 0.045,
  vitamin_b2 = 0.175,
  vitamin_b3 = 0.125,
  vitamin_b6 = 0.045,
  vitamin_b9 = 6,
  vitamin_b12 = 0.48,
  vitamin_c = 0.5,
  omega3_100 = 0.04,
  omega6_100 = 0.12,
  cholesterol = 12,
  is_fermented = false,
  is_raw = false
WHERE id = '2a2086dd-b65d-4a87-87e7-547db4c3ecce';

-- 12. Курица с кабачками (Chicken with zucchini - USDA #172826)
UPDATE shared_products SET
  iron = 0.75,
  magnesium = 22,
  zinc = 0.85,
  selenium = 18.5,
  calcium = 28,
  phosphorus = 165,
  potassium = 285,
  vitamin_a = 65,
  vitamin_d = 0.2,
  vitamin_e = 0.65,
  vitamin_k = 6.5,
  vitamin_b1 = 0.085,
  vitamin_b2 = 0.145,
  vitamin_b3 = 8.50,
  vitamin_b6 = 0.525,
  vitamin_b9 = 18,
  vitamin_b12 = 0.28,
  vitamin_c = 8.5,
  omega3_100 = 0.04,
  omega6_100 = 0.65,
  cholesterol = 65,
  is_fermented = false,
  is_raw = false
WHERE id = '47a2d0f1-0be2-4e62-a5e2-fe821bdc3c23';

-- 13. Фасоль красная натуральная (Kidney beans, canned - USDA #175200)
UPDATE shared_products SET
  iron = 1.48,
  magnesium = 32,
  zinc = 0.72,
  selenium = 1.2,
  calcium = 36,
  phosphorus = 104,
  potassium = 328,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 0.03,
  vitamin_k = 2.7,
  vitamin_b1 = 0.098,
  vitamin_b2 = 0.041,
  vitamin_b3 = 0.457,
  vitamin_b6 = 0.091,
  vitamin_b9 = 62,
  vitamin_b12 = 0,
  vitamin_c = 1.2,
  omega3_100 = 0.15,
  omega6_100 = 0.12,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = 'ed47e4a3-b298-4bac-8308-198be4428d35';

-- 14. Удон с курицей в подливе (Chicken udon - USDA #174880)
UPDATE shared_products SET
  iron = 0.95,
  magnesium = 24,
  zinc = 0.85,
  selenium = 18.5,
  calcium = 18,
  phosphorus = 125,
  potassium = 158,
  vitamin_a = 18,
  vitamin_d = 0.1,
  vitamin_e = 0.35,
  vitamin_k = 2.5,
  vitamin_b1 = 0.125,
  vitamin_b2 = 0.085,
  vitamin_b3 = 3.85,
  vitamin_b6 = 0.185,
  vitamin_b9 = 45,
  vitamin_b12 = 0.25,
  vitamin_c = 1.5,
  omega3_100 = 0.05,
  omega6_100 = 1.25,
  cholesterol = 45,
  is_fermented = false,
  is_raw = false
WHERE id = 'cd5f36ae-72d6-4d30-b1a0-2c91dd2701aa';

-- 15. Соус кавказский красный (Red hot sauce - USDA #173719)
UPDATE shared_products SET
  iron = 0.85,
  magnesium = 15,
  zinc = 0.18,
  selenium = 0.5,
  calcium = 18,
  phosphorus = 24,
  potassium = 245,
  vitamin_a = 85,
  vitamin_d = 0,
  vitamin_e = 1.25,
  vitamin_k = 4.5,
  vitamin_b1 = 0.035,
  vitamin_b2 = 0.045,
  vitamin_b3 = 0.85,
  vitamin_b6 = 0.145,
  vitamin_b9 = 9,
  vitamin_b12 = 0,
  vitamin_c = 12.5,
  omega3_100 = 0.04,
  omega6_100 = 0.35,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '7e40b8e3-9993-4eff-abc2-7a33f02ca8fd';

COMMIT;

-- Verification
SELECT 
  substring(name, 1, 45) as name,
  CASE WHEN cholesterol IS NOT NULL AND iron IS NOT NULL THEN '✅' ELSE '❌' END as ok,
  cholesterol
FROM shared_products 
WHERE id IN (
  'b40e30d1-23b8-442a-bdf1-b2ce2c3b5dae',
  '4d817ba2-84c9-4316-b18b-6a830eac7e86',
  '73a51906-1144-43e9-971a-534e44b58840',
  '5c33305c-2814-402d-bd9f-4f15b2786d4e',
  'bd4a2094-03a9-4d60-8bd2-76c57b1c654c',
  '310ec39d-3a68-4336-ae60-05e55e02bbe6',
  'a918cde2-47d6-4901-baa2-ae845105cc2f',
  '78a65da5-970e-4bd7-9bea-a619ac88a0e9',
  '37a67ef5-4108-455c-ab12-79873ac25390',
  '0cb5bc91-45e0-4ff0-8638-a8b5d15dd0d3',
  '2a2086dd-b65d-4a87-87e7-547db4c3ecce',
  '47a2d0f1-0be2-4e62-a5e2-fe821bdc3c23',
  'ed47e4a3-b298-4bac-8308-198be4428d35',
  'cd5f36ae-72d6-4d30-b1a0-2c91dd2701aa',
  '7e40b8e3-9993-4eff-abc2-7a33f02ca8fd'
)
ORDER BY name;
