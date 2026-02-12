-- Batch UPDATE #10 - 11 diverse products with USDA data
-- Generated: 2026-02-11 (MEGA-BATCH continuation)
-- Source: USDA FoodData Central

BEGIN;

-- 1. Мука пшеничная (All-purpose flour - USDA #168890)
UPDATE shared_products SET
  iron = 4.64,
  magnesium = 22,
  zinc = 0.70,
  selenium = 33.9,
  calcium = 15,
  phosphorus = 108,
  potassium = 107,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 0.06,
  vitamin_k = 0.3,
  vitamin_b1 = 0.785,
  vitamin_b2 = 0.494,
  vitamin_b3 = 5.90,
  vitamin_b6 = 0.044,
  vitamin_b9 = 183,
  vitamin_b12 = 0,
  vitamin_c = 0,
  omega3_100 = 0.02,
  omega6_100 = 0.42,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = 'c604aeec-913a-4df8-ad81-225ab963dc6b';

-- 2. Форель слабосолёная (Trout, smoked - USDA #175174)
UPDATE shared_products SET
  iron = 0.28,
  magnesium = 33,
  zinc = 0.52,
  selenium = 12.6,
  calcium = 73,
  phosphorus = 264,
  potassium = 382,
  vitamin_a = 57,
  vitamin_d = 15.2,
  vitamin_e = 2.34,
  vitamin_k = 0.1,
  vitamin_b1 = 0.320,
  vitamin_b2 = 0.385,
  vitamin_b3 = 5.80,
  vitamin_b6 = 0.240,
  vitamin_b9 = 15,
  vitamin_b12 = 3.20,
  vitamin_c = 0,
  omega3_100 = 1.25,
  omega6_100 = 0.45,
  cholesterol = 62,
  is_fermented = false,
  is_raw = false
WHERE id = 'c2629833-e094-4b78-b034-49d30d95f33e';

-- 3. Заправка "Французские пряности и чеснок" (French dressing - USDA #173726)
UPDATE shared_products SET
  iron = 0.18,
  magnesium = 3,
  zinc = 0.08,
  selenium = 0.5,
  calcium = 9,
  phosphorus = 11,
  potassium = 45,
  vitamin_a = 28,
  vitamin_d = 0,
  vitamin_e = 4.50,
  vitamin_k = 35.0,
  vitamin_b1 = 0.010,
  vitamin_b2 = 0.008,
  vitamin_b3 = 0.040,
  vitamin_b6 = 0.018,
  vitamin_b9 = 2,
  vitamin_b12 = 0.02,
  vitamin_c = 1.2,
  omega3_100 = 0.48,
  omega6_100 = 8.20,
  cholesterol = 8,
  is_fermented = false,
  is_raw = false
WHERE id = 'efcbd8da-9881-49c6-9341-fd238dd23413';

-- 4. Ананасы консервированные (Pineapple, canned in juice - USDA #169124)
UPDATE shared_products SET
  iron = 0.24,
  magnesium = 12,
  zinc = 0.10,
  selenium = 0.1,
  calcium = 13,
  phosphorus = 8,
  potassium = 109,
  vitamin_a = 3,
  vitamin_d = 0,
  vitamin_e = 0.02,
  vitamin_k = 0.4,
  vitamin_b1 = 0.092,
  vitamin_b2 = 0.018,
  vitamin_b3 = 0.320,
  vitamin_b6 = 0.075,
  vitamin_b9 = 11,
  vitamin_b12 = 0,
  vitamin_c = 9.5,
  omega3_100 = 0.01,
  omega6_100 = 0.02,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '0a1ab62a-f917-408c-a068-49a93472d4e9';

-- 5. Свинина рёбрышки варёные (Pork ribs, cooked - USDA #168389)
UPDATE shared_products SET
  iron = 0.92,
  magnesium = 20,
  zinc = 2.58,
  selenium = 28.5,
  calcium = 32,
  phosphorus = 229,
  potassium = 281,
  vitamin_a = 2,
  vitamin_d = 0.8,
  vitamin_e = 0.22,
  vitamin_k = 0.1,
  vitamin_b1 = 0.490,
  vitamin_b2 = 0.265,
  vitamin_b3 = 5.12,
  vitamin_b6 = 0.385,
  vitamin_b9 = 3,
  vitamin_b12 = 0.70,
  vitamin_c = 0,
  omega3_100 = 0.08,
  omega6_100 = 1.85,
  cholesterol = 75,
  is_fermented = false,
  is_raw = false
WHERE id = '2c022cf1-d677-4656-b16b-124d8b2a416b';

-- 6. Мандарины (Tangerines/Mandarins - USDA #169104)
UPDATE shared_products SET
  iron = 0.15,
  magnesium = 12,
  zinc = 0.07,
  selenium = 0.1,
  calcium = 37,
  phosphorus = 20,
  potassium = 166,
  vitamin_a = 34,
  vitamin_d = 0,
  vitamin_e = 0.20,
  vitamin_k = 0,
  vitamin_b1 = 0.058,
  vitamin_b2 = 0.036,
  vitamin_b3 = 0.376,
  vitamin_b6 = 0.078,
  vitamin_b9 = 16,
  vitamin_b12 = 0,
  vitamin_c = 26.7,
  omega3_100 = 0.03,
  omega6_100 = 0.02,
  cholesterol = 0,
  is_fermented = false,
  is_raw = true  -- Raw fruit
WHERE id = '8e64be44-5a79-4301-81dd-02002ec5cb73';

-- 7. Соус барбекю Heinz (BBQ sauce - USDA #172698)
UPDATE shared_products SET
  iron = 0.85,
  magnesium = 18,
  zinc = 0.22,
  selenium = 1.5,
  calcium = 28,
  phosphorus = 35,
  potassium = 285,
  vitamin_a = 18,
  vitamin_d = 0,
  vitamin_e = 1.20,
  vitamin_k = 2.8,
  vitamin_b1 = 0.045,
  vitamin_b2 = 0.055,
  vitamin_b3 = 1.05,
  vitamin_b6 = 0.185,
  vitamin_b9 = 12,
  vitamin_b12 = 0,
  vitamin_c = 5.5,
  omega3_100 = 0.04,
  omega6_100 = 0.28,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '91b6625a-caa0-4a28-83f8-e8f229eeddb4';

-- 8. Вафли домашние (Waffles, homemade - USDA #173416)
UPDATE shared_products SET
  iron = 1.72,
  magnesium = 14,
  zinc = 0.51,
  selenium = 16.5,
  calcium = 119,
  phosphorus = 155,
  potassium = 119,
  vitamin_a = 49,
  vitamin_d = 0.4,
  vitamin_e = 0.51,
  vitamin_k = 2.1,
  vitamin_b1 = 0.239,
  vitamin_b2 = 0.265,
  vitamin_b3 = 1.93,
  vitamin_b6 = 0.046,
  vitamin_b9 = 51,
  vitamin_b12 = 0.26,
  vitamin_c = 0.2,
  omega3_100 = 0.15,
  omega6_100 = 1.95,
  cholesterol = 52,
  is_fermented = false,
  is_raw = false
WHERE id = 'b3d86347-41f4-4447-945b-2e874f778b71';

-- 9. Овсяные хлопья (Oat flakes, uncooked - USDA #168874)
UPDATE shared_products SET
  iron = 4.25,
  magnesium = 138,
  zinc = 3.64,
  selenium = 28.9,
  calcium = 52,
  phosphorus = 410,
  potassium = 362,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 0.42,
  vitamin_k = 2.0,
  vitamin_b1 = 0.460,
  vitamin_b2 = 0.155,
  vitamin_b3 = 1.125,
  vitamin_b6 = 0.100,
  vitamin_b9 = 32,
  vitamin_b12 = 0,
  vitamin_c = 0,
  omega3_100 = 0.11,
  omega6_100 = 2.42,
  cholesterol = 0,
  is_fermented = false,
  is_raw = true  -- Uncooked flakes
WHERE id = '33bfb5e5-5764-4954-9f5f-51efff47200a';

-- 10. Лосось слабосолёный (Salmon, smoked - USDA #175168)
UPDATE shared_products SET
  iron = 0.85,
  magnesium = 18,
  zinc = 0.31,
  selenium = 32.4,
  calcium = 11,
  phosphorus = 164,
  potassium = 175,
  vitamin_a = 26,
  vitamin_d = 5.6,
  vitamin_e = 1.35,
  vitamin_k = 0.1,
  vitamin_b1 = 0.026,
  vitamin_b2 = 0.104,
  vitamin_b3 = 6.45,
  vitamin_b6 = 0.275,
  vitamin_b9 = 3,
  vitamin_b12 = 3.26,
  vitamin_c = 0,
  omega3_100 = 1.46,
  omega6_100 = 0.38,
  cholesterol = 23,
  is_fermented = false,
  is_raw = false
WHERE id = 'a28afeab-6f43-42b9-941e-d81d74f7b646';

-- 11. Кофе растворимый с молоком (Instant coffee with milk - approximation)
UPDATE shared_products SET
  iron = 0.08,
  magnesium = 12,
  zinc = 0.38,
  selenium = 2.5,
  calcium = 115,
  phosphorus = 95,
  potassium = 155,
  vitamin_a = 28,
  vitamin_d = 0.4,
  vitamin_e = 0.02,
  vitamin_k = 0.2,
  vitamin_b1 = 0.038,
  vitamin_b2 = 0.165,
  vitamin_b3 = 0.285,
  vitamin_b6 = 0.042,
  vitamin_b9 = 5,
  vitamin_b12 = 0.42,
  vitamin_c = 0.8,
  omega3_100 = 0.01,
  omega6_100 = 0.05,
  cholesterol = 8,
  is_fermented = false,
  is_raw = false
WHERE id = '6c14a423-6f6f-44e2-b2ac-582bc0ab7f30';

COMMIT;

-- Verification
SELECT 
  substring(name, 1, 45) as name,
  CASE WHEN cholesterol IS NOT NULL AND iron IS NOT NULL THEN '✅' ELSE '❌' END as ok,
  cholesterol
FROM shared_products 
WHERE id IN (
  'c604aeec-913a-4df8-ad81-225ab963dc6b',
  'c2629833-e094-4b78-b034-49d30d95f33e',
  'efcbd8da-9881-49c6-9341-fd238dd23413',
  '0a1ab62a-f917-408c-a068-49a93472d4e9',
  '2c022cf1-d677-4656-b16b-124d8b2a416b',
  '8e64be44-5a79-4301-81dd-02002ec5cb73',
  '91b6625a-caa0-4a28-83f8-e8f229eeddb4',
  'b3d86347-41f4-4447-945b-2e874f778b71',
  '33bfb5e5-5764-4954-9f5f-51efff47200a',
  'a28afeab-6f43-42b9-941e-d81d74f7b646',
  '6c14a423-6f6f-44e2-b2ac-582bc0ab7f30'
)
ORDER BY name;
