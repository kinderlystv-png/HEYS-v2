-- ═══════════════════════════════════════════════════════════════════════════
-- 🔔 HEYS Messenger: для куратора «непрочитанные» = «не обработанные» (done_at IS NULL)
-- ═══════════════════════════════════════════════════════════════════════════
-- Дата: 2026-05-28
--
-- Бизнес-логика: куратор может зайти в тред и просто закрыть. read_at пометит
-- сообщение «прочитанным», но реально куратор может ничего не сделать (не
-- добавить приём пищи в день, не уточнить и т.п.). Чтобы это не терялось —
-- считаем «непрочитанным» всё что не помечено ✓ «обработано» (done_at IS NULL).
--
-- Клиент остаётся на read_at (его флоу другой: ему важно знать пришёл ли
-- ответ).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE INDEX IF NOT EXISTS idx_messages_curator_pending
  ON public.client_messages(curator_id, client_id, created_at DESC)
  WHERE done_at IS NULL AND sender_role = 'client';

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
  WITH client_threads AS (
    SELECT
      c.id AS client_id,
      COUNT(m.id) FILTER (
        WHERE m.done_at IS NULL AND m.sender_role = 'client'
      ) AS unread_count,
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
  SELECT COALESCE(
    jsonb_agg(row_to_json(ct) ORDER BY ct.last_message_at DESC NULLS LAST),
    '[]'::jsonb
  )
  INTO v_result
  FROM client_threads ct;

  RETURN jsonb_build_object('success', true, 'inbox', v_result);

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.get_curator_unread_counts(UUID) IS
  '🔔 Messenger curator inbox: unread_count = client-сообщения БЕЗ done_at '
  '(не обработанные курaтором). Клиент в этой функции не считает, у него своя.';

COMMIT;

DO $$
DECLARE
  v_idx INT;
BEGIN
  SELECT COUNT(*) INTO v_idx FROM pg_indexes
  WHERE schemaname = 'public' AND indexname = 'idx_messages_curator_pending';
  IF v_idx <> 1 THEN
    RAISE EXCEPTION 'Pending index not created';
  END IF;
  RAISE NOTICE '✅ Migration verified: get_curator_unread_counts updated + pending index';
END $$;
