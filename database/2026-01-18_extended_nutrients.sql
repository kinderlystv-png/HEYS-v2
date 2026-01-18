-- =====================================================
-- MIGRATION: Extended Nutrients for Products
-- Date: 2026-01-18
-- Description: Adds 29 new nutritional fields to shared_products
--              for Harm Score v3.0 and nutrient density calculations
-- =====================================================

-- =====================================================
-- 1. BASIC NUTRIENTS (5 fields)
-- =====================================================

-- Sodium in mg per 100g (He & MacGregor 2011 - hypertension risk)
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS sodium100 NUMERIC;
COMMENT ON COLUMN shared_products.sodium100 IS 'Sodium mg/100g';

-- Omega-3 in g per 100g (Simopoulos 2002 - anti-inflammatory)
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS omega3_100 NUMERIC;
COMMENT ON COLUMN shared_products.omega3_100 IS 'Omega-3 g/100g';

-- Omega-6 in g per 100g (balance with omega-3)
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS omega6_100 NUMERIC;
COMMENT ON COLUMN shared_products.omega6_100 IS 'Omega-6 g/100g';

-- NOVA classification 1-4 (Monteiro 2019 - ultra-processing)
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS nova_group INTEGER;
COMMENT ON COLUMN shared_products.nova_group IS 'NOVA classification: 1=unprocessed, 2=ingredients, 3=processed, 4=ultra-processed';

-- E-additives array (Chassaing 2015 - gut inflammation)
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS additives TEXT[];
COMMENT ON COLUMN shared_products.additives IS 'Array of E-codes like {E621,E300}';

-- Calculated nutrient density score 0-100 (Drewnowski 2005)
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS nutrient_density NUMERIC;
COMMENT ON COLUMN shared_products.nutrient_density IS 'Nutrient density score 0-100, calculated from vitamins/minerals';

-- =====================================================
-- 2. QUALITY FLAGS (4 fields)
-- =====================================================

-- Organic product (Smith-Spangler 2012)
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS is_organic BOOLEAN DEFAULT false;
COMMENT ON COLUMN shared_products.is_organic IS 'Organic certified product';

-- Whole grain (Aune 2016 - cardiovascular benefits)
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS is_whole_grain BOOLEAN DEFAULT false;
COMMENT ON COLUMN shared_products.is_whole_grain IS 'Contains whole grains';

-- Fermented (probiotics, gut health)
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS is_fermented BOOLEAN DEFAULT false;
COMMENT ON COLUMN shared_products.is_fermented IS 'Fermented product (kefir, kimchi, etc)';

-- Raw/uncooked (preserves enzymes, nutrients)
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS is_raw BOOLEAN DEFAULT false;
COMMENT ON COLUMN shared_products.is_raw IS 'Raw/uncooked product';

-- =====================================================
-- 3. VITAMINS (11 fields) - % of Daily Value per 100g
-- =====================================================

-- Vitamin A (DV: 900 mcg RAE)
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_a NUMERIC;
COMMENT ON COLUMN shared_products.vitamin_a IS 'Vitamin A % of DV per 100g';

-- Vitamin C (DV: 90 mg)
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_c NUMERIC;
COMMENT ON COLUMN shared_products.vitamin_c IS 'Vitamin C % of DV per 100g';

-- Vitamin D (DV: 20 mcg) - often deficient
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_d NUMERIC;
COMMENT ON COLUMN shared_products.vitamin_d IS 'Vitamin D % of DV per 100g';

-- Vitamin E (DV: 15 mg)
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_e NUMERIC;
COMMENT ON COLUMN shared_products.vitamin_e IS 'Vitamin E % of DV per 100g';

-- Vitamin K (DV: 120 mcg)
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_k NUMERIC;
COMMENT ON COLUMN shared_products.vitamin_k IS 'Vitamin K % of DV per 100g';

