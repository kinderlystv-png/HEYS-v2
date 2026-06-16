-- Harden trial/client onboarding SECURITY DEFINER functions.
-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default; these
-- functions must only be callable through the authenticated RPC runtime roles.

REVOKE ALL ON FUNCTION public.create_client_with_pin(TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_clear_telegram_binding(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_regenerate_pin(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_pin_token_chat(UUID, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_trial_drip_targets() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.create_client_with_pin(TEXT, TEXT, TEXT, TEXT, UUID) FROM anon;
    REVOKE ALL ON FUNCTION public.admin_clear_telegram_binding(UUID, UUID) FROM anon;
    REVOKE ALL ON FUNCTION public.admin_regenerate_pin(UUID, UUID) FROM anon;
    REVOKE ALL ON FUNCTION public.claim_pin_token_chat(UUID, BIGINT) FROM anon;
    REVOKE ALL ON FUNCTION public.get_trial_drip_targets() FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.create_client_with_pin(TEXT, TEXT, TEXT, TEXT, UUID) FROM authenticated;
    REVOKE ALL ON FUNCTION public.admin_clear_telegram_binding(UUID, UUID) FROM authenticated;
    REVOKE ALL ON FUNCTION public.admin_regenerate_pin(UUID, UUID) FROM authenticated;
    REVOKE ALL ON FUNCTION public.claim_pin_token_chat(UUID, BIGINT) FROM authenticated;
    REVOKE ALL ON FUNCTION public.get_trial_drip_targets() FROM authenticated;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.create_client_with_pin(TEXT, TEXT, TEXT, TEXT, UUID) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.admin_clear_telegram_binding(UUID, UUID) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.admin_regenerate_pin(UUID, UUID) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.claim_pin_token_chat(UUID, BIGINT) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.get_trial_drip_targets() TO heys_rpc;

GRANT EXECUTE ON FUNCTION public.admin_clear_telegram_binding(UUID, UUID) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.admin_regenerate_pin(UUID, UUID) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.claim_pin_token_chat(UUID, BIGINT) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.get_trial_drip_targets() TO heys_admin;
