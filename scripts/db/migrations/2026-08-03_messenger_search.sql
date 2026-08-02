-- 2026-08-03: поиск по переписке мессенджера
--
-- Context: история грузится страницами по 50, единственная навигация —
-- «Показать ранее». Найти прошлый вторник нечем. Поиск ищет по тексту
-- сообщения и по расшифровке голосового: голосовые иначе неотличимы друг
-- от друга.
--
-- Поиск сделан отдельными SECURITY DEFINER функциями, а не параметром q у
-- существующего thread: у треда своя пагинация по времени, и смешивать её с
-- релевантностью значило бы сломать «Показать ранее».
--
-- Apply: bash scripts/db/psql.sh -f scripts/db/migrations/2026-08-03_messenger_search.sql
-- Rollback: см. ===== ROLLBACK ===== в конце файла.

-- ===== FORWARD =====

-- Ускоряет ILIKE по тексту в пределах одного треда. Полнотекстовый индекс
-- здесь избыточен: сообщения короткие, а поиск всегда ограничен client_id.
CREATE INDEX IF NOT EXISTS idx_messages_client_body
  ON public.client_messages(client_id, created_at DESC)
  WHERE body IS NOT NULL;

CREATE OR REPLACE FUNCTION public.search_messages_in_thread(
  p_client_id UUID,
  p_query TEXT,
  p_type TEXT,
  p_before_ts TIMESTAMPTZ,
  p_limit INT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT;
  v_pattern TEXT;
  v_messages JSONB;
BEGIN
  v_limit := LEAST(COALESCE(p_limit, 30), 100);
  -- Экранируем спецсимволы LIKE: иначе «100%» найдёт вообще всё.
  v_pattern := '%' || replace(replace(replace(COALESCE(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  SELECT COALESCE(jsonb_agg(row_to_json(m) ORDER BY m.created_at DESC), '[]'::jsonb)
  INTO v_messages
  FROM (
    SELECT id, client_id, curator_id, sender_role, body,
           intent_type, intent_payload, applied_at, applied_summary,
           done_at, acked_at, edited_at, attachments, created_at
    FROM public.client_messages
    WHERE client_id = p_client_id
      AND (p_before_ts IS NULL OR created_at < p_before_ts)
      AND (
        body ILIKE v_pattern
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(attachments, '[]'::jsonb)) AS att
          WHERE att->>'transcript_text' ILIKE v_pattern
        )
      )
      AND (
        p_type IS NULL
        OR (p_type = 'applied' AND applied_at IS NOT NULL)
        OR (p_type = 'image' AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(COALESCE(attachments, '[]'::jsonb)) AS att
              WHERE COALESCE(att->>'type', att->>'media_type') = 'image'))
        OR (p_type = 'audio' AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(COALESCE(attachments, '[]'::jsonb)) AS att
              WHERE COALESCE(att->>'type', att->>'media_type') = 'audio'))
      )
    ORDER BY created_at DESC
    LIMIT v_limit
  ) m;

  RETURN jsonb_build_object('success', true, 'messages', v_messages);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.search_messages_as_client(
  p_session_token TEXT,
  p_query TEXT,
  p_type TEXT,
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
BEGIN
  v_client_id := public.require_client_id(p_session_token);
  RETURN public.search_messages_in_thread(v_client_id, p_query, p_type, p_before_ts, p_limit);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.search_messages_as_curator(
  p_curator_id UUID,
  p_client_id UUID,
  p_query TEXT,
  p_type TEXT,
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
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = p_client_id AND curator_id = p_curator_id
  ) INTO v_owns;

  IF NOT v_owns THEN
    RETURN jsonb_build_object('success', false, 'error', 'curator_does_not_own_client');
  END IF;

  RETURN public.search_messages_in_thread(p_client_id, p_query, p_type, p_before_ts, p_limit);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.search_messages_as_client(TEXT, TEXT, TEXT, TIMESTAMPTZ, INT) IS
  '💬 Messenger: поиск клиента по своей переписке, включая расшифровки голосовых.';
COMMENT ON FUNCTION public.search_messages_as_curator(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, INT) IS
  '💬 Messenger: поиск куратора по переписке своего клиента.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_rpc') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.search_messages_as_client(TEXT, TEXT, TEXT, TIMESTAMPTZ, INT) TO heys_rpc';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.search_messages_as_curator(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, INT) TO heys_rpc';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.search_messages_in_thread(UUID, TEXT, TEXT, TIMESTAMPTZ, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_messages_as_client(TEXT, TEXT, TEXT, TIMESTAMPTZ, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_messages_as_curator(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, INT) FROM PUBLIC;


-- ===== ROLLBACK =====
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.search_messages_as_curator(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, INT);
-- DROP FUNCTION IF EXISTS public.search_messages_as_client(TEXT, TEXT, TEXT, TIMESTAMPTZ, INT);
-- DROP FUNCTION IF EXISTS public.search_messages_in_thread(UUID, TEXT, TEXT, TIMESTAMPTZ, INT);
-- DROP INDEX IF EXISTS public.idx_messages_client_body;
-- COMMIT;
