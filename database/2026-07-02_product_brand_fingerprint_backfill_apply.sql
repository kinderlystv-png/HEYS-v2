\set ON_ERROR_STOP on

-- Safe narrow apply: fill brand_fingerprint only for products where brand is
-- already present and brand_fingerprint is empty. Does not change names/brands.
-- Run the matching dry-run first:
--   database/2026-07-02_product_brand_fingerprint_backfill_dry_run.sql

BEGIN;

WITH candidates AS (
  SELECT
    id,
    public.compute_product_brand_fingerprint(
      jsonb_build_object(
        'name', name,
        'brand', brand,
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
    ) AS next_brand_fingerprint
  FROM public.shared_products
  WHERE COALESCE(NULLIF(TRIM(brand), ''), '') <> ''
    AND COALESCE(NULLIF(brand_fingerprint, ''), '') = ''
)
UPDATE public.shared_products sp
SET brand_fingerprint = candidates.next_brand_fingerprint,
    updated_at = timezone('utc', now())
FROM candidates
WHERE sp.id = candidates.id
  AND candidates.next_brand_fingerprint IS NOT NULL;

COMMIT;
