-- Trial candidate invite PIN: one-time use + 3-day TTL after invite is sent.
-- Mirrors client onetime_pin_* semantics (issue_onetime_pin_for_client / verify_client_onetime_pin).

ALTER TABLE public.trial_candidates
  ADD COLUMN IF NOT EXISTS pin_consumed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pin_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN public.trial_candidates.pin_consumed_at IS
  'First successful verify_trial_candidate_pin; blocks PIN reuse.';
COMMENT ON COLUMN public.trial_candidates.pin_expires_at IS
  'PIN invalid after this time; set when invite is marked sent (+3 days).';

-- Candidates who already started used the PIN at least once.
UPDATE public.trial_candidates
   SET pin_consumed_at = COALESCE(started_at, invite_sent_at, updated_at)
 WHERE pin_consumed_at IS NULL
   AND started_at IS NOT NULL;

-- Active invites: TTL from send time when known.
UPDATE public.trial_candidates
   SET pin_expires_at = invite_sent_at + INTERVAL '3 days'
 WHERE pin_expires_at IS NULL
   AND invite_sent_at IS NOT NULL
   AND status IN ('invite_sent', 'in_progress', 'completed', 'needs_clarification');

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
  INSERT INTO public.trial_candidates(lead_id, curator_id, pin_hash, pin_consumed_at, pin_expires_at)
  VALUES (p_lead_id, p_curator_id, crypt(v_pin, gen_salt('bf', 12)), NULL, NULL)
  ON CONFLICT (lead_id) DO UPDATE SET
    curator_id = EXCLUDED.curator_id, client_id = NULL,
    status = 'invite_prepared', current_step = 0, pin_hash = EXCLUDED.pin_hash,
    pin_consumed_at = NULL, pin_expires_at = NULL,
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
    invite_sent_at = COALESCE(invite_sent_at, NOW()),
    pin_expires_at = NOW() + INTERVAL '3 days',
    updated_at = NOW()
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
    pin_consumed_at = NULL, pin_expires_at = NULL,
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

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_credentials');
  END IF;

  IF v_candidate.locked_until IS NOT NULL AND v_candidate.locked_until > NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'pin_rate_limited');
  END IF;

  IF v_candidate.pin_consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'onetime_pin_consumed');
  END IF;

  IF v_candidate.pin_expires_at IS NOT NULL AND v_candidate.pin_expires_at <= NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'onetime_pin_expired');
  END IF;

  IF crypt(p_pin, v_candidate.pin_hash) <> v_candidate.pin_hash THEN
    UPDATE public.trial_candidates SET failed_attempts = failed_attempts + 1,
      locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE locked_until END
    WHERE id = v_candidate.id;
    RETURN jsonb_build_object('success', false, 'error', 'invalid_credentials');
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.trial_candidate_sessions(token_hash, candidate_id, expires_at)
  VALUES (digest(v_token, 'sha256'), v_candidate.id, NOW() + INTERVAL '7 days');
  UPDATE public.trial_candidates
     SET failed_attempts = 0,
         locked_until = NULL,
         pin_consumed_at = NOW(),
         started_at = COALESCE(started_at, NOW()),
         status = CASE WHEN status = 'invite_sent' THEN 'in_progress' ELSE status END,
         updated_at = NOW()
   WHERE id = v_candidate.id;
  INSERT INTO public.trial_candidate_audit_events(candidate_id, actor_type, action)
  VALUES (v_candidate.id, 'candidate', 'login');
  RETURN jsonb_build_object('success', true, 'candidate_session_token', v_token,
    'candidate_id', v_candidate.id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_prepare_trial_candidate_from_lead(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_mark_trial_candidate_invite_sent(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_regenerate_trial_candidate_pin(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_trial_candidate_pin(TEXT, TEXT) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_rpc') THEN
    GRANT EXECUTE ON FUNCTION public.verify_trial_candidate_pin(TEXT, TEXT) TO heys_rpc;
    GRANT EXECUTE ON FUNCTION public.admin_prepare_trial_candidate_from_lead(UUID, UUID) TO heys_rpc;
    GRANT EXECUTE ON FUNCTION public.admin_mark_trial_candidate_invite_sent(UUID, UUID) TO heys_rpc;
    GRANT EXECUTE ON FUNCTION public.admin_regenerate_trial_candidate_pin(UUID, UUID) TO heys_rpc;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_admin') THEN
    GRANT EXECUTE ON FUNCTION public.admin_prepare_trial_candidate_from_lead(UUID, UUID) TO heys_admin;
    GRANT EXECUTE ON FUNCTION public.admin_mark_trial_candidate_invite_sent(UUID, UUID) TO heys_admin;
    GRANT EXECUTE ON FUNCTION public.admin_regenerate_trial_candidate_pin(UUID, UUID) TO heys_admin;
  END IF;
END $$;
