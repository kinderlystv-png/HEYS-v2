-- ═══════════════════════════════════════════════════════════════════════════
-- 🔔 HEYS Messenger: unread count для FAB badge
-- ═══════════════════════════════════════════════════════════════════════════
-- Дата: 2026-05-28
--
-- Lightweight RPC для клиента — сколько непрочитанных от куратора.
-- Для куратора уже есть get_curator_unread_counts (возвращает по всем клиентам).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_unread_count_as_client(
  p_session_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_count INT;
BEGIN
  v_client_id := public.require_client_id(p_session_token);

  SELECT COUNT(*) INTO v_count
  FROM public.client_messages
  WHERE client_id = v_client_id
    AND sender_role = 'curator'
    AND read_at IS NULL;

  RETURN jsonb_build_object('success', true, 'unread_count', v_count);

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.get_my_unread_count_as_client(TEXT) IS
  '🔔 Messenger: количество непрочитанных сообщений от куратора. Session-auth.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_rpc') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_my_unread_count_as_client(TEXT) TO heys_rpc';
    RAISE NOTICE '✅ GRANT EXECUTE для get_my_unread_count_as_client';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.get_my_unread_count_as_client(TEXT) FROM PUBLIC;

COMMIT;
