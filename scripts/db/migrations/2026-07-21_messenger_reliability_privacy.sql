-- 2026-07-21: Retry-safe messenger mutations and durable media cleanup.
--
-- Context: an ambiguous HTTP response could duplicate a sent message, toggle
-- mutations were not retry-safe, and hard-delete discarded attachment paths
-- before Object Storage cleanup could be confirmed.
--
-- ROLLBACK (manual, after rolling back web/functions):
-- DROP FUNCTION IF EXISTS public.send_message_as_client_v2(TEXT, TEXT, TEXT, JSONB, JSONB, UUID, TEXT);
-- DROP FUNCTION IF EXISTS public.send_message_as_curator_v2(UUID, UUID, TEXT, JSONB, UUID, TEXT);
-- DROP FUNCTION IF EXISTS public.set_message_done_by_curator(UUID, UUID, BOOLEAN);
-- DROP FUNCTION IF EXISTS public.set_message_acked_as_client(TEXT, UUID, BOOLEAN);
-- DROP TABLE IF EXISTS public.messenger_media_cleanup_queue;
-- DROP INDEX IF EXISTS public.idx_client_messages_request_id;
-- ALTER TABLE public.client_messages DROP COLUMN IF EXISTS request_fingerprint,
--   DROP COLUMN IF EXISTS request_id;
-- Recreate the legacy delete_message_as_client/delete_message_as_curator bodies
-- from database/2026-05-28_message_delete.sql if the queue table is removed.

ALTER TABLE public.client_messages
  ADD COLUMN IF NOT EXISTS request_id UUID,
  ADD COLUMN IF NOT EXISTS request_fingerprint TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_messages_request_id
  ON public.client_messages(client_id, sender_role, request_id)
  WHERE request_id IS NOT NULL;

COMMENT ON COLUMN public.client_messages.request_id IS
  'Stable idempotency key for one user send action; reused only by transport retries.';
COMMENT ON COLUMN public.client_messages.request_fingerprint IS
  'Server-computed SHA-256 of the canonical message payload for conflict detection.';

CREATE TABLE IF NOT EXISTS public.messenger_media_cleanup_queue (
  object_path TEXT PRIMARY KEY,
  client_id UUID NOT NULL,
  source_message_id UUID,
  reason TEXT NOT NULL DEFAULT 'message_deleted'
    CHECK (reason IN ('message_deleted', 'abandoned_upload')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'retry', 'completed')),
  attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messenger_media_cleanup_ready
  ON public.messenger_media_cleanup_queue(available_at, created_at)
  WHERE status IN ('pending', 'retry');

COMMENT ON TABLE public.messenger_media_cleanup_queue IS
  'Crash-safe, idempotent Object Storage cleanup queue for messenger attachments.';

CREATE OR REPLACE FUNCTION public.send_message_as_client_v2(
  p_session_token TEXT,
  p_body TEXT,
  p_intent_type TEXT,
  p_intent_payload JSONB,
  p_attachments JSONB,
  p_request_id UUID,
  p_request_fingerprint TEXT
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
  v_created_at TIMESTAMPTZ;
  v_existing_fingerprint TEXT;
  v_attachments JSONB := COALESCE(p_attachments, '[]'::jsonb);
  v_body TEXT := NULLIF(TRIM(COALESCE(p_body, '')), '');
  v_fingerprint TEXT := LOWER(COALESCE(p_request_fingerprint, ''));
BEGIN
  IF p_request_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'request_id_required');
  END IF;
  IF jsonb_typeof(v_attachments) IS DISTINCT FROM 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_attachments');
  END IF;
  IF v_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_request_fingerprint');
  END IF;

  v_client_id := public.require_client_id(p_session_token);
  SELECT curator_id INTO v_curator_id FROM public.clients WHERE id = v_client_id;
  IF v_curator_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'client_has_no_curator');
  END IF;
  IF v_body IS NULL AND p_intent_type IS NULL AND jsonb_array_length(v_attachments) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'body_or_intent_or_attachment_required');
  END IF;

  INSERT INTO public.client_messages (
    client_id, curator_id, sender_role, body, intent_type, intent_payload,
    attachments, request_id, request_fingerprint
  ) VALUES (
    v_client_id, v_curator_id, 'client', v_body, p_intent_type,
    p_intent_payload, v_attachments, p_request_id, v_fingerprint
  )
  ON CONFLICT (client_id, sender_role, request_id) WHERE request_id IS NOT NULL
  DO NOTHING
  RETURNING id, created_at INTO v_message_id, v_created_at;

  IF v_message_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true, 'message_id', v_message_id, 'created_at', v_created_at,
      'client_id', v_client_id, 'curator_id', v_curator_id, 'replayed', false
    );
  END IF;

  SELECT id, created_at, request_fingerprint
    INTO v_message_id, v_created_at, v_existing_fingerprint
    FROM public.client_messages
   WHERE client_id = v_client_id
     AND sender_role = 'client'
     AND request_id = p_request_id;

  IF v_message_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'idempotency_state_unavailable');
  END IF;
  IF v_existing_fingerprint IS DISTINCT FROM v_fingerprint THEN
    RETURN jsonb_build_object('success', false, 'error', 'idempotency_conflict');
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'message_id', v_message_id, 'created_at', v_created_at,
    'client_id', v_client_id, 'curator_id', v_curator_id, 'replayed', true
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'message_store_failed');
END;
$$;

