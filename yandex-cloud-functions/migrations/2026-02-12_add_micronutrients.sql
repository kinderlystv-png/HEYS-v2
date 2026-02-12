-- Migration: Add micronutrient fields to shared_products
-- Date: 2026-02-12
-- Purpose: Enable micronutrient pattern analyzers (Vitamin Defense, Bone Health, Iron Status, B-Complex Anemia)
-- Required for: ~7-10 insights patterns currently inactive due to missing data

-- Add micronutrient columns (per 100g)
ALTER TABLE public.shared_products 
  ADD COLUMN IF NOT EXISTS iron NUMERIC,           -- Железо (мг/100г)
  ADD COLUMN IF NOT EXISTS vitamin_c NUMERIC,      -- Витамин C (мг/100г)
  ADD COLUMN IF NOT EXISTS calcium NUMERIC,        -- Кальций (мг/100г)
  ADD COLUMN IF NOT EXISTS vitamin_d NUMERIC,      -- Витамин D (мкг/100г)
  ADD COLUMN IF NOT EXISTS vitamin_b12 NUMERIC,    -- Витамин B12 (мкг/100г)
  ADD COLUMN IF NOT EXISTS vitamin_a NUMERIC,      -- Витамин A (мкг/100г)
  ADD COLUMN IF NOT EXISTS vitamin_e NUMERIC,      -- Витамин E (мг/100г)
  ADD COLUMN IF NOT EXISTS magnesium NUMERIC,      -- Магний (мг/100г)
  ADD COLUMN IF NOT EXISTS zinc NUMERIC,           -- Цинк (мг/100г)
  ADD COLUMN IF NOT EXISTS potassium NUMERIC,      -- Калий (мг/100г)
  ADD COLUMN IF NOT EXISTS sodium NUMERIC,         -- Натрий (мг/100г)
  ADD COLUMN IF NOT EXISTS folate NUMERIC;         -- Фолиевая кислота (мкг/100г)

-- Add comment
COMMENT ON COLUMN public.shared_products.iron IS 'Железо (мг/100г) — для analyzeIronStatus, analyzeBComplexAnemia';
COMMENT ON COLUMN public.shared_products.vitamin_c IS 'Витамин C (мг/100г) — для analyzeVitaminDefense';
COMMENT ON COLUMN public.shared_products.calcium IS 'Кальций (мг/100г) — для analyzeBoneHealth';
COMMENT ON COLUMN public.shared_products.vitamin_d IS 'Витамин D (мкг/100г) — для analyzeBoneHealth';
COMMENT ON COLUMN public.shared_products.vitamin_b12 IS 'Витамин B12 (мкг/100г) — для analyzeBComplexAnemia';

-- Create index for fast micronutrient queries
CREATE INDEX IF NOT EXISTS idx_shared_products_iron 
  ON public.shared_products (iron) WHERE iron IS NOT NULL AND iron > 0;
CREATE INDEX IF NOT EXISTS idx_shared_products_vitamin_c 
  ON public.shared_products (vitamin_c) WHERE vitamin_c IS NOT NULL AND vitamin_c > 0;
CREATE INDEX IF NOT EXISTS idx_shared_products_calcium 
  ON public.shared_products (calcium) WHERE calcium IS NOT NULL AND calcium > 0;

-- Sample data (top iron sources)
UPDATE public.shared_products SET iron = 3.5 WHERE name_norm ILIKE '%говядина%' AND iron IS NULL;
UPDATE public.shared_products SET iron = 2.5 WHERE name_norm ILIKE '%курица%' AND iron IS NULL;
UPDATE public.shared_products SET iron = 4.2 WHERE name_norm ILIKE '%печень%' AND iron IS NULL;
UPDATE public.shared_products SET iron = 3.6 WHERE name_norm ILIKE '%фасоль%' AND iron IS NULL;
UPDATE public.shared_products SET iron = 2.7 WHERE name_norm ILIKE '%шпинат%' AND iron IS NULL;
UPDATE public.shared_products SET iron = 2.0, vitamin_c = 0.6 WHERE name_norm ILIKE '%яйцо%' AND iron IS NULL;

-- Sample data (top vitamin C sources)
UPDATE public.shared_products SET vitamin_c = 200 WHERE name_norm ILIKE '%перец%' AND vitamin_c IS NULL;
UPDATE public.shared_products SET vitamin_c = 53 WHERE name_norm ILIKE '%апельсин%' AND vitamin_c IS NULL;
UPDATE public.shared_products SET vitamin_c = 59 WHERE name_norm ILIKE '%киви%' AND vitamin_c IS NULL;
UPDATE public.shared_products SET vitamin_c = 60 WHERE name_norm ILIKE '%брокколи%' AND vitamin_c IS NULL;
UPDATE public.shared_products SET vitamin_c = 40 WHERE name_norm ILIKE '%клубника%' AND vitamin_c IS NULL;

-- Sample data (top calcium sources)
UPDATE public.shared_products SET calcium = 1000 WHERE name_norm ILIKE '%творог%' AND calcium IS NULL;
UPDATE public.shared_products SET calcium = 120 WHERE name_norm ILIKE '%молоко%' AND calcium IS NULL;
UPDATE public.shared_products SET calcium = 800 WHERE name_norm ILIKE '%сыр%' AND calcium IS NULL;
UPDATE public.shared_products SET calcium = 140 WHERE name_norm ILIKE '%йогурт%' AND calcium IS NULL;
UPDATE public.shared_products SET calcium = 250 WHERE name_norm ILIKE '%кунжут%' AND calcium IS NULL;

-- Analyze table to update statistics
ANALYZE public.shared_products;
