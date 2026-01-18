-- ═══════════════════════════════════════════════════════════════════
-- 🔄 HEYS: Обновление get_shared_products с extended nutrients
-- Created: 2026-01-18
-- Purpose: Добавить nova_group и другие extended поля в выдачу
-- ═══════════════════════════════════════════════════════════════════

-- DROP старой функции и CREATE новой с extended полями
DROP FUNCTION IF EXISTS public.get_shared_products(text, integer, integer);

CREATE OR REPLACE FUNCTION public.get_shared_products(
  p_search TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT NULL,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  name_norm TEXT,
  simple100 NUMERIC,
  complex100 NUMERIC,
  protein100 NUMERIC,
  badfat100 NUMERIC,
  goodfat100 NUMERIC,
  trans100 NUMERIC,
  fiber100 NUMERIC,
  gi NUMERIC,
  harm NUMERIC,
  category TEXT,
  portions JSONB,
  description TEXT,
  fingerprint TEXT,
  created_at TIMESTAMPTZ,
  -- 🆕 Extended nutrients
  sodium100 NUMERIC,
  omega3_100 NUMERIC,
  omega6_100 NUMERIC,
  nova_group INTEGER,
  additives TEXT[],
  nutrient_density NUMERIC,
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
    sp.simple100,
    sp.complex100,
    sp.protein100,
    sp.badfat100,
    sp.goodfat100,
    sp.trans100,
    sp.fiber100,
    sp.gi,
    sp.harm,
    sp.category,
    sp.portions,
    sp.description,
    sp.fingerprint,
    sp.created_at,
    -- Extended nutrients
    sp.sodium100,
    sp.omega3_100,
    sp.omega6_100,
    sp.nova_group,
    sp.additives,
    sp.nutrient_density,
    sp.is_organic,
    sp.is_whole_grain,
    sp.is_fermented,
    sp.is_raw,
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
    sp.vitamin_b9,
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
  FROM shared_products sp
  WHERE
    (p_search IS NULL OR sp.name_norm ILIKE '%' || LOWER(p_search) || '%')
  ORDER BY sp.name ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.get_shared_products(TEXT, INTEGER, INTEGER) IS 
'Получение списка shared_products с extended nutrients (v3.0 Harm Score).
Включает nova_group, витамины, минералы, флаги качества.';

-- Права
GRANT EXECUTE ON FUNCTION public.get_shared_products(TEXT, INTEGER, INTEGER) TO heys_rpc;

DO $$
BEGIN
  RAISE NOTICE '✅ get_shared_products обновлена с extended nutrients';
END $$;