-- Vitamin B1/Thiamin (DV: 1.2 mg)
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_b1 NUMERIC;
COMMENT ON COLUMN shared_products.vitamin_b1 IS 'Vitamin B1 (Thiamin) % of DV per 100g';

-- Vitamin B2/Riboflavin (DV: 1.3 mg)
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_b2 NUMERIC;
COMMENT ON COLUMN shared_products.vitamin_b2 IS 'Vitamin B2 (Riboflavin) % of DV per 100g';

-- Vitamin B3/Niacin (DV: 16 mg)
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_b3 NUMERIC;
COMMENT ON COLUMN shared_products.vitamin_b3 IS 'Vitamin B3 (Niacin) % of DV per 100g';

-- Vitamin B6 (DV: 1.7 mg)
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_b6 NUMERIC;
COMMENT ON COLUMN shared_products.vitamin_b6 IS 'Vitamin B6 % of DV per 100g';

-- Vitamin B9/Folate (DV: 400 mcg) - important for pregnancy
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_b9 NUMERIC;
COMMENT ON COLUMN shared_products.vitamin_b9 IS 'Vitamin B9 (Folate) % of DV per 100g';

-- Vitamin B12 (DV: 2.4 mcg) - important for vegans
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_b12 NUMERIC;
COMMENT ON COLUMN shared_products.vitamin_b12 IS 'Vitamin B12 % of DV per 100g';

-- =====================================================
-- 4. MINERALS (8 fields) - % of Daily Value per 100g
-- =====================================================

-- Calcium (DV: 1000 mg)
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS calcium NUMERIC;
COMMENT ON COLUMN shared_products.calcium IS 'Calcium % of DV per 100g';

-- Iron (DV: 18 mg)
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS iron NUMERIC;
COMMENT ON COLUMN shared_products.iron IS 'Iron % of DV per 100g';

-- Magnesium (DV: 400 mg)
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS magnesium NUMERIC;
COMMENT ON COLUMN shared_products.magnesium IS 'Magnesium % of DV per 100g';

-- Phosphorus (DV: 700 mg)
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS phosphorus NUMERIC;
COMMENT ON COLUMN shared_products.phosphorus IS 'Phosphorus % of DV per 100g';

-- Potassium (DV: 3500 mg)
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS potassium NUMERIC;
COMMENT ON COLUMN shared_products.potassium IS 'Potassium % of DV per 100g';

-- Zinc (DV: 11 mg)
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS zinc NUMERIC;
COMMENT ON COLUMN shared_products.zinc IS 'Zinc % of DV per 100g';

-- Selenium (DV: 55 mcg)
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS selenium NUMERIC;
COMMENT ON COLUMN shared_products.selenium IS 'Selenium % of DV per 100g';

-- Iodine (DV: 150 mcg)
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS iodine NUMERIC;
COMMENT ON COLUMN shared_products.iodine IS 'Iodine % of DV per 100g';

-- =====================================================
-- 4. CONSTRAINTS & INDEXES
-- =====================================================

-- NOVA group must be 1-4
ALTER TABLE shared_products DROP CONSTRAINT IF EXISTS chk_nova_group;
ALTER TABLE shared_products ADD CONSTRAINT chk_nova_group
  CHECK (nova_group IS NULL OR (nova_group >= 1 AND nova_group <= 4));

-- Nutrient density 0-100
ALTER TABLE shared_products DROP CONSTRAINT IF EXISTS chk_nutrient_density;
ALTER TABLE shared_products ADD CONSTRAINT chk_nutrient_density
  CHECK (nutrient_density IS NULL OR (nutrient_density >= 0 AND nutrient_density <= 100));

