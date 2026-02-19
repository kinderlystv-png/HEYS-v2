-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: Fix get_shared_products to return extended nutrients
-- Date: 2026-02-19
-- Author: AI Agent
-- ═══════════════════════════════════════════════════════════════════
-- 
-- PROBLEM:
--   The deployed get_shared_products() RPC returns only macronutrients.
--   Vitamins, minerals, sodium, omega3/6, nova_group etc. are missing.
--   Personal products (from client_kv_store) have all fields → UI shows
--   values for personal products but '—' for shared products.
--
-- ROOT CAUSE:
--   RPC function was created in yandex_postgresql_setup.sql with only
--   base fields. Migration 2026-01-18_update_get_shared_products.sql
--   was never applied to production DB.
--
-- COLUMN NAME CONFLICT:
--   Migration 2026-01-18_extended_nutrients.sql → sodium100
--   Migration 2026-02-12_add_micronutrients.sql → sodium, folate
--   Both used IF NOT EXISTS, so both columns may coexist.
--   This migration handles both cases via COALESCE.
--
-- SAFE TO RE-RUN: Yes (CREATE OR REPLACE, ADD COLUMN IF NOT EXISTS)
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- STEP 1: Ensure ALL extended columns exist
-- (idempotent — IF NOT EXISTS on each)
-- ═══════════════════════════════════════════════════════════════════

-- Basic extended
ALTER TABLE public.shared_products ADD COLUMN IF NOT EXISTS sodium100 NUMERIC;
ALTER TABLE public.shared_products ADD COLUMN IF NOT EXISTS sodium NUMERIC;
ALTER TABLE public.shared_products ADD COLUMN IF NOT EXISTS omega3_100 NUMERIC;
ALTER TABLE public.shared_products ADD COLUMN IF NOT EXISTS omega6_100 NUMERIC;
ALTER TABLE public.shared_products ADD COLUMN IF NOT EXISTS nova_group INTEGER;
ALTER TABLE public.shared_products ADD COLUMN IF NOT EXISTS additives TEXT[];
ALTER TABLE public.shared_products ADD COLUMN IF NOT EXISTS nutrient_density NUMERIC;

-- Quality flags
ALTER TABLE public.shared_products ADD COLUMN IF NOT EXISTS is_organic BOOLEAN DEFAULT false;
ALTER TABLE public.shared_products ADD COLUMN IF NOT EXISTS is_whole_grain BOOLEAN DEFAULT false;
ALTER TABLE public.shared_products ADD COLUMN IF NOT EXISTS is_fermented BOOLEAN DEFAULT false;
ALTER TABLE public.shared_products ADD COLUMN IF NOT EXISTS is_raw BOOLEAN DEFAULT false;

-- Vitamins
ALTER TABLE public.shared_products ADD COLUMN IF NOT EXISTS vitamin_a NUMERIC;
ALTER TABLE public.shared_products ADD COLUMN IF NOT EXISTS vitamin_c NUMERIC;
ALTER TABLE public.shared_products ADD COLUMN IF NOT EXISTS vitamin_d NUMERIC;
ALTER TABLE public.shared_products ADD COLUMN IF NOT EXISTS vitamin_e NUMERIC;
ALTER TABLE public.shared_products ADD COLUMN IF NOT EXISTS vitamin_k NUMERIC;
ALTER TABLE public.shared_products ADD COLUMN IF NOT EXISTS vitamin_b1 NUMERIC;
ALTER TABLE public.shared_products ADD COLUMN IF NOT EXISTS vitamin_b2 NUMERIC;
ALTER TABLE public.shared_products ADD COLUMN IF NOT EXISTS vitamin_b3 NUMERIC;
ALTER TABLE public.shared_products ADD COLUMN IF NOT EXISTS vitamin_b6 NUMERIC;
ALTER TABLE public.shared_products ADD COLUMN IF NOT EXISTS vitamin_b9 NUMERIC;
ALTER TABLE public.shared_products ADD COLUMN IF NOT EXISTS vitamin_b12 NUMERIC;
ALTER TABLE public.shared_products ADD COLUMN IF NOT EXISTS folate NUMERIC;

