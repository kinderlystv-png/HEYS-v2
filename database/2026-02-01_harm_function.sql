-- Create function to calculate harm score
-- Formula from DATA_MODEL_REFERENCE.md v2.0

CREATE OR REPLACE FUNCTION calculate_harm_score(
  p_simple100 NUMERIC,
  p_protein100 NUMERIC,
  p_badfat100 NUMERIC,
  p_goodfat100 NUMERIC,
  p_trans100 NUMERIC,
  p_fiber100 NUMERIC,
  p_gi NUMERIC,
  p_sodium100 NUMERIC,
  p_nova_group INTEGER
) RETURNS NUMERIC AS $$
DECLARE
  penalties NUMERIC := 0;
  bonuses NUMERIC := 0;
  gi_penalty NUMERIC := 0;
  nova_penalty NUMERIC := 0;
  raw_score NUMERIC;
BEGIN
  -- PENALTIES
  penalties := COALESCE(p_trans100, 0) * 3.0;
  penalties := penalties + COALESCE(p_simple100, 0) * 0.08;
  penalties := penalties + COALESCE(p_badfat100, 0) * 0.10;
  penalties := penalties + COALESCE(p_sodium100, 0) * 0.002;
  
  -- GI penalty
  IF COALESCE(p_gi, 0) <= 35 THEN
    gi_penalty := 0;
  ELSIF p_gi <= 55 THEN
    gi_penalty := 0.5;
  ELSIF p_gi <= 70 THEN
    gi_penalty := 1.0;
  ELSE
    gi_penalty := 1.5 + (p_gi - 70) * 0.02;
  END IF;
  penalties := penalties + gi_penalty;
  
  -- NOVA penalty
  nova_penalty := CASE COALESCE(p_nova_group, 1)
    WHEN 1 THEN 0
    WHEN 2 THEN 0.3
    WHEN 3 THEN 0.8
    WHEN 4 THEN 2.5
    ELSE 0
  END;
  penalties := penalties + nova_penalty;
  
  -- BONUSES
  bonuses := COALESCE(p_fiber100, 0) * 0.30;
  bonuses := bonuses + COALESCE(p_protein100, 0) * 0.06;
  bonuses := bonuses + COALESCE(p_goodfat100, 0) * 0.04;
  
  -- Final score
  raw_score := penalties - bonuses;
  RETURN GREATEST(0, LEAST(10, ROUND(raw_score::NUMERIC, 1)));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Now update all products with recalculated harm
UPDATE shared_products
SET harm = calculate_harm_score(
  simple100, protein100, badfat100, goodfat100, trans100, 
  fiber100, gi, sodium100, nova_group
);

-- Check results
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE harm = 0) as harm_zero,
  COUNT(*) FILTER (WHERE harm > 0 AND harm <= 3) as harm_low,
  COUNT(*) FILTER (WHERE harm > 3 AND harm <= 6) as harm_medium,
  COUNT(*) FILTER (WHERE harm > 6) as harm_high
FROM shared_products;

-- Show some examples
SELECT name, harm, simple100, protein100, fiber100, gi, nova_group
FROM shared_products
ORDER BY harm DESC
LIMIT 15;
