-- 2026-08-02: applied_summary и seen_at для мессенджера
--
-- Context: редизайн мессенджера показывает клиенту карточку «внесено в дневник»
-- с составом того, что куратор действительно записал, и отмечает, что куратор
-- сообщение видел. В таблице для этого не было полей: applied_at существовал,
-- но только как флаг и только для intent-сообщений.
--
-- Три изменения:
--   1. applied_summary — что именно попало в день (состав, итог, ссылка на день);
--   2. seen_at — курсор «куратор открыл тред», отдельный от read_at;
--   3. CHECK на applied_at ослаблен: клиент чаще пишет текстом («завтрак в
--      08:40, овсянка 60 г»), и такое сообщение тоже вносится в день. Требование
--      intent_type делало отметку невозможной для основного сценария.
--
-- Apply: bash scripts/db/psql.sh -f scripts/db/migrations/2026-08-02_messenger_applied_summary.sql
-- Rollback: см. ===== ROLLBACK ===== в конце файла.

-- ===== FORWARD =====

ALTER TABLE public.client_messages
  ADD COLUMN IF NOT EXISTS applied_summary JSONB,
  ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ;

COMMENT ON COLUMN public.client_messages.applied_summary IS
  'Что куратор внёс в день по этому сообщению: {items:[{name,grams,kcal}], total:{kcal,p,f,c}, meal_label, meal_time, day_id}.';
COMMENT ON COLUMN public.client_messages.seen_at IS
  'Когда куратор открыл тред с этим сообщением. Отличается от read_at: read_at ставится массово, seen_at — курсор просмотра.';

-- Старый CHECK разрешал applied_at только на intent-сообщениях.
ALTER TABLE public.client_messages
  DROP CONSTRAINT IF EXISTS client_messages_check1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.client_messages'::regclass
      AND conname = 'client_messages_applied_by_client_only'
  ) THEN
    ALTER TABLE public.client_messages
      ADD CONSTRAINT client_messages_applied_by_client_only
      CHECK (applied_at IS NULL OR sender_role = 'client');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.client_messages'::regclass
      AND conname = 'client_messages_summary_needs_applied'
  ) THEN
    ALTER TABLE public.client_messages
      ADD CONSTRAINT client_messages_summary_needs_applied
      CHECK (applied_summary IS NULL OR applied_at IS NOT NULL);
  END IF;
END $$;

-- ── Тред отдаёт новые поля ────────────────────────────────────────────────

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
           intent_type, intent_payload, applied_at, applied_meal_id, applied_summary,
           done_at, acked_at, edited_at, attachments, read_at, seen_at, created_at
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
           intent_type, intent_payload, applied_at, applied_meal_id, applied_summary,
           done_at, acked_at, edited_at, attachments, read_at, seen_at, created_at
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

-- ── Куратор отмечает сообщение внесённым ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.apply_message_as_curator(
  p_curator_id UUID,
  p_message_id UUID,
  p_summary JSONB,
  p_applied BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.client_messages%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM public.client_messages
  WHERE id = p_message_id AND curator_id = p_curator_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'message_not_found_or_forbidden');
  END IF;

  -- Внести в день можно только сообщение клиента: своё собственное куратор
  -- в дневник клиента не переносит.
  IF v_row.sender_role <> 'client' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_a_client_message');
  END IF;

  UPDATE public.client_messages
  SET applied_at = CASE WHEN p_applied THEN COALESCE(applied_at, NOW()) ELSE NULL END,
      applied_summary = CASE WHEN p_applied THEN p_summary ELSE NULL END,
      -- Внесённое сообщение считается и обработанным: отдельно нажимать
      -- «Обработать» после разбора куратору незачем.
      done_at = CASE WHEN p_applied THEN COALESCE(done_at, NOW()) ELSE done_at END
  WHERE id = p_message_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'success', true,
    'message_id', v_row.id,
    'applied_at', v_row.applied_at,
    'applied_summary', v_row.applied_summary,
    'done_at', v_row.done_at
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.apply_message_as_curator(UUID, UUID, JSONB, BOOLEAN) IS
  '💬 Messenger: куратор отметил сообщение внесённым в день и приложил состав записи.';

-- ── Открытие треда куратором ставит seen_at ───────────────────────────────

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
    RETURN jsonb_build_object('success', false, 'error', 'curator_does_not_own_client');
  END IF;

  UPDATE public.client_messages
  SET read_at = COALESCE(read_at, NOW()),
      seen_at = COALESCE(seen_at, NOW())
  WHERE client_id = p_client_id
    AND sender_role = 'client'
    AND (read_at IS NULL OR seen_at IS NULL)
    AND (p_up_to_ts IS NULL OR created_at <= p_up_to_ts);

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'updated', v_updated);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_rpc') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.apply_message_as_curator(UUID, UUID, JSONB, BOOLEAN) TO heys_rpc';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_messages_thread_as_client(TEXT, TIMESTAMPTZ, INT) TO heys_rpc';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_messages_thread_as_curator(UUID, UUID, TIMESTAMPTZ, INT) TO heys_rpc';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.mark_messages_read_as_curator(UUID, UUID, TIMESTAMPTZ) TO heys_rpc';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.apply_message_as_curator(UUID, UUID, JSONB, BOOLEAN) FROM PUBLIC;


-- ===== ROLLBACK =====
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.apply_message_as_curator(UUID, UUID, JSONB, BOOLEAN);
-- ALTER TABLE public.client_messages
--   DROP CONSTRAINT IF EXISTS client_messages_summary_needs_applied,
--   DROP CONSTRAINT IF EXISTS client_messages_applied_by_client_only;
-- ALTER TABLE public.client_messages
--   ADD CONSTRAINT client_messages_check1
--   CHECK (applied_at IS NULL OR (sender_role = 'client' AND intent_type IS NOT NULL));
-- ALTER TABLE public.client_messages
--   DROP COLUMN IF EXISTS applied_summary,
--   DROP COLUMN IF EXISTS seen_at;
-- -- thread-функции и mark_messages_read_as_curator вернуть из
-- -- database/2026-05-28_message_attachments.sql и database/2026-05-27_client_messages.sql
-- COMMIT;
