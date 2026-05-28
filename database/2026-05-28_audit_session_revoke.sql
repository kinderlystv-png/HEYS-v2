-- ═══════════════════════════════════════════════════════════════════
-- Migration: audit trigger на client_sessions.revoked_at + restrict
--            EXECUTE на revoke_all_client_sessions до heys_admin (Ticket F)
-- Date: 2026-05-28
-- Purpose:
--   Closes forensic gap from 2026-05-19 incident: 87 sessions у клиента
--   Александра отозваны 13:31:35 одновременно, actor неизвестен
--   (audit_logs за 13:30-13:35 пустой). Direct SQL call прошёл мимо
--   audit-системы потому что:
--     1. revoke_all_client_sessions имеет GRANT EXECUTE → PUBLIC (любой
--        PG role может вызвать без трейса)
--     2. UPDATE client_sessions SET revoked_at = NOW() не имеет триггера
--   После этой миграции:
--     - PUBLIC и heys_rpc больше не могут вызывать revoke_all_client_sessions
--       напрямую — только через admin_set_client_pin (SECURITY DEFINER →
--       heys_admin)
--     - Любой UPDATE revoked_at (через любой путь, прямой SQL ИЛИ функция)
--       создаёт запись в audit_logs с actor context (current_user,
--       session_user, application_name, backend_pid)
--
-- Apply:
--   ./scripts/db/psql.sh -f database/2026-05-28_audit_session_revoke.sql
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Trigger function: log session revocation events with full actor context.
--    SECURITY DEFINER — чтобы writer-роль которая делает UPDATE имела право
--    INSERT в audit_logs.
--    EXCEPTION WHEN OTHERS THEN WARN — не блокируем revoke если audit лёг
--    (production-safe; alerting через WARNING level).
CREATE OR REPLACE FUNCTION public.audit_session_revoke()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (
    action, resource_type, resource_id,
    old_values, new_values, metadata, ip_address, user_agent
  ) VALUES (
    'session_revoked',
    'client_session',
    NEW.id,
    jsonb_build_object('revoked_at', OLD.revoked_at),
    jsonb_build_object(
      'revoked_at', NEW.revoked_at,
      'client_id', NEW.client_id,
      'session_expires_at', NEW.expires_at
    ),
    jsonb_build_object(
      'current_user', current_user,
      'session_user', session_user,
      'application_name', current_setting('application_name', true),
      'backend_pid', pg_backend_pid()
    ),
    NEW.ip_address,  -- IP from which session was originally created
    NEW.user_agent
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Best-effort: don't block revoke if audit insert fails.
  -- WARNING surface in PG logs + alerting; не блокируем business logic.
  RAISE WARNING 'audit_session_revoke insert failed: % (sqlstate=%)', SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.audit_session_revoke() IS
  'Trigger fn для client_sessions.revoked_at NULL → NOT NULL. Логирует actor (current_user, session_user, application_name, backend_pid) в audit_logs. Best-effort — не блокирует revoke при audit failure.';

-- 2. Trigger: fires ONLY on transitions NULL → NOT NULL (idempotent — повторный
--    UPDATE того же revoked_at не создаёт дубль).
DROP TRIGGER IF EXISTS trg_audit_session_revoke ON public.client_sessions;
CREATE TRIGGER trg_audit_session_revoke
AFTER UPDATE OF revoked_at ON public.client_sessions
FOR EACH ROW
WHEN (OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL)
EXECUTE PROCEDURE public.audit_session_revoke();

COMMENT ON TRIGGER trg_audit_session_revoke ON public.client_sessions IS
  'Ticket F (2026-05-28): forensic trail для session revocation. Срабатывает при NULL → NOT NULL переходе revoked_at, идемпотентный по design.';

-- 3. Restrict EXECUTE on revoke_all_client_sessions: PUBLIC and heys_rpc
--    больше не могут вызывать напрямую. Только heys_admin (для прямых SQL ops)
--    + admin_set_client_pin (SECURITY DEFINER, owner=heys_admin → его privilege
--    наследуется).
REVOKE EXECUTE ON FUNCTION public.revoke_all_client_sessions(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.revoke_all_client_sessions(UUID) FROM heys_rpc;
-- heys_admin GRANT уже существует с 2026-05-19, но re-grant идемпотентен.
GRANT EXECUTE ON FUNCTION public.revoke_all_client_sessions(UUID) TO heys_admin;

COMMIT;

-- Smoke test queries (выполнить отдельно для верификации):
-- 1) Проверка grants:
--   SELECT grantee, privilege_type FROM information_schema.routine_privileges
--   WHERE routine_name = 'revoke_all_client_sessions';
--   Ожидание: только heys_admin (PUBLIC и heys_rpc исчезнут)
--
-- 2) Проверка trigger:
--   SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = 'client_sessions'::regclass;
--   Ожидание: trg_audit_session_revoke present, tgenabled='O'
--
-- 3) Проверка audit-fire (требует test-сессии):
--   - Создать test session via SQL
--   - UPDATE client_sessions SET revoked_at = NOW() WHERE id = '<test-id>';
--   - SELECT * FROM audit_logs WHERE resource_id = '<test-id>' AND action='session_revoked';
--   Ожидание: одна запись с full metadata.
