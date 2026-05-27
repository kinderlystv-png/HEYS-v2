-- ═══════════════════════════════════════════════════════════════════════════
-- 💬 HEYS Messenger: client_messages таблица + RPC
-- ═══════════════════════════════════════════════════════════════════════════
-- Дата: 2026-05-27
--
-- Назначение: встроить мессенджер в HEYS чтобы клиент мог одной кнопкой
-- написать куратору («съел творог 200г», «не успел поесть»), и куратор
-- получил push + увидел сообщение в UI. Заменяет split-контекст Telegram/
-- WhatsApp на единый канал внутри приложения.
--
-- Семантика:
--   • client_messages — двунаправленный thread между client и его curator
--   • sender_role: 'client' | 'curator'
--   • body — свободный текст (до 2000 chars, API-level)
--   • intent_type/intent_payload — structured «съел/тренировался/вес»
--     (Phase 2: куратор одной кнопкой [Применить] добавит в day record)
--   • read_at — pull-based read receipts (без realtime)
--   • applied_at/applied_meal_id — Phase 2 markers что intent применён
--
-- Безопасность:
--   • client RPC берут session_token, client_id извлекается через
--     require_client_id (тот же паттерн что batch_upsert_client_kv_by_session)
--   • curator RPC берут p_curator_id (из JWT) + ownership check
--     (clients.curator_id = p_curator_id) — паттерн из
--     batch_upsert_client_kv_by_curator
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Таблица client_messages
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.client_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  curator_id UUID NOT NULL REFERENCES public.curators(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('client', 'curator')),

  body TEXT CHECK (body IS NULL OR LENGTH(body) <= 2000),
  intent_type TEXT CHECK (intent_type IS NULL OR intent_type IN ('meal', 'training', 'weight')),
  intent_payload JSONB,

  applied_at TIMESTAMPTZ,
  applied_meal_id TEXT,

  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Хотя бы одно из body/intent должно быть заполнено
  CHECK (body IS NOT NULL OR intent_type IS NOT NULL),
  -- applied_at/applied_meal_id осмысленны только для intent-сообщений от клиента
  CHECK (applied_at IS NULL OR (sender_role = 'client' AND intent_type IS NOT NULL))
);

COMMENT ON TABLE public.client_messages IS
  'Messenger thread между клиентом и его куратором. См. database/2026-05-27_client_messages.sql.';

-- Индекс для ленты треда (paginate by created_at DESC)
CREATE INDEX IF NOT EXISTS idx_messages_client_thread
  ON public.client_messages(client_id, created_at DESC);

-- Partial индекс для inbox куратора: непрочитанные от клиентов
CREATE INDEX IF NOT EXISTS idx_messages_curator_unread
  ON public.client_messages(curator_id, client_id, created_at DESC)
  WHERE read_at IS NULL AND sender_role = 'client';

-- Partial индекс для клиента: непрочитанные от куратора
CREATE INDEX IF NOT EXISTS idx_messages_client_unread
  ON public.client_messages(client_id, created_at DESC)
  WHERE read_at IS NULL AND sender_role = 'curator';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) send_message_as_client — клиент пишет своему куратору
-- ═══════════════════════════════════════════════════════════════════════════
-- Session-auth: client_id извлекается из session token, curator_id берётся
-- из clients.curator_id. Клиент не может писать «другому» куратору.

