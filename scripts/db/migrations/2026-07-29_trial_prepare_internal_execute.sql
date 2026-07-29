-- 2026-07-29: restore the internal trial-prepare call permission.
--
-- Context: trial-intake v2 intentionally revoked direct gateway access to
-- admin_convert_lead, but also revoked EXECUTE from the SECURITY DEFINER owner
-- heys_admin. The public prepare entry point therefore failed before it could
-- convert the lead. Keep the lower-level function unavailable to heys_rpc and
-- PUBLIC while allowing the owner-only nested call.
--
-- ROLLBACK: REVOKE EXECUTE ON FUNCTION public.admin_convert_lead(UUID, UUID) FROM heys_admin;

REVOKE EXECUTE ON FUNCTION public.admin_convert_lead(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_convert_lead(UUID, UUID) FROM heys_rpc;
GRANT EXECUTE ON FUNCTION public.admin_convert_lead(UUID, UUID) TO heys_admin;
