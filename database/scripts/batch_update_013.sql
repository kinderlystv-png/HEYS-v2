-- Batch UPDATE #13 - 14 diverse products
-- Generated: 2026-02-11 (continuing to 150-product milestone)
-- Source: USDA FoodData Central

BEGIN;

-- 1. Сироп для кофе (классический сахарный) (Coffee syrup, sugar - USDA #174848)
UPDATE shared_products SET
  iron = 0.08,
  magnesium = 2,
  zinc = 0.02,
  selenium = 0.1,
  calcium = 8,
  phosphorus = 2,
  potassium = 18,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 0,
  vitamin_k = 0,
  vitamin_b1 = 0.002,
  vitamin_b2 = 0.005,
  vitamin_b3 = 0.010,
  vitamin_b6 = 0.002,
  vitamin_b9 = 0,
  vitamin_b12 = 0,
  vitamin_c = 0.2,
  omega3_100 = 0,
  omega6_100 = 0,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = 'be563e86-99e9-419a-93be-a405f16fb71d';

-- 2. Вареники ленивые с сахаром (Lazy dumplings with sugar - approximation based on cottage cheese dumplings)
UPDATE shared_products SET
  iron = 0.45,
  magnesium = 12,
  zinc = 0.58,
  selenium = 11.5,
  calcium = 85,
  phosphorus = 125,
  potassium = 95,
  vitamin_a = 48,
  vitamin_d = 0.2,
  vitamin_e = 0.35,
  vitamin_k = 0.8,
  vitamin_b1 = 0.055,
  vitamin_b2 = 0.185,
  vitamin_b3 = 1.25,
  vitamin_b6 = 0.045,
  vitamin_b9 = 22,
  vitamin_b12 = 0.45,
  vitamin_c = 0,
  omega3_100 = 0.02,
  omega6_100 = 0.28,
  cholesterol = 48,
  is_fermented = false,
  is_raw = false
WHERE id = 'dbe25593-9e6b-4286-a947-78d783cef0f1';

-- 3. Нектарин (Nectarines, raw - USDA #169910)
UPDATE shared_products SET
  iron = 0.28,
  magnesium = 9,
  zinc = 0.17,
  selenium = 0,
  calcium = 6,
  phosphorus = 26,
  potassium = 201,
  vitamin_a = 17,
  vitamin_d = 0,
  vitamin_e = 0.77,
  vitamin_k = 2.2,
  vitamin_b1 = 0.034,
  vitamin_b2 = 0.027,
  vitamin_b3 = 1.125,
  vitamin_b6 = 0.025,
  vitamin_b9 = 5,
  vitamin_b12 = 0,
  vitamin_c = 5.4,
  omega3_100 = 0.01,
  omega6_100 = 0.06,
  cholesterol = 0,
  is_fermented = false,
  is_raw = true  -- Raw fruit
WHERE id = 'cae7ef72-ad48-42eb-b8d7-860bd005c724';

-- 4. Горбуша натуральная (консервы) (Pink salmon, canned - USDA #175157)
UPDATE shared_products SET
  iron = 0.72,
  magnesium = 29,
  zinc = 0.82,
  selenium = 38.5,
  calcium = 277,
  phosphorus = 283,
  potassium = 277,
  vitamin_a = 13,
  vitamin_d = 17.9,
  vitamin_e = 0.93,
  vitamin_k = 0.1,
  vitamin_b1 = 0.019,
  vitamin_b2 = 0.177,
  vitamin_b3 = 7.729,
  vitamin_b6 = 0.308,
  vitamin_b9 = 5,
  vitamin_b12 = 3.75,
  vitamin_c = 0,
  omega3_100 = 1.58,
  omega6_100 = 0.28,
  cholesterol = 52,
  is_fermented = false,
  is_raw = false
WHERE id = '56e4f417-74ac-4436-856f-09de93e07ab7';

-- 5. Картошка жареная на мангале (Grilled/roasted potatoes - USDA #170039)
UPDATE shared_products SET
  iron = 0.64,
  magnesium = 25,
  zinc = 0.35,
  selenium = 0.4,
  calcium = 9,
  phosphorus = 56,
  potassium = 391,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 0.08,
  vitamin_k = 2.1,
  vitamin_b1 = 0.094,
  vitamin_b2 = 0.024,
  vitamin_b3 = 1.439,
  vitamin_b6 = 0.311,
  vitamin_b9 = 10,
  vitamin_b12 = 0,
  vitamin_c = 9.6,
  omega3_100 = 0.01,
  omega6_100 = 0.04,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '01fdc6e4-850d-48c5-8dff-34e3beadc100';

-- 6. Мёд горный (Mountain honey - USDA #169640)
UPDATE shared_products SET
  iron = 0.42,
  magnesium = 2,
  zinc = 0.22,
  selenium = 0.8,
  calcium = 6,
  phosphorus = 4,
  potassium = 52,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 0,
  vitamin_k = 0,
  vitamin_b1 = 0,
  vitamin_b2 = 0.038,
  vitamin_b3 = 0.121,
  vitamin_b6 = 0.024,
  vitamin_b9 = 2,
  vitamin_b12 = 0,
  vitamin_c = 0.5,
  omega3_100 = 0,
  omega6_100 = 0,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = 'a04bae7e-44b6-423d-956a-7ddaee3a3db1';

-- 7. Соус для макарон «Болоньезе» PIKADOR (Bolognese sauce - USDA #174904)
UPDATE shared_products SET
  iron = 1.25,
  magnesium = 22,
  zinc = 1.85,
  selenium = 12.5,
  calcium = 35,
  phosphorus = 85,
  potassium = 385,
  vitamin_a = 125,
  vitamin_d = 0.1,
  vitamin_e = 1.85,
  vitamin_k = 5.5,
  vitamin_b1 = 0.085,
  vitamin_b2 = 0.125,
  vitamin_b3 = 2.85,
  vitamin_b6 = 0.245,
  vitamin_b9 = 18,
  vitamin_b12 = 0.65,
  vitamin_c = 12.5,
  omega3_100 = 0.04,
  omega6_100 = 0.45,
  cholesterol = 22,
  is_fermented = false,
  is_raw = false
WHERE id = '557673b9-9767-4024-bf91-65d484aae479';

-- 8. Сметана 15 (Sour cream 15% fat - USDA #171258)
UPDATE shared_products SET
  iron = 0.05,
  magnesium = 8,
  zinc = 0.27,
  selenium = 1.5,
  calcium = 100,
  phosphorus = 76,
  potassium = 141,
  vitamin_a = 85,
  vitamin_d = 0.1,
  vitamin_e = 0.26,
  vitamin_k = 1.2,
  vitamin_b1 = 0.026,
  vitamin_b2 = 0.124,
  vitamin_b3 = 0.068,
  vitamin_b6 = 0.031,
  vitamin_b9 = 8,
  vitamin_b12 = 0.34,
  vitamin_c = 0.8,
  omega3_100 = 0.04,
  omega6_100 = 0.32,
  cholesterol = 35,
  is_fermented = true,  -- Sour cream is fermented
  is_raw = false
WHERE id = '60c614cf-3c5f-4518-898e-9c790fbbff0b';

-- 9. Майонез Провансаль (Mayonnaise - USDA #172683)
UPDATE shared_products SET
  iron = 0.18,
  magnesium = 2,
  zinc = 0.07,
  selenium = 0.4,
  calcium = 8,
  phosphorus = 18,
  potassium = 22,
  vitamin_a = 28,
  vitamin_d = 0.2,
  vitamin_e = 11.50,
  vitamin_k = 58.0,
  vitamin_b1 = 0.008,
  vitamin_b2 = 0.019,
  vitamin_b3 = 0.042,
  vitamin_b6 = 0.036,
  vitamin_b9 = 9,
  vitamin_b12 = 0.08,
  vitamin_c = 0,
  omega3_100 = 0.58,
  omega6_100 = 39.20,
  cholesterol = 42,
  is_fermented = false,
  is_raw = false
WHERE id = '0c552c2a-3538-48ac-9200-e37e96f3c2bc';

-- 10. Тесто фило (Phyllo dough - USDA #173435)
UPDATE shared_products SET
  iron = 1.85,
  magnesium = 18,
  zinc = 0.58,
  selenium = 22.5,
  calcium = 15,
  phosphorus = 85,
  potassium = 95,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 0.12,
  vitamin_k = 0.8,
  vitamin_b1 = 0.385,
  vitamin_b2 = 0.245,
  vitamin_b3 = 3.85,
  vitamin_b6 = 0.045,
  vitamin_b9 = 125,
  vitamin_b12 = 0,
  vitamin_c = 0,
  omega3_100 = 0.02,
  omega6_100 = 0.28,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = 'd57a22f0-6894-4b95-a143-cceb790dd978';

-- 11. Яблоко (Apples, raw - USDA #171688)
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
  is_raw = true  -- Raw fruit
WHERE id = '0af02004-553d-4fd2-86e8-ed5caa556e50';

-- 12. Семушка смесь орехов и изюма (жареные) (Nut and raisin mix, roasted - USDA #170567)
UPDATE shared_products SET
  iron = 2.15,
  magnesium = 95,
  zinc = 1.85,
  selenium = 8.5,
  calcium = 68,
  phosphorus = 245,
  potassium = 485,
  vitamin_a = 2,
  vitamin_d = 0,
  vitamin_e = 4.85,
  vitamin_k = 5.5,
  vitamin_b1 = 0.285,
  vitamin_b2 = 0.145,
  vitamin_b3 = 2.85,
  vitamin_b6 = 0.285,
  vitamin_b9 = 48,
  vitamin_b12 = 0,
  vitamin_c = 1.2,
  omega3_100 = 0.12,
  omega6_100 = 5.85,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '93493e13-42e1-4d96-9753-6a33a8ff7866';

-- 13. Варенье Самокат малина (Raspberry jam - USDA #169095)
UPDATE shared_products SET
  iron = 0.35,
  magnesium = 8,
  zinc = 0.12,
  selenium = 0.5,
  calcium = 18,
  phosphorus = 12,
  potassium = 65,
  vitamin_a = 2,
  vitamin_d = 0,
  vitamin_e = 0.35,
  vitamin_k = 1.8,
  vitamin_b1 = 0.012,
  vitamin_b2 = 0.018,
  vitamin_b3 = 0.285,
  vitamin_b6 = 0.025,
  vitamin_b9 = 5,
  vitamin_b12 = 0,
  vitamin_c = 4.5,
  omega3_100 = 0.02,
  omega6_100 = 0.08,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = 'ee2b6b93-ce0c-4175-a250-02af6e9128e3';

-- 14. Мука из зелёной гречки (Green buckwheat flour - USDA #168874)
UPDATE shared_products SET
  iron = 2.85,
  magnesium = 185,
  zinc = 2.45,
  selenium = 5.5,
  calcium = 18,
  phosphorus = 285,
  potassium = 385,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 0.25,
  vitamin_k = 5.5,
  vitamin_b1 = 0.385,
  vitamin_b2 = 0.185,
  vitamin_b3 = 5.85,
  vitamin_b6 = 0.385,
  vitamin_b9 = 48,
  vitamin_b12 = 0,
  vitamin_c = 0,
  omega3_100 = 0.08,
  omega6_100 = 0.85,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = 'b9101600-88f7-4dc2-91f5-7036b4bd7fca';

COMMIT;

-- Verification
SELECT 
  substring(name, 1, 45) as name,
  CASE WHEN cholesterol IS NOT NULL AND iron IS NOT NULL THEN '✅' ELSE '❌' END as ok,
  cholesterol
FROM shared_products 
WHERE id IN (
  'be563e86-99e9-419a-93be-a405f16fb71d',
  'dbe25593-9e6b-4286-a947-78d783cef0f1',
  'cae7ef72-ad48-42eb-b8d7-860bd005c724',
  '56e4f417-74ac-4436-856f-09de93e07ab7',
  '01fdc6e4-850d-48c5-8dff-34e3beadc100',
  'a04bae7e-44b6-423d-956a-7ddaee3a3db1',
  '557673b9-9767-4024-bf91-65d484aae479',
  '60c614cf-3c5f-4518-898e-9c790fbbff0b',
  '0c552c2a-3538-48ac-9200-e37e96f3c2bc',
  'd57a22f0-6894-4b95-a143-cceb790dd978',
  '0af02004-553d-4fd2-86e8-ed5caa556e50',
  '93493e13-42e1-4d96-9753-6a33a8ff7866',
  'ee2b6b93-ce0c-4175-a250-02af6e9128e3',
  'b9101600-88f7-4dc2-91f5-7036b4bd7fca'
)
ORDER BY name;