CREATE OR REPLACE FUNCTION public.send_message_as_curator_v2(
  p_curator_id UUID,
  p_client_id UUID,
  p_body TEXT,
  p_attachments JSONB,
  p_request_id UUID,
  p_request_fingerprint TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message_id UUID;
  v_created_at TIMESTAMPTZ;
  v_existing_fingerprint TEXT;
  v_attachments JSONB := COALESCE(p_attachments, '[]'::jsonb);
  v_body TEXT := NULLIF(TRIM(COALESCE(p_body, '')), '');
  v_fingerprint TEXT := LOWER(COALESCE(p_request_fingerprint, ''));
BEGIN
  IF p_request_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'request_id_required');
  END IF;
  IF jsonb_typeof(v_attachments) IS DISTINCT FROM 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_attachments');
  END IF;
  IF v_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_request_fingerprint');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clients WHERE id = p_client_id AND curator_id = p_curator_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'curator_does_not_own_client');
  END IF;
  IF v_body IS NULL AND jsonb_array_length(v_attachments) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'body_or_attachment_required');
  END IF;

  INSERT INTO public.client_messages (
    client_id, curator_id, sender_role, body, attachments,
    request_id, request_fingerprint
  ) VALUES (
    p_client_id, p_curator_id, 'curator', v_body, v_attachments,
    p_request_id, v_fingerprint
  )
  ON CONFLICT (client_id, sender_role, request_id) WHERE request_id IS NOT NULL
  DO NOTHING
  RETURNING id, created_at INTO v_message_id, v_created_at;

  IF v_message_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true, 'message_id', v_message_id, 'created_at', v_created_at,
      'client_id', p_client_id, 'curator_id', p_curator_id, 'replayed', false
    );
  END IF;

  SELECT id, created_at, request_fingerprint
    INTO v_message_id, v_created_at, v_existing_fingerprint
    FROM public.client_messages
   WHERE client_id = p_client_id
     AND sender_role = 'curator'
     AND request_id = p_request_id;

  IF v_message_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'idempotency_state_unavailable');
  END IF;
  IF v_existing_fingerprint IS DISTINCT FROM v_fingerprint THEN
    RETURN jsonb_build_object('success', false, 'error', 'idempotency_conflict');
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'message_id', v_message_id, 'created_at', v_created_at,
    'client_id', p_client_id, 'curator_id', p_curator_id, 'replayed', true
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'message_store_failed');
END;
$$;

CREATE OR REPLACE FUNCTION public.set_message_done_by_curator(
  p_curator_id UUID,
  p_message_id UUID,
  p_done BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_done_at TIMESTAMPTZ;
BEGIN
  UPDATE public.client_messages AS m
     SET done_at = CASE
       WHEN p_done THEN COALESCE(m.done_at, NOW())
       ELSE NULL
     END
   WHERE m.id = p_message_id
     AND m.curator_id = p_curator_id
     AND m.sender_role = 'client'
     AND EXISTS (
       SELECT 1 FROM public.clients c
        WHERE c.id = m.client_id AND c.curator_id = p_curator_id
     )
  RETURNING done_at INTO v_done_at;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'message_not_found_or_forbidden');
  END IF;
  RETURN jsonb_build_object(
    'success', true, 'message_id', p_message_id, 'done_at', v_done_at
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'message_state_update_failed');
END;
$$;

CREATE OR REPLACE FUNCTION public.set_message_acked_as_client(
  p_session_token TEXT,
  p_message_id UUID,
  p_acked BOOLEAN
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
  UPDATE public.client_messages
     SET acked_at = CASE
       WHEN p_acked THEN COALESCE(acked_at, NOW())
       ELSE NULL
     END
   WHERE id = p_message_id
     AND client_id = v_client_id
     AND sender_role = 'curator'
  RETURNING acked_at INTO v_acked_at;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'message_not_found_or_forbidden');
  END IF;
  RETURN jsonb_build_object(
    'success', true, 'message_id', p_message_id, 'acked_at', v_acked_at
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'message_state_update_failed');
END;
$$;

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
  v_attachments JSONB;
  v_deleted INT := 0;
  v_queued INT := 0;
