# Batch Enrichment Template

## Workflow for 10-product batch:

### Step 1: Select batch

```sql
-- Find 10 products without cholesterol
SELECT id, name, category, iron
FROM shared_products
WHERE cholesterol IS NULL
ORDER BY CASE WHEN iron IS NOT NULL THEN 0 ELSE 1 END, id
LIMIT 10;
```

### Step 2: Lookup USDA for each

Manual search at: https://fdc.nal.usda.gov/fdc-app.html#/

For Russian products, translate and find closest match:

- Говядина → Beef
- Курица → Chicken
- Творог → Cottage cheese
- Молоко → Milk

### Step 3: Generate UPDATE (template)

```sql
UPDATE shared_products SET
  -- Minerals (mg, except selenium in µg)
  iron = ?,
  magnesium = ?,
  zinc = ?,
  selenium = ?,
  calcium = ?,
  phosphorus = ?,
  potassium = ?,

  -- Vitamins
  vitamin_a = ?,
  vitamin_d = ?,
  vitamin_e = ?,
  vitamin_k = ?,
  vitamin_b1 = ?,
  vitamin_b2 = ?,
  vitamin_b3 = ?,
  vitamin_b6 = ?,
  vitamin_b9 = ?,
  vitamin_b12 = ?,
  vitamin_c = ?,

  -- Fatty acids (g per 100g)
  omega3_100 = ?,
  omega6_100 = ?,

  -- Cholesterol (mg)
  cholesterol = ?,

  -- Flags
  is_fermented = false,
  is_raw = false,

  updated_at = CURRENT_TIMESTAMP
WHERE id = 'UUID-HERE';
```

### Step 4: Apply and verify

```sql
-- Verify all 10 products
SELECT name, iron, omega3_100, cholesterol
FROM shared_products
WHERE id IN ('uuid1', 'uuid2', ...);
```

## USDA Nutrient IDs (for API if needed)

- Energy: 1008
- Protein: 1003
- Fat: 1004
- Carbs: 1005
- Fiber: 1079
- Iron: 1089
- Magnesium: 1090
- Zinc: 1095
- Selenium: 1103
- Calcium: 1087
- Phosphorus: 1091
- Potassium: 1092
- Vitamin A (RAE): 1106
- Vitamin D: 1114
- Vitamin E: 1109
- Vitamin K: 1185
- Thiamin (B1): 1165
- Riboflavin (B2): 1166
- Niacin (B3): 1167
- Vitamin B6: 1175
- Folate (B9): 1177
- Vitamin B12: 1178
- Vitamin C: 1162
- Omega-3: 1404, 1405, 1406 (ALA, EPA, DHA)
- Omega-6: 1269
- Cholesterol: 1253

## Quick USDA Common Foods

| Product        | USDA FDC ID | Name                                                 |
| -------------- | ----------- | ---------------------------------------------------- |
| Chicken breast | 331960      | Chicken, broiler, breast, meat only, cooked, roasted |
| Beef (lean)    | 174032      | Beef, ground, 95% lean meat, cooked                  |
| Salmon         | 175168      | Fish, salmon, Atlantic, farmed, cooked               |
| Milk (whole)   | 746762      | Milk, whole, 3.25% milkfat                           |
| Cottage cheese | 328637      | Cheese, cottage, lowfat, 2% milkfat                  |
| Eggs           | 748967      | Egg, whole, raw, fresh                               |
| Oats           | 169716      | Oatmeal, dry                                         |
| Brown rice     | 168878      | Rice, brown, long-grain, cooked                      |
| Spinach        | 168462      | Spinach, raw                                         |
| Broccoli       | 747447      | Broccoli, raw                                        |

## Estimated Time

- USDA lookup: 1-2 min/product
- UPDATE generation: 30 sec/product
- Verification: 30 sec/batch
- **Total: ~30 min per 10 products**
- **Target rate: 20 products/hour** (accounting for breaks)
