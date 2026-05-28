-- ═══════════════════════════════════════════════════════════════════════════
-- ✅ HEYS Messenger: done_at — куратор отмечает сообщение «обработано»
-- ═══════════════════════════════════════════════════════════════════════════
-- Дата: 2026-05-28
--
-- Куратор увидел «съел творог 200г», добавил в день клиента руками, тапает
-- галочку — сообщение получает done_at=NOW(). Клиент видит «✓ Обработано».
-- Toggle: повторный тап снимает отметку (done_at → NULL).
--
-- Семантика отдельная от applied_at (который зарезервирован под Phase 2:
-- автоматическое применение intent в day). done_at — чисто статус-маркер,
-- никакой мутации данных дневника.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) Колонка
ALTER TABLE public.client_messages
  ADD COLUMN IF NOT EXISTS done_at TIMESTAMPTZ;

COMMENT ON COLUMN public.client_messages.done_at IS
  'Куратор отметил сообщение клиента как обработанное (вручную). См. toggle_message_done_by_curator.';

-- Partial-индекс для возможных аудитов «сколько необработанных за период».
-- Минимальный overhead, partial по done_at IS NULL ускорит queries вида
-- "необработанные за последние X дней по куратору".
CREATE INDEX IF NOT EXISTS idx_messages_curator_undone
  ON public.client_messages(curator_id, created_at DESC)
  WHERE done_at IS NULL AND sender_role = 'client';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) RPC: toggle_message_done_by_curator
-- ═══════════════════════════════════════════════════════════════════════════
-- Toggle: если done_at IS NULL → SET NOW(); если уже отмечено → SET NULL.
-- Работает только для сообщений от клиента (sender_role='client') —
-- собственные сообщения куратор отмечать как «обработанные» не может,
-- это бессмысленно.

CREATE OR REPLACE FUNCTION public.toggle_message_done_by_curator(
  p_curator_id UUID,
  p_message_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg_client_id UUID;
  v_msg_curator_id UUID;
  v_msg_sender TEXT;
  v_new_done_at TIMESTAMPTZ;
BEGIN
  -- 1. Получить сообщение + ownership info одной выборкой
  SELECT client_id, curator_id, sender_role
  INTO v_msg_client_id, v_msg_curator_id, v_msg_sender
  FROM public.client_messages
  WHERE id = p_message_id;

  IF v_msg_client_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'message_not_found');
  END IF;

  -- 2. Ownership check: curator_id из сообщения должен совпадать с JWT-curator_id,
  --    AND курaтор должен реально владеть этим клиентом (paranoid double-check
  --    на случай если curator_id в client_messages устарел — изначально он
  --    проставляется из clients.curator_id при отправке, но клиент мог быть
  --    передан другому куратору и старые сообщения остались с prev curator_id).
  IF v_msg_curator_id != p_curator_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_your_message');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = v_msg_client_id AND curator_id = p_curator_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'curator_does_not_own_client');
  END IF;

  -- 3. Только сообщения клиента можно отметить
  IF v_msg_sender != 'client' THEN
    RETURN jsonb_build_object('success', false, 'error', 'only_client_messages_can_be_marked');
  END IF;

  -- 4. Toggle. Если уже отмечено — снимаем (NULL).
  UPDATE public.client_messages
  SET done_at = CASE WHEN done_at IS NULL THEN NOW() ELSE NULL END
  WHERE id = p_message_id
  RETURNING done_at INTO v_new_done_at;

  RETURN jsonb_build_object(
    'success', true,
    'message_id', p_message_id,
    'done_at', v_new_done_at
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.toggle_message_done_by_curator(UUID, UUID) IS
  '✅ Messenger: куратор отмечает/снимает отметку «обработано» на сообщении клиента.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) Обновить get_messages_thread_*: включить done_at в SELECT
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
           done_at, read_at, created_at
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
           done_at, read_at, created_at
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
-- 4) GRANT EXECUTE для heys_rpc
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_rpc') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.toggle_message_done_by_curator(UUID, UUID) TO heys_rpc';
    -- Permissions для CREATE OR REPLACE — yes, нужно перевыдать
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_messages_thread_as_client(TEXT, TIMESTAMPTZ, INT) TO heys_rpc';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_messages_thread_as_curator(UUID, UUID, TIMESTAMPTZ, INT) TO heys_rpc';
    RAISE NOTICE '✅ GRANT EXECUTE для toggle_message_done_by_curator + thread RPCs';
  ELSE
    RAISE NOTICE '⚠ Role heys_rpc not found';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.toggle_message_done_by_curator(UUID, UUID) FROM PUBLIC;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Verification
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_col_exists BOOLEAN;
  v_fn_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'client_messages' AND column_name = 'done_at'
  ) INTO v_col_exists;
  IF NOT v_col_exists THEN
    RAISE EXCEPTION 'done_at column not created';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = 'toggle_message_done_by_curator'
  ) INTO v_fn_exists;
  IF NOT v_fn_exists THEN
    RAISE EXCEPTION 'toggle_message_done_by_curator RPC not created';
  END IF;

  RAISE NOTICE '✅ Migration verified: done_at column + toggle_message_done_by_curator RPC';
END $$;
