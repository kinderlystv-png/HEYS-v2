-- Verify shared product barcode migration.
-- Run after applying scripts/db/migrations/2026-06-27_shared_products_barcode.sql:
--   bash scripts/db/psql.sh -v ON_ERROR_STOP=1 -f scripts/db/check-shared-products-barcode.sql

\echo 'Checking shared_products barcode schema...'

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shared_products'
      AND column_name = 'barcode'
      AND data_type = 'text'
  ) THEN
    RAISE EXCEPTION 'public.shared_products.barcode text is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shared_products_pending'
      AND column_name = 'barcode'
      AND data_type = 'text'
  ) THEN
    RAISE EXCEPTION 'public.shared_products_pending.barcode text is missing';
  END IF;

  IF to_regclass('public.idx_shared_products_barcode') IS NULL THEN
    RAISE EXCEPTION 'idx_shared_products_barcode is missing';
  END IF;

  IF to_regclass('public.idx_shared_products_pending_barcode') IS NULL THEN
    RAISE EXCEPTION 'idx_shared_products_pending_barcode is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shared_products'
      AND column_name = 'barcodes'
      AND data_type = 'ARRAY'
  ) THEN
    RAISE EXCEPTION 'public.shared_products.barcodes text[] is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shared_products_pending'
      AND column_name = 'barcodes'
      AND data_type = 'ARRAY'
  ) THEN
    RAISE EXCEPTION 'public.shared_products_pending.barcodes text[] is missing';
  END IF;

  IF to_regclass('public.idx_shared_products_barcodes') IS NULL THEN
    RAISE EXCEPTION 'idx_shared_products_barcodes is missing';
  END IF;

  IF to_regclass('public.idx_shared_products_pending_barcodes') IS NULL THEN
    RAISE EXCEPTION 'idx_shared_products_pending_barcodes is missing';
  END IF;
END $$;

\echo 'Checking barcode-aware RPC function signatures...'

DO $$
DECLARE
  pending_args text;
  pending_def text;
  publish_def text;
  attach_session_def text;
  attach_curator_def text;
  shared_result text;
BEGIN
  SELECT pg_get_function_arguments(p.oid), pg_get_functiondef(p.oid)
  INTO pending_args, pending_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'create_pending_product_by_session'
    AND p.oid = to_regprocedure('public.create_pending_product_by_session(text,text,jsonb,text,text)');

  IF pending_def IS NULL THEN
    RAISE EXCEPTION 'create_pending_product_by_session(text,text,jsonb,text,text) is missing';
  END IF;

  IF pending_args NOT LIKE '%p_name text%' OR pending_args NOT LIKE '%p_fingerprint text%' OR pending_args NOT LIKE '%p_name_norm text%' THEN
    RAISE EXCEPTION 'create_pending_product_by_session arguments are not compatible: %', pending_args;
  END IF;

  IF pending_args LIKE '%p_product_name%' THEN
    RAISE EXCEPTION 'create_pending_product_by_session still exposes stale p_product_name argument: %', pending_args;
  END IF;

  IF pending_def NOT LIKE '%v_barcode%' OR pending_def NOT LIKE '%shared_products_pending%' THEN
    RAISE EXCEPTION 'create_pending_product_by_session is not barcode-aware';
  END IF;

  IF pending_def NOT LIKE '%v_barcodes%' OR pending_def NOT LIKE '%barcodes%' THEN
    RAISE EXCEPTION 'create_pending_product_by_session is not barcode-array-aware';
  END IF;

  SELECT pg_get_functiondef(p.oid)
  INTO publish_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'publish_shared_product_by_curator'
    AND p.oid = to_regprocedure('public.publish_shared_product_by_curator(uuid,jsonb)');

  IF publish_def IS NULL THEN
    RAISE EXCEPTION 'publish_shared_product_by_curator(uuid,jsonb) is missing';
  END IF;

  IF publish_def NOT LIKE '%v_barcode%' OR publish_def NOT LIKE '%barcode%' THEN
    RAISE EXCEPTION 'publish_shared_product_by_curator is not barcode-aware';
  END IF;

  IF publish_def NOT LIKE '%v_barcodes%' OR publish_def NOT LIKE '%barcodes%' THEN
    RAISE EXCEPTION 'publish_shared_product_by_curator is not barcode-array-aware';
  END IF;

  SELECT pg_get_functiondef(p.oid)
  INTO attach_session_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'add_shared_product_barcode_by_session'
    AND p.oid = to_regprocedure('public.add_shared_product_barcode_by_session(text,uuid,text)');

  IF attach_session_def IS NULL THEN
    RAISE EXCEPTION 'add_shared_product_barcode_by_session(text,uuid,text) is missing';
  END IF;

  IF attach_session_def NOT LIKE '%require_client_id%' OR attach_session_def NOT LIKE '%_add_shared_product_barcode%' THEN
    RAISE EXCEPTION 'add_shared_product_barcode_by_session is not session-safe barcode attach';
  END IF;

  SELECT pg_get_functiondef(p.oid)
  INTO attach_curator_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'add_shared_product_barcode_by_curator'
    AND p.oid = to_regprocedure('public.add_shared_product_barcode_by_curator(uuid,uuid,text)');

  IF attach_curator_def IS NULL THEN
    RAISE EXCEPTION 'add_shared_product_barcode_by_curator(uuid,uuid,text) is missing';
  END IF;

  IF attach_curator_def NOT LIKE '%p_curator_id%' OR attach_curator_def NOT LIKE '%_add_shared_product_barcode%' THEN
    RAISE EXCEPTION 'add_shared_product_barcode_by_curator is not curator barcode attach';
  END IF;

  SELECT pg_get_function_result(p.oid)
  INTO shared_result
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_shared_products'
    AND p.oid = to_regprocedure('public.get_shared_products(text,integer,integer)');

  IF shared_result IS NULL THEN
    RAISE EXCEPTION 'get_shared_products(text,integer,integer) is missing';
  END IF;

  IF shared_result NOT LIKE '%barcode text%' OR shared_result NOT LIKE '%barcodes text[]%' THEN
    RAISE EXCEPTION 'get_shared_products does not expose barcode/barcodes: %', shared_result;
  END IF;
END $$;

\echo 'Checking normalized barcode values...'

SELECT 'shared_products_invalid_barcode_rows' AS check_name, count(*) AS rows
FROM public.shared_products
WHERE barcode IS NOT NULL
  AND barcode !~ '^[0-9A-Z]{6,32}$';

SELECT 'shared_products_pending_invalid_barcode_rows' AS check_name, count(*) AS rows
FROM public.shared_products_pending
WHERE barcode IS NOT NULL
  AND barcode !~ '^[0-9A-Z]{6,32}$';

SELECT 'shared_products_duplicate_barcodes' AS check_name, count(*) AS duplicate_groups
FROM (
  SELECT barcode
  FROM public.shared_products
  WHERE barcode IS NOT NULL
  GROUP BY barcode
  HAVING count(*) > 1
) d;

SELECT 'shared_products_invalid_barcodes_aliases' AS check_name, count(*) AS rows
FROM public.shared_products sp
CROSS JOIN LATERAL unnest(coalesce(sp.barcodes, ARRAY[]::text[])) AS b(code)
WHERE b.code !~ '^[0-9A-Z]{6,32}$';

\echo 'Barcode schema verification complete.'
