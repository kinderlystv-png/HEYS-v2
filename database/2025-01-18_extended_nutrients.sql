-- ============================================================================
-- DEPRECATED — заменено 2026-01-18_extended_nutrients.sql
-- Файл оставлен для истории, применять НЕ НУЖНО
-- ============================================================================
/*

-- ============================================================================
-- 1. ADD NEW COLUMNS TO shared_products
-- ============================================================================

-- === BASIC OPTIONAL ===
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS sodium100 NUMERIC;         -- Натрий мг/100г
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS omega3_100 NUMERIC;        -- Омега-3 г/100г
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS omega6_100 NUMERIC;        -- Омега-6 г/100г
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS nova_group SMALLINT;       -- NOVA 1-4
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS additives TEXT[];          -- E-добавки массив
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS nutrient_density NUMERIC;  -- 0-100

-- === QUALITY FLAGS ===
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS is_organic BOOLEAN DEFAULT false;
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS is_whole_grain BOOLEAN DEFAULT false;
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS is_fermented BOOLEAN DEFAULT false;
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS is_raw BOOLEAN DEFAULT false;

-- === VITAMINS (% от DV на 100г) ===
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_a NUMERIC;
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_c NUMERIC;
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_d NUMERIC;
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_e NUMERIC;
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_k NUMERIC;
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_b1 NUMERIC;
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_b2 NUMERIC;
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_b3 NUMERIC;
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_b6 NUMERIC;
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_b9 NUMERIC;
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS vitamin_b12 NUMERIC;

-- === MINERALS (% от DV на 100г) ===
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS calcium NUMERIC;
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS iron NUMERIC;
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS magnesium NUMERIC;
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS phosphorus NUMERIC;
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS potassium NUMERIC;
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS zinc NUMERIC;
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS selenium NUMERIC;
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS iodine NUMERIC;

-- ============================================================================
-- 2. ADD CONSTRAINTS
-- ============================================================================

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

-- Sodium, omega must be >= 0
ALTER TABLE shared_products DROP CONSTRAINT IF EXISTS chk_basic_nutrients_positive;
ALTER TABLE shared_products ADD CONSTRAINT chk_basic_nutrients_positive 
  CHECK (
    (sodium100 IS NULL OR sodium100 >= 0) AND
    (omega3_100 IS NULL OR omega3_100 >= 0) AND
    (omega6_100 IS NULL OR omega6_100 >= 0)
  );

-- ============================================================================
-- 3. CREATE INDEXES FOR COMMON QUERIES
-- ============================================================================

-- Index on NOVA group for filtering
CREATE INDEX IF NOT EXISTS idx_shared_products_nova_group 
  ON shared_products(nova_group) WHERE nova_group IS NOT NULL;

-- Index on sodium for sorting/filtering high-sodium products
CREATE INDEX IF NOT EXISTS idx_shared_products_sodium 
  ON shared_products(sodium100) WHERE sodium100 IS NOT NULL;

-- Index on quality flags (organic, whole grain, etc.)
CREATE INDEX IF NOT EXISTS idx_shared_products_is_organic 
  ON shared_products(is_organic) WHERE is_organic = true;
CREATE INDEX IF NOT EXISTS idx_shared_products_is_whole_grain 
  ON shared_products(is_whole_grain) WHERE is_whole_grain = true;

-- ============================================================================
-- 4. UPDATE RPC FUNCTION: publish_shared_product_by_curator
-- ============================================================================

CREATE OR REPLACE FUNCTION publish_shared_product_by_curator(
  p_curator_id UUID,
  p_product_data JSONB
) RETURNS JSONB AS $$
DECLARE
  v_fingerprint TEXT;
  v_name_norm TEXT;
  v_product_id UUID;
  v_existing_id UUID;
  v_result JSONB;
BEGIN
  -- Validate curator exists
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_curator_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'curator_not_found');
  END IF;

  -- Extract and validate required fields
  IF p_product_data->>'name' IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'name_required');
  END IF;

  -- Get fingerprint and normalized name
  v_fingerprint := p_product_data->>'fingerprint';
  v_name_norm := lower(trim(regexp_replace(p_product_data->>'name', '\s+', ' ', 'g')));
  v_name_norm := replace(v_name_norm, 'ё', 'е');

  -- Check for existing product by fingerprint
  IF v_fingerprint IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM shared_products WHERE fingerprint = v_fingerprint LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'status', 'duplicate', 'id', v_existing_id, 'message', 'Product already exists');
    END IF;
  END IF;

  -- Insert new product with all fields
  INSERT INTO shared_products (
    name,
    name_norm,
    fingerprint,
    simple100,
    complex100,
    protein100,
    "badFat100",
    "goodFat100",
    trans100,
    fiber100,
    gi,
    harm,
    category,
    portions,
    description,
    -- Extended fields (v4.4.0)
    sodium100,
    omega3_100,
    omega6_100,
    nova_group,
    additives,
    nutrient_density,
    is_organic,
    is_whole_grain,
    is_fermented,
    is_raw,
    vitamin_a,
    vitamin_c,
    vitamin_d,
    vitamin_e,
    vitamin_k,
    vitamin_b1,
    vitamin_b2,
    vitamin_b3,
    vitamin_b6,
    vitamin_b9,
    vitamin_b12,
    calcium,
    iron,
    magnesium,
    phosphorus,
    potassium,
    zinc,
    selenium,
    iodine,
    -- Metadata
    created_by,
    created_at,
    updated_at
  ) VALUES (
    p_product_data->>'name',
    v_name_norm,
    v_fingerprint,
    (p_product_data->>'simple100')::NUMERIC,
    (p_product_data->>'complex100')::NUMERIC,
    (p_product_data->>'protein100')::NUMERIC,
    (p_product_data->>'badFat100')::NUMERIC,
    (p_product_data->>'goodFat100')::NUMERIC,
    (p_product_data->>'trans100')::NUMERIC,
    (p_product_data->>'fiber100')::NUMERIC,
    (p_product_data->>'gi')::NUMERIC,
    (p_product_data->>'harm')::NUMERIC,
    p_product_data->>'category',
    p_product_data->'portions',
    p_product_data->>'description',
    -- Extended fields
    (p_product_data->>'sodium100')::NUMERIC,
    (p_product_data->>'omega3_100')::NUMERIC,
    (p_product_data->>'omega6_100')::NUMERIC,
    (p_product_data->>'nova_group')::SMALLINT,
    CASE WHEN p_product_data->'additives' IS NOT NULL 
         THEN ARRAY(SELECT jsonb_array_elements_text(p_product_data->'additives'))
         ELSE NULL END,
    (p_product_data->>'nutrient_density')::NUMERIC,
    COALESCE((p_product_data->>'is_organic')::BOOLEAN, false),
    COALESCE((p_product_data->>'is_whole_grain')::BOOLEAN, false),
    COALESCE((p_product_data->>'is_fermented')::BOOLEAN, false),
    COALESCE((p_product_data->>'is_raw')::BOOLEAN, false),
    (p_product_data->>'vitamin_a')::NUMERIC,
    (p_product_data->>'vitamin_c')::NUMERIC,
    (p_product_data->>'vitamin_d')::NUMERIC,
    (p_product_data->>'vitamin_e')::NUMERIC,
    (p_product_data->>'vitamin_k')::NUMERIC,
    (p_product_data->>'vitamin_b1')::NUMERIC,
    (p_product_data->>'vitamin_b2')::NUMERIC,
    (p_product_data->>'vitamin_b3')::NUMERIC,
    (p_product_data->>'vitamin_b6')::NUMERIC,
    (p_product_data->>'vitamin_b9')::NUMERIC,
    (p_product_data->>'vitamin_b12')::NUMERIC,
    (p_product_data->>'calcium')::NUMERIC,
    (p_product_data->>'iron')::NUMERIC,
    (p_product_data->>'magnesium')::NUMERIC,
    (p_product_data->>'phosphorus')::NUMERIC,
    (p_product_data->>'potassium')::NUMERIC,
    (p_product_data->>'zinc')::NUMERIC,
    (p_product_data->>'selenium')::NUMERIC,
    (p_product_data->>'iodine')::NUMERIC,
    -- Metadata
    p_curator_id,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_product_id;

  RETURN jsonb_build_object('success', true, 'status', 'published', 'id', v_product_id);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. CREATE VIEW FOR PRODUCTS WITH COMPUTED FIELDS
-- ============================================================================

DROP VIEW IF EXISTS v_shared_products_full;
CREATE VIEW v_shared_products_full AS
SELECT 
  sp.*,
  -- Computed macros
  COALESCE(simple100, 0) + COALESCE(complex100, 0) AS carbs100,
  COALESCE("badFat100", 0) + COALESCE("goodFat100", 0) + COALESCE(trans100, 0) AS fat100,
  -- Atwater kcal
  ROUND(
    COALESCE(protein100, 0) * 4 + 
    (COALESCE(simple100, 0) + COALESCE(complex100, 0)) * 4 + 
    (COALESCE("badFat100", 0) + COALESCE("goodFat100", 0) + COALESCE(trans100, 0)) * 9
  ) AS kcal100,
  -- NOVA label
  CASE nova_group
    WHEN 1 THEN 'Необработанные'
    WHEN 2 THEN 'Кулинарные ингредиенты'
    WHEN 3 THEN 'Переработанные'
    WHEN 4 THEN 'Ультрапереработанные'
    ELSE NULL
  END AS nova_label
FROM shared_products sp;

-- ============================================================================
-- 6. GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON v_shared_products_full TO authenticated;
GRANT EXECUTE ON FUNCTION publish_shared_product_by_curator(UUID, JSONB) TO authenticated;

-- ============================================================================
-- 7. ADD COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON COLUMN shared_products.nova_group IS 'NOVA classification 1-4 (Monteiro 2019)';
COMMENT ON COLUMN shared_products.sodium100 IS 'Sodium in mg per 100g';
COMMENT ON COLUMN shared_products.omega3_100 IS 'Omega-3 in g per 100g';
COMMENT ON COLUMN shared_products.omega6_100 IS 'Omega-6 in g per 100g';
COMMENT ON COLUMN shared_products.nutrient_density IS 'Nutrient density score 0-100';
COMMENT ON COLUMN shared_products.is_organic IS 'Certified organic product';
COMMENT ON COLUMN shared_products.is_whole_grain IS 'Whole grain product';
COMMENT ON COLUMN shared_products.is_fermented IS 'Fermented product';
COMMENT ON COLUMN shared_products.is_raw IS 'Raw/unprocessed product';
COMMENT ON COLUMN shared_products.additives IS 'Array of E-numbers (food additives)';

-- Vitamins
COMMENT ON COLUMN shared_products.vitamin_a IS 'Vitamin A % Daily Value per 100g';
COMMENT ON COLUMN shared_products.vitamin_c IS 'Vitamin C % Daily Value per 100g';
COMMENT ON COLUMN shared_products.vitamin_d IS 'Vitamin D % Daily Value per 100g';
COMMENT ON COLUMN shared_products.vitamin_e IS 'Vitamin E % Daily Value per 100g';
COMMENT ON COLUMN shared_products.vitamin_k IS 'Vitamin K % Daily Value per 100g';
COMMENT ON COLUMN shared_products.vitamin_b1 IS 'Thiamin % Daily Value per 100g';
COMMENT ON COLUMN shared_products.vitamin_b2 IS 'Riboflavin % Daily Value per 100g';
COMMENT ON COLUMN shared_products.vitamin_b3 IS 'Niacin % Daily Value per 100g';
COMMENT ON COLUMN shared_products.vitamin_b6 IS 'Vitamin B6 % Daily Value per 100g';
COMMENT ON COLUMN shared_products.vitamin_b9 IS 'Folate % Daily Value per 100g';
COMMENT ON COLUMN shared_products.vitamin_b12 IS 'Vitamin B12 % Daily Value per 100g';

-- Minerals
COMMENT ON COLUMN shared_products.calcium IS 'Calcium % Daily Value per 100g';
COMMENT ON COLUMN shared_products.iron IS 'Iron % Daily Value per 100g';
COMMENT ON COLUMN shared_products.magnesium IS 'Magnesium % Daily Value per 100g';
COMMENT ON COLUMN shared_products.phosphorus IS 'Phosphorus % Daily Value per 100g';
COMMENT ON COLUMN shared_products.potassium IS 'Potassium % Daily Value per 100g';
COMMENT ON COLUMN shared_products.zinc IS 'Zinc % Daily Value per 100g';
COMMENT ON COLUMN shared_products.selenium IS 'Selenium % Daily Value per 100g';
COMMENT ON COLUMN shared_products.iodine IS 'Iodine % Daily Value per 100g';

-- ============================================================================
-- DONE
-- ============================================================================
*/
