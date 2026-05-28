-- ═══════════════════════════════════════════════════════════════════════════
-- 📷 HEYS Messenger: attachments column (photos)
-- ═══════════════════════════════════════════════════════════════════════════
-- Дата: 2026-05-28
--
-- Фото в сообщениях. Реиспользуем существующую инфраструктуру:
-- HEYS.StoragePhotos.uploadPhoto → Yandex Object Storage (bucket meal-photos) →
-- возвращает {url, path}. Эти данные складываем в client_messages.attachments[].
--
-- Каждый элемент массива: {url, path, filename?, mime?, width?, height?}.
-- В MVP: только photos. Будущие типы (voice, file) — extend schema без миграции.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Колонка attachments
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.client_messages
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.client_messages.attachments IS
  'Массив прикреплённых файлов: [{url, path, filename, mime, width, height}, ...]. '
  'В MVP только фото из bucket meal-photos (Yandex Object Storage).';

-- Снимаем CHECK constraint про body OR intent (он не учитывает что attachments
-- тоже может быть единственным «контентом» сообщения — фото без текста).
ALTER TABLE public.client_messages
  DROP CONSTRAINT IF EXISTS client_messages_check;

-- Восстанавливаем с расширенным правилом: хоть что-то одно должно быть.
ALTER TABLE public.client_messages
  ADD CONSTRAINT client_messages_content_check
  CHECK (body IS NOT NULL OR intent_type IS NOT NULL OR jsonb_array_length(attachments) > 0);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) send_message_as_client — принимает p_attachments
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.send_message_as_client(
  p_session_token TEXT,
  p_body TEXT,
  p_intent_type TEXT,
  p_intent_payload JSONB,
  p_attachments JSONB DEFAULT '[]'::jsonb
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
  v_attachments JSONB := COALESCE(p_attachments, '[]'::jsonb);
BEGIN
  v_client_id := public.require_client_id(p_session_token);

  SELECT curator_id INTO v_curator_id FROM public.clients WHERE id = v_client_id;
  IF v_curator_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'client_has_no_curator');
  END IF;

  -- Хотя бы один тип контента
  IF (p_body IS NULL OR LENGTH(TRIM(p_body)) = 0)
     AND p_intent_type IS NULL
     AND jsonb_array_length(v_attachments) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'body_or_intent_or_attachment_required');
  END IF;

  INSERT INTO public.client_messages (
    client_id, curator_id, sender_role,
    body, intent_type, intent_payload, attachments
  )
  VALUES (
    v_client_id, v_curator_id, 'client',
    NULLIF(TRIM(COALESCE(p_body, '')), ''),
    p_intent_type, p_intent_payload, v_attachments
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
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) send_message_as_curator — принимает p_attachments
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.send_message_as_curator(
  p_curator_id UUID,
  p_client_id UUID,
  p_body TEXT,
  p_attachments JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owns BOOLEAN;
  v_message_id UUID;
  v_attachments JSONB := COALESCE(p_attachments, '[]'::jsonb);
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = p_client_id AND curator_id = p_curator_id
  ) INTO v_owns;

  IF NOT v_owns THEN
    RETURN jsonb_build_object('success', false, 'error', 'curator_does_not_own_client');
  END IF;

  IF (p_body IS NULL OR LENGTH(TRIM(p_body)) = 0)
     AND jsonb_array_length(v_attachments) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'body_or_attachment_required');
  END IF;

  INSERT INTO public.client_messages (
    client_id, curator_id, sender_role, body, attachments
  )
  VALUES (
    p_client_id, p_curator_id, 'curator',
    NULLIF(TRIM(COALESCE(p_body, '')), ''),
    v_attachments
  )
  RETURNING id INTO v_message_id;

  RETURN jsonb_build_object(
    'success', true,
    'message_id', v_message_id,
    'created_at', NOW()
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) Обновить thread SELECT'ы чтобы attachments попадал в payload
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
           done_at, edited_at, attachments, read_at, created_at
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
           done_at, edited_at, attachments, read_at, created_at
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
-- 5) GRANT EXECUTE (новые сигнатуры функций)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_rpc') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.send_message_as_client(TEXT, TEXT, TEXT, JSONB, JSONB) TO heys_rpc';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.send_message_as_curator(UUID, UUID, TEXT, JSONB) TO heys_rpc';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_messages_thread_as_client(TEXT, TIMESTAMPTZ, INT) TO heys_rpc';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_messages_thread_as_curator(UUID, UUID, TIMESTAMPTZ, INT) TO heys_rpc';
    RAISE NOTICE '✅ GRANT EXECUTE для send (с attachments) + thread RPCs';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.send_message_as_client(TEXT, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_message_as_curator(UUID, UUID, TEXT, JSONB) FROM PUBLIC;

COMMIT;

DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'client_messages' AND column_name = 'attachments';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'attachments column not created';
  END IF;
  RAISE NOTICE '✅ Migration verified: attachments column + updated RPCs';
END $$;
