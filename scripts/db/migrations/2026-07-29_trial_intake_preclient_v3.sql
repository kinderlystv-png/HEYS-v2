-- HEYS trial intake v3: questionnaire before client account creation.
-- Additive forward migration. Legacy client-backed trial_intakes remain valid.

CREATE TABLE IF NOT EXISTS public.trial_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL UNIQUE REFERENCES public.leads(id) ON DELETE RESTRICT,
  curator_id UUID NOT NULL,
  client_id UUID UNIQUE REFERENCES public.clients(id) ON DELETE SET NULL,
  schema_version TEXT NOT NULL DEFAULT '1.1',
  status TEXT NOT NULL DEFAULT 'invite_prepared' CHECK (status IN (
    'invite_prepared', 'invite_sent', 'in_progress', 'completed',
    'needs_clarification', 'approved_waiting_slot', 'rejected', 'promoted', 'expired'
  )),
  current_step SMALLINT NOT NULL DEFAULT 0 CHECK (current_step BETWEEN 0 AND 5),
  pin_hash TEXT NOT NULL,
  failed_attempts SMALLINT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  answers_encrypted BYTEA,
  answers_key_version SMALLINT,
  review_note_encrypted BYTEA,
  clarification_request_encrypted BYTEA,
  clarification_sections TEXT[],
  decision_reason TEXT CHECK (decision_reason IS NULL OR decision_reason IN (
    'out_of_scope', 'safety', 'unrealistic_expectations',
    'format_mismatch', 'candidate_withdrew'
  )),
  invite_prepared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invite_sent_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  retention_delete_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trial_candidates_curator_status_idx
  ON public.trial_candidates(curator_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS trial_candidates_retention_idx
  ON public.trial_candidates(retention_delete_at)
  WHERE retention_delete_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.trial_candidate_sessions (
  token_hash BYTEA PRIMARY KEY,
  candidate_id UUID NOT NULL REFERENCES public.trial_candidates(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS trial_candidate_sessions_candidate_idx
  ON public.trial_candidate_sessions(candidate_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS public.trial_candidate_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.trial_candidates(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('personal_data', 'health_data')),
  document_version TEXT NOT NULL,
  document_sha256 TEXT NOT NULL CHECK (document_sha256 ~ '^[0-9a-f]{64}$'),
  granted BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  signature_method TEXT NOT NULL DEFAULT 'checkbox',
  ip_address INET,
  user_agent TEXT,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS trial_candidate_consents_active_idx
  ON public.trial_candidate_consents(candidate_id, consent_type)
  WHERE is_active AND granted AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.trial_candidate_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.trial_candidates(id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('candidate', 'curator', 'system')),
  actor_id UUID,
  action TEXT NOT NULL,
  is_health BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.trial_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trial_candidate_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trial_candidate_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trial_candidate_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.trial_candidates FROM PUBLIC;
REVOKE ALL ON TABLE public.trial_candidate_sessions FROM PUBLIC;
REVOKE ALL ON TABLE public.trial_candidate_consents FROM PUBLIC;
REVOKE ALL ON TABLE public.trial_candidate_audit_events FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.require_trial_candidate_id(p_candidate_session_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_candidate_id UUID;
BEGIN
  SELECT s.candidate_id INTO v_candidate_id
  FROM public.trial_candidate_sessions s
  JOIN public.trial_candidates c ON c.id = s.candidate_id
  WHERE s.token_hash = digest(p_candidate_session_token, 'sha256')
    AND s.expires_at > NOW() AND s.revoked_at IS NULL
    AND c.status IN ('invite_sent', 'in_progress', 'completed', 'needs_clarification');
  IF v_candidate_id IS NULL THEN RAISE EXCEPTION 'invalid_candidate_session'; END IF;
  UPDATE public.trial_candidate_sessions SET last_seen_at = NOW()
  WHERE token_hash = digest(p_candidate_session_token, 'sha256');
  RETURN v_candidate_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_prepare_trial_candidate_from_lead(
  p_lead_id UUID, p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_lead RECORD; v_candidate RECORD; v_pin TEXT;
BEGIN
  IF p_curator_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'curator_id_required');
  END IF;
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'lead_not_found'); END IF;
  IF v_lead.status NOT IN ('new', 'contacted') OR v_lead.consent_accepted_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'fresh_application_required');
  END IF;
  IF v_lead.curator_id IS NOT NULL AND v_lead.curator_id IS DISTINCT FROM p_curator_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.clients c
    WHERE (c.phone = regexp_replace(v_lead.phone, '[^0-9]', '', 'g')
       OR c.phone_normalized = regexp_replace(v_lead.phone, '[^0-9+]', '', 'g'))
      AND c.subscription_status IN ('trial', 'trial_pending', 'active')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'phone_already_has_active');
  END IF;

  SELECT * INTO v_candidate FROM public.trial_candidates WHERE lead_id = p_lead_id FOR UPDATE;
  IF FOUND AND v_candidate.status NOT IN ('rejected', 'expired') THEN
    RETURN jsonb_build_object('success', false, 'error', 'candidate_already_exists',
      'candidate_id', v_candidate.id, 'intake_status', v_candidate.status);
  END IF;

  v_pin := LPAD((floor(random() * 9000)::INT + 1000)::TEXT, 4, '0');
  INSERT INTO public.trial_candidates(lead_id, curator_id, pin_hash)
  VALUES (p_lead_id, p_curator_id, crypt(v_pin, gen_salt('bf', 12)))
  ON CONFLICT (lead_id) DO UPDATE SET
    curator_id = EXCLUDED.curator_id, client_id = NULL,
    status = 'invite_prepared', current_step = 0, pin_hash = EXCLUDED.pin_hash,
    failed_attempts = 0, locked_until = NULL, answers_encrypted = NULL,
    review_note_encrypted = NULL, clarification_request_encrypted = NULL,
    clarification_sections = NULL, decision_reason = NULL,
    invite_prepared_at = NOW(), invite_sent_at = NULL, started_at = NULL,
    completed_at = NULL, reviewed_at = NULL, retention_delete_at = NULL, updated_at = NOW()
  RETURNING * INTO v_candidate;

  UPDATE public.leads SET status = 'contacted', curator_id = p_curator_id,
    contacted_at = COALESCE(contacted_at, NOW()), updated_at = NOW()
  WHERE id = p_lead_id;
  INSERT INTO public.trial_candidate_audit_events(candidate_id, actor_type, actor_id, action)
  VALUES (v_candidate.id, 'curator', p_curator_id, 'prepare_invite');
  RETURN jsonb_build_object('success', true, 'candidate_id', v_candidate.id,
    'pin', v_pin, 'intake_status', 'invite_prepared',
    'intake_url', 'https://app.heyslab.ru/?intake=1');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_mark_trial_candidate_invite_sent(
  p_candidate_id UUID, p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_sent_at TIMESTAMPTZ;
BEGIN
  UPDATE public.trial_candidates SET status = 'invite_sent',
    invite_sent_at = COALESCE(invite_sent_at, NOW()), updated_at = NOW()
  WHERE id = p_candidate_id AND curator_id = p_curator_id
    AND status IN ('invite_prepared', 'invite_sent')
  RETURNING invite_sent_at INTO v_sent_at;
  IF v_sent_at IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'invite_not_prepared'); END IF;
  INSERT INTO public.trial_candidate_audit_events(candidate_id, actor_type, actor_id, action)
  VALUES (p_candidate_id, 'curator', p_curator_id, 'mark_invite_sent');
  RETURN jsonb_build_object('success', true, 'status', 'invite_sent', 'sent_at', v_sent_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_regenerate_trial_candidate_pin(
  p_candidate_id UUID, p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_pin TEXT; v_updated_id UUID;
BEGIN
  v_pin := LPAD((floor(random() * 9000)::INT + 1000)::TEXT, 4, '0');
  UPDATE public.trial_candidates SET pin_hash = crypt(v_pin, gen_salt('bf', 12)),
    status = 'invite_prepared', failed_attempts = 0, locked_until = NULL,
    invite_prepared_at = NOW(), invite_sent_at = NULL, updated_at = NOW()
  WHERE id = p_candidate_id AND curator_id = p_curator_id
    AND status IN ('invite_prepared', 'invite_sent')
  RETURNING id INTO v_updated_id;
  IF v_updated_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invite_regeneration_not_allowed');
  END IF;
  UPDATE public.trial_candidate_sessions SET revoked_at = COALESCE(revoked_at, NOW())
  WHERE candidate_id = v_updated_id AND revoked_at IS NULL;
  INSERT INTO public.trial_candidate_audit_events(candidate_id, actor_type, actor_id, action)
  VALUES (v_updated_id, 'curator', p_curator_id, 'regenerate_invite_pin');
  RETURN jsonb_build_object('success', true, 'candidate_id', v_updated_id,
    'pin', v_pin, 'intake_status', 'invite_prepared',
    'intake_url', 'https://app.heyslab.ru/?intake=1');
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_trial_candidate_pin(p_phone TEXT, p_pin TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_candidate RECORD; v_token TEXT;
BEGIN
  SELECT c.* INTO v_candidate
  FROM public.trial_candidates c JOIN public.leads l ON l.id = c.lead_id
  WHERE regexp_replace(l.phone, '[^0-9]', '', 'g') = regexp_replace(p_phone, '[^0-9]', '', 'g')
    AND c.status IN ('invite_sent', 'in_progress', 'completed', 'needs_clarification')
  ORDER BY c.created_at DESC LIMIT 1 FOR UPDATE OF c;
  IF NOT FOUND OR (v_candidate.locked_until IS NOT NULL AND v_candidate.locked_until > NOW())
     OR crypt(p_pin, v_candidate.pin_hash) <> v_candidate.pin_hash THEN
    IF FOUND THEN
      UPDATE public.trial_candidates SET failed_attempts = failed_attempts + 1,
        locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE locked_until END
      WHERE id = v_candidate.id;
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'invalid_credentials');
  END IF;
  v_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.trial_candidate_sessions(token_hash, candidate_id, expires_at)
  VALUES (digest(v_token, 'sha256'), v_candidate.id, NOW() + INTERVAL '7 days');
  UPDATE public.trial_candidates SET failed_attempts = 0, locked_until = NULL WHERE id = v_candidate.id;
  INSERT INTO public.trial_candidate_audit_events(candidate_id, actor_type, action)
  VALUES (v_candidate.id, 'candidate', 'login');
  RETURN jsonb_build_object('success', true, 'candidate_session_token', v_token,
    'candidate_id', v_candidate.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_trial_candidate_health_consent_by_candidate_session(
  p_candidate_session_token TEXT, p_document_version TEXT, p_ip TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_candidate_id UUID; v_hash TEXT; v_ip INET;
BEGIN
  v_candidate_id := public.require_trial_candidate_id(p_candidate_session_token);
  SELECT document_sha256 INTO v_hash FROM public.legal_consent_registry
  WHERE consent_type = 'health_data' AND document_version = p_document_version AND status = 'active';
  IF v_hash IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'consent_version_not_allowed'); END IF;
  BEGIN
    v_ip := NULLIF(p_ip, '')::inet;
  EXCEPTION WHEN invalid_text_representation THEN
    v_ip := NULL;
  END;
  UPDATE public.trial_candidate_consents SET is_active = FALSE, revoked_at = NOW()
  WHERE candidate_id = v_candidate_id AND consent_type = 'health_data' AND is_active;
  INSERT INTO public.trial_candidate_consents(candidate_id, consent_type, document_version,
    document_sha256, signature_method, ip_address, user_agent)
  VALUES (v_candidate_id, 'health_data', p_document_version, v_hash, 'checkbox',
    v_ip, p_user_agent);
  INSERT INTO public.trial_candidate_audit_events(candidate_id, actor_type, action, is_health)
  VALUES (v_candidate_id, 'candidate', 'accept_health_consent', TRUE);
  RETURN jsonb_build_object('success', true, 'document_version', p_document_version,
    'document_sha256', v_hash);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_trial_candidate_intake_by_candidate_session(
  p_candidate_session_token TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id UUID; v_row public.trial_candidates%ROWTYPE; v_answers JSONB; v_clarification JSONB;
BEGIN
  v_id := public.require_trial_candidate_id(p_candidate_session_token);
  SELECT * INTO v_row FROM public.trial_candidates WHERE id = v_id;
  v_answers := CASE WHEN v_row.answers_encrypted IS NULL THEN '{}'::jsonb
    ELSE public.decrypt_health_data(v_row.answers_encrypted) END;
  v_clarification := CASE WHEN v_row.clarification_request_encrypted IS NULL THEN NULL
    ELSE public.decrypt_health_data(v_row.clarification_request_encrypted) END;
  RETURN jsonb_build_object('success', true, 'intake', jsonb_build_object(
    'candidate_id', v_id, 'schema_version', v_row.schema_version, 'status', v_row.status,
    'current_step', v_row.current_step, 'answers', v_answers,
    'clarification_request', CASE WHEN v_clarification IS NULL THEN NULL ELSE v_clarification->>'text' END,
    'clarification_sections', COALESCE(to_jsonb(v_row.clarification_sections), '[]'::jsonb),
    'updated_at', v_row.updated_at));
END;
$$;

CREATE OR REPLACE FUNCTION public.save_trial_candidate_intake_by_candidate_session(
  p_candidate_session_token TEXT, p_answers JSONB, p_current_step SMALLINT,
  p_complete BOOLEAN DEFAULT FALSE, p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id UUID; v_status TEXT; v_updated TIMESTAMPTZ; v_validation TEXT;
BEGIN
  v_id := public.require_trial_candidate_id(p_candidate_session_token);
  IF NOT EXISTS (SELECT 1 FROM public.trial_candidate_consents
    WHERE candidate_id = v_id AND consent_type = 'health_data' AND granted AND is_active AND revoked_at IS NULL)
  THEN RETURN jsonb_build_object('success', false, 'error', 'health_consent_required'); END IF;
  v_validation := public.validate_trial_intake_answers_v2(p_answers, p_complete);
  IF v_validation IS NOT NULL THEN RETURN jsonb_build_object('success', false, 'error', v_validation); END IF;
  SELECT status, updated_at INTO v_status, v_updated FROM public.trial_candidates WHERE id = v_id FOR UPDATE;
  IF p_expected_updated_at IS NOT NULL AND v_updated IS DISTINCT FROM p_expected_updated_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'stale_draft', 'updated_at', v_updated);
  END IF;
  IF v_status NOT IN ('invite_sent', 'in_progress', 'needs_clarification') THEN
    RETURN jsonb_build_object('success', false, 'error', 'intake_locked');
  END IF;
  UPDATE public.trial_candidates SET answers_encrypted = public.encrypt_health_data(p_answers),
    schema_version = p_answers #>> '{meta,schema_version}', current_step = p_current_step,
    status = CASE WHEN p_complete THEN 'completed' ELSE 'in_progress' END,
    started_at = COALESCE(started_at, NOW()), completed_at = CASE WHEN p_complete THEN NOW() ELSE completed_at END,
    clarification_request_encrypted = CASE WHEN p_complete THEN NULL ELSE clarification_request_encrypted END,
    clarification_sections = CASE WHEN p_complete THEN NULL ELSE clarification_sections END,
    updated_at = NOW() WHERE id = v_id RETURNING updated_at INTO v_updated;
  INSERT INTO public.trial_candidate_audit_events(candidate_id, actor_type, action, is_health,
    metadata) VALUES (v_id, 'candidate', CASE WHEN p_complete THEN 'submit_intake' ELSE 'save_intake' END,
    TRUE, jsonb_build_object('current_step', p_current_step));
  RETURN jsonb_build_object('success', true,
    'status', CASE WHEN p_complete THEN 'completed' ELSE 'in_progress' END, 'updated_at', v_updated);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_trial_candidate_summaries(p_curator_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object('success', true, 'items', COALESCE(jsonb_agg(jsonb_build_object(
    'candidate_id', c.id, 'lead_id', c.lead_id, 'client_name', l.name,
    'client_phone', l.phone, 'messenger', l.messenger, 'status', c.status,
    'current_step', c.current_step, 'invite_sent_at', c.invite_sent_at,
    'completed_at', c.completed_at, 'reviewed_at', c.reviewed_at,
    'updated_at', c.updated_at, 'decision_reason', c.decision_reason
  ) ORDER BY c.updated_at DESC), '[]'::jsonb))
  FROM public.trial_candidates c
  JOIN public.leads l ON l.id = c.lead_id
  WHERE c.curator_id = p_curator_id;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_trial_candidate(
  p_candidate_id UUID, p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.trial_candidates%ROWTYPE; v_answers JSONB; v_note JSONB; v_clarification JSONB;
BEGIN
  SELECT * INTO v_row FROM public.trial_candidates
  WHERE id = p_candidate_id AND curator_id = p_curator_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'forbidden'); END IF;
  v_answers := CASE WHEN v_row.answers_encrypted IS NULL THEN '{}'::jsonb
    ELSE public.decrypt_health_data(v_row.answers_encrypted) END;
  v_note := CASE WHEN v_row.review_note_encrypted IS NULL THEN NULL
    ELSE public.decrypt_health_data(v_row.review_note_encrypted) END;
  v_clarification := CASE WHEN v_row.clarification_request_encrypted IS NULL THEN NULL
    ELSE public.decrypt_health_data(v_row.clarification_request_encrypted) END;
  INSERT INTO public.trial_candidate_audit_events(candidate_id, actor_type, actor_id, action, is_health)
  VALUES (p_candidate_id, 'curator', p_curator_id, 'read_intake', TRUE);
  RETURN jsonb_build_object('success', true, 'intake', jsonb_build_object(
    'candidate_id', v_row.id, 'status', v_row.status, 'schema_version', v_row.schema_version,
    'current_step', v_row.current_step, 'answers', v_answers,
    'internal_note', CASE WHEN v_note IS NULL THEN NULL ELSE v_note->>'text' END,
    'decision_checklist', CASE WHEN v_note IS NULL THEN NULL ELSE v_note->'checklist' END,
    'clarification_request', CASE WHEN v_clarification IS NULL THEN NULL ELSE v_clarification->>'text' END,
    'clarification_sections', v_row.clarification_sections,
    'decision_reason', v_row.decision_reason,
    'updated_at', v_row.updated_at));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_trial_candidate_v3(
  p_candidate_id UUID, p_action TEXT, p_reason_code TEXT DEFAULT NULL,
  p_internal_note TEXT DEFAULT NULL, p_client_message TEXT DEFAULT NULL,
  p_clarification_sections TEXT[] DEFAULT NULL, p_decision_checklist JSONB DEFAULT NULL,
  p_curator_id UUID DEFAULT NULL, p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_candidate public.trial_candidates%ROWTYPE; v_conversion JSONB; v_client_id UUID; v_pin TEXT;
BEGIN
  SELECT * INTO v_candidate FROM public.trial_candidates
  WHERE id = p_candidate_id AND curator_id = p_curator_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'forbidden'); END IF;
  IF v_candidate.status NOT IN ('completed', 'needs_clarification', 'approved_waiting_slot') THEN
    RETURN jsonb_build_object('success', false, 'error', 'review_not_allowed');
  END IF;
  IF p_expected_updated_at IS NULL OR v_candidate.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'stale_intake', 'updated_at', v_candidate.updated_at);
  END IF;
  IF p_action NOT IN ('needs_clarification', 'approved', 'approved_waiting_slot', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_action');
  END IF;
  IF p_action IN ('approved', 'approved_waiting_slot', 'rejected')
     AND NOT public.validate_trial_decision_checklist_v1(p_decision_checklist) THEN
    RETURN jsonb_build_object('success', false, 'error', 'decision_checklist_required');
  END IF;
  IF p_action = 'needs_clarification' AND (NULLIF(BTRIM(COALESCE(p_client_message, '')), '') IS NULL
     OR COALESCE(array_length(p_clarification_sections, 1), 0) = 0) THEN
    RETURN jsonb_build_object('success', false, 'error', 'clarification_request_required');
  END IF;
  IF p_action = 'rejected' AND (p_reason_code IS NULL OR NULLIF(BTRIM(COALESCE(p_internal_note, '')), '') IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'rejection_reason_required');
  END IF;
  IF p_action = 'rejected' AND p_reason_code NOT IN (
    'out_of_scope', 'safety', 'unrealistic_expectations', 'format_mismatch', 'candidate_withdrew'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_reason_code');
  END IF;

  IF p_action = 'approved' THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_each(p_decision_checklist) AS field(key, value)
      WHERE field.value <> 'true'::jsonb
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'approval_checklist_failed');
    END IF;
    v_conversion := public.admin_convert_lead(v_candidate.lead_id, p_curator_id);
    IF COALESCE((v_conversion->>'success')::boolean, FALSE) IS NOT TRUE THEN RETURN v_conversion; END IF;
    v_client_id := (v_conversion->>'client_id')::uuid;
    v_pin := v_conversion->>'pin';
    UPDATE public.trial_intakes SET schema_version = v_candidate.schema_version,
      status = 'approved', current_step = v_candidate.current_step,
      answers_encrypted = v_candidate.answers_encrypted,
      review_note_encrypted = public.encrypt_health_data(jsonb_build_object(
        'text', NULLIF(BTRIM(COALESCE(p_internal_note, '')), ''), 'checklist', p_decision_checklist)),
      started_at = v_candidate.started_at, completed_at = v_candidate.completed_at,
      reviewed_at = NOW(), updated_at = NOW()
    WHERE client_id = v_client_id;
    -- Candidate health proof authorizes only questionnaire review. It remains
    -- in the candidate ledger and is never promoted into client consents;
    -- the new client accepts the active client documents after first login.
    UPDATE public.trial_candidates SET status = 'promoted', client_id = v_client_id,
      reviewed_at = NOW(), updated_at = NOW() WHERE id = p_candidate_id;
    UPDATE public.trial_candidate_sessions SET revoked_at = COALESCE(revoked_at, NOW())
    WHERE candidate_id = p_candidate_id AND revoked_at IS NULL;
    INSERT INTO public.trial_candidate_audit_events(candidate_id, actor_type, actor_id, action, is_health)
    VALUES (p_candidate_id, 'curator', p_curator_id, 'promote_to_client', TRUE);
    RETURN jsonb_build_object('success', true, 'status', 'promoted', 'client_id', v_client_id,
      'pin', v_pin, 'intake_url', 'https://app.heyslab.ru/');
  END IF;

  UPDATE public.trial_candidates SET status = p_action,
    decision_reason = CASE WHEN p_action = 'rejected' THEN p_reason_code ELSE NULL END,
    review_note_encrypted = public.encrypt_health_data(jsonb_build_object(
      'text', NULLIF(BTRIM(COALESCE(p_internal_note, '')), ''), 'checklist', p_decision_checklist)),
    clarification_request_encrypted = CASE WHEN p_action = 'needs_clarification'
      THEN public.encrypt_health_data(jsonb_build_object('text', p_client_message)) ELSE NULL END,
    clarification_sections = CASE WHEN p_action = 'needs_clarification' THEN p_clarification_sections ELSE NULL END,
    reviewed_at = NOW(), retention_delete_at = CASE WHEN p_action = 'rejected'
      THEN NOW() + INTERVAL '30 days' ELSE NULL END, updated_at = NOW()
  WHERE id = p_candidate_id;
  INSERT INTO public.trial_candidate_audit_events(candidate_id, actor_type, actor_id, action, is_health,
    metadata) VALUES (p_candidate_id, 'curator', p_curator_id, 'review_intake', TRUE,
    jsonb_build_object('action', p_action, 'reason_code', p_reason_code));
  RETURN jsonb_build_object('success', true, 'status', p_action);
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_expired_trial_candidates()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_deleted INTEGER;
BEGIN
  DELETE FROM public.trial_candidates
  WHERE retention_delete_at IS NOT NULL AND retention_delete_at <= NOW()
    AND status IN ('rejected', 'expired');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- Server-side ownership filter: claimed leads are visible only to their curator.
CREATE OR REPLACE FUNCTION public.admin_get_leads(p_status TEXT DEFAULT 'new', p_curator_id UUID DEFAULT NULL)
RETURNS TABLE (id UUID, name TEXT, phone TEXT, messenger TEXT, status TEXT,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, created_at TIMESTAMPTZ,
  contacted_at TIMESTAMPTZ, curator_id UUID, notes TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT l.id, l.name, l.phone, l.messenger, l.status, l.utm_source, l.utm_medium,
    l.utm_campaign, l.created_at, l.contacted_at, l.curator_id, l.notes
  FROM public.leads l
  WHERE (p_status = 'all' OR l.status = p_status)
    AND (l.status <> 'contacted' OR l.curator_id = p_curator_id)
  ORDER BY l.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.require_trial_candidate_id(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_prepare_trial_candidate_from_lead(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_mark_trial_candidate_invite_sent(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_regenerate_trial_candidate_pin(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_trial_candidate_pin(TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_trial_candidate_health_consent_by_candidate_session(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_trial_candidate_intake_by_candidate_session(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_trial_candidate_intake_by_candidate_session(TEXT, JSONB, SMALLINT, BOOLEAN, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_trial_candidate_summaries(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_trial_candidate(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_review_trial_candidate_v3(UUID, TEXT, TEXT, TEXT, TEXT, TEXT[], JSONB, UUID, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.purge_expired_trial_candidates() FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_rpc') THEN
    GRANT EXECUTE ON FUNCTION public.verify_trial_candidate_pin(TEXT, TEXT) TO heys_rpc;
    GRANT EXECUTE ON FUNCTION public.accept_trial_candidate_health_consent_by_candidate_session(TEXT, TEXT, TEXT, TEXT) TO heys_rpc;
    GRANT EXECUTE ON FUNCTION public.get_trial_candidate_intake_by_candidate_session(TEXT) TO heys_rpc;
    GRANT EXECUTE ON FUNCTION public.save_trial_candidate_intake_by_candidate_session(TEXT, JSONB, SMALLINT, BOOLEAN, TIMESTAMPTZ) TO heys_rpc;
    GRANT EXECUTE ON FUNCTION public.admin_prepare_trial_candidate_from_lead(UUID, UUID) TO heys_rpc;
    GRANT EXECUTE ON FUNCTION public.admin_mark_trial_candidate_invite_sent(UUID, UUID) TO heys_rpc;
    GRANT EXECUTE ON FUNCTION public.admin_regenerate_trial_candidate_pin(UUID, UUID) TO heys_rpc;
    GRANT EXECUTE ON FUNCTION public.admin_get_trial_candidate_summaries(UUID) TO heys_rpc;
    GRANT EXECUTE ON FUNCTION public.admin_get_trial_candidate(UUID, UUID) TO heys_rpc;
    GRANT EXECUTE ON FUNCTION public.admin_review_trial_candidate_v3(UUID, TEXT, TEXT, TEXT, TEXT, TEXT[], JSONB, UUID, TIMESTAMPTZ) TO heys_rpc;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_admin') THEN
    GRANT EXECUTE ON FUNCTION public.require_trial_candidate_id(TEXT) TO heys_admin;
    GRANT EXECUTE ON FUNCTION public.admin_prepare_trial_candidate_from_lead(UUID, UUID) TO heys_admin;
    GRANT EXECUTE ON FUNCTION public.admin_mark_trial_candidate_invite_sent(UUID, UUID) TO heys_admin;
    GRANT EXECUTE ON FUNCTION public.admin_regenerate_trial_candidate_pin(UUID, UUID) TO heys_admin;
    GRANT EXECUTE ON FUNCTION public.admin_get_trial_candidate_summaries(UUID) TO heys_admin;
    GRANT EXECUTE ON FUNCTION public.admin_get_trial_candidate(UUID, UUID) TO heys_admin;
    GRANT EXECUTE ON FUNCTION public.admin_review_trial_candidate_v3(UUID, TEXT, TEXT, TEXT, TEXT, TEXT[], JSONB, UUID, TIMESTAMPTZ) TO heys_admin;
    GRANT EXECUTE ON FUNCTION public.purge_expired_trial_candidates() TO heys_admin;
  END IF;
END $$;