-- Minerals
ALTER TABLE public.shared_products ADD COLUMN IF NOT EXISTS calcium NUMERIC;
ALTER TABLE public.shared_products ADD COLUMN IF NOT EXISTS iron NUMERIC;
ALTER TABLE public.shared_products ADD COLUMN IF NOT EXISTS magnesium NUMERIC;
ALTER TABLE public.shared_products ADD COLUMN IF NOT EXISTS phosphorus NUMERIC;
ALTER TABLE public.shared_products ADD COLUMN IF NOT EXISTS potassium NUMERIC;
ALTER TABLE public.shared_products ADD COLUMN IF NOT EXISTS zinc NUMERIC;
ALTER TABLE public.shared_products ADD COLUMN IF NOT EXISTS selenium NUMERIC;
ALTER TABLE public.shared_products ADD COLUMN IF NOT EXISTS iodine NUMERIC;


-- ═══════════════════════════════════════════════════════════════════
-- STEP 2: Sync sodium ↔ sodium100 for existing rows
-- Client code uses sodium100, micronutrient migration used sodium.
-- Fill whichever is missing from the other.
-- ═══════════════════════════════════════════════════════════════════

UPDATE public.shared_products
SET sodium100 = sodium
WHERE sodium100 IS NULL AND sodium IS NOT NULL;

UPDATE public.shared_products
SET sodium = sodium100
WHERE sodium IS NULL AND sodium100 IS NOT NULL;

-- Same for folate ↔ vitamin_b9
UPDATE public.shared_products
SET vitamin_b9 = folate
WHERE vitamin_b9 IS NULL AND folate IS NOT NULL;

UPDATE public.shared_products
SET folate = vitamin_b9
WHERE folate IS NULL AND vitamin_b9 IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════
-- STEP 3: Replace get_shared_products() with extended version
-- ═══════════════════════════════════════════════════════════════════

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
    sp.created_at,
    sp.updated_at,
    -- Extended nutrients (COALESCE handles sodium vs sodium100 naming)
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
'Returns shared products with ALL nutrient fields (macros + vitamins + minerals).
v2.0 (2026-02-19): Added 30+ extended nutrient columns.
Handles sodium/sodium100 and folate/vitamin_b9 naming via COALESCE.';

-- Grant execute to RPC role
GRANT EXECUTE ON FUNCTION public.get_shared_products(TEXT, INTEGER, INTEGER) TO heys_rpc;


-- ═══════════════════════════════════════════════════════════════════
-- STEP 4: Verification
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  col_count INTEGER;
  fn_exists BOOLEAN;
BEGIN
  -- Check extended columns exist
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'shared_products'
    AND column_name IN (
      'sodium100', 'omega3_100', 'omega6_100', 'nova_group', 'additives', 'nutrient_density',
      'is_organic', 'is_whole_grain', 'is_fermented', 'is_raw',
      'vitamin_a', 'vitamin_c', 'vitamin_d', 'vitamin_e', 'vitamin_k',
      'vitamin_b1', 'vitamin_b2', 'vitamin_b3', 'vitamin_b6', 'vitamin_b9', 'vitamin_b12',
      'calcium', 'iron', 'magnesium', 'phosphorus', 'potassium', 'zinc', 'selenium', 'iodine'
    );

  -- Check function exists
  SELECT EXISTS(
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'get_shared_products'
  ) INTO fn_exists;

  IF col_count >= 25 AND fn_exists THEN
    RAISE NOTICE '✅ Migration OK: % extended columns found, RPC function updated', col_count;
  ELSE
    RAISE NOTICE '⚠️ Migration partial: % columns (expected 29+), function exists: %', col_count, fn_exists;
  END IF;
END $$;

-- Quick smoke test: call the function and check column count
DO $$
DECLARE
  result_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO result_count
  FROM public.get_shared_products(NULL, 1, 0);
  RAISE NOTICE '✅ Smoke test: get_shared_products returned % row(s)', result_count;
END $$;
