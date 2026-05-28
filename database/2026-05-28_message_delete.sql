-- ═══════════════════════════════════════════════════════════════════════════
-- 🗑 HEYS Messenger: delete own message (hard delete)
-- ═══════════════════════════════════════════════════════════════════════════
-- Дата: 2026-05-28
--
-- Каждый удаляет только свои сообщения (hard delete).
-- Клиент удаляет свои через session_token, курaтор — через JWT с ownership check.
-- Идемпотентно: если сообщение уже удалено, возвращаем success=true (deleted=0).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) delete_message_as_client — клиент удаляет свои сообщения
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.delete_message_as_client(
  p_session_token TEXT,
  p_message_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_deleted INT;
BEGIN
  v_client_id := public.require_client_id(p_session_token);

  DELETE FROM public.client_messages
  WHERE id = p_message_id
    AND client_id = v_client_id
    AND sender_role = 'client';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'message_id', p_message_id,
    'deleted', v_deleted
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION public.delete_message_as_client(TEXT, UUID) IS
  '🗑 Messenger: клиент удаляет своё сообщение (hard delete). Session-auth.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) delete_message_as_curator — курaтор удаляет свои сообщения
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.delete_message_as_curator(
  p_curator_id UUID,
  p_message_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM public.client_messages
  WHERE id = p_message_id
    AND curator_id = p_curator_id
    AND sender_role = 'curator';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'message_id', p_message_id,
    'deleted', v_deleted
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION public.delete_message_as_curator(UUID, UUID) IS
  '🗑 Messenger: курaтор удаляет своё сообщение (hard delete). JWT-auth.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) GRANT EXECUTE для runtime-роли heys_rpc
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_rpc') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.delete_message_as_client(TEXT, UUID) TO heys_rpc';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.delete_message_as_curator(UUID, UUID) TO heys_rpc';
    RAISE NOTICE '✅ GRANT EXECUTE для delete_message RPC';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.delete_message_as_client(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_message_as_curator(UUID, UUID) FROM PUBLIC;

COMMIT;

DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND proname IN ('delete_message_as_client', 'delete_message_as_curator');
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Expected 2 delete RPCs, found %', v_count;
  END IF;
  RAISE NOTICE '✅ Migration verified: 2 delete RPCs созданы';
END $$;
