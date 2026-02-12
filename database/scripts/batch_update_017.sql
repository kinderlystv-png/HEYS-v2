-- Batch UPDATE #17 - 20 products
-- Generated: 2026-02-12
-- Source: USDA FoodData Central (or best-fit approximations)

BEGIN;

-- 1. Холодец говяжий (Beef aspic/jelly - best-fit)
UPDATE shared_products SET
  iron = 1.35,
  magnesium = 7,
  zinc = 2.45,
  selenium = 9.8,
  calcium = 8,
  phosphorus = 45,
  potassium = 55,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 0.15,
  vitamin_k = 0.2,
  vitamin_b1 = 0.025,
  vitamin_b2 = 0.085,
  vitamin_b3 = 1.45,
  vitamin_b6 = 0.095,
  vitamin_b9 = 4,
  vitamin_b12 = 0.85,
  vitamin_c = 0.5,
  omega3_100 = 0.02,
  omega6_100 = 0.08,
  cholesterol = 35,
  is_fermented = false,
  is_raw = false
WHERE id = 'ce0ea17d-8126-4ae8-9c78-b93f3429c4dd';

-- 2. Миндаль (Almonds, raw - USDA)
UPDATE shared_products SET
  iron = 3.71,
  magnesium = 270,
  zinc = 3.12,
  selenium = 4.1,
  calcium = 269,
  phosphorus = 481,
  potassium = 733,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 25.63,
  vitamin_k = 0,
  vitamin_b1 = 0.205,
  vitamin_b2 = 1.138,
  vitamin_b3 = 3.618,
  vitamin_b6 = 0.143,
  vitamin_b9 = 44,
  vitamin_b12 = 0,
  vitamin_c = 0,
  omega3_100 = 0.00,
  omega6_100 = 12.06,
  cholesterol = 0,
  is_fermented = false,
  is_raw = true
WHERE id = '34d85507-8e07-4337-8ec1-ed095a425596';

-- 3. Протеиновое печенье LIGHT PROTEIN COOKIE «Salted Caramel» Sporty (approx)
UPDATE shared_products SET
  iron = 2.85,
  magnesium = 45,
  zinc = 1.65,
  selenium = 8.5,
  calcium = 85,
  phosphorus = 165,
  potassium = 195,
  vitamin_a = 0,
  vitamin_d = 0.2,
  vitamin_e = 1.85,
  vitamin_k = 1.2,
  vitamin_b1 = 0.145,
  vitamin_b2 = 0.185,
  vitamin_b3 = 2.45,
  vitamin_b6 = 0.165,
  vitamin_b9 = 24,
  vitamin_b12 = 0.6,
  vitamin_c = 0,
  omega3_100 = 0.06,
  omega6_100 = 3.50,
  cholesterol = 18,
  is_fermented = false,
  is_raw = false
WHERE id = '8976f361-be81-4fbd-a730-692a5508b2dd';

-- 4. Мясо с картошкой запечённое (курица, сметана, сыр) (approx)
UPDATE shared_products SET
  iron = 1.45,
  magnesium = 22,
  zinc = 2.65,
  selenium = 12.5,
  calcium = 85,
  phosphorus = 145,
  potassium = 385,
  vitamin_a = 95,
  vitamin_d = 0.1,
  vitamin_e = 0.45,
  vitamin_k = 2.5,
  vitamin_b1 = 0.165,
  vitamin_b2 = 0.145,
  vitamin_b3 = 3.25,
  vitamin_b6 = 0.385,
  vitamin_b9 = 14,
  vitamin_b12 = 0.85,
  vitamin_c = 6.5,
  omega3_100 = 0.08,
  omega6_100 = 1.85,
  cholesterol = 65,
  is_fermented = false,
  is_raw = false
WHERE id = '5d66f31b-9477-4744-9683-007aab31bdaf';