-- Vitamins/minerals must be >= 0
ALTER TABLE shared_products DROP CONSTRAINT IF EXISTS chk_vitamins_positive;
ALTER TABLE shared_products ADD CONSTRAINT chk_vitamins_positive
  CHECK (
    (vitamin_a IS NULL OR vitamin_a >= 0) AND
    (vitamin_c IS NULL OR vitamin_c >= 0) AND
    (vitamin_d IS NULL OR vitamin_d >= 0) AND
    (vitamin_e IS NULL OR vitamin_e >= 0) AND
    (vitamin_k IS NULL OR vitamin_k >= 0) AND
    (vitamin_b1 IS NULL OR vitamin_b1 >= 0) AND
    (vitamin_b2 IS NULL OR vitamin_b2 >= 0) AND
    (vitamin_b3 IS NULL OR vitamin_b3 >= 0) AND
    (vitamin_b6 IS NULL OR vitamin_b6 >= 0) AND
    (vitamin_b9 IS NULL OR vitamin_b9 >= 0) AND
    (vitamin_b12 IS NULL OR vitamin_b12 >= 0)
  );

ALTER TABLE shared_products DROP CONSTRAINT IF EXISTS chk_minerals_positive;
ALTER TABLE shared_products ADD CONSTRAINT chk_minerals_positive
  CHECK (
    (calcium IS NULL OR calcium >= 0) AND
    (iron IS NULL OR iron >= 0) AND
    (magnesium IS NULL OR magnesium >= 0) AND
    (phosphorus IS NULL OR phosphorus >= 0) AND
    (potassium IS NULL OR potassium >= 0) AND
    (zinc IS NULL OR zinc >= 0) AND
    (selenium IS NULL OR selenium >= 0) AND
    (iodine IS NULL OR iodine >= 0)
  );

-- Sodium/omega must be >= 0
ALTER TABLE shared_products DROP CONSTRAINT IF EXISTS chk_basic_nutrients_positive;
ALTER TABLE shared_products ADD CONSTRAINT chk_basic_nutrients_positive
  CHECK (
    (sodium100 IS NULL OR sodium100 >= 0) AND
    (omega3_100 IS NULL OR omega3_100 >= 0) AND
    (omega6_100 IS NULL OR omega6_100 >= 0)
  );

-- Index on NOVA group for filtering
CREATE INDEX IF NOT EXISTS idx_shared_products_nova_group
  ON shared_products(nova_group) WHERE nova_group IS NOT NULL;

-- Index on sodium for sorting/filtering high-sodium products
CREATE INDEX IF NOT EXISTS idx_shared_products_sodium
  ON shared_products(sodium100) WHERE sodium100 IS NOT NULL;

-- Index on quality flags
CREATE INDEX IF NOT EXISTS idx_shared_products_is_organic
  ON shared_products(is_organic) WHERE is_organic = true;
CREATE INDEX IF NOT EXISTS idx_shared_products_is_whole_grain
  ON shared_products(is_whole_grain) WHERE is_whole_grain = true;

-- =====================================================
-- 5. VERIFICATION
-- =====================================================

-- Check columns were added
DO $$
DECLARE
    col_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO col_count
    FROM information_schema.columns
    WHERE table_name = 'shared_products'
      AND column_name IN (
        'sodium100', 'omega3_100', 'omega6_100', 'nova_group', 'additives', 'nutrient_density',
        'is_organic', 'is_whole_grain', 'is_fermented', 'is_raw',
        'vitamin_a', 'vitamin_c', 'vitamin_d', 'vitamin_e', 'vitamin_k',
        'vitamin_b1', 'vitamin_b2', 'vitamin_b3', 'vitamin_b6', 'vitamin_b9', 'vitamin_b12',
        'calcium', 'iron', 'magnesium', 'phosphorus', 'potassium', 'zinc', 'selenium', 'iodine'
      );
    
    IF col_count = 29 THEN
        RAISE NOTICE '✅ All 29 extended nutrient columns added successfully';
    ELSE
        RAISE NOTICE '⚠️ Expected 29 columns, found %', col_count;
    END IF;
END $$;

-- Show final column list
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'shared_products'
ORDER BY ordinal_position;
