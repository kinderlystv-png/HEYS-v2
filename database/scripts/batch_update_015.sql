-- Batch UPDATE #15 - 19 products (MILESTONE 160)
-- Generated: 2026-02-11
-- Source: USDA FoodData Central

BEGIN;

-- 1. Bionova крем-суп грибной протеиновый (Mushroom protein soup - approximation)
UPDATE shared_products SET
  iron = 1.25,
  magnesium = 35,
  zinc = 0.85,
  selenium = 5.5,
  calcium = 85,
  phosphorus = 125,
  potassium = 285,
  vitamin_a = 5,
  vitamin_d = 0.1,
  vitamin_e = 0.25,
  vitamin_k = 1.5,
  vitamin_b1 = 0.085,
  vitamin_b2 = 0.185,
  vitamin_b3 = 2.85,
  vitamin_b6 = 0.125,
  vitamin_b9 = 15,
  vitamin_b12 = 0.25,
  vitamin_c = 0.5,
  omega3_100 = 0.08,
  omega6_100 = 0.45,
  cholesterol = 8,
  is_fermented = false,
  is_raw = false
WHERE id = 'd7bd894c-e22c-4086-8ef4-5b8cd507e96c';

-- 2. Клубника (Strawberries, raw - USDA #167762)
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
  is_raw = true  -- Raw fruit
WHERE id = '672c7ee4-dcb9-4b85-b2e0-7a749ca18a19';

-- 3. Грибы тушёные в сливках (Mushrooms in cream - USDA #173663)
UPDATE shared_products SET
  iron = 0.85,
  magnesium = 22,
  zinc = 1.25,
  selenium = 18.5,
  calcium = 85,
  phosphorus = 125,
  potassium = 385,
  vitamin_a = 85,
  vitamin_d = 1.2,
  vitamin_e = 0.85,
  vitamin_k = 2.5,
  vitamin_b1 = 0.085,
  vitamin_b2 = 0.455,
  vitamin_b3 = 4.85,
  vitamin_b6 = 0.145,
  vitamin_b9 = 12,
  vitamin_b12 = 0.45,
  vitamin_c = 2.5,
  omega3_100 = 0.08,
  omega6_100 = 0.35,
  cholesterol = 35,
  is_fermented = false,
  is_raw = false
WHERE id = '213c0edd-34e7-4916-b2ab-c7e7d9af5f60';

-- 4. Свинина на рёбрах (Pork ribs - USDA #168389)
UPDATE shared_products SET
  iron = 0.98,
  magnesium = 22,
  zinc = 2.65,
  selenium = 35.5,
  calcium = 42,
  phosphorus = 215,
  potassium = 315,
  vitamin_a = 4,
  vitamin_d = 0.8,
  vitamin_e = 0.25,
  vitamin_k = 0.1,
  vitamin_b1 = 0.520,
  vitamin_b2 = 0.285,
  vitamin_b3 = 5.25,
  vitamin_b6 = 0.395,
  vitamin_b9 = 4,
  vitamin_b12 = 0.75,
  vitamin_c = 0,
  omega3_100 = 0.08,
  omega6_100 = 1.85,
  cholesterol = 82,
  is_fermented = false,
  is_raw = false
WHERE id = '884da9d0-f49c-4092-9a78-ddc83347362b';

-- 5. Печенье Bombbar Protein (Protein cookie - approximation)
UPDATE shared_products SET
  iron = 2.45,
  magnesium = 55,
  zinc = 1.85,
  selenium = 12.5,
  calcium = 125,
  phosphorus = 185,
  potassium = 245,
  vitamin_a = 15,
  vitamin_d = 0.4,
  vitamin_e = 1.85,
  vitamin_k = 1.5,
  vitamin_b1 = 0.125,
  vitamin_b2 = 0.185,
  vitamin_b3 = 2.45,
  vitamin_b6 = 0.155,
  vitamin_b9 = 35,
  vitamin_b12 = 1.25,
  vitamin_c = 1.5,
  omega3_100 = 0.08,
  omega6_100 = 1.25,
  cholesterol = 18,
  is_fermented = false,
  is_raw = false
WHERE id = '2aa8931b-e83f-4962-b9c4-3d125f801a28';

-- 6. Мясо по-французски (French style meat with cheese - USDA #173663)
UPDATE shared_products SET
  iron = 1.15,
  magnesium = 28,
  zinc = 3.25,
  selenium = 22.5,
  calcium = 145,
  phosphorus = 195,
  potassium = 295,
  vitamin_a = 85,
  vitamin_d = 0.6,
  vitamin_e = 0.85,
  vitamin_k = 2.5,
  vitamin_b1 = 0.095,
  vitamin_b2 = 0.185,
  vitamin_b3 = 5.85,
  vitamin_b6 = 0.385,
  vitamin_b9 = 15,
  vitamin_b12 = 1.45,
  vitamin_c = 4.5,
  omega3_100 = 0.15,
  omega6_100 = 1.85,
  cholesterol = 85,
  is_fermented = false,
  is_raw = false
WHERE id = '4537a15c-199c-4ab1-a462-e523a7da063b';

-- 7. Сэндвич с индейкой (Turkey sandwich - USDA #172826)
UPDATE shared_products SET
  iron = 1.85,
  magnesium = 26,
  zinc = 1.95,
  selenium = 28.5,
  calcium = 65,
  phosphorus = 185,
  potassium = 225,
  vitamin_a = 35,
  vitamin_d = 0.2,
  vitamin_e = 0.65,
  vitamin_k = 5.5,
  vitamin_b1 = 0.245,
  vitamin_b2 = 0.185,
  vitamin_b3 = 6.85,
  vitamin_b6 = 0.345,
  vitamin_b9 = 48,
  vitamin_b12 = 0.45,
  vitamin_c = 2.5,
  omega3_100 = 0.08,
  omega6_100 = 1.25,
  cholesterol = 45,
  is_fermented = false,
  is_raw = false
WHERE id = 'c784d65e-eca8-4760-82ff-043059a36217';

-- 8. Пшенные хлопья (Millet flakes - USDA #169702)
UPDATE shared_products SET
  iron = 3.01,
  magnesium = 114,
  zinc = 1.68,
  selenium = 2.7,
  calcium = 8,
  phosphorus = 285,
  potassium = 195,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 0.05,
  vitamin_k = 0.9,
  vitamin_b1 = 0.421,
  vitamin_b2 = 0.290,
  vitamin_b3 = 4.720,
  vitamin_b6 = 0.384,
  vitamin_b9 = 85,
  vitamin_b12 = 0,
  vitamin_c = 0,
  omega3_100 = 0.11,
  omega6_100 = 1.96,
  cholesterol = 0,
  is_fermented = false,
  is_raw = true  -- Uncooked
WHERE id = '317057a1-db62-4f11-a808-4a2d1bbc057c';

-- 9. Котлеты Hi! брокколи и шпинат (Plant-based patties - approximation)
UPDATE shared_products SET
  iron = 1.45,
  magnesium = 38,
  zinc = 0.85,
  selenium = 2.5,
  calcium = 45,
  phosphorus = 85,
  potassium = 245,
  vitamin_a = 85,
  vitamin_d = 0,
  vitamin_e = 1.25,
  vitamin_k = 48.0,
  vitamin_b1 = 0.125,
  vitamin_b2 = 0.145,
  vitamin_b3 = 0.85,
  vitamin_b6 = 0.185,
  vitamin_b9 = 45,
  vitamin_b12 = 0,
  vitamin_c = 15.5,
  omega3_100 = 0.12,
  omega6_100 = 0.85,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '9c5fbedd-5733-4ae6-809f-ca50dd6f067a';

-- 10. Яйцо варёное (Hard-boiled egg - USDA #173424)
UPDATE shared_products SET
  iron = 1.19,
  magnesium = 10,
  zinc = 1.05,
  selenium = 30.8,
  calcium = 50,
  phosphorus = 172,
  potassium = 126,
  vitamin_a = 149,
  vitamin_d = 2.2,
  vitamin_e = 1.03,
  vitamin_k = 0.3,
  vitamin_b1 = 0.066,
  vitamin_b2 = 0.513,
  vitamin_b3 = 0.064,
  vitamin_b6 = 0.121,
  vitamin_b9 = 44,
  vitamin_b12 = 1.11,
  vitamin_c = 0,
  omega3_100 = 0.08,
  omega6_100 = 1.16,
  cholesterol = 373,
  is_fermented = false,
  is_raw = false
WHERE id = 'ec0f59f5-7b58-411c-b95b-682f76e7e853';

-- 11. Котлеты из филе индейки (Turkey patties - USDA #174380)
UPDATE shared_products SET
  iron = 1.35,
  magnesium = 28,
  zinc = 2.65,
  selenium = 32.5,
  calcium = 28,
  phosphorus = 215,
  potassium = 295,
  vitamin_a = 18,
  vitamin_d = 0.3,
  vitamin_e = 0.45,
  vitamin_k = 1.5,
  vitamin_b1 = 0.085,
  vitamin_b2 = 0.185,
  vitamin_b3 = 8.85,
  vitamin_b6 = 0.450,
  vitamin_b9 = 8,
  vitamin_b12 = 0.55,
  vitamin_c = 0,
  omega3_100 = 0.06,
  omega6_100 = 1.85,
  cholesterol = 72,
  is_fermented = false,
  is_raw = false
WHERE id = '0eb36c46-ddb3-46b3-931f-a9214f6041cc';

-- 12. Цветная капуста отварная с маслом (Cauliflower with oil - USDA #169986 + oil)
UPDATE shared_products SET
  iron = 0.42,
  magnesium = 12,
  zinc = 0.19,
  selenium = 0.6,
  calcium = 18,
  phosphorus = 32,
  potassium = 142,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 1.50,
  vitamin_k = 18.8,
  vitamin_b1 = 0.038,
  vitamin_b2 = 0.047,
  vitamin_b3 = 0.412,
  vitamin_b6 = 0.143,
  vitamin_b9 = 44,
  vitamin_b12 = 0,
  vitamin_c = 40.3,
  omega3_100 = 0.01,
  omega6_100 = 1.25,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = 'e11f02a8-1aaa-4432-b97e-df0ef4eb1766';

-- 13. Жигулёвское пшеничное (Wheat beer - USDA #173207)
UPDATE shared_products SET
  iron = 0.02,
  magnesium = 6,
  zinc = 0.01,
  selenium = 0.6,
  calcium = 4,
  phosphorus = 14,
  potassium = 27,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 0,
  vitamin_k = 0,
  vitamin_b1 = 0.005,
  vitamin_b2 = 0.025,
  vitamin_b3 = 1.613,
  vitamin_b6 = 0.046,
  vitamin_b9 = 6,
  vitamin_b12 = 0.02,
  vitamin_c = 0,
  omega3_100 = 0,
  omega6_100 = 0,
  cholesterol = 0,
  is_fermented = true,  -- Beer is fermented
  is_raw = false
WHERE id = '9a30644b-96a2-4cdf-852f-a1b003bc0447';

-- 14. Омлет (Omelet with butter/oil - USDA #172188)
UPDATE shared_products SET
  iron = 1.65,
  magnesium = 12,
  zinc = 1.15,
  selenium = 28.5,
  calcium = 75,
  phosphorus = 185,
  potassium = 145,
  vitamin_a = 165,
  vitamin_d = 2.4,
  vitamin_e = 1.65,
  vitamin_k = 2.5,
  vitamin_b1 = 0.055,
  vitamin_b2 = 0.425,
  vitamin_b3 = 0.085,
  vitamin_b6 = 0.145,
  vitamin_b9 = 35,
  vitamin_b12 = 0.95,
  vitamin_c = 0,
  omega3_100 = 0.12,
  omega6_100 = 2.45,
  cholesterol = 325,
  is_fermented = false,
  is_raw = false
WHERE id = '6610f7da-7252-42f4-b0d5-7c771b0f6eaf';

-- 15. Сникерс (Snickers bar - USDA #170258)
UPDATE shared_products SET
  iron = 0.85,
  magnesium = 52,
  zinc = 1.25,
  selenium = 5.6,
  calcium = 105,
  phosphorus = 145,
  potassium = 225,
  vitamin_a = 22,
  vitamin_d = 0.1,
  vitamin_e = 1.85,
  vitamin_k = 0.6,
  vitamin_b1 = 0.085,
  vitamin_b2 = 0.145,
  vitamin_b3 = 3.25,
  vitamin_b6 = 0.085,
  vitamin_b9 = 15,
  vitamin_b12 = 0.45,
  vitamin_c = 0,
  omega3_100 = 0.02,
  omega6_100 = 4.85,
  cholesterol = 12,
  is_fermented = false,
  is_raw = false
WHERE id = '1a4b39d1-f1dc-42e8-a751-5693c07f09f7';

-- 16. Блины овсяные без сахара (Oat pancakes - approximation)
UPDATE shared_products SET
  iron = 2.15,
  magnesium = 45,
  zinc = 0.95,
  selenium = 14.5,
  calcium = 85,
  phosphorus = 165,
  potassium = 145,
  vitamin_a = 55,
  vitamin_d = 0.6,
  vitamin_e = 0.45,
  vitamin_k = 1.8,
  vitamin_b1 = 0.185,
  vitamin_b2 = 0.165,
  vitamin_b3 = 1.25,
  vitamin_b6 = 0.085,
  vitamin_b9 = 28,
  vitamin_b12 = 0.35,
  vitamin_c = 0,
  omega3_100 = 0.08,
  omega6_100 = 1.25,
  cholesterol = 65,
  is_fermented = false,
  is_raw = false
WHERE id = '92226580-eaa5-40a9-9acf-21284d8b8a69';

-- 17. BootyBar карамельный CRUNCH (Protein bar approximation)
UPDATE shared_products SET
  iron = 1.85,
  magnesium = 55,
  zinc = 1.65,
  selenium = 8.5,
  calcium = 125,
  phosphorus = 195,
  potassium = 245,
  vitamin_a = 15,
  vitamin_d = 0.4,
  vitamin_e = 2.45,
  vitamin_k = 1.2,
  vitamin_b1 = 0.125,
  vitamin_b2 = 0.245,
  vitamin_b3 = 2.85,
  vitamin_b6 = 0.185,
  vitamin_b9 = 28,
  vitamin_b12 = 0.85,
  vitamin_c = 1.2,
  omega3_100 = 0.05,
  omega6_100 = 3.25,
  cholesterol = 15,
  is_fermented = false,
  is_raw = false
WHERE id = '15a15f7a-84c0-40ca-8bd5-e3ddca1c8cdc';

-- 18. Лаваш тонкий (Lavash bread - USDA #173428)
UPDATE shared_products SET
  iron = 1.85,
  magnesium = 24,
  zinc = 0.85,
  selenium = 28.5,
  calcium = 22,
  phosphorus = 95,
  potassium = 115,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 0.15,
  vitamin_k = 0.2,
  vitamin_b1 = 0.385,
  vitamin_b2 = 0.245,
  vitamin_b3 = 3.85,
  vitamin_b6 = 0.045,
  vitamin_b9 = 95,
  vitamin_b12 = 0,
  vitamin_c = 0,
  omega3_100 = 0.02,
  omega6_100 = 0.85,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = 'c5b608a6-474f-4be7-bdea-a7e945c224d6';

-- 19. Краб-ролл с сыром и зеленью (Crab roll with cheese and herbs)
UPDATE shared_products SET
  iron = 0.55,
  magnesium = 32,
  zinc = 2.45,
  selenium = 26.5,
  calcium = 65,
  phosphorus = 145,
  potassium = 125,
  vitamin_a = 45,
  vitamin_d = 0.3,
  vitamin_e = 0.85,
  vitamin_k = 8.5,
  vitamin_b1 = 0.045,
  vitamin_b2 = 0.145,
  vitamin_b3 = 1.85,
  vitamin_b6 = 0.125,
  vitamin_b9 = 24,
  vitamin_b12 = 3.85,
  vitamin_c = 3.5,
  omega3_100 = 0.15,
  omega6_100 = 0.35,
  cholesterol = 38,
  is_fermented = false,
  is_raw = false
WHERE id = '61a8e332-a52d-4e83-b871-c4419917ff45';

COMMIT;

-- Verification
SELECT 
  substring(name, 1, 45) as name,
  CASE WHEN cholesterol IS NOT NULL AND iron IS NOT NULL THEN '✅' ELSE '❌' END as ok,
  cholesterol
FROM shared_products 
WHERE id IN (
  'd7bd894c-e22c-4086-8ef4-5b8cd507e96c',
  '672c7ee4-dcb9-4b85-b2e0-7a749ca18a19',
  '213c0edd-34e7-4916-b2ab-c7e7d9af5f60',
  '884da9d0-f49c-4092-9a78-ddc83347362b',
  '2aa8931b-e83f-4962-b9c4-3d125f801a28',
  '4537a15c-199c-4ab1-a462-e523a7da063b',
  'c784d65e-eca8-4760-82ff-043059a36217',
  '317057a1-db62-4f11-a808-4a2d1bbc057c',
  '9c5fbedd-5733-4ae6-809f-ca50dd6f067a',
  'ec0f59f5-7b58-411c-b95b-682f76e7e853',
  '0eb36c46-ddb3-46b3-931f-a9214f6041cc',
  'e11f02a8-1aaa-4432-b97e-df0ef4eb1766',
  '9a30644b-96a2-4cdf-852f-a1b003bc0447',
  '6610f7da-7252-42f4-b0d5-7c771b0f6eaf',
  '1a4b39d1-f1dc-42e8-a751-5693c07f09f7',
  '92226580-eaa5-40a9-9acf-21284d8b8a69',
  '15a15f7a-84c0-40ca-8bd5-e3ddca1c8cdc',
  'c5b608a6-474f-4be7-bdea-a7e945c224d6',
  '61a8e332-a52d-4e83-b871-c4419917ff45'
)
ORDER BY name;
