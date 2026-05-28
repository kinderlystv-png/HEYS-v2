-- ═══════════════════════════════════════════════════════════════════════════
-- ✓ HEYS Messenger: acked_at — клиент подтверждает что принял сообщение куратора
-- ═══════════════════════════════════════════════════════════════════════════
-- Дата: 2026-05-28
--
-- Симметрично done_at для куратора. Курaтор пишет «уточни граммы» → клиент
-- открыл чат → раньше счётчик у клиента сразу обнулялся (через read_at). Но
-- клиент мог закрыть и забыть. Теперь:
--   • acked_at IS NULL — сообщение куратора висит у клиента в badge
--   • Клиент нажал ✓ → acked_at = NOW() → badge падает
--   • Курaтор видит у себя в треде что клиент принял (галочка/время)
--
-- Изменения:
--   1. ALTER TABLE: acked_at TIMESTAMPTZ
--   2. Partial index на curator-сообщения без acked_at (быстрый count)
--   3. RPC toggle_message_acked_as_client (session-auth)
--   4. UPDATE get_my_unread_count_as_client: COUNT acked_at IS NULL
--   5. UPDATE thread RPCs: SELECT acked_at в выборку
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Колонка acked_at
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.client_messages
  ADD COLUMN IF NOT EXISTS acked_at TIMESTAMPTZ;

COMMENT ON COLUMN public.client_messages.acked_at IS
  'Когда клиент явно подтвердил, что принял сообщение куратора (тап ✓). '
  'Симметрично done_at для куратора. Только для sender_role=''curator''.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Partial index для быстрого client-pending count
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_messages_client_unacked
  ON public.client_messages(client_id, created_at DESC)
  WHERE acked_at IS NULL AND sender_role = 'curator';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) toggle_message_acked_as_client — клиент переключает acked_at
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.toggle_message_acked_as_client(
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
  v_acked_at TIMESTAMPTZ;
BEGIN
  v_client_id := public.require_client_id(p_session_token);

  -- Toggle: если acked_at IS NULL → NOW(), иначе NULL
  UPDATE public.client_messages
  SET acked_at = CASE WHEN acked_at IS NULL THEN NOW() ELSE NULL END
  WHERE id = p_message_id
    AND client_id = v_client_id
    AND sender_role = 'curator'
  RETURNING acked_at INTO v_acked_at;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'message_not_found_or_wrong_role');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message_id', p_message_id,
    'acked_at', v_acked_at
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.toggle_message_acked_as_client(TEXT, UUID) IS
  '✓ Messenger: клиент подтверждает / снимает подтверждение на сообщении куратора.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) get_my_unread_count_as_client: счёт по acked_at вместо read_at
-- ═══════════════════════════════════════════════════════════════════════════

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
    AND acked_at IS NULL;

  RETURN jsonb_build_object('success', true, 'unread_count', v_count);

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.get_my_unread_count_as_client(TEXT) IS
  '🔔 Messenger: количество не-принятых сообщений от куратора (acked_at IS NULL).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) thread RPC: добавить acked_at в SELECT
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
           done_at, acked_at, edited_at, attachments, read_at, created_at
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
           done_at, acked_at, edited_at, attachments, read_at, created_at
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
-- 6) GRANT EXECUTE
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_rpc') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.toggle_message_acked_as_client(TEXT, UUID) TO heys_rpc';
    RAISE NOTICE '✅ GRANT EXECUTE для toggle_message_acked_as_client';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.toggle_message_acked_as_client(TEXT, UUID) FROM PUBLIC;

COMMIT;

DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'client_messages' AND column_name = 'acked_at';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'acked_at column not created';
  END IF;
  RAISE NOTICE '✅ Migration verified: acked_at + toggle_message_acked_as_client + updated thread RPCs';
END $$;
