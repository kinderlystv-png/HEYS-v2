-- Batch UPDATE #16 - 18 products
-- Generated: 2026-02-11
-- Source: USDA FoodData Central

BEGIN;

-- 1. Капуста квашеная сладкая (Sauerkraut - USDA #169994 + sugar)
UPDATE shared_products SET
  iron = 1.47,
  magnesium = 13,
  zinc = 0.19,
  selenium = 0.6,
  calcium = 30,
  phosphorus = 20,
  potassium = 170,
  vitamin_a = 1,
  vitamin_d = 0,
  vitamin_e = 0.14,
  vitamin_k = 13.0,
  vitamin_b1 = 0.021,
  vitamin_b2 = 0.022,
  vitamin_b3 = 0.143,
  vitamin_b6 = 0.130,
  vitamin_b9 = 24,
  vitamin_b12 = 0,
  vitamin_c = 14.7,
  omega3_100 = 0.08,
  omega6_100 = 0.06,
  cholesterol = 0,
  is_fermented = true,  -- Sauerkraut is fermented
  is_raw = true   -- Raw fermented vegetable
WHERE id = 'a2add072-661c-4fcd-9b94-e20cb531f0b7';

-- 2. Chikalab Chika Layers Crispy Cookies (Protein bar approximation)
UPDATE shared_products SET
  iron = 2.45,
  magnesium = 58,
  zinc = 1.85,
  selenium = 8.5,
  calcium = 125,
  phosphorus = 195,
  potassium = 245,
  vitamin_a = 15,
  vitamin_d = 0.4,
  vitamin_e = 2.85,
  vitamin_k = 1.2,
  vitamin_b1 = 0.125,
  vitamin_b2 = 0.245,
  vitamin_b3 = 2.85,
  vitamin_b6 = 0.185,
  vitamin_b9 = 28,
  vitamin_b12 = 0.85,
  vitamin_c = 1.2,
  omega3_100 = 0.08,
  omega6_100 = 3.85,
  cholesterol = 15,
  is_fermented = false,
  is_raw = false
WHERE id = '54a312a4-c3d7-4212-9160-f4e2f7a9e77a';

-- 3. Сливки 10 (Light cream 10% - USDA #171261)
UPDATE shared_products SET
  iron = 0.03,
  magnesium = 10,
  zinc = 0.35,
  selenium = 2.4,
  calcium = 109,
  phosphorus = 89,
  potassium = 138,
  vitamin_a = 93,
  vitamin_d = 0,
  vitamin_e = 0.31,
  vitamin_k = 0.7,
  vitamin_b1 = 0.034,
  vitamin_b2 = 0.160,
  vitamin_b3 = 0.083,
  vitamin_b6 = 0.040,
  vitamin_b9 = 4,
  vitamin_b12 = 0.36,
  vitamin_c = 0.9,
  omega3_100 = 0.05,
  omega6_100 = 0.28,
  cholesterol = 36,
  is_fermented = false,
  is_raw = false
WHERE id = 'c55a5703-1092-4084-b6b9-10defa192a1e';

-- 4. Котлета свино-говяжья (Pork and beef patty, steamed - approximation)
UPDATE shared_products SET
  iron = 1.85,
  magnesium = 18,
  zinc = 3.85,
  selenium = 18.5,
  calcium = 15,
  phosphorus = 185,
  potassium = 285,
  vitamin_a = 8,
  vitamin_d = 0.2,
  vitamin_e = 0.35,
  vitamin_k = 0.4,
  vitamin_b1 = 0.285,
  vitamin_b2 = 0.185,
  vitamin_b3 = 4.85,
  vitamin_b6 = 0.325,
  vitamin_b9 = 6,
  vitamin_b12 = 1.45,
  vitamin_c = 0,
  omega3_100 = 0.08,
  omega6_100 = 1.25,
  cholesterol = 72,
  is_fermented = false,
  is_raw = false
WHERE id = 'ac327a34-12fd-4c37-b0ec-9fbb58cadba5';

-- 5. Печёночный паштет из индейки (Turkey liver pate - USDA #174384)
UPDATE shared_products SET
  iron = 5.25,
  magnesium = 18,
  zinc = 2.45,
  selenium = 35.5,
  calcium = 12,
  phosphorus = 185,
  potassium = 165,
  vitamin_a = 2500,
  vitamin_d = 0.2,
  vitamin_e = 0.35,
  vitamin_k = 0.2,
  vitamin_b1 = 0.095,
  vitamin_b2 = 1.850,
  vitamin_b3 = 5.85,
  vitamin_b6 = 0.450,
  vitamin_b9 = 185,
  vitamin_b12 = 15.50,
  vitamin_c = 4.5,
  omega3_100 = 0.12,
  omega6_100 = 0.85,
  cholesterol = 185,
  is_fermented = false,
  is_raw = false
WHERE id = '8b35a362-47fb-4684-9da6-d9a9abc82221';

-- 6. Утка запечённая (Duck, roasted, meat only - USDA #172428)
UPDATE shared_products SET
  iron = 2.70,
  magnesium = 20,
  zinc = 2.60,
  selenium = 19.9,
  calcium = 11,
  phosphorus = 203,
  potassium = 252,
  vitamin_a = 21,
  vitamin_d = 0.1,
  vitamin_e = 0.70,
  vitamin_k = 2.4,
  vitamin_b1 = 0.260,
  vitamin_b2 = 0.470,
  vitamin_b3 = 5.100,
  vitamin_b6 = 0.250,
  vitamin_b9 = 10,
  vitamin_b12 = 0.40,
  vitamin_c = 0,
  omega3_100 = 0.08,
  omega6_100 = 1.22,
  cholesterol = 89,
  is_fermented = false,
  is_raw = false
WHERE id = '2d1649cf-a9a8-489b-a070-1eaa976702e3';

-- 7. Яблочный пирог (Apple pie - USDA #173461)
UPDATE shared_products SET
  iron = 0.95,
  magnesium = 8,
  zinc = 0.18,
  selenium = 4.5,
  calcium = 12,
  phosphorus = 45,
  potassium = 85,
  vitamin_a = 35,
  vitamin_d = 0.1,
  vitamin_e = 0.45,
  vitamin_k = 3.5,
  vitamin_b1 = 0.085,
  vitamin_b2 = 0.095,
  vitamin_b3 = 0.85,
  vitamin_b6 = 0.045,
  vitamin_b9 = 18,
  vitamin_b12 = 0.05,
  vitamin_c = 1.5,
  omega3_100 = 0.02,
  omega6_100 = 2.85,
  cholesterol = 18,
  is_fermented = false,
  is_raw = false
WHERE id = '94d4bc85-af76-46a2-a4fb-68b82be97a15';

-- 8. Колбаса докторская (Doctor's sausage/Bologna - USDA #173541)
UPDATE shared_products SET
  iron = 1.34,
  magnesium = 11,
  zinc = 2.05,
  selenium = 18.2,
  calcium = 14,
  phosphorus = 121,
  potassium = 160,
  vitamin_a = 0,
  vitamin_d = 0.3,
  vitamin_e = 0.27,
  vitamin_k = 0,
  vitamin_b1 = 0.160,
  vitamin_b2 = 0.170,
  vitamin_b3 = 2.850,
  vitamin_b6 = 0.170,
  vitamin_b9 = 2,
  vitamin_b12 = 0.95,
  vitamin_c = 0,
  omega3_100 = 0.06,
  omega6_100 = 1.86,
  cholesterol = 57,
  is_fermented = false,
  is_raw = false
WHERE id = '46b4491f-bc85-4020-a5f4-d6c1fba024b0';

-- 9. Яблочная меренга с ягодами (Apple meringue - approximation)
UPDATE shared_products SET
  iron = 0.25,
  magnesium = 5,
  zinc = 0.05,
  selenium = 1.5,
  calcium = 8,
  phosphorus = 12,
  potassium = 65,
  vitamin_a = 5,
  vitamin_d = 0,
  vitamin_e = 0.15,
  vitamin_k = 0.2,
  vitamin_b1 = 0.012,
  vitamin_b2 = 0.045,
  vitamin_b3 = 0.125,
  vitamin_b6 = 0.015,
  vitamin_b9 = 2,
  vitamin_b12 = 0.05,
  vitamin_c = 2.5,
  omega3_100 = 0.01,
  omega6_100 = 0.02,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '490a7127-3355-48f3-a13a-878eed571246';

-- 10. Виноград (Grapes, raw - USDA #174682)
UPDATE shared_products SET
  iron = 0.36,
  magnesium = 7,
  zinc = 0.07,
  selenium = 0.1,
  calcium = 10,
  phosphorus = 20,
  potassium = 191,
  vitamin_a = 3,
  vitamin_d = 0,
  vitamin_e = 0.19,
  vitamin_k = 14.6,
  vitamin_b1 = 0.069,
  vitamin_b2 = 0.070,
  vitamin_b3 = 0.188,
  vitamin_b6 = 0.086,
  vitamin_b9 = 2,
  vitamin_b12 = 0,
  vitamin_c = 3.2,
  omega3_100 = 0.02,
  omega6_100 = 0.06,
  cholesterol = 0,
  is_fermented = false,
  is_raw = true  -- Raw fruit
WHERE id = 'feb75bc8-d69e-4ef2-a6ef-3128bc2e9412';

-- 11. Протёртая земляника без сахара (Pureed strawberries - USDA #167762)
UPDATE shared_products SET
  iron = 0.41,
  magnesium = 13,
  zinc = 0.14,
  selenium = 0.4,
  calcium = 16,
  phosphorus = 24,
  potassium = 153,
  vitamin_a = 1,
  vitamin_d = 0,
  vitamin_e = 0.29,
  vitamin_k = 2.2,
  vitamin_b1 = 0.024,
  vitamin_b2 = 0.022,
  vitamin_b3 = 0.386,
  vitamin_b6 = 0.047,
  vitamin_b9 = 24,
  vitamin_b12 = 0,
  vitamin_c = 58.8,
  omega3_100 = 0.07,
  omega6_100 = 0.09,
  cholesterol = 0,
  is_fermented = false,
  is_raw = true  -- Typically raw puree
WHERE id = 'dab097da-af8f-40da-836e-489bdd202225';

-- 12. Молоко 1,5 Простоквашино (Milk 1% - USDA #171271)
UPDATE shared_products SET
  iron = 0.03,
  magnesium = 11,
  zinc = 0.40,
  selenium = 3.4,
  calcium = 116,
  phosphorus = 86,
  potassium = 136,
  vitamin_a = 46,
  vitamin_d = 1.3,
  vitamin_e = 0.04,
  vitamin_k = 0.1,
  vitamin_b1 = 0.044,
  vitamin_b2 = 0.174,
  vitamin_b3 = 0.092,
  vitamin_b6 = 0.039,
  vitamin_b9 = 5,
  vitamin_b12 = 0.46,
  vitamin_c = 0,
  omega3_100 = 0.01,
  omega6_100 = 0.04,
  cholesterol = 5,
  is_fermented = false,
  is_raw = false
WHERE id = 'fde9a0cb-9670-404a-ab12-10d3a7f2f817';

-- 13. Мюсли-батончик KERLL (Granola bar - USDA #173360)
UPDATE shared_products SET
  iron = 1.85,
  magnesium = 45,
  zinc = 1.25,
  selenium = 5.5,
  calcium = 45,
  phosphorus = 125,
  potassium = 185,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 1.65,
  vitamin_k = 1.5,
  vitamin_b1 = 0.185,
  vitamin_b2 = 0.095,
  vitamin_b3 = 2.45,
  vitamin_b6 = 0.145,
  vitamin_b9 = 18,
  vitamin_b12 = 0,
  vitamin_c = 0.5,
  omega3_100 = 0.05,
  omega6_100 = 2.85,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = 'd7544389-59b3-4c8f-ba0a-b631d02fce30';

-- 14. Bootybar Crunch фисташковый (Pistachio protein bar - approximation)
UPDATE shared_products SET
  iron = 2.15,
  magnesium = 65,
  zinc = 1.85,
  selenium = 7.5,
  calcium = 115,
  phosphorus = 185,
  potassium = 285,
  vitamin_a = 15,
  vitamin_d = 0.4,
  vitamin_e = 3.25,
  vitamin_k = 1.8,
  vitamin_b1 = 0.145,
  vitamin_b2 = 0.225,
  vitamin_b3 = 2.45,
  vitamin_b6 = 0.225,
  vitamin_b9 = 35,
  vitamin_b12 = 0.85,
  vitamin_c = 0.5,
  omega3_100 = 0.08,
  omega6_100 = 4.25,
  cholesterol = 15,
  is_fermented = false,
  is_raw = false
WHERE id = '90be4110-4cd3-43c0-9378-cc9f19de6897';

-- 15. Лапша соба варёная (Soba noodles, cooked - USDA #169720)
UPDATE shared_products SET
  iron = 0.55,
  magnesium = 24,
  zinc = 0.75,
  selenium = 6.5,
  calcium = 8,
  phosphorus = 55,
  potassium = 65,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 0.05,
  vitamin_k = 0,
  vitamin_b1 = 0.045,
  vitamin_b2 = 0.025,
  vitamin_b3 = 0.45,
  vitamin_b6 = 0.035,
  vitamin_b9 = 8,
  vitamin_b12 = 0,
  vitamin_c = 0,
  omega3_100 = 0.02,
  omega6_100 = 0.15,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = 'ed5dd413-a97d-4f0b-8fa2-f91de63c2a8c';

-- 16. Котлеты морковные Алина (Carrot patties - approximation)
UPDATE shared_products SET
  iron = 0.65,
  magnesium = 15,
  zinc = 0.35,
  selenium = 1.2,
  calcium = 28,
  phosphorus = 45,
  potassium = 245,
  vitamin_a = 645,
  vitamin_d = 0,
  vitamin_e = 0.85,
  vitamin_k = 12.5,
  vitamin_b1 = 0.055,
  vitamin_b2 = 0.065,
  vitamin_b3 = 0.65,
  vitamin_b6 = 0.125,
  vitamin_b9 = 15,
  vitamin_b12 = 0,
  vitamin_c = 4.5,
  omega3_100 = 0.04,
  omega6_100 = 1.25,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = 'a097a41d-cbf8-4126-861c-3c77c13e4f66';

-- 17. Пончик глазированный (Glazed doughnut - USDA #173420)
UPDATE shared_products SET
  iron = 2.45,
  magnesium = 14,
  zinc = 0.45,
  selenium = 6.5,
  calcium = 28,
  phosphorus = 95,
  potassium = 85,
  vitamin_a = 15,
  vitamin_d = 0.2,
  vitamin_e = 1.25,
  vitamin_k = 8.5,
  vitamin_b1 = 0.245,
  vitamin_b2 = 0.225,
  vitamin_b3 = 1.85,
  vitamin_b6 = 0.045,
  vitamin_b9 = 65,
  vitamin_b12 = 0.15,
  vitamin_c = 0.2,
  omega3_100 = 0.08,
  omega6_100 = 4.85,
  cholesterol = 22,
  is_fermented = false,
  is_raw = false
WHERE id = '60732320-0172-49ef-820e-d4cba12d4163';

-- 18. Подсолнечное масло рафинированное (Sunflower oil - USDA #171029)
UPDATE shared_products SET
  iron = 0,
  magnesium = 0,
  zinc = 0,
  selenium = 0,
  calcium = 0,
  phosphorus = 0,
  potassium = 0,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 41.08,
  vitamin_k = 5.4,
  vitamin_b1 = 0,
  vitamin_b2 = 0,
  vitamin_b3 = 0,
  vitamin_b6 = 0,
  vitamin_b9 = 0,
  vitamin_b12 = 0,
  vitamin_c = 0,
  omega3_100 = 0.20,
  omega6_100 = 65.70,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = 'c2b3b2bd-3791-4249-9774-9524e2ce4af6';

COMMIT;

-- Verification
SELECT 
  substring(name, 1, 45) as name,
  CASE WHEN cholesterol IS NOT NULL AND iron IS NOT NULL THEN '✅' ELSE '❌' END as ok,
  cholesterol
FROM shared_products 
WHERE id IN (
  'a2add072-661c-4fcd-9b94-e20cb531f0b7',
  '54a312a4-c3d7-4212-9160-f4e2f7a9e77a',
  'c55a5703-1092-4084-b6b9-10defa192a1e',
  'ac327a34-12fd-4c37-b0ec-9fbb58cadba5',
  '8b35a362-47fb-4684-9da6-d9a9abc82221',
  '2d1649cf-a9a8-489b-a070-1eaa976702e3',
  '94d4bc85-af76-46a2-a4fb-68b82be97a15',
  '46b4491f-bc85-4020-a5f4-d6c1fba024b0',
  '490a7127-3355-48f3-a13a-878eed571246',
  'feb75bc8-d69e-4ef2-a6ef-3128bc2e9412',
  'dab097da-af8f-40da-836e-489bdd202225',
  'fde9a0cb-9670-404a-ab12-10d3a7f2f817',
  'd7544389-59b3-4c8f-ba0a-b631d02fce30',
  '90be4110-4cd3-43c0-9378-cc9f19de6897',
  'ed5dd413-a97d-4f0b-8fa2-f91de63c2a8c',
  'a097a41d-cbf8-4126-861c-3c77c13e4f66',
  '60732320-0172-49ef-820e-d4cba12d4163',
  'c2b3b2bd-3791-4249-9774-9524e2ce4af6'
)
ORDER BY name;