-- 5. Овощной суп с вермишелью (best-fit)
UPDATE shared_products SET
  iron = 0.45,
  magnesium = 8,
  zinc = 0.25,
  selenium = 3.5,
  calcium = 12,
  phosphorus = 28,
  potassium = 85,
  vitamin_a = 125,
  vitamin_d = 0,
  vitamin_e = 0.15,
  vitamin_k = 8.5,
  vitamin_b1 = 0.045,
  vitamin_b2 = 0.035,
  vitamin_b3 = 0.45,
  vitamin_b6 = 0.045,
  vitamin_b9 = 15,
  vitamin_b12 = 0,
  vitamin_c = 1.5,
  omega3_100 = 0.02,
  omega6_100 = 0.15,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '57aae705-89f4-45b5-a9e3-611d6470190c';

-- 6. Сало солёное (Pork fat, cured) (best-fit)
UPDATE shared_products SET
  iron = 0.15,
  magnesium = 2,
  zinc = 0.25,
  selenium = 2.5,
  calcium = 3,
  phosphorus = 15,
  potassium = 35,
  vitamin_a = 0,
  vitamin_d = 1.5,
  vitamin_e = 0.85,
  vitamin_k = 0,
  vitamin_b1 = 0.085,
  vitamin_b2 = 0.045,
  vitamin_b3 = 1.25,
  vitamin_b6 = 0.025,
  vitamin_b9 = 0,
  vitamin_b12 = 0.25,
  vitamin_c = 0,
  omega3_100 = 0.85,
  omega6_100 = 9.50,
  cholesterol = 95,
  is_fermented = false,
  is_raw = true
WHERE id = '90dca660-6067-449a-adb5-7771407b0a0b';

-- 7. Cafe Au Lait (растворимый) (best-fit)
UPDATE shared_products SET
  iron = 0.15,
  magnesium = 25,
  zinc = 0.15,
  selenium = 0.5,
  calcium = 85,
  phosphorus = 95,
  potassium = 245,
  vitamin_a = 45,
  vitamin_d = 0,
  vitamin_e = 0.05,
  vitamin_k = 0.1,
  vitamin_b1 = 0.025,
  vitamin_b2 = 0.125,
  vitamin_b3 = 0.85,
  vitamin_b6 = 0.025,
  vitamin_b9 = 2,
  vitamin_b12 = 0.25,
  vitamin_c = 0,
  omega3_100 = 0.0,
  omega6_100 = 0.02,
  cholesterol = 8,
  is_fermented = false,
  is_raw = false
WHERE id = '4abdae38-15f4-4059-9902-757c75b8ddf2';

-- 8. Овощной салат с подсолнечным маслом (approx)
UPDATE shared_products SET
  iron = 0.85,
  magnesium = 18,
  zinc = 0.35,
  selenium = 0.8,
  calcium = 35,
  phosphorus = 45,
  potassium = 285,
  vitamin_a = 450,
  vitamin_d = 0,
  vitamin_e = 3.85,
  vitamin_k = 45.0,
  vitamin_b1 = 0.055,
  vitamin_b2 = 0.065,
  vitamin_b3 = 0.65,
  vitamin_b6 = 0.145,
  vitamin_b9 = 45,
  vitamin_b12 = 0,
  vitamin_c = 15.0,
  omega3_100 = 0.15,
  omega6_100 = 4.85,
  cholesterol = 0,
  is_fermented = false,
  is_raw = true
WHERE id = 'dbd0aa02-b038-499c-afbf-d1180f20a311';

-- 9. Суп овощной с фрикадельками (approx)
UPDATE shared_products SET
  iron = 0.95,
  magnesium = 15,
  zinc = 1.25,
  selenium = 6.5,
  calcium = 18,
  phosphorus = 65,
  potassium = 185,
  vitamin_a = 150,
  vitamin_d = 0,
  vitamin_e = 0.25,
  vitamin_k = 8.5,
  vitamin_b1 = 0.055,
  vitamin_b2 = 0.085,
  vitamin_b3 = 1.45,
  vitamin_b6 = 0.125,
  vitamin_b9 = 12,
  vitamin_b12 = 0.35,
  vitamin_c = 2.5,
  omega3_100 = 0.04,
  omega6_100 = 0.25,
  cholesterol = 15,
  is_fermented = false,
  is_raw = false
