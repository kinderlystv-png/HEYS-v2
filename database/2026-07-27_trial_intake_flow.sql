-- HEYS: protected trial-candidate intake v1
-- Flow: landing lead -> curator invite -> authenticated intake -> manual review -> trial.

BEGIN;

CREATE TABLE IF NOT EXISTS public.trial_intakes (
  client_id             UUID PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  curator_id            UUID NOT NULL,
  schema_version        TEXT NOT NULL DEFAULT '1.0',
  status                TEXT NOT NULL DEFAULT 'not_invited'
    CHECK (status IN (
      'not_invited', 'invited', 'in_progress', 'completed',
      'needs_clarification', 'approved', 'rejected'
    )),
  current_step          SMALLINT NOT NULL DEFAULT 0 CHECK (current_step BETWEEN 0 AND 5),
  answers_encrypted     BYTEA,
  answers_key_version   SMALLINT,
  review_note_encrypted BYTEA,
  decision_reason       TEXT
    CHECK (decision_reason IS NULL OR decision_reason IN (
      'out_of_scope', 'safety', 'unrealistic_expectations',
      'format_mismatch', 'no_capacity', 'candidate_withdrew'
    )),
  invited_at            TIMESTAMPTZ,
  started_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  reviewed_at           TIMESTAMPTZ,
  retention_delete_at   TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trial_intakes_curator_status_idx
  ON public.trial_intakes(curator_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS trial_intakes_retention_idx
  ON public.trial_intakes(retention_delete_at)
  WHERE retention_delete_at IS NOT NULL;

ALTER TABLE public.trial_intakes
  DROP CONSTRAINT IF EXISTS trial_intakes_current_step_check;
ALTER TABLE public.trial_intakes
  ADD CONSTRAINT trial_intakes_current_step_check
  CHECK (current_step BETWEEN 0 AND 5);

COMMENT ON TABLE public.trial_intakes IS
  'Protected trial-candidate intake. Answers and curator notes are encrypted; plaintext contains workflow metadata only.';

ALTER TABLE public.trial_intakes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.trial_intakes FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.trial_intakes FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.trial_intakes FROM authenticated;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_trial_intake_on_health_revoke()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.consent_type = 'health_data'
     AND (NEW.granted = FALSE OR NEW.revoked_at IS NOT NULL)
     AND (OLD.granted IS DISTINCT FROM NEW.granted OR OLD.revoked_at IS DISTINCT FROM NEW.revoked_at) THEN
    DELETE FROM public.trial_intakes WHERE client_id = NEW.client_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purge_trial_intake_on_health_revoke ON public.consents;
CREATE TRIGGER trg_purge_trial_intake_on_health_revoke
AFTER UPDATE OF granted, revoked_at ON public.consents
FOR EACH ROW
EXECUTE FUNCTION public.purge_trial_intake_on_health_revoke();

CREATE OR REPLACE FUNCTION public.validate_trial_intake_answers_v1(
  p_answers JSONB,
  p_complete BOOLEAN DEFAULT FALSE
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_section TEXT;
  v_allowed_fields TEXT[];
  v_unknown_field TEXT;
  v_invalid_field TEXT;
BEGIN
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object'
     OR octet_length(p_answers::text) > 65536 THEN
    RETURN 'invalid_answers';
  END IF;

  SELECT fields.field_name INTO v_unknown_field
  FROM jsonb_object_keys(p_answers) AS fields(field_name)
  WHERE fields.field_name NOT IN (
    'goals', 'experience', 'lifestyle', 'collaboration',
    'health', 'safety', 'meta'
  )
  LIMIT 1;
  IF v_unknown_field IS NOT NULL THEN
    RETURN 'unknown_answer_section';
  END IF;

  FOREACH v_section IN ARRAY ARRAY[
    'goals', 'experience', 'lifestyle', 'collaboration',
    'health', 'safety', 'meta'
  ] LOOP
    IF NOT (p_answers ? v_section)
       OR jsonb_typeof(p_answers -> v_section) <> 'object' THEN
      RETURN 'invalid_answer_section';
    END IF;

    v_allowed_fields := CASE v_section
      WHEN 'goals' THEN ARRAY['primary_goal', 'success_definition', 'time_expectations']
      WHEN 'experience' THEN ARRAY['previous_experience', 'what_worked', 'what_did_not_work']
      WHEN 'lifestyle' THEN ARRAY['schedule', 'sleep', 'activity', 'constraints']
      WHEN 'collaboration' THEN ARRAY['daily_tracking', 'feedback_style', 'expectations_from_curator']
      WHEN 'health' THEN ARRAY[
        'chronic_conditions', 'medications', 'injuries_operations', 'allergies',
        'pregnancy_lactation', 'eating_disorder_history', 'doctor_restrictions'
      ]
      WHEN 'safety' THEN ARRAY[
        'acute_symptoms', 'recent_surgery', 'active_ed_concern',
        'medical_supervision', 'details'
      ]
      ELSE ARRAY['schema_version']
    END;

    SELECT fields.field_name INTO v_unknown_field
    FROM jsonb_object_keys(p_answers -> v_section) AS fields(field_name)
    WHERE NOT (fields.field_name = ANY(v_allowed_fields))
    LIMIT 1;
    IF v_unknown_field IS NOT NULL THEN
      RETURN 'unknown_answer_field';
    END IF;

    SELECT fields.field_name INTO v_invalid_field
    FROM jsonb_each(p_answers -> v_section) AS fields(field_name, field_value)
    WHERE CASE
      WHEN v_section = 'safety' AND fields.field_name <> 'details'
        THEN jsonb_typeof(fields.field_value) NOT IN ('boolean', 'null')
      ELSE jsonb_typeof(fields.field_value) NOT IN ('string', 'null')
    END
    LIMIT 1;
    IF v_invalid_field IS NOT NULL THEN
      RETURN 'invalid_answer_type';
    END IF;
  END LOOP;

  IF COALESCE(p_answers #>> '{meta,schema_version}', '') <> '1.0' THEN
    RETURN 'unsupported_schema_version';
  END IF;

  IF COALESCE(p_answers #>> '{experience,previous_experience}', '') NOT IN (
    '', 'none', 'self', 'specialist', 'both'
  ) OR COALESCE(p_answers #>> '{collaboration,daily_tracking}', '') NOT IN (
    '', 'yes', 'mostly', 'no'
  ) OR COALESCE(p_answers #>> '{collaboration,feedback_style}', '') NOT IN (
    '', 'concise', 'detailed', 'gentle', 'direct'
  ) OR COALESCE(p_answers #>> '{health,pregnancy_lactation}', '') NOT IN (
    '', 'no', 'pregnancy', 'lactation', 'not_applicable', 'prefer_not'
  ) OR COALESCE(p_answers #>> '{health,eating_disorder_history}', '') NOT IN (
    '', 'no', 'past', 'current', 'unsure', 'prefer_not'
  ) THEN
    RETURN 'invalid_answer_option';
  END IF;

  IF p_complete AND (
    BTRIM(COALESCE(p_answers #>> '{goals,primary_goal}', '')) = '' OR
    BTRIM(COALESCE(p_answers #>> '{goals,success_definition}', '')) = '' OR
    BTRIM(COALESCE(p_answers #>> '{experience,previous_experience}', '')) = '' OR
    BTRIM(COALESCE(p_answers #>> '{lifestyle,schedule}', '')) = '' OR
    BTRIM(COALESCE(p_answers #>> '{lifestyle,sleep}', '')) = '' OR
    BTRIM(COALESCE(p_answers #>> '{collaboration,daily_tracking}', '')) = '' OR
    BTRIM(COALESCE(p_answers #>> '{collaboration,feedback_style}', '')) = '' OR
    BTRIM(COALESCE(p_answers #>> '{health,doctor_restrictions}', '')) = ''
  ) THEN
    RETURN 'required_answers_missing';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_trial_intake_by_session(
  p_session_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client_id UUID;
  v_row public.trial_intakes%ROWTYPE;
  v_answers JSONB;
BEGIN
  SELECT cs.client_id INTO v_client_id
  FROM public.client_sessions cs
  WHERE cs.token_hash = digest(p_session_token, 'sha256')
    AND cs.expires_at > NOW()
    AND cs.revoked_at IS NULL;

  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_session');
  END IF;

  SELECT * INTO v_row
  FROM public.trial_intakes ti
  WHERE ti.client_id = v_client_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'status', 'not_invited', 'intake', NULL);
  END IF;

  IF v_row.answers_encrypted IS NOT NULL THEN
    v_answers := public.decrypt_health_data(v_row.answers_encrypted);
    IF v_answers IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'decrypt_failed');
    END IF;
  ELSE
    v_answers := '{}'::jsonb;
  END IF;

  PERFORM public.log_data_access(
    'client_self', v_client_id, v_client_id, 'read_trial_intake',
    ARRAY['trial_intake_v1'], true, NULL, NULL,
    jsonb_build_object('schema_version', v_row.schema_version)
  );

  RETURN jsonb_build_object(
    'success', true,
    'intake', jsonb_build_object(
      'schema_version', v_row.schema_version,
      'status', v_row.status,
      'current_step', v_row.current_step,
      'answers', v_answers,
      'invited_at', v_row.invited_at,
      'completed_at', v_row.completed_at,
      'updated_at', v_row.updated_at
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_trial_intake_by_session(
  p_session_token TEXT,
  p_answers JSONB,
  p_current_step SMALLINT,
  p_complete BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client_id UUID;
  v_status TEXT;
  v_next_status TEXT;
  v_validation_error TEXT;
BEGIN
  SELECT cs.client_id INTO v_client_id
  FROM public.client_sessions cs
  WHERE cs.token_hash = digest(p_session_token, 'sha256')
    AND cs.expires_at > NOW()
    AND cs.revoked_at IS NULL;

  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_session');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.consents c
    WHERE c.client_id = v_client_id
      AND c.consent_type = 'health_data'
      AND c.document_version = '1.5'
      AND c.granted = TRUE
      AND COALESCE(c.is_active, TRUE) = TRUE
      AND c.revoked_at IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'health_consent_required');
  END IF;

  v_validation_error := public.validate_trial_intake_answers_v1(p_answers, p_complete);
  IF v_validation_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', v_validation_error);
  END IF;

  IF p_current_step < 0 OR p_current_step > 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_step');
  END IF;

  SELECT ti.status INTO v_status
  FROM public.trial_intakes ti
  WHERE ti.client_id = v_client_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_invited');
  END IF;
  IF v_status NOT IN ('invited', 'in_progress', 'needs_clarification') THEN
    RETURN jsonb_build_object('success', false, 'error', 'intake_locked', 'status', v_status);
  END IF;

  v_next_status := CASE WHEN p_complete THEN 'completed' ELSE 'in_progress' END;

  UPDATE public.trial_intakes
  SET answers_encrypted = public.encrypt_health_data(p_answers),
      answers_key_version = 1,
      current_step = p_current_step,
      status = v_next_status,
      started_at = COALESCE(started_at, NOW()),
      completed_at = CASE WHEN p_complete THEN NOW() ELSE completed_at END,
      decision_reason = CASE WHEN p_complete THEN NULL ELSE decision_reason END,
      retention_delete_at = NULL,
      updated_at = NOW()
  WHERE client_id = v_client_id;

  PERFORM public.log_data_access(
    'client_self', v_client_id, v_client_id, 'write_trial_intake',
    ARRAY['trial_intake_v1'], true, NULL, NULL,
    jsonb_build_object('complete', p_complete, 'current_step', p_current_step)
  );

  RETURN jsonb_build_object(
    'success', true,
    'status', v_next_status,
    'current_step', p_current_step,
    'saved_at', NOW()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_invite_trial_intake(
  p_client_id UUID,
  p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status TEXT;
BEGIN
  IF p_curator_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = p_client_id AND c.curator_id = p_curator_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  INSERT INTO public.trial_intakes (
    client_id, curator_id, status, invited_at, updated_at
  ) VALUES (
    p_client_id, p_curator_id, 'invited', NOW(), NOW()
  )
  ON CONFLICT (client_id) DO UPDATE SET
    curator_id = EXCLUDED.curator_id,
    status = CASE
      WHEN trial_intakes.status IN ('not_invited', 'invited') THEN 'invited'
      ELSE trial_intakes.status
    END,
    invited_at = COALESCE(trial_intakes.invited_at, NOW()),
    updated_at = NOW()
  RETURNING status INTO v_status;

  INSERT INTO public.trial_queue (client_id, status, queued_at)
  SELECT p_client_id, 'queued', NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.trial_queue tq
    WHERE tq.client_id = p_client_id
      AND tq.status IN ('queued', 'pending', 'offer', 'assigned')
  );

  RETURN jsonb_build_object(
    'success', true,
    'status', v_status,
    'intake_url', 'https://app.heyslab.ru/?intake=1'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_trial_intake_summaries(
  p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_curator_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'curator_id_required');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'client_id', ti.client_id,
        'status', ti.status,
        'schema_version', ti.schema_version,
        'current_step', ti.current_step,
        'invited_at', ti.invited_at,
        'completed_at', ti.completed_at,
        'updated_at', ti.updated_at,
        'decision_reason', ti.decision_reason
      ) ORDER BY ti.updated_at DESC)
      FROM public.trial_intakes ti
      JOIN public.clients c ON c.id = ti.client_id
      WHERE ti.curator_id = p_curator_id
        AND c.curator_id = p_curator_id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_trial_intake(
  p_client_id UUID,
  p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.trial_intakes%ROWTYPE;
  v_answers JSONB;
  v_note JSONB;
BEGIN
  IF p_curator_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = p_client_id AND c.curator_id = p_curator_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_row FROM public.trial_intakes WHERE client_id = p_client_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  v_answers := CASE WHEN v_row.answers_encrypted IS NULL THEN '{}'::jsonb
    ELSE public.decrypt_health_data(v_row.answers_encrypted) END;
  v_note := CASE WHEN v_row.review_note_encrypted IS NULL THEN NULL
    ELSE public.decrypt_health_data(v_row.review_note_encrypted) END;
  IF v_row.answers_encrypted IS NOT NULL AND v_answers IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'decrypt_failed');
  END IF;

  PERFORM public.log_data_access(
    'curator', p_curator_id, p_client_id, 'read_trial_intake',
    ARRAY['trial_intake_v1'], true, NULL, NULL,
    jsonb_build_object('schema_version', v_row.schema_version)
  );

  RETURN jsonb_build_object(
    'success', true,
    'intake', jsonb_build_object(
      'client_id', v_row.client_id,
      'schema_version', v_row.schema_version,
      'status', v_row.status,
      'current_step', v_row.current_step,
      'answers', v_answers,
      'internal_note', CASE WHEN v_note IS NULL THEN NULL ELSE v_note->>'text' END,
      'decision_reason', v_row.decision_reason,
      'invited_at', v_row.invited_at,
      'completed_at', v_row.completed_at,
      'reviewed_at', v_row.reviewed_at,
      'updated_at', v_row.updated_at
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_trial_intake(
  p_client_id UUID,
  p_action TEXT,
  p_reason_code TEXT DEFAULT NULL,
  p_internal_note TEXT DEFAULT NULL,
  p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_status TEXT;
  v_note TEXT := NULLIF(BTRIM(COALESCE(p_internal_note, '')), '');
BEGIN
  IF p_curator_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = p_client_id AND c.curator_id = p_curator_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  IF p_action NOT IN ('needs_clarification', 'approved', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_action');
  END IF;
  IF p_action = 'rejected' AND (
    p_reason_code NOT IN (
      'out_of_scope', 'safety', 'unrealistic_expectations',
      'format_mismatch', 'no_capacity', 'candidate_withdrew'
    ) OR v_note IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'rejection_reason_required');
  END IF;
  IF p_action = 'needs_clarification' AND v_note IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'clarification_note_required');
  END IF;
  IF v_note IS NOT NULL AND length(v_note) > 2000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'internal_note_too_long');
  END IF;

  SELECT status INTO v_current_status
  FROM public.trial_intakes
  WHERE client_id = p_client_id
  FOR UPDATE;
  IF v_current_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  IF v_current_status NOT IN ('completed', 'needs_clarification') THEN
    RETURN jsonb_build_object('success', false, 'error', 'review_not_allowed', 'status', v_current_status);
  END IF;

  UPDATE public.trial_intakes
  SET status = p_action,
      decision_reason = CASE WHEN p_action = 'rejected' THEN p_reason_code ELSE NULL END,
      review_note_encrypted = CASE WHEN v_note IS NULL THEN NULL
        ELSE public.encrypt_health_data(jsonb_build_object('text', v_note)) END,
      reviewed_at = NOW(),
      retention_delete_at = CASE WHEN p_action = 'rejected' THEN NOW() + INTERVAL '30 days' ELSE NULL END,
      updated_at = NOW()
  WHERE client_id = p_client_id;

  PERFORM public.log_data_access(
    'curator', p_curator_id, p_client_id, 'review_trial_intake',
    ARRAY['trial_intake_v1'], true, NULL, NULL,
    jsonb_build_object('action', p_action, 'reason_code', p_reason_code)
  );

  RETURN jsonb_build_object('success', true, 'status', p_action);
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_expired_trial_intakes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM public.trial_intakes
  WHERE status = 'rejected'
    AND retention_delete_at IS NOT NULL
    AND retention_delete_at <= NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Session-bound and atomic health-data revocation. The legacy two-call flow
-- (revoke_consent(client_id) + purge_health_data(client_id)) exposed an IDOR
-- surface and could leave data behind if the second request failed.
CREATE OR REPLACE FUNCTION public.revoke_consent_by_session(
  p_session_token TEXT,
  p_consent_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client_id UUID;
  v_deleted_keys INTEGER := 0;
  v_killed_sessions INTEGER := 0;
BEGIN
  v_client_id := public.require_client_id(p_session_token);
  PERFORM set_config('app.consents_writer', 'authorized', true);

  UPDATE public.consents
  SET granted = FALSE, revoked_at = NOW()
  WHERE client_id = v_client_id
    AND consent_type = p_consent_type
    AND granted = TRUE
    AND revoked_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'consent_not_found_or_already_revoked');
  END IF;

  IF p_consent_type = 'health_data' THEN
    DELETE FROM public.client_kv_store
    WHERE client_id = v_client_id
      AND public.is_health_key(k);
    GET DIAGNOSTICS v_deleted_keys = ROW_COUNT;
    -- The consent trigger above removes the separately encrypted trial intake.
  END IF;

  IF p_consent_type IN ('health_data', 'personal_data') THEN
    UPDATE public.client_sessions
    SET revoked_at = NOW()
    WHERE client_id = v_client_id
      AND revoked_at IS NULL;
    GET DIAGNOSTICS v_killed_sessions = ROW_COUNT;
  END IF;

  PERFORM public.log_data_access(
    'client_self', v_client_id, v_client_id, 'revoke_consent',
    ARRAY[p_consent_type], p_consent_type = 'health_data', NULL, NULL,
    jsonb_build_object(
      'consent_type', p_consent_type,
      'deleted_keys', v_deleted_keys,
      'sessions_killed', v_killed_sessions
    )
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'consent_type', p_consent_type,
    'deleted_keys', v_deleted_keys,
    'sessions_killed', v_killed_sessions
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Landing consent is only personal-data consent. User agreement and health
-- consent are collected after authenticated client login.
CREATE OR REPLACE FUNCTION public.admin_convert_lead(
    p_lead_id UUID,
    p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_lead RECORD;
    v_client_id UUID;
    v_phone_clean TEXT;
    v_phone_normalized TEXT;
    v_pin TEXT;
    v_pin_hash TEXT;
    v_pin_token UUID := gen_random_uuid();
    v_pin_token_expires TIMESTAMPTZ := NOW() + INTERVAL '7 days';
    v_existing_client_id UUID;
    v_existing_status TEXT;
    v_consent_ip INET;
BEGIN
    SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'lead_not_found');
    END IF;
    IF p_curator_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'curator_id_required');
    END IF;
    IF v_lead.status = 'converted' THEN
        RETURN jsonb_build_object('success', false, 'error', 'lead_already_converted', 'client_id', v_lead.client_id);
    END IF;

    v_phone_clean := regexp_replace(v_lead.phone, '[^0-9]', '', 'g');
    v_phone_normalized := regexp_replace(v_lead.phone, '[^0-9+]', '', 'g');
    IF length(v_phone_clean) < 10 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_phone_format');
    END IF;

    SELECT id, subscription_status INTO v_existing_client_id, v_existing_status
    FROM public.clients
    WHERE (phone = v_phone_clean OR phone_normalized = v_phone_normalized)
      AND subscription_status IN ('trial', 'trial_pending', 'active')
    LIMIT 1;
    IF v_existing_client_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'phone_already_has_active',
          'code', 'PHONE_ALREADY_TRIAL', 'client_id', v_existing_client_id,
          'subscription_status', v_existing_status);
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.clients
      WHERE phone = v_phone_clean OR phone_normalized = v_phone_normalized
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'phone_already_exists');
    END IF;

    v_pin := LPAD((floor(random() * 9000)::INT + 1000)::TEXT, 4, '0');
    v_pin_hash := crypt(v_pin, gen_salt('bf', 12));

    INSERT INTO public.clients (
      id, name, phone, phone_normalized, email, pin_hash, curator_id,
      subscription_status, pin_token, pin_token_expires_at, birth_year
    ) VALUES (
      gen_random_uuid(), COALESCE(v_lead.name, 'Клиент'), v_phone_clean,
      v_phone_normalized, NULL, v_pin_hash, p_curator_id, 'none',
      v_pin_token, v_pin_token_expires, v_lead.birth_year
    ) RETURNING id INTO v_client_id;

    BEGIN
      v_consent_ip := NULLIF(BTRIM(v_lead.ip_address::text), '')::inet;
    EXCEPTION WHEN invalid_text_representation THEN
      v_consent_ip := NULL;
    END;
    PERFORM set_config('app.consents_writer', 'authorized', true);
    INSERT INTO public.consents (
      client_id, consent_type, document_version, granted, is_active,
      signature_method, ip_address, user_agent, created_at
    ) VALUES (
      v_client_id, 'personal_data', COALESCE(v_lead.consent_privacy_version, '1.0'),
      true, true, 'checkbox', v_consent_ip,
      COALESCE(v_lead.consent_user_agent, v_lead.user_agent),
      COALESCE(v_lead.consent_accepted_at, v_lead.created_at)
    );

    IF v_lead.consent_marketing_accepted_at IS NOT NULL THEN
      INSERT INTO public.consents (
        client_id, consent_type, document_version, granted, is_active,
        signature_method, ip_address, user_agent, created_at
      ) VALUES (
        v_client_id, 'marketing', COALESCE(v_lead.consent_privacy_version, '1.0'),
        true, true, 'checkbox', v_consent_ip,
        COALESCE(v_lead.consent_user_agent, v_lead.user_agent),
        v_lead.consent_marketing_accepted_at
      );
    END IF;

    INSERT INTO public.trial_intakes (
      client_id, curator_id, status, invited_at, updated_at
    ) VALUES (v_client_id, p_curator_id, 'invited', NOW(), NOW());

    INSERT INTO public.trial_queue (client_id, status, queued_at)
    VALUES (v_client_id, 'queued', NOW());
    INSERT INTO public.trial_queue_events (client_id, event_type, meta)
    VALUES (v_client_id, 'queued', jsonb_build_object(
      'lead_id', p_lead_id, 'curator_id', p_curator_id,
      'source', 'trial_intake_invite', 'auto_pin', true
    ));

    UPDATE public.leads
    SET status = 'converted', client_id = v_client_id, contacted_at = NOW(),
        curator_id = p_curator_id, updated_at = NOW()
    WHERE id = p_lead_id;

    PERFORM public.record_funnel_event(
      p_event_type := 'week_request', p_lead_id := p_lead_id,
      p_client_id := v_client_id,
      p_metadata := jsonb_build_object('source', 'trial_intake_invite'),
      p_dedupe_key := 'week_request:lead:' || p_lead_id::text
    );

    RETURN jsonb_build_object(
      'success', true, 'client_id', v_client_id, 'pin', v_pin,
      'pin_token', v_pin_token, 'pin_token_expires_at', v_pin_token_expires,
      'phone', v_phone_clean, 'phone_normalized', v_phone_normalized,
      'intake_status', 'invited', 'intake_url', 'https://app.heyslab.ru/?intake=1'
    );
END;
$$;

-- New intakes must be approved before the existing trial activation path runs.
-- Legacy clients without an intake remain compatible.
CREATE OR REPLACE FUNCTION public.admin_activate_trial(
    p_client_id UUID,
    p_start_date DATE DEFAULT CURRENT_DATE,
    p_trial_days INTEGER DEFAULT 7,
    p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_client RECORD;
    v_trial_start_at TIMESTAMPTZ;
    v_trial_ends_at TIMESTAMPTZ;
    v_is_future BOOLEAN;
    v_intake_status TEXT;
BEGIN
    IF p_curator_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = p_client_id AND c.curator_id = p_curator_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'forbidden');
    END IF;

    SELECT * INTO v_client FROM public.clients WHERE id = p_client_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'client_not_found');
    END IF;

    SELECT status INTO v_intake_status FROM public.trial_intakes WHERE client_id = p_client_id;
    IF v_intake_status IS NOT NULL AND v_intake_status <> 'approved' THEN
      RETURN jsonb_build_object('success', false, 'error', 'intake_not_approved', 'intake_status', v_intake_status);
    END IF;

    IF v_client.subscription_status IN ('trial', 'active') THEN
      UPDATE public.trial_queue SET status = 'assigned',
        assigned_at = COALESCE(assigned_at, v_client.trial_started_at, NOW()), updated_at = NOW()
      WHERE client_id = p_client_id AND status IN ('queued', 'pending', 'offer');
      RETURN jsonb_build_object('success', true, 'already_active', true,
        'status', v_client.subscription_status, 'trial_started_at', v_client.trial_started_at,
        'trial_ends_at', v_client.trial_ends_at);
    END IF;

    v_is_future := p_start_date > CURRENT_DATE;
    UPDATE public.clients
    SET subscription_status = CASE WHEN v_is_future THEN 'trial_pending' ELSE 'trial' END,
        trial_started_at = CASE WHEN v_is_future THEN p_start_date::timestamptz ELSE NOW() END,
        trial_ends_at = CASE WHEN v_is_future
          THEN (p_start_date + (p_trial_days || ' days')::interval)::timestamptz
          ELSE NOW() + (p_trial_days || ' days')::interval END,
        updated_at = NOW()
    WHERE id = p_client_id
    RETURNING trial_started_at, trial_ends_at INTO v_trial_start_at, v_trial_ends_at;

    INSERT INTO public.subscriptions (client_id, trial_started_at, trial_ends_at, trial_approved_at)
    VALUES (p_client_id, v_trial_start_at, v_trial_ends_at, NOW())
    ON CONFLICT (client_id) DO UPDATE SET
      trial_started_at = EXCLUDED.trial_started_at,
      trial_ends_at = EXCLUDED.trial_ends_at,
      trial_approved_at = NOW();

    UPDATE public.trial_queue SET status = 'assigned', assigned_at = NOW(), updated_at = NOW()
    WHERE client_id = p_client_id AND status IN ('queued', 'pending', 'offer');
    INSERT INTO public.trial_queue_events (client_id, event_type, meta)
    VALUES (p_client_id, 'claimed', jsonb_build_object(
      'curator_id', p_curator_id, 'start_date', p_start_date,
      'trial_days', p_trial_days, 'is_future', v_is_future,
      'source', 'approved_trial_intake'
    ));
    PERFORM public.record_funnel_event(
      p_event_type := 'trial_active', p_client_id := p_client_id,
      p_metadata := jsonb_build_object('trial_days', p_trial_days,
        'is_future', v_is_future, 'source', 'approved_trial_intake'),
      p_dedupe_key := 'trial_active:client:' || p_client_id::text || ':' || v_trial_start_at::date::text,
      p_occurred_at := v_trial_start_at
    );

    RETURN jsonb_build_object('success', true,
      'status', CASE WHEN v_is_future THEN 'trial_pending' ELSE 'trial' END,
      'trial_started_at', v_trial_start_at, 'trial_ends_at', v_trial_ends_at,
      'is_future', v_is_future);
END;
$$;

-- DSAR parity: include the decrypted intake in the subject's own export.
CREATE OR REPLACE FUNCTION public.export_my_data_by_session(
  p_session_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client_id UUID;
  v_client JSONB;
  v_consents JSONB;
  v_kv JSONB;
  v_subs JSONB;
  v_leads JSONB;
  v_intake JSONB;
BEGIN
  v_client_id := public.require_client_id(p_session_token);

  SELECT to_jsonb(c) - 'pin_hash' - 'pin_token' - 'pin_token_expires_at'
  INTO v_client FROM public.clients c WHERE id = v_client_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(co) ORDER BY co.created_at DESC), '[]'::jsonb)
  INTO v_consents FROM public.consents co WHERE co.client_id = v_client_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'key', kv.k,
    'value', CASE WHEN kv.v_encrypted IS NOT NULL
      THEN COALESCE(public.decrypt_health_data(kv.v_encrypted), kv.v) ELSE kv.v END,
    'updated_at', kv.updated_at
  ) ORDER BY kv.updated_at DESC), '[]'::jsonb)
  INTO v_kv FROM public.client_kv_store kv WHERE kv.client_id = v_client_id;

  SELECT COALESCE(to_jsonb(s), '{}'::jsonb)
  INTO v_subs FROM public.subscriptions s WHERE s.client_id = v_client_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'created_at', l.created_at, 'status', l.status,
    'utm_source', l.utm_source, 'utm_medium', l.utm_medium,
    'utm_campaign', l.utm_campaign, 'messenger', l.messenger
  ) ORDER BY l.created_at DESC), '[]'::jsonb)
  INTO v_leads FROM public.leads l WHERE l.client_id = v_client_id;

  SELECT jsonb_build_object(
    'schema_version', ti.schema_version, 'status', ti.status,
    'current_step', ti.current_step,
    'answers', CASE WHEN ti.answers_encrypted IS NULL THEN '{}'::jsonb
      ELSE public.decrypt_health_data(ti.answers_encrypted) END,
    'invited_at', ti.invited_at, 'completed_at', ti.completed_at,
    'reviewed_at', ti.reviewed_at, 'updated_at', ti.updated_at
  ) INTO v_intake
  FROM public.trial_intakes ti WHERE ti.client_id = v_client_id;

  PERFORM public.log_data_access(
    'client_self', v_client_id, v_client_id, 'export_my_data',
    NULL, true, NULL, NULL, jsonb_build_object('includes_trial_intake', v_intake IS NOT NULL)
  );

  RETURN jsonb_build_object(
    'success', true, 'exported_at', NOW(), 'client', v_client,
    'consents', v_consents, 'kv_store', v_kv, 'subscription', v_subs,
    'leads_history', v_leads, 'trial_intake', v_intake,
    'disclaimer', 'Это экспорт всех ваших персональных данных, хранящихся в сервисе HEYS на момент запроса.'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_trial_intake_by_session(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_trial_intake_answers_v1(JSONB, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_trial_intake_by_session(TEXT, JSONB, SMALLINT, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_invite_trial_intake(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_trial_intake_summaries(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_trial_intake(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_review_trial_intake(UUID, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.purge_expired_trial_intakes() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_consents(UUID, JSONB, TEXT, TEXT) FROM PUBLIC, heys_rpc;
REVOKE EXECUTE ON FUNCTION public.check_required_consents(UUID) FROM PUBLIC, heys_rpc;
REVOKE EXECUTE ON FUNCTION public.revoke_consent(UUID, TEXT) FROM PUBLIC, heys_rpc;
REVOKE EXECUTE ON FUNCTION public.get_client_consents(UUID) FROM PUBLIC, heys_rpc;
REVOKE EXECUTE ON FUNCTION public.purge_health_data(UUID) FROM PUBLIC, heys_rpc;
REVOKE EXECUTE ON FUNCTION public.revoke_consent_by_session(TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_trial_intake_by_session(TEXT) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.save_trial_intake_by_session(TEXT, JSONB, SMALLINT, BOOLEAN) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.admin_invite_trial_intake(UUID, UUID) TO heys_rpc, heys_admin;
GRANT EXECUTE ON FUNCTION public.admin_get_trial_intake_summaries(UUID) TO heys_rpc, heys_admin;
GRANT EXECUTE ON FUNCTION public.admin_get_trial_intake(UUID, UUID) TO heys_rpc, heys_admin;
GRANT EXECUTE ON FUNCTION public.admin_review_trial_intake(UUID, TEXT, TEXT, TEXT, UUID) TO heys_rpc, heys_admin;
GRANT EXECUTE ON FUNCTION public.purge_expired_trial_intakes() TO heys_admin;
GRANT EXECUTE ON FUNCTION public.admin_convert_lead(UUID, UUID) TO heys_rpc, heys_admin;
GRANT EXECUTE ON FUNCTION public.admin_activate_trial(UUID, DATE, INTEGER, UUID) TO heys_rpc, heys_admin;
GRANT EXECUTE ON FUNCTION public.export_my_data_by_session(TEXT) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.revoke_consent_by_session(TEXT, TEXT) TO heys_rpc;

COMMIT;
