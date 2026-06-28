-- HEYS: expose barcode fields through get_shared_products RPC.
-- The shared_products table already stores barcode/barcodes, but the RPC cache
-- path used by the app could not see them.

DROP FUNCTION IF EXISTS public.get_shared_products(TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.get_shared_products(
  p_search TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT NULL,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  name_norm TEXT,
  -- Base macronutrients
  simple100 NUMERIC,
  complex100 NUMERIC,
  protein100 NUMERIC,
  badfat100 NUMERIC,
  goodfat100 NUMERIC,
  trans100 NUMERIC,
  fiber100 NUMERIC,
  -- Metadata
  gi NUMERIC,
  harm NUMERIC,
  category TEXT,
  portions JSONB,
  description TEXT,
  fingerprint TEXT,
  barcode TEXT,
  barcodes TEXT[],
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  -- Extended nutrients
  sodium100 NUMERIC,
  omega3_100 NUMERIC,
  omega6_100 NUMERIC,
  nova_group INTEGER,
  additives TEXT[],
  nutrient_density NUMERIC,
  -- Quality flags
  is_organic BOOLEAN,
  is_whole_grain BOOLEAN,
  is_fermented BOOLEAN,
  is_raw BOOLEAN,
  -- Vitamins
  vitamin_a NUMERIC,
  vitamin_c NUMERIC,
  vitamin_d NUMERIC,
  vitamin_e NUMERIC,
  vitamin_k NUMERIC,
  vitamin_b1 NUMERIC,
  vitamin_b2 NUMERIC,
  vitamin_b3 NUMERIC,
  vitamin_b6 NUMERIC,
  vitamin_b9 NUMERIC,
  vitamin_b12 NUMERIC,
  -- Minerals
  calcium NUMERIC,
  iron NUMERIC,
  magnesium NUMERIC,
  phosphorus NUMERIC,
  potassium NUMERIC,
  zinc NUMERIC,
  selenium NUMERIC,
  iodine NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sp.id,
    sp.name,
    sp.name_norm,
    -- Base macronutrients
    sp.simple100,
    sp.complex100,
    sp.protein100,
    sp.badfat100,
    sp.goodfat100,
    sp.trans100,
    sp.fiber100,
    -- Metadata
    sp.gi,
    sp.harm,
    sp.category,
    sp.portions,
    sp.description,
    sp.fingerprint,
    sp.barcode,
    sp.barcodes,
    sp.created_at,
    sp.updated_at,
    -- Extended nutrients
    COALESCE(sp.sodium100, sp.sodium) AS sodium100,
    sp.omega3_100,
    sp.omega6_100,
    sp.nova_group,
    sp.additives,
    sp.nutrient_density,
    -- Quality flags
    COALESCE(sp.is_organic, false) AS is_organic,
    COALESCE(sp.is_whole_grain, false) AS is_whole_grain,
    COALESCE(sp.is_fermented, false) AS is_fermented,
    COALESCE(sp.is_raw, false) AS is_raw,
    -- Vitamins
    sp.vitamin_a,
    sp.vitamin_c,
    sp.vitamin_d,
    sp.vitamin_e,
    sp.vitamin_k,
    sp.vitamin_b1,
    sp.vitamin_b2,
    sp.vitamin_b3,
    sp.vitamin_b6,
    COALESCE(sp.vitamin_b9, sp.folate) AS vitamin_b9,
    sp.vitamin_b12,
    -- Minerals
    sp.calcium,
    sp.iron,
    sp.magnesium,
    sp.phosphorus,
    sp.potassium,
    sp.zinc,
    sp.selenium,
    sp.iodine
  FROM public.shared_products sp
  WHERE
    (p_search IS NULL OR p_search = '' OR sp.name_norm ILIKE '%' || LOWER(TRIM(p_search)) || '%')
  ORDER BY sp.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.get_shared_products(TEXT, INTEGER, INTEGER) IS
'Returns shared products with all product fields required by client caches.
v2.1 (2026-06-28): Exposes barcode/barcodes for scanner and barcode-management UI.';

GRANT EXECUTE ON FUNCTION public.get_shared_products(TEXT, INTEGER, INTEGER) TO heys_rpc;
