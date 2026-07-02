\set ON_ERROR_STOP on

-- Dry-run only. This script reports conservative brand extraction candidates
-- without changing data. Review the output before creating a real UPDATE.

WITH brand_rules(brand, pattern, priority) AS (
  VALUES
    ('Nestlé Хрутка', 'nestlé хрутка', 100),
    ('Nestle Хрутка', 'nestle хрутка', 99),
    ('Простоквашино', 'простоквашино', 90),
    ('Ясно Солнышко', 'ясно солнышко', 90),
    ('Хрутка', 'хрутка', 80),
    ('Levro', 'levro', 70),
    ('Bombbar', 'bombbar', 70),
    ('Raffaello', 'raffaello', 70),
    ('Savoiardi', 'savoiardi', 70)
),
raw_candidates AS (
  SELECT
    sp.id,
    sp.name AS old_name,
    sp.brand AS current_brand,
    br.brand AS proposed_brand,
    br.priority,
    sp.simple100,
    sp.complex100,
    sp.protein100,
    sp.badfat100,
    sp.goodfat100,
    sp.trans100,
    sp.fiber100,
    sp.gi,
    sp.harm,
    btrim(
      regexp_replace(
        regexp_replace(sp.name, '(^|\s)' || br.pattern || '(\s|$)', ' ', 'i'),
        '\s+',
        ' ',
        'g'
      )
    ) AS proposed_name
  FROM public.shared_products sp
  JOIN brand_rules br
    ON lower(sp.name) ~ ('(^|[[:space:][:punct:]])' || br.pattern || '([[:space:][:punct:]]|$)')
  WHERE COALESCE(btrim(sp.brand), '') = ''
),
candidates AS (
  SELECT DISTINCT ON (id)
    *
  FROM raw_candidates
  ORDER BY id, priority DESC, length(proposed_brand) DESC
)
SELECT
  id,
  old_name,
  proposed_brand,
  proposed_name,
  public.compute_product_brand_fingerprint(
    jsonb_build_object(
      'name', proposed_name,
      'brand', proposed_brand,
      'simple100', simple100,
      'complex100', complex100,
      'protein100', protein100,
      'badFat100', badfat100,
      'goodFat100', goodfat100,
      'trans100', trans100,
      'fiber100', fiber100,
      'gi', gi,
      'harm', harm
    )
  ) AS proposed_brand_fingerprint,
  CASE
    WHEN proposed_name = '' THEN 'skip_empty_name'
    WHEN lower(old_name) = lower(proposed_brand) THEN 'skip_brand_only_name'
    WHEN proposed_name ~ '\s[0-9]+([,.][0-9]+)?$' THEN 'needs_review_numeric_tail'
    ELSE 'candidate'
  END AS status
FROM candidates
ORDER BY proposed_brand, old_name;