WHERE id = '73d51d5c-1586-4d14-9c7b-4ab0d6a63e9c';

-- 10. Филе куриной грудки (отварное) (USDA best-fit)
UPDATE shared_products SET
  iron = 0.75,
  magnesium = 25,
  zinc = 0.85,
  selenium = 22.5,
  calcium = 12,
  phosphorus = 196,
  potassium = 220,
  vitamin_a = 6,
  vitamin_d = 0.1,
  vitamin_e = 0.30,
  vitamin_k = 0,
  vitamin_b1 = 0.065,
  vitamin_b2 = 0.115,
  vitamin_b3 = 11.20,
  vitamin_b6 = 0.550,
  vitamin_b9 = 4,
  vitamin_b12 = 0.30,
  vitamin_c = 0,
  omega3_100 = 0.04,
  omega6_100 = 0.18,
  cholesterol = 75,
  is_fermented = false,
  is_raw = false
WHERE id = 'dfd369c3-d355-4d91-b8d3-522e7a47b9d4';

-- 11. Мороженое молочное ванильное без сахара (approx)
UPDATE shared_products SET
  iron = 0.10,
  magnesium = 12,
  zinc = 0.45,
  selenium = 2.5,
  calcium = 115,
  phosphorus = 95,
  potassium = 145,
  vitamin_a = 65,
  vitamin_d = 0.2,
  vitamin_e = 0.15,
  vitamin_k = 0.2,
  vitamin_b1 = 0.045,
  vitamin_b2 = 0.185,
  vitamin_b3 = 0.125,
  vitamin_b6 = 0.045,
  vitamin_b9 = 5,
  vitamin_b12 = 0.45,
  vitamin_c = 0.5,
  omega3_100 = 0.02,
  omega6_100 = 0.15,
  cholesterol = 35,
  is_fermented = false,
  is_raw = false
WHERE id = 'ae4ca119-dfd7-4cdf-9a47-dc6d8c93748d';

-- 12. Кофе с молоком (молоко 1,5) (approx)
UPDATE shared_products SET
  iron = 0.02,
  magnesium = 8,
  zinc = 0.08,
  selenium = 0.5,
  calcium = 25,
  phosphorus = 20,
  potassium = 65,
  vitamin_a = 10,
  vitamin_d = 0.1,
  vitamin_e = 0.01,
  vitamin_k = 0,
  vitamin_b1 = 0.010,
  vitamin_b2 = 0.040,
  vitamin_b3 = 0.15,
  vitamin_b6 = 0.010,
  vitamin_b9 = 1,
  vitamin_b12 = 0.10,
  vitamin_c = 0,
  omega3_100 = 0.0,
  omega6_100 = 0.01,
  cholesterol = 2,
  is_fermented = false,
  is_raw = false
WHERE id = 'dc118f1f-c921-4b39-8eb0-2aa967b24cdc';

-- 13. Топпинг Bombbar сгущёнка без сахара (approx)
UPDATE shared_products SET
  iron = 0.15,
  magnesium = 5,
  zinc = 0.15,
  selenium = 1.5,
  calcium = 45,
  phosphorus = 35,
  potassium = 55,
  vitamin_a = 15,
  vitamin_d = 0,
  vitamin_e = 0.05,
  vitamin_k = 0,
  vitamin_b1 = 0.015,
  vitamin_b2 = 0.045,
  vitamin_b3 = 0.05,
  vitamin_b6 = 0.015,
  vitamin_b9 = 2,
  vitamin_b12 = 0.05,
  vitamin_c = 0.5,
  omega3_100 = 0.0,
  omega6_100 = 0.0,
  cholesterol = 2,
  is_fermented = false,
  is_raw = false
