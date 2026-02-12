-- Test enrichment for: Курица шашлык (окорочок без кожи)
-- Source: USDA FoodData Central - Chicken, drumstick, meat only, cooked, roasted
-- UUID: 6462df14-f133-40f5-b34d-a2b8f0a62af1

-- BEFORE: Check current state
SELECT 
  id, name, 
  iron, magnesium, zinc, selenium,
  vitamin_a, vitamin_d, vitamin_b6, vitamin_b12,
  omega3_100, omega6_100, cholesterol
FROM shared_products 
WHERE id = '6462df14-f133-40f5-b34d-a2b8f0a62af1';

-- UPDATE: Apply USDA data (values per 100g)
UPDATE shared_products SET
  -- Minerals (mg per 100g, except selenium in µg)
  iron = 1.05,              -- Iron (1.05 mg)
  magnesium = 20,           -- Magnesium (20 mg)
  zinc = 2.55,              -- Zinc (2.55 mg)
  selenium = 19.5,          -- Selenium (19.5 µg)
  calcium = 11,             -- Calcium (11 mg)
  phosphorus = 180,         -- Phosphorus (180 mg)
  potassium = 230,          -- Potassium (230 mg)
  
  -- Vitamins
  vitamin_a = 16,           -- Vitamin A (16 µg RAE)
  vitamin_d = 0.1,          -- Vitamin D (0.1 µg)
  vitamin_e = 0.2,          -- Vitamin E (0.2 mg)
  vitamin_k = 2.5,          -- Vitamin K (2.5 µg)
  vitamin_b1 = 0.07,        -- Thiamin (0.07 mg)
  vitamin_b2 = 0.18,        -- Riboflavin (0.18 mg)
  vitamin_b3 = 5.8,         -- Niacin (5.8 mg)
  vitamin_b6 = 0.31,        -- B6 (0.31 mg)
  vitamin_b9 = 6,           -- Folate (6 µg)
  vitamin_b12 = 0.34,       -- B12 (0.34 µg)
  vitamin_c = 0,            -- Vitamin C (0 mg)
  
  -- Fatty acids (g per 100g)
  omega3_100 = 0.06,        -- Omega-3 total (0.06 g)
  omega6_100 = 1.2,         -- Omega-6 total (1.2 g)
  
  -- Cholesterol (mg per 100g)
  cholesterol = 93,         -- Cholesterol (93 mg)
  
  -- Flags
  is_fermented = false,
  is_raw = false,
  is_organic = false,
  is_whole_grain = false,
  
  updated_at = CURRENT_TIMESTAMP
WHERE id = '6462df14-f133-40f5-b34d-a2b8f0a62af1';

-- AFTER: Verify changes
SELECT 
  id, name,
  iron, magnesium, zinc, selenium,
  vitamin_a, vitamin_d, vitamin_b6, vitamin_b12,
  omega3_100, omega6_100, cholesterol,
  updated_at
FROM shared_products 
WHERE id = '6462df14-f133-40f5-b34d-a2b8f0a62af1';

-- Coverage check
SELECT 
  CASE 
    WHEN iron IS NOT NULL AND iron > 0 
      AND magnesium IS NOT NULL AND magnesium > 0
      AND zinc IS NOT NULL AND zinc > 0
      AND omega3_100 IS NOT NULL 
      AND omega6_100 IS NOT NULL
      AND cholesterol IS NOT NULL
      AND vitamin_b6 IS NOT NULL
      AND vitamin_b12 IS NOT NULL
    THEN '✅ ENRICHMENT SUCCESS'
    ELSE '❌ INCOMPLETE'
  END as status,
  name
FROM shared_products 
WHERE id = '6462df14-f133-40f5-b34d-a2b8f0a62af1';
