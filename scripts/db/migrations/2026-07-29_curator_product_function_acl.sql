-- 2026-07-29: restrict curator-product SECURITY DEFINER functions to heys_rpc.
--
-- Function bodies are intentionally unchanged. The HTTP RPC gateway verifies
-- the curator JWT and injects p_curator_id; database ACLs ensure these entry
-- points are not executable through another database role via PUBLIC grants.

REVOKE ALL ON FUNCTION public.publish_shared_product_by_curator(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_shared_product_barcode_by_curator(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_shared_product_portions_by_curator(uuid, uuid, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.publish_shared_product_by_curator(uuid, jsonb) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.add_shared_product_barcode_by_curator(uuid, uuid, text) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.update_shared_product_portions_by_curator(uuid, uuid, jsonb) TO heys_rpc;

DO $$
DECLARE
  v_signature regprocedure;
  v_public_execute boolean;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.publish_shared_product_by_curator(uuid,jsonb)'::regprocedure,
    'public.add_shared_product_barcode_by_curator(uuid,uuid,text)'::regprocedure,
    'public.update_shared_product_portions_by_curator(uuid,uuid,jsonb)'::regprocedure
  ]
  LOOP
    SELECT EXISTS (
      SELECT 1
      FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      WHERE p.oid = v_signature::oid
        AND acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'
    )
    INTO v_public_execute;

    IF v_public_execute THEN
      RAISE EXCEPTION 'PUBLIC still has EXECUTE on %', v_signature;
    END IF;
    IF NOT has_function_privilege('heys_rpc', v_signature::oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'heys_rpc lacks EXECUTE on %', v_signature;
    END IF;
  END LOOP;
END;
$$;

-- ROLLBACK:
-- The pre-migration live ACL exposed only the barcode curator function to
-- PUBLIC. Existing heys_rpc grants predated this migration and remain intact.
-- GRANT EXECUTE ON FUNCTION public.add_shared_product_barcode_by_curator(uuid, uuid, text) TO PUBLIC;
