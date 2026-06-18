-- ============================================================================
-- HEYS Messenger: SpeechKit transcription pilot
-- Date: 2026-06-18
-- ============================================================================
-- Adds optional speech_transcription consent, curator-side consent proof storage,
-- and async STT job tracking for messenger voice attachments.
-- Idempotent: safe to run repeatedly.
-- ============================================================================

BEGIN;

-- 1) Optional client consent type.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consents_consent_type_check') THEN
    ALTER TABLE public.consents DROP CONSTRAINT consents_consent_type_check;
  END IF;

  ALTER TABLE public.consents
    ADD CONSTRAINT consents_consent_type_check
    CHECK (consent_type IN (
      'user_agreement',
      'personal_data',
      'health_data',
      'marketing',
      'payment_oferta',
      'push_notifications',
      'curator_access',
      'speech_transcription'
    ));
END $$;

CREATE OR REPLACE FUNCTION public.log_consents(
    p_client_id UUID,
    p_consents JSONB,
    p_ip TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_consent JSONB;
    v_result JSONB := '[]'::jsonb;
    v_type TEXT;
    v_granted BOOLEAN;
    v_version TEXT;
    v_signature TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM clients WHERE id = p_client_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Client not found');
    END IF;

    PERFORM set_config('app.consents_writer', 'authorized', true);

    FOR v_consent IN SELECT * FROM jsonb_array_elements(p_consents)
    LOOP
        v_type := v_consent->>'type';
        v_granted := COALESCE((v_consent->>'granted')::boolean, true);
        v_version := COALESCE(v_consent->>'version', '1.0');
        v_signature := COALESCE(v_consent->>'signature_method', 'checkbox');

        IF v_type NOT IN ('user_agreement', 'personal_data', 'health_data',
                          'marketing', 'payment_oferta',
                          'push_notifications', 'curator_access',
                          'speech_transcription') THEN
            CONTINUE;
        END IF;

        UPDATE public.consents
        SET granted = false,
            is_active = false,
            revoked_at = NOW()
        WHERE client_id = p_client_id
          AND consent_type = v_type
          AND granted = true
          AND revoked_at IS NULL;

        INSERT INTO public.consents (
            client_id, consent_type, document_version, signature_method,
            granted, is_active, ip_address, user_agent, created_at
        ) VALUES (
            p_client_id, v_type, v_version, v_signature,
            v_granted, v_granted,
            CASE WHEN p_ip IS NOT NULL AND p_ip <> '' THEN p_ip::inet ELSE NULL END,
            p_user_agent, NOW()
        );

        v_result := v_result || jsonb_build_object(
            'type', v_type, 'granted', v_granted, 'logged', true);
    END LOOP;

    RETURN jsonb_build_object('success', true, 'consents', v_result, 'client_id', p_client_id);
END;
$$;

COMMENT ON FUNCTION public.log_consents(UUID, JSONB, TEXT, TEXT) IS
  'Логирование согласий (v1.3 2026-06-18: + speech_transcription optional consent).';

-- 2) Curator consent proof storage.
CREATE TABLE IF NOT EXISTS public.curator_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curator_id UUID NOT NULL REFERENCES public.curators(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL,
  document_version TEXT NOT NULL DEFAULT '1.0',
  granted BOOLEAN NOT NULL DEFAULT true,
  ip_address INET,
  user_agent TEXT,
  consent_method TEXT DEFAULT 'checkbox',
  signature_method TEXT DEFAULT 'checkbox',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  CHECK (consent_type IN ('speech_transcription'))
);

CREATE INDEX IF NOT EXISTS curator_consents_curator_type_idx
  ON public.curator_consents(curator_id, consent_type, created_at DESC);

COMMENT ON TABLE public.curator_consents IS
  'Optional curator consent proof records, currently for messenger speech transcription pilot.';

