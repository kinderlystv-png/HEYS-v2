\set ON_ERROR_STOP on

-- Read-only duplicate audit for shared products.
-- No UPDATE/DELETE. Use this before any cleanup/backfill.

WITH legacy_fingerprint_duplicates AS (
  SELECT
    'legacy_fingerprint_duplicates' AS section,
    fingerprint AS duplicate_key,
    count(*) AS rows_count,
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', name,
        'brand', brand,
        'brand_fingerprint', brand_fingerprint
      )
      ORDER BY name, brand, id
    ) AS rows
  FROM public.shared_products
  WHERE COALESCE(NULLIF(fingerprint, ''), '') <> ''
  GROUP BY fingerprint
  HAVING count(*) > 1
),
brand_fingerprint_duplicates AS (
  SELECT
    'brand_fingerprint_duplicates' AS section,
    brand_fingerprint AS duplicate_key,
    count(*) AS rows_count,
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', name,
        'brand', brand,
        'fingerprint', fingerprint
      )
      ORDER BY name, brand, id
    ) AS rows
  FROM public.shared_products
  WHERE COALESCE(NULLIF(brand_fingerprint, ''), '') <> ''
  GROUP BY brand_fingerprint
  HAVING count(*) > 1
),
barcode_values AS (
  SELECT
    sp.id,
    sp.name,
    sp.brand,
    code
  FROM public.shared_products sp
  CROSS JOIN LATERAL (
    SELECT NULLIF(btrim(sp.barcode), '') AS code
    UNION
    SELECT NULLIF(btrim(value), '') AS code
    FROM unnest(COALESCE(sp.barcodes, ARRAY[]::text[])) AS value
  ) codes
  WHERE code IS NOT NULL
),
barcode_duplicates AS (
  SELECT
    'barcode_duplicates' AS section,
    code AS duplicate_key,
    count(*) AS rows_count,
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', name,
        'brand', brand
      )
      ORDER BY name, brand, id
    ) AS rows
  FROM barcode_values
  GROUP BY code
  HAVING count(*) > 1
)
SELECT *
FROM legacy_fingerprint_duplicates
UNION ALL
SELECT *
FROM brand_fingerprint_duplicates
UNION ALL
SELECT *
FROM barcode_duplicates
ORDER BY section, rows_count DESC, duplicate_key;