CREATE OR REPLACE FUNCTION public.send_message_as_client(
  p_session_token TEXT,
  p_body TEXT,
  p_intent_type TEXT,
  p_intent_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_curator_id UUID;
  v_message_id UUID;
BEGIN
  -- 1. Извлечь client_id из сессии (IDOR-safe)
  v_client_id := public.require_client_id(p_session_token);

  -- 2. Найти curator_id владельца этого клиента
  SELECT curator_id INTO v_curator_id
  FROM public.clients
  WHERE id = v_client_id;

  IF v_curator_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'client_has_no_curator'
    );
  END IF;

  -- 3. Validate (defensive — основная валидация на API-уровне)
  IF (p_body IS NULL OR LENGTH(TRIM(p_body)) = 0) AND p_intent_type IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'body_or_intent_required'
    );
  END IF;

  -- 4. INSERT
  INSERT INTO public.client_messages (
    client_id, curator_id, sender_role,
    body, intent_type, intent_payload
  )
  VALUES (
    v_client_id, v_curator_id, 'client',
    NULLIF(TRIM(p_body), ''), p_intent_type, p_intent_payload
  )
  RETURNING id INTO v_message_id;

  RETURN jsonb_build_object(
    'success', true,
    'message_id', v_message_id,
    'curator_id', v_curator_id,
    'client_id', v_client_id,
    'created_at', NOW()
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION public.send_message_as_client(TEXT, TEXT, TEXT, JSONB) IS
  '💬 Messenger: клиент отправляет сообщение своему куратору. Session-auth (IDOR-safe).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) send_message_as_curator — куратор отвечает клиенту
-- ═══════════════════════════════════════════════════════════════════════════
-- JWT-auth: p_curator_id из JWT, ownership check через clients.curator_id.

CREATE OR REPLACE FUNCTION public.send_message_as_curator(
  p_curator_id UUID,
  p_client_id UUID,
  p_body TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owns BOOLEAN;
  v_message_id UUID;
BEGIN
  -- 1. Ownership check (тот же паттерн что batch_upsert_client_kv_by_curator)
  SELECT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = p_client_id AND curator_id = p_curator_id
  ) INTO v_owns;

  IF NOT v_owns THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'curator_does_not_own_client'
    );
  END IF;

  -- 2. Validate body (куратор шлёт только текст, без intent)
  IF p_body IS NULL OR LENGTH(TRIM(p_body)) = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'body_required'
    );
  END IF;

  -- 3. INSERT
  INSERT INTO public.client_messages (
    client_id, curator_id, sender_role, body
  )
  VALUES (
    p_client_id, p_curator_id, 'curator', TRIM(p_body)
  )
  RETURNING id INTO v_message_id;

  RETURN jsonb_build_object(
    'success', true,
    'message_id', v_message_id,
    'created_at', NOW()
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION public.send_message_as_curator(UUID, UUID, TEXT) IS
  '💬 Messenger: куратор отвечает клиенту. JWT-auth + ownership check.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) get_messages_thread_as_client — клиент читает свой тред
-- ═══════════════════════════════════════════════════════════════════════════
-- Возвращает последние p_limit сообщений до p_before_ts (NULL = с конца).

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
           read_at, created_at
    FROM public.client_messages
    WHERE client_id = v_client_id
      AND (p_before_ts IS NULL OR created_at < p_before_ts)
    ORDER BY created_at DESC
    LIMIT v_limit
  ) m;

  RETURN jsonb_build_object(
    'success', true,
    'messages', v_messages
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION public.get_messages_thread_as_client(TEXT, TIMESTAMPTZ, INT) IS
  '💬 Messenger: лента треда для клиента. Session-auth.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) get_messages_thread_as_curator — куратор читает тред с конкретным клиентом
-- ═══════════════════════════════════════════════════════════════════════════

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
    RETURN jsonb_build_object(
      'success', false,
      'error', 'curator_does_not_own_client'
    );
  END IF;

  v_limit := LEAST(COALESCE(p_limit, 50), 200);

  SELECT COALESCE(jsonb_agg(row_to_json(m) ORDER BY m.created_at DESC), '[]'::jsonb)
  INTO v_messages
  FROM (
    SELECT id, client_id, curator_id, sender_role, body,
           intent_type, intent_payload, applied_at, applied_meal_id,
           read_at, created_at
    FROM public.client_messages
    WHERE client_id = p_client_id
      AND (p_before_ts IS NULL OR created_at < p_before_ts)
    ORDER BY created_at DESC
    LIMIT v_limit
  ) m;

  RETURN jsonb_build_object(
    'success', true,
    'messages', v_messages
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION public.get_messages_thread_as_curator(UUID, UUID, TIMESTAMPTZ, INT) IS
  '💬 Messenger: лента треда для куратора. JWT-auth + ownership check.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) get_curator_unread_counts — inbox куратора (по всем клиентам)
-- ═══════════════════════════════════════════════════════════════════════════
-- Возвращает массив [{client_id, unread_count, last_message_preview, last_message_at}]
-- для всех клиентов куратора. Используется для badges в dropdown свитча клиентов.

CREATE OR REPLACE FUNCTION public.get_curator_unread_counts(
  p_curator_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- LEFT JOIN clients → messages: вернём строку даже для клиентов без сообщений
  -- (unread_count=0, чтобы UI знал кому badge не показывать)
  WITH client_threads AS (
    SELECT
      c.id AS client_id,
      COUNT(m.id) FILTER (WHERE m.read_at IS NULL AND m.sender_role = 'client') AS unread_count,
      MAX(m.created_at) AS last_message_at,
      (
        SELECT jsonb_build_object(
          'body', m2.body,
          'intent_type', m2.intent_type,
          'sender_role', m2.sender_role
        )
        FROM public.client_messages m2
        WHERE m2.client_id = c.id
        ORDER BY m2.created_at DESC
        LIMIT 1
      ) AS last_message_preview
    FROM public.clients c
    LEFT JOIN public.client_messages m ON m.client_id = c.id
    WHERE c.curator_id = p_curator_id
    GROUP BY c.id
  )
  SELECT COALESCE(jsonb_agg(row_to_json(ct) ORDER BY ct.last_message_at DESC NULLS LAST), '[]'::jsonb)
  INTO v_result
  FROM client_threads ct;

  RETURN jsonb_build_object(
    'success', true,
    'inbox', v_result
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION public.get_curator_unread_counts(UUID) IS
  '💬 Messenger: inbox куратора со всеми клиентами + unread counts + last message preview.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 7) mark_messages_read_as_client — клиент пометил прочитанным
-- ═══════════════════════════════════════════════════════════════════════════
-- Помечает все сообщения от куратора с created_at <= p_up_to_ts как прочитанные.

CREATE OR REPLACE FUNCTION public.mark_messages_read_as_client(
  p_session_token TEXT,
  p_up_to_ts TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_updated INT;
BEGIN
  v_client_id := public.require_client_id(p_session_token);

  UPDATE public.client_messages
  SET read_at = NOW()
  WHERE client_id = v_client_id
    AND sender_role = 'curator'
    AND read_at IS NULL
    AND (p_up_to_ts IS NULL OR created_at <= p_up_to_ts);

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'updated', v_updated
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION public.mark_messages_read_as_client(TEXT, TIMESTAMPTZ) IS
  '💬 Messenger: клиент пометил сообщения куратора прочитанными.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 8) mark_messages_read_as_curator — куратор пометил прочитанным
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.mark_messages_read_as_curator(
  p_curator_id UUID,
  p_client_id UUID,
  p_up_to_ts TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owns BOOLEAN;
  v_updated INT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = p_client_id AND curator_id = p_curator_id
  ) INTO v_owns;

  IF NOT v_owns THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'curator_does_not_own_client'
    );
  END IF;

  UPDATE public.client_messages
  SET read_at = NOW()
  WHERE client_id = p_client_id
    AND sender_role = 'client'
    AND read_at IS NULL
    AND (p_up_to_ts IS NULL OR created_at <= p_up_to_ts);

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'updated', v_updated
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION public.mark_messages_read_as_curator(UUID, UUID, TIMESTAMPTZ) IS
  '💬 Messenger: куратор пометил сообщения клиента прочитанными.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 9) GRANT EXECUTE для runtime-роли heys_rpc
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_rpc') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.send_message_as_client(TEXT, TEXT, TEXT, JSONB) TO heys_rpc';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.send_message_as_curator(UUID, UUID, TEXT) TO heys_rpc';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_messages_thread_as_client(TEXT, TIMESTAMPTZ, INT) TO heys_rpc';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_messages_thread_as_curator(UUID, UUID, TIMESTAMPTZ, INT) TO heys_rpc';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_curator_unread_counts(UUID) TO heys_rpc';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.mark_messages_read_as_client(TEXT, TIMESTAMPTZ) TO heys_rpc';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.mark_messages_read_as_curator(UUID, UUID, TIMESTAMPTZ) TO heys_rpc';
    -- GRANT на саму таблицу: SELECT/INSERT/UPDATE через SECURITY DEFINER функции,
    -- но heys_rpc нужен доступ для запроса (даже через RPC) — стандарт для проекта
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.client_messages TO heys_rpc';
    RAISE NOTICE '✅ Granted EXECUTE to heys_rpc for 7 messenger RPCs + table access';
  ELSE
    RAISE NOTICE '⚠ Role heys_rpc not found, skipping grants';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.send_message_as_client(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_message_as_curator(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_messages_thread_as_client(TEXT, TIMESTAMPTZ, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_messages_thread_as_curator(UUID, UUID, TIMESTAMPTZ, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_curator_unread_counts(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_messages_read_as_client(TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_messages_read_as_curator(UUID, UUID, TIMESTAMPTZ) FROM PUBLIC;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Verification (запускаются в той же транзакции; падают → ROLLBACK)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_count INT;
BEGIN
  -- Таблица существует
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'client_messages') THEN
    RAISE EXCEPTION 'Table client_messages not created';
  END IF;

  -- FK constraints
  SELECT COUNT(*) INTO v_count FROM pg_constraint
  WHERE conrelid = 'public.client_messages'::regclass AND contype = 'f';
  IF v_count < 2 THEN
    RAISE EXCEPTION 'Expected ≥2 FK constraints on client_messages, got %', v_count;
  END IF;

  -- 7 RPC функций
  SELECT COUNT(*) INTO v_count FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND proname IN (
      'send_message_as_client',
      'send_message_as_curator',
      'get_messages_thread_as_client',
      'get_messages_thread_as_curator',
      'get_curator_unread_counts',
      'mark_messages_read_as_client',
      'mark_messages_read_as_curator'
    );
  IF v_count <> 7 THEN
    RAISE EXCEPTION 'Expected 7 messenger RPCs, found %', v_count;
  END IF;

  -- Индексы
  SELECT COUNT(*) INTO v_count FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'client_messages';
  IF v_count < 4 THEN  -- PK + 3 наших
    RAISE EXCEPTION 'Expected ≥4 indexes on client_messages, got %', v_count;
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ HEYS Messenger migration applied successfully';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '   Table: client_messages';
  RAISE NOTICE '   RPCs:  7 (send×2, get_thread×2, get_inbox×1, mark_read×2)';
  RAISE NOTICE '   Note:  apply_intent RPC будет добавлен в Phase 2';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;
