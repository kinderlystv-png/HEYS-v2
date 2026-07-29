-- Canonical source snapshot for the live curator portions function.
--
-- This file is not a managed migration and must not be applied independently.
-- ACL hardening is owned by:
-- scripts/db/migrations/2026-07-29_curator_product_function_acl.sql

CREATE OR REPLACE FUNCTION public.update_shared_product_portions_by_curator(
  p_curator_id uuid,
  p_product_id uuid,
  p_portions jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_product_exists boolean;
  v_updated_at timestamptz;
BEGIN
  SELECT EXISTS(SELECT 1 FROM shared_products WHERE id = p_product_id)
  INTO v_product_exists;

  IF NOT v_product_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'product_not_found',
      'message', 'Product not found'
    );
  END IF;

  UPDATE shared_products
  SET portions = p_portions,
      updated_at = now()
  WHERE id = p_product_id
  RETURNING updated_at INTO v_updated_at;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'updated',
    'id', p_product_id,
    'portions', p_portions,
    'updated_at', v_updated_at,
    'curator_id', p_curator_id,
    'message', 'Portions updated by curator'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'database_error',
    'message', SQLERRM
  );
END;
$function$;