BEGIN
  v_client_id := public.require_client_id(p_session_token);
  SELECT attachments INTO v_attachments
    FROM public.client_messages
   WHERE id = p_message_id
     AND client_id = v_client_id
     AND sender_role = 'client'
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'message_id', p_message_id, 'deleted', 0, 'cleanup_queued', 0);
  END IF;

  INSERT INTO public.messenger_media_cleanup_queue (
    object_path, client_id, source_message_id, reason, status, available_at,
    claimed_at, completed_at, last_error_code, updated_at
  )
  SELECT attachment->>'path', v_client_id, p_message_id, 'message_deleted',
         'pending', NOW(), NULL, NULL, NULL, NOW()
   FROM jsonb_array_elements(COALESCE(v_attachments, '[]'::jsonb)) attachment
   WHERE (
     COALESCE(attachment->>'path', '') LIKE v_client_id::text || '/____-__-__/msg-%/%'
     OR COALESCE(attachment->>'path', '') LIKE v_client_id::text || '/____-__-__/voice/msg-%/%'
   )
     AND NOT EXISTS (
       SELECT 1
         FROM public.client_messages other
         CROSS JOIN LATERAL jsonb_array_elements(COALESCE(other.attachments, '[]'::jsonb)) other_attachment
        WHERE other.id <> p_message_id
          AND other_attachment->>'path' = attachment->>'path'
     )
  ON CONFLICT (object_path) DO UPDATE
    SET status = 'pending', available_at = NOW(), claimed_at = NULL,
        completed_at = NULL, last_error_code = NULL, updated_at = NOW();
  GET DIAGNOSTICS v_queued = ROW_COUNT;

  DELETE FROM public.client_messages WHERE id = p_message_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN jsonb_build_object(
    'success', true, 'message_id', p_message_id,
    'deleted', v_deleted, 'cleanup_queued', v_queued
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'message_delete_failed');
END;
$$;

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
  v_client_id UUID;
  v_attachments JSONB;
  v_deleted INT := 0;
  v_queued INT := 0;
BEGIN
  SELECT client_id, attachments INTO v_client_id, v_attachments
    FROM public.client_messages
   WHERE id = p_message_id
     AND curator_id = p_curator_id
     AND sender_role = 'curator'
     AND EXISTS (
       SELECT 1 FROM public.clients c
        WHERE c.id = client_messages.client_id AND c.curator_id = p_curator_id
     )
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'message_id', p_message_id, 'deleted', 0, 'cleanup_queued', 0);
  END IF;

  INSERT INTO public.messenger_media_cleanup_queue (
    object_path, client_id, source_message_id, reason, status, available_at,
    claimed_at, completed_at, last_error_code, updated_at
  )
  SELECT attachment->>'path', v_client_id, p_message_id, 'message_deleted',
         'pending', NOW(), NULL, NULL, NULL, NOW()
   FROM jsonb_array_elements(COALESCE(v_attachments, '[]'::jsonb)) attachment
   WHERE (
     COALESCE(attachment->>'path', '') LIKE v_client_id::text || '/____-__-__/msg-%/%'
     OR COALESCE(attachment->>'path', '') LIKE v_client_id::text || '/____-__-__/voice/msg-%/%'
   )
     AND NOT EXISTS (
       SELECT 1
         FROM public.client_messages other
         CROSS JOIN LATERAL jsonb_array_elements(COALESCE(other.attachments, '[]'::jsonb)) other_attachment
        WHERE other.id <> p_message_id
          AND other_attachment->>'path' = attachment->>'path'
     )
  ON CONFLICT (object_path) DO UPDATE
    SET status = 'pending', available_at = NOW(), claimed_at = NULL,
        completed_at = NULL, last_error_code = NULL, updated_at = NOW();
  GET DIAGNOSTICS v_queued = ROW_COUNT;

  DELETE FROM public.client_messages WHERE id = p_message_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN jsonb_build_object(
    'success', true, 'message_id', p_message_id,
    'deleted', v_deleted, 'cleanup_queued', v_queued
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'message_delete_failed');
END;
$$;

REVOKE ALL ON FUNCTION public.send_message_as_client_v2(TEXT, TEXT, TEXT, JSONB, JSONB, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_message_as_curator_v2(UUID, UUID, TEXT, JSONB, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_message_done_by_curator(UUID, UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_message_acked_as_client(TEXT, UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_message_as_client(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_message_as_curator(UUID, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.send_message_as_client_v2(TEXT, TEXT, TEXT, JSONB, JSONB, UUID, TEXT) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.send_message_as_curator_v2(UUID, UUID, TEXT, JSONB, UUID, TEXT) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.set_message_done_by_curator(UUID, UUID, BOOLEAN) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.set_message_acked_as_client(TEXT, UUID, BOOLEAN) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.delete_message_as_client(TEXT, UUID) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.delete_message_as_curator(UUID, UUID) TO heys_rpc;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messenger_media_cleanup_queue TO heys_rpc, heys_admin;
