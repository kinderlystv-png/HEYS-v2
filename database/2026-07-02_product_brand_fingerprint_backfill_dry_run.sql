\set ON_ERROR_STOP on

-- Dry-run only. Reports rows that already have brand, but still miss the
-- brand-aware dedupe key. Review before running any UPDATE.

SELECT
  id,
  name,
  brand,
  fingerprint AS legacy_fingerprint,
  brand_fingerprint AS current_brand_fingerprint,
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
  ) AS proposed_brand_fingerprint,
  'needs_review_before_apply' AS status
FROM public.shared_products
WHERE COALESCE(NULLIF(TRIM(brand), ''), '') <> ''
  AND COALESCE(NULLIF(brand_fingerprint, ''), '') = ''
ORDER BY name, brand, id;
