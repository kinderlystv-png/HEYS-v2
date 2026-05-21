-- ═══════════════════════════════════════════════════════════════════════════════
-- HEYS: Patch fix2 для 2026-05-20_compliance_overhaul.sql
-- Дата: 2026-05-20
-- ═══════════════════════════════════════════════════════════════════════════════
-- Что чиним:
--   1. Immutability triггер — переписываем на role-aware. heys_admin
--      пропускаем (privileged direct admin), heys_rpc/heys_rest/heys_maintenance
--      без writer-flag блокируем.
--      Это вместе с GRANT-настройкой (heys_admin only) даёт defense-in-depth.
--   2. delete_my_account — восстанавливаем security_events INSERT
--      (был в оригинале 2026-05-14, я случайно затёр в overhaul) + сохраняем
--      новые правки (detach consents + log_data_access).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1) Role-aware immutability guard ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.consents_immutability_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_authorized TEXT;
BEGIN
  -- heys_admin — privileged direct admin role, никогда не блокируется
  -- (отдельный audit идёт через audit_logs / security_events).
  IF current_user = 'heys_admin' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Внутри SECURITY DEFINER функций: писатель выставил локальный флаг.
  v_authorized := current_setting('app.consents_writer', true);
  IF v_authorized = 'authorized' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  RAISE EXCEPTION
    'consents table is immutable for role %: % only allowed through authorized SECURITY DEFINER functions',
    current_user, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

-- Триггер уже создан в overhaul — DROP/CREATE REPLACE справится автоматически
-- (CREATE TRIGGER не имеет CREATE OR REPLACE, поэтому используем DROP IF EXISTS).
DROP TRIGGER IF EXISTS consents_immutability_update ON public.consents;
CREATE TRIGGER consents_immutability_update
  BEFORE UPDATE ON public.consents
  FOR EACH ROW EXECUTE FUNCTION public.consents_immutability_guard();

DROP TRIGGER IF EXISTS consents_immutability_delete ON public.consents;
CREATE TRIGGER consents_immutability_delete
  BEFORE DELETE ON public.consents
  FOR EACH ROW EXECUTE FUNCTION public.consents_immutability_guard();

-- ─── 2) delete_my_account: восстанавливаем security_events ─────────────────

CREATE OR REPLACE FUNCTION public.delete_my_account(p_session_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_deleted INT := 0;
BEGIN
  IF p_session_token IS NULL OR length(trim(p_session_token)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_token required');
  END IF;

  BEGIN
    v_client_id := public.require_client_id(p_session_token);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid or expired session');
  END;

  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'session has no client_id');
  END IF;

  -- Логируем намерение в security_events ДО удаления (cascade удалит client_id,
  -- поэтому фиксируем его в meta).
  INSERT INTO security_events (event_type, meta)
  VALUES ('account_deleted', jsonb_build_object('deleted_client_id', v_client_id));

  -- Compliance audit: лог в data_access_audit_log (запись переживёт delete клиента,
  -- т.к. data_access_audit_log.client_id без FK).
  PERFORM public.log_data_access('client_self', v_client_id, v_client_id,
    'account_deleted', NULL, true, NULL, NULL, '{}'::jsonb);

  -- Detach consents: обнуляем PII в IP/UA, помечаем is_active=false.
  -- Записи остаются для compliance audit-trail (несмотря на CASCADE — мы их
  -- удалим явно НЕ будем, но cascade при DELETE FROM clients их всё равно
  -- сотрёт. Это известный конфликт: cascade != audit-preservation.
  -- В этой миграции принимаем cascade-delete как есть; full preservation
  -- через миграцию FK на ON DELETE SET NULL — отдельный шаг (см. follow-up).
  PERFORM set_config('app.consents_writer', 'authorized', true);
  UPDATE consents
     SET ip_address = NULL,
         user_agent = '[deleted]',
         is_active = false
   WHERE client_id = v_client_id;

  -- Каскадное удаление (consents, kv_store, sessions, subscriptions, leads.client_id → NULL)
  DELETE FROM clients WHERE id = v_client_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'client already deleted');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_client_id', v_client_id,
    'deleted_at', NOW()
  );
END;
$$;

COMMIT;