WHERE id = 'c915ecd8-d8f7-45fa-b175-6f52325788f1';

-- 14. Гречневые палочки Зелёная линия (approx)
UPDATE shared_products SET
  iron = 1.85,
  magnesium = 85,
  zinc = 1.25,
  selenium = 4.5,
  calcium = 18,
  phosphorus = 165,
  potassium = 245,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 0.15,
  vitamin_k = 0.1,
  vitamin_b1 = 0.145,
  vitamin_b2 = 0.085,
  vitamin_b3 = 1.85,
  vitamin_b6 = 0.165,
  vitamin_b9 = 18,
  vitamin_b12 = 0,
  vitamin_c = 0,
  omega3_100 = 0.05,
  omega6_100 = 0.85,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '42fc3962-be74-43b3-86cd-9f78b1c4fd0f';

-- 15. Planto Фундук и пекан (plant drink) (approx)
UPDATE shared_products SET
  iron = 0.45,
  magnesium = 18,
  zinc = 0.35,
  selenium = 0.8,
  calcium = 120,
  phosphorus = 45,
  potassium = 85,
  vitamin_a = 0,
  vitamin_d = 0.75,
  vitamin_e = 1.85,
  vitamin_k = 0.5,
  vitamin_b1 = 0.045,
  vitamin_b2 = 0.210,
  vitamin_b3 = 0.15,
  vitamin_b6 = 0.045,
  vitamin_b9 = 5,
  vitamin_b12 = 0.38,
  vitamin_c = 0,
  omega3_100 = 0.05,
  omega6_100 = 0.85,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = 'd79a5653-df37-43ed-b0cc-a590a404ff66';

-- 16. Кефир 2,5 Кубанский молочник (Kefir - best-fit)
UPDATE shared_products SET
  iron = 0.04,
  magnesium = 11,
  zinc = 0.38,
  selenium = 3.6,
  calcium = 120,
  phosphorus = 95,
  potassium = 150,
  vitamin_a = 52,
  vitamin_d = 1.3,
  vitamin_e = 0.05,
  vitamin_k = 0.2,
  vitamin_b1 = 0.038,
  vitamin_b2 = 0.170,
  vitamin_b3 = 0.090,
  vitamin_b6 = 0.038,
  vitamin_b9 = 5,
  vitamin_b12 = 0.29,
  vitamin_c = 1.0,
  omega3_100 = 0.03,
  omega6_100 = 0.06,
  cholesterol = 10,
  is_fermented = true,
  is_raw = false
WHERE id = 'b48f0786-0585-47c3-9380-eb857075b6ae';

-- 17. Соус Цезарь низкокалорийный (Caesar dressing - best-fit)
UPDATE shared_products SET
  iron = 0.25,
  magnesium = 4,
  zinc = 0.15,
  selenium = 1.2,
  calcium = 18,
  phosphorus = 25,
  potassium = 35,
  vitamin_a = 12,
  vitamin_d = 0.1,
  vitamin_e = 1.45,
  vitamin_k = 24.5,
  vitamin_b1 = 0.015,
  vitamin_b2 = 0.035,
  vitamin_b3 = 0.15,
  vitamin_b6 = 0.015,
  vitamin_b9 = 2,
  vitamin_b12 = 0.05,
  vitamin_c = 0.5,
  omega3_100 = 0.45,
  omega6_100 = 8.50,
  cholesterol = 12,
  is_fermented = false,
  is_raw = false
WHERE id = '38ce2592-64b2-4fc5-8b34-63558c96acb5';

-- 18. Кокосовые чипсы (Coconut, dried) (USDA best-fit)
UPDATE shared_products SET
  iron = 3.32,
  magnesium = 90,
  zinc = 2.01,
  selenium = 18.5,
  calcium = 26,
  phosphorus = 206,
  potassium = 543,
  vitamin_a = 0,
  vitamin_d = 0,
  vitamin_e = 0.45,
  vitamin_k = 0.3,
  vitamin_b1 = 0.060,
  vitamin_b2 = 0.100,
  vitamin_b3 = 0.60,
  vitamin_b6 = 0.300,
  vitamin_b9 = 16,
  vitamin_b12 = 0,
  vitamin_c = 1.5,
  omega3_100 = 0.0,
  omega6_100 = 0.75,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '1c5d6803-9c99-43bb-85dd-6d578d915786';

