-- ═══════════════════════════════════════════════════════════════════════════
-- ✏️ HEYS Messenger: edit own message
-- ═══════════════════════════════════════════════════════════════════════════
-- Дата: 2026-05-28
--
-- Каждый редактирует только свои сообщения. Меняется body, проставляется
-- edited_at = NOW(). Для intent-сообщений редактирование запрещаем (контракт
-- intent_payload нельзя менять текстом — пришлось бы инвалидировать ссылку
-- куратора, если он уже применил).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Колонка edited_at
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.client_messages
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

COMMENT ON COLUMN public.client_messages.edited_at IS
  'Время последнего редактирования. NULL если не редактировалось.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) edit_message_as_client
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.edit_message_as_client(
  p_session_token TEXT,
  p_message_id UUID,
  p_new_body TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_updated INT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  v_client_id := public.require_client_id(p_session_token);

  IF p_new_body IS NULL OR LENGTH(TRIM(p_new_body)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'body_required');
  END IF;
  IF LENGTH(p_new_body) > 2000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'body_too_long');
  END IF;

  -- Редактируем только text-сообщения (intent_type IS NULL).
  -- Intent редактировать нельзя — это поломало бы applied_meal_id ссылки.
  UPDATE public.client_messages
  SET body = TRIM(p_new_body),
      edited_at = v_now
  WHERE id = p_message_id
    AND client_id = v_client_id
    AND sender_role = 'client'
    AND intent_type IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found_or_intent');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message_id', p_message_id,
    'edited_at', v_now
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.edit_message_as_client(TEXT, UUID, TEXT) IS
  '✏️ Messenger: клиент редактирует свой text-message. Session-auth.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) edit_message_as_curator
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.edit_message_as_curator(
  p_curator_id UUID,
  p_message_id UUID,
  p_new_body TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF p_new_body IS NULL OR LENGTH(TRIM(p_new_body)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'body_required');
  END IF;
  IF LENGTH(p_new_body) > 2000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'body_too_long');
  END IF;

  UPDATE public.client_messages
  SET body = TRIM(p_new_body),
      edited_at = v_now
  WHERE id = p_message_id
    AND curator_id = p_curator_id
    AND sender_role = 'curator';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message_id', p_message_id,
    'edited_at', v_now
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.edit_message_as_curator(UUID, UUID, TEXT) IS
  '✏️ Messenger: куратор редактирует свой message. JWT-auth.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) Обновить SELECT'ы thread RPC чтобы edited_at попадал во фронт
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_messages_thread_as_client(
  p_session_token TEXT,
  p_before_ts TIMESTAMPTZ,
  p_limit INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_limit INT;
  v_messages JSONB;
BEGIN
  v_client_id := public.require_client_id(p_session_token);
  v_limit := LEAST(COALESCE(p_limit, 50), 200);

  SELECT COALESCE(jsonb_agg(row_to_json(m) ORDER BY m.created_at DESC), '[]'::jsonb)
  INTO v_messages
  FROM (
    SELECT id, client_id, curator_id, sender_role, body,
           intent_type, intent_payload, applied_at, applied_meal_id,
           done_at, edited_at, read_at, created_at
    FROM public.client_messages
    WHERE client_id = v_client_id
      AND (p_before_ts IS NULL OR created_at < p_before_ts)
    ORDER BY created_at DESC
    LIMIT v_limit
  ) m;

  RETURN jsonb_build_object('success', true, 'messages', v_messages);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_messages_thread_as_curator(
  p_curator_id UUID,
  p_client_id UUID,
  p_before_ts TIMESTAMPTZ,
  p_limit INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owns BOOLEAN;
  v_limit INT;
  v_messages JSONB;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = p_client_id AND curator_id = p_curator_id
  ) INTO v_owns;

  IF NOT v_owns THEN
    RETURN jsonb_build_object('success', false, 'error', 'curator_does_not_own_client');
  END IF;

  v_limit := LEAST(COALESCE(p_limit, 50), 200);

  SELECT COALESCE(jsonb_agg(row_to_json(m) ORDER BY m.created_at DESC), '[]'::jsonb)
  INTO v_messages
  FROM (
    SELECT id, client_id, curator_id, sender_role, body,
           intent_type, intent_payload, applied_at, applied_meal_id,
           done_at, edited_at, read_at, created_at
    FROM public.client_messages
    WHERE client_id = p_client_id
      AND (p_before_ts IS NULL OR created_at < p_before_ts)
    ORDER BY created_at DESC
    LIMIT v_limit
  ) m;

  RETURN jsonb_build_object('success', true, 'messages', v_messages);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) GRANT EXECUTE
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_rpc') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.edit_message_as_client(TEXT, UUID, TEXT) TO heys_rpc';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.edit_message_as_curator(UUID, UUID, TEXT) TO heys_rpc';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_messages_thread_as_client(TEXT, TIMESTAMPTZ, INT) TO heys_rpc';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_messages_thread_as_curator(UUID, UUID, TIMESTAMPTZ, INT) TO heys_rpc';
    RAISE NOTICE '✅ GRANT EXECUTE для edit + refreshed thread RPC';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.edit_message_as_client(TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.edit_message_as_curator(UUID, UUID, TEXT) FROM PUBLIC;

COMMIT;

DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND proname IN ('edit_message_as_client', 'edit_message_as_curator');
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Expected 2 edit RPCs, found %', v_count;
  END IF;
  RAISE NOTICE '✅ Migration verified: edited_at column + 2 edit RPCs';
END $$;
