-- Batch UPDATE #5 - 7 products (fish, vegetables, nuts, fruits) with USDA data
-- Generated: 2026-02-11
-- Source: USDA FoodData Central

BEGIN;

-- 1. Владкон тунец тушёнка премиум (Tuna, canned in oil - USDA #175176)
UPDATE shared_products SET
  iron = 1.18,
  magnesium = 29,
  zinc = 0.86,
  selenium = 60.6,
  calcium = 11,
  phosphorus = 189,
  potassium = 207,
  vitamin_a = 20,
  vitamin_d = 4.2,
  vitamin_e = 2.45,
  vitamin_k = 0.1,
  vitamin_b1 = 0.040,
  vitamin_b2 = 0.112,
  vitamin_b3 = 13.42,
  vitamin_b6 = 0.45,
  vitamin_b9 = 4,
  vitamin_b12 = 2.20,
  vitamin_c = 0,
  omega3_100 = 1.30,
  omega6_100 = 2.90,
  cholesterol = 55,
  is_fermented = false,
  is_raw = false
WHERE id = '8ca70fc0-095d-4478-8700-b9cbe5192795';

-- 2. Помидор (Tomato, raw - USDA #170457)
UPDATE shared_products SET
  iron = 0.27,
  magnesium = 11,
  zinc = 0.17,
  selenium = 0.0,
  calcium = 10,
  phosphorus = 24,
  potassium = 237,
  vitamin_a = 42,
  vitamin_d = 0,
  vitamin_e = 0.54,
  vitamin_k = 7.9,
  vitamin_b1 = 0.037,
  vitamin_b2 = 0.019,
  vitamin_b3 = 0.594,
  vitamin_b6 = 0.080,
  vitamin_b9 = 15,
  vitamin_b12 = 0,
  vitamin_c = 13.7,
  omega3_100 = 0.003,
  omega6_100 = 0.08,
  cholesterol = 0,
  is_fermented = false,
  is_raw = true  -- Raw vegetable
WHERE id = 'bd8b1f82-0844-4697-bbbf-155bef22e458';

-- 3. Перец сладкий на гриле (Bell pepper, grilled - USDA #170108)
UPDATE shared_products SET
  iron = 0.46,
  magnesium = 12,
  zinc = 0.18,
  selenium = 0.1,
  calcium = 9,
  phosphorus = 24,
  potassium = 175,
  vitamin_a = 157,
  vitamin_d = 0,
  vitamin_e = 1.58,
  vitamin_k = 4.9,
  vitamin_b1 = 0.057,
  vitamin_b2 = 0.028,
  vitamin_b3 = 0.480,
  vitamin_b6 = 0.224,
  vitamin_b9 = 10,
  vitamin_b12 = 0,
  vitamin_c = 80.4,
  omega3_100 = 0.03,
  omega6_100 = 0.11,
  cholesterol = 0,
  is_fermented = false,
  is_raw = false
WHERE id = 'e0097652-9010-49e6-9664-1cf2d5c95ee1';

-- 4. Орехи микс (миндаль, кешью, фундук) - averaged USDA #170567 (almonds), #170162 (cashews), #170596 (hazelnuts)
UPDATE shared_products SET
  iron = 3.15,
  magnesium = 245,
  zinc = 3.55,
  selenium = 6.3,
  calcium = 183,
  phosphorus = 429,
  potassium = 573,
  vitamin_a = 1,
  vitamin_d = 0,
  vitamin_e = 12.5,
  vitamin_k = 3.5,
  vitamin_b1 = 0.380,
  vitamin_b2 = 0.120,
  vitamin_b3 = 2.30,
  vitamin_b6 = 0.310,
  vitamin_b9 = 58,
  vitamin_b12 = 0,
  vitamin_c = 1.0,
  omega3_100 = 0.12,
  omega6_100 = 12.50,
  cholesterol = 0,
  is_fermented = false,
  is_raw = true  -- Raw nuts
WHERE id = 'e381a1ba-945c-42d5-931b-73bbf8170f4d';

-- 5. Тунец консервированный в собственном соку (Tuna, canned in water - USDA #175165)
UPDATE shared_products SET
  iron = 1.0,
  magnesium = 27,
  zinc = 0.78,
  selenium = 76.0,
  calcium = 7,
  phosphorus = 217,
  potassium = 237,
  vitamin_a = 17,
  vitamin_d = 3.9,
  vitamin_e = 0.24,
  vitamin_k = 0.1,
  vitamin_b1 = 0.013,
  vitamin_b2 = 0.034,
  vitamin_b3 = 11.06,
  vitamin_b6 = 0.52,
  vitamin_b9 = 4,
  vitamin_b12 = 2.08,
  vitamin_c = 0,
  omega3_100 = 0.22,
  omega6_100 = 0.02,
  cholesterol = 39,
  is_fermented = false,
  is_raw = false
WHERE id = 'ee9a9d5a-e207-423c-bb03-80b441e43336';

-- 6. Перец болгарский свежий (Bell pepper, raw - USDA #170108)
UPDATE shared_products SET
  iron = 0.43,
  magnesium = 12,
  zinc = 0.25,
  selenium = 0.1,
  calcium = 7,
  phosphorus = 26,
  potassium = 211,
  vitamin_a = 157,
  vitamin_d = 0,
  vitamin_e = 1.58,
  vitamin_k = 4.9,
  vitamin_b1 = 0.054,
  vitamin_b2 = 0.085,
  vitamin_b3 = 0.979,
  vitamin_b6 = 0.291,
  vitamin_b9 = 46,
  vitamin_b12 = 0,
  vitamin_c = 127.7,
  omega3_100 = 0.03,
  omega6_100 = 0.06,
  cholesterol = 0,
  is_fermented = false,
  is_raw = true  -- Raw vegetable
WHERE id = 'fd74ea21-abe5-4c08-b3c9-937a333fae0a';

-- 7. Апельсин (Orange, raw - USDA #169097)
UPDATE shared_products SET
  iron = 0.10,
  magnesium = 10,
  zinc = 0.07,
  selenium = 0.5,
  calcium = 40,
  phosphorus = 14,
  potassium = 181,
  vitamin_a = 11,
  vitamin_d = 0,
  vitamin_e = 0.18,
  vitamin_k = 0,
  vitamin_b1 = 0.087,
  vitamin_b2 = 0.040,
  vitamin_b3 = 0.282,
  vitamin_b6 = 0.060,
  vitamin_b9 = 30,
  vitamin_b12 = 0,
  vitamin_c = 53.2,
  omega3_100 = 0.01,
  omega6_100 = 0.02,
  cholesterol = 0,
  is_fermented = false,
  is_raw = true  -- Raw fruit
WHERE id = '073b868a-0f78-4ccf-a821-050133707e19';

COMMIT;

-- Verification query
SELECT 
  name,
  CASE 
    WHEN cholesterol IS NOT NULL 
      AND omega3_100 IS NOT NULL 
      AND iron IS NOT NULL
    THEN '✅ COMPLETE'
    ELSE '❌ INCOMPLETE'
  END as status,
  cholesterol,
  vitamin_c,
  is_raw
FROM shared_products 
WHERE id IN (
  '8ca70fc0-095d-4478-8700-b9cbe5192795',
  'bd8b1f82-0844-4697-bbbf-155bef22e458',
  'e0097652-9010-49e6-9664-1cf2d5c95ee1',
  'e381a1ba-945c-42d5-931b-73bbf8170f4d',
  'ee9a9d5a-e207-423c-bb03-80b441e43336',
  'fd74ea21-abe5-4c08-b3c9-937a333fae0a',
  '073b868a-0f78-4ccf-a821-050133707e19'
)
ORDER BY name;