-- 19. Ткемали Кинто классический (Tkemali sauce) (approx)
UPDATE shared_products SET
  iron = 0.45,
  magnesium = 12,
  zinc = 0.15,
  selenium = 0.2,
  calcium = 15,
  phosphorus = 18,
  potassium = 145,
  vitamin_a = 45,
  vitamin_d = 0,
  vitamin_e = 0.45,
  vitamin_k = 3.5,
  vitamin_b1 = 0.025,
  vitamin_b2 = 0.035,
  vitamin_b3 = 0.35,
  vitamin_b6 = 0.045,
  vitamin_b9 = 4,
  vitamin_b12 = 0,
  vitamin_c = 4.5,
  omega3_100 = 0,
  omega6_100 = 0.15,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = '24b1ac20-8ed2-45bb-9fc8-f57b2f52f5eb';

-- 20. Печенье витаминизированное «Юбилейное» с овсяными хлопьями (best-fit)
UPDATE shared_products SET
  iron = 2.45,
  magnesium = 35,
  zinc = 0.85,
  selenium = 8.5,
  calcium = 35,
  phosphorus = 125,
  potassium = 145,
  vitamin_a = 5,
  vitamin_d = 0,
  vitamin_e = 1.25,
  vitamin_k = 3.5,
  vitamin_b1 = 0.185,
  vitamin_b2 = 0.145,
  vitamin_b3 = 2.25,
  vitamin_b6 = 0.065,
  vitamin_b9 = 45,
  vitamin_b12 = 0.15,
  vitamin_c = 0,
  omega3_100 = 0.06,
  omega6_100 = 2.85,
  cholesterol = 15,
  is_fermented = false,
  is_raw = false
WHERE id = '2910474f-8321-4e62-b33a-e68f089b6282';

COMMIT;

-- Verification
SELECT 
  substring(name, 1, 45) as name,
  CASE WHEN cholesterol IS NOT NULL AND iron IS NOT NULL THEN '✅' ELSE '❌' END as ok,
  cholesterol
FROM shared_products 
WHERE id IN (
  'ce0ea17d-8126-4ae8-9c78-b93f3429c4dd',
  '34d85507-8e07-4337-8ec1-ed095a425596',
  '8976f361-be81-4fbd-a730-692a5508b2dd',
  '5d66f31b-9477-4744-9683-007aab31bdaf',
  '57aae705-89f4-45b5-a9e3-611d6470190c',
  '90dca660-6067-449a-adb5-7771407b0a0b',
  '4abdae38-15f4-4059-9902-757c75b8ddf2',
  'dbd0aa02-b038-499c-afbf-d1180f20a311',
  '73d51d5c-1586-4d14-9c7b-4ab0d6a63e9c',
  'dfd369c3-d355-4d91-b8d3-522e7a47b9d4',
  'ae4ca119-dfd7-4cdf-9a47-dc6d8c93748d',
  'dc118f1f-c921-4b39-8eb0-2aa967b24cdc',
  'c915ecd8-d8f7-45fa-b175-6f52325788f1',
  '42fc3962-be74-43b3-86cd-9f78b1c4fd0f',
  'd79a5653-df37-43ed-b0cc-a590a404ff66',
  'b48f0786-0585-47c3-9380-eb857075b6ae',
  '38ce2592-64b2-4fc5-8b34-63558c96acb5',
  '1c5d6803-9c99-43bb-85dd-6d578d915786',
  '24b1ac20-8ed2-45bb-9fc8-f57b2f52f5eb',
  '2910474f-8321-4e62-b33a-e68f089b6282'
)
ORDER BY name;