-- 3) Async transcription jobs.
CREATE TABLE IF NOT EXISTS public.message_transcription_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.client_messages(id) ON DELETE CASCADE,
  attachment_path TEXT NOT NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('client', 'curator')),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  curator_id UUID REFERENCES public.curators(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'processing', 'ready', 'failed', 'unsupported_format', 'budget_capped', 'consent_required')
  ),
  operation_id TEXT,
  duration_ms INTEGER,
  mime TEXT,
  billable_seconds INTEGER NOT NULL DEFAULT 0,
  estimated_cost_rub NUMERIC(10, 4) NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE (message_id, attachment_path)
);

ALTER TABLE public.message_transcription_jobs
  ALTER COLUMN curator_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS message_transcription_jobs_status_idx
  ON public.message_transcription_jobs(status, updated_at);
CREATE INDEX IF NOT EXISTS message_transcription_jobs_month_cost_idx
  ON public.message_transcription_jobs(created_at, estimated_cost_rub)
  WHERE status IN ('queued', 'processing', 'ready');

COMMENT ON TABLE public.message_transcription_jobs IS
  'Pilot async SpeechKit STT jobs for messenger voice attachments.';

CREATE OR REPLACE FUNCTION public.set_message_attachment_transcript(
  p_message_id UUID,
  p_attachment_path TEXT,
  p_status TEXT,
  p_text TEXT DEFAULT NULL,
  p_provider TEXT DEFAULT 'yandex_speechkit',
  p_error TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attachments JSONB;
  v_updated_attachments JSONB;
  v_attachment_found BOOLEAN := false;
BEGIN
  IF p_status NOT IN ('none', 'queued', 'processing', 'ready', 'failed',
                     'unsupported_format', 'budget_capped', 'consent_required') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_transcript_status');
  END IF;

  SELECT m.attachments
    INTO v_attachments
    FROM public.client_messages m
   WHERE m.id = p_message_id
   FOR UPDATE;

  IF v_attachments IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'message_or_attachment_not_found');
  END IF;

  SELECT jsonb_agg(
    CASE
      WHEN elem->>'path' = p_attachment_path THEN
        elem
          || jsonb_build_object('transcript_status', p_status)
          || CASE WHEN p_provider IS NOT NULL THEN jsonb_build_object('transcript_provider', p_provider) ELSE '{}'::jsonb END
          || CASE WHEN p_text IS NOT NULL THEN jsonb_build_object('transcript_text', p_text) ELSE '{}'::jsonb END
          || CASE WHEN p_error IS NOT NULL THEN jsonb_build_object('transcript_error', p_error) ELSE '{}'::jsonb END
          || CASE WHEN p_status IN ('ready', 'failed') THEN jsonb_build_object('transcript_created_at', NOW()) ELSE '{}'::jsonb END
      ELSE elem
    END
    ORDER BY ord
  ),
  COALESCE(bool_or(elem->>'path' = p_attachment_path), false)
  INTO v_updated_attachments, v_attachment_found
  FROM jsonb_array_elements(v_attachments) WITH ORDINALITY AS a(elem, ord);

  IF v_updated_attachments IS NULL OR NOT v_attachment_found THEN
    RETURN jsonb_build_object('success', false, 'error', 'message_or_attachment_not_found');
  END IF;

  UPDATE public.client_messages
     SET attachments = v_updated_attachments
   WHERE id = p_message_id;

  RETURN jsonb_build_object('success', true, 'message_id', p_message_id, 'status', p_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_message_attachment_transcript(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO heys_rpc;

CREATE OR REPLACE FUNCTION public.claim_message_transcription_jobs(
  p_limit INT DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jobs JSONB;
BEGIN
  WITH picked AS (
    SELECT id
      FROM public.message_transcription_jobs
     WHERE status = 'queued'
     ORDER BY created_at ASC
     LIMIT LEAST(COALESCE(p_limit, 5), 20)
     FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.message_transcription_jobs j
       SET status = 'processing',
           attempts = attempts + 1,
           started_at = COALESCE(started_at, NOW()),
           updated_at = NOW()
      FROM picked
     WHERE j.id = picked.id
     RETURNING j.*
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(updated.*)), '[]'::jsonb)
    INTO v_jobs
    FROM updated;

  RETURN jsonb_build_object('success', true, 'jobs', v_jobs);
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_message_transcription_jobs(INT) TO heys_rpc;

COMMIT;
