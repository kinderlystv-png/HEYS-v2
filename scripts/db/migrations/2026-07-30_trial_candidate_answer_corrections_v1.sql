-- HEYS trial candidate answer corrections v1.
-- Forward-only: preserve candidate answers and append curator-confirmed revisions.

CREATE TABLE IF NOT EXISTS public.trial_candidate_answer_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.trial_candidates(id) ON DELETE CASCADE,
  revision_no INTEGER NOT NULL CHECK (revision_no > 0),
  request_id UUID NOT NULL,
  actor_id UUID NOT NULL,
  payload_encrypted BYTEA NOT NULL,
  key_version SMALLINT NOT NULL DEFAULT 1 CHECK (key_version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (candidate_id, revision_no),
  UNIQUE (candidate_id, request_id)
);

CREATE INDEX IF NOT EXISTS trial_candidate_answer_corrections_candidate_idx
  ON public.trial_candidate_answer_corrections(candidate_id, revision_no);

ALTER TABLE public.trial_candidate_answer_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.trial_candidate_answer_corrections FROM PUBLIC;

-- Keep the published validator contract and accept the curator/candidate-safe
-- "unsure" value used by the current questionnaire.
CREATE OR REPLACE FUNCTION public.validate_trial_intake_answers_v2(
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
  v_schema_version TEXT;
  v_allowed_fields TEXT[];
  v_unknown_field TEXT;
  v_invalid_field TEXT;
  v_safety_field TEXT;
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
  IF v_unknown_field IS NOT NULL THEN RETURN 'unknown_answer_section'; END IF;

  v_schema_version := COALESCE(p_answers #>> '{meta,schema_version}', '');
  IF v_schema_version NOT IN ('1.0', '1.1') THEN RETURN 'unsupported_schema_version'; END IF;

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
        'chronic_conditions_status', 'chronic_conditions',
        'medications_status', 'medications',
        'injuries_operations_status', 'injuries_operations',
        'allergies_status', 'allergies',
        'pregnancy_lactation', 'eating_disorder_history',
        'doctor_restrictions_status', 'doctor_restrictions'
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
    IF v_unknown_field IS NOT NULL THEN RETURN 'unknown_answer_field'; END IF;

    SELECT fields.field_name INTO v_invalid_field
    FROM jsonb_each(p_answers -> v_section) AS fields(field_name, field_value)
    WHERE CASE
      WHEN v_schema_version = '1.0'
        AND v_section = 'safety'
        AND fields.field_name <> 'details'
        THEN jsonb_typeof(fields.field_value) NOT IN ('boolean', 'null')
      ELSE jsonb_typeof(fields.field_value) NOT IN ('string', 'null')
    END
    LIMIT 1;
    IF v_invalid_field IS NOT NULL THEN RETURN 'invalid_answer_type'; END IF;
  END LOOP;

  IF COALESCE(p_answers #>> '{experience,previous_experience}', '') NOT IN (
    '', 'none', 'self', 'specialist', 'both'
  ) OR COALESCE(p_answers #>> '{collaboration,daily_tracking}', '') NOT IN (
    '', 'yes', 'mostly', 'no', 'unsure'
  ) OR COALESCE(p_answers #>> '{collaboration,feedback_style}', '') NOT IN (
    '', 'concise', 'detailed', 'gentle', 'direct'
  ) OR COALESCE(p_answers #>> '{health,pregnancy_lactation}', '') NOT IN (
    '', 'no', 'pregnancy', 'lactation', 'not_applicable', 'prefer_not'
  ) OR COALESCE(p_answers #>> '{health,eating_disorder_history}', '') NOT IN (
    '', 'no', 'past', 'current', 'unsure', 'prefer_not'
  ) THEN
    RETURN 'invalid_answer_option';
  END IF;

  IF v_schema_version = '1.1' THEN
    FOREACH v_safety_field IN ARRAY ARRAY[
      'acute_symptoms', 'recent_surgery', 'active_ed_concern', 'medical_supervision'
    ] LOOP
      IF COALESCE(p_answers #>> ARRAY['safety', v_safety_field], '') NOT IN (
        '', 'no', 'yes', 'prefer_not'
      ) THEN RETURN 'invalid_answer_option'; END IF;
    END LOOP;

    FOREACH v_safety_field IN ARRAY ARRAY[
      'chronic_conditions_status', 'medications_status',
      'injuries_operations_status', 'allergies_status',
      'doctor_restrictions_status'
    ] LOOP
      IF COALESCE(p_answers #>> ARRAY['health', v_safety_field], '') NOT IN (
        '', 'no', 'yes', 'prefer_not'
      ) THEN RETURN 'invalid_answer_option'; END IF;
    END LOOP;
  END IF;

  IF p_complete AND (
    BTRIM(COALESCE(p_answers #>> '{goals,primary_goal}', '')) = '' OR
    BTRIM(COALESCE(p_answers #>> '{goals,success_definition}', '')) = '' OR
    BTRIM(COALESCE(p_answers #>> '{experience,previous_experience}', '')) = '' OR
    BTRIM(COALESCE(p_answers #>> '{lifestyle,schedule}', '')) = '' OR
    BTRIM(COALESCE(p_answers #>> '{lifestyle,sleep}', '')) = '' OR
    BTRIM(COALESCE(p_answers #>> '{collaboration,daily_tracking}', '')) = '' OR
    BTRIM(COALESCE(p_answers #>> '{collaboration,feedback_style}', '')) = ''
  ) THEN RETURN 'required_answers_missing'; END IF;

  IF p_complete AND v_schema_version = '1.0'
     AND BTRIM(COALESCE(p_answers #>> '{health,doctor_restrictions}', '')) = '' THEN
    RETURN 'required_answers_missing';
  END IF;

  IF p_complete AND v_schema_version = '1.1' AND (
    COALESCE(p_answers #>> '{health,chronic_conditions_status}', '') = '' OR
    COALESCE(p_answers #>> '{health,medications_status}', '') = '' OR
    COALESCE(p_answers #>> '{health,injuries_operations_status}', '') = '' OR
    COALESCE(p_answers #>> '{health,allergies_status}', '') = '' OR
    COALESCE(p_answers #>> '{health,doctor_restrictions_status}', '') = '' OR
    COALESCE(p_answers #>> '{safety,acute_symptoms}', '') = '' OR
    COALESCE(p_answers #>> '{safety,recent_surgery}', '') = '' OR
    COALESCE(p_answers #>> '{safety,active_ed_concern}', '') = '' OR
    COALESCE(p_answers #>> '{safety,medical_supervision}', '') = ''
  ) THEN RETURN 'required_answers_missing'; END IF;

  IF p_complete AND v_schema_version = '1.1' AND (
    (p_answers #>> '{health,chronic_conditions_status}' = 'yes'
      AND BTRIM(COALESCE(p_answers #>> '{health,chronic_conditions}', '')) = '') OR
    (p_answers #>> '{health,medications_status}' = 'yes'
      AND BTRIM(COALESCE(p_answers #>> '{health,medications}', '')) = '') OR
    (p_answers #>> '{health,injuries_operations_status}' = 'yes'
      AND BTRIM(COALESCE(p_answers #>> '{health,injuries_operations}', '')) = '') OR
    (p_answers #>> '{health,allergies_status}' = 'yes'
      AND BTRIM(COALESCE(p_answers #>> '{health,allergies}', '')) = '') OR
    (p_answers #>> '{health,doctor_restrictions_status}' = 'yes'
      AND BTRIM(COALESCE(p_answers #>> '{health,doctor_restrictions}', '')) = '')
  ) THEN RETURN 'conditional_details_missing'; END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trial_candidate_question_path_v1(p_question_id TEXT)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE p_question_id
    WHEN 'goals.primary_goal' THEN ARRAY['goals', 'primary_goal']
    WHEN 'goals.success_definition' THEN ARRAY['goals', 'success_definition']
    WHEN 'goals.time_expectations' THEN ARRAY['goals', 'time_expectations']
    WHEN 'experience.previous_experience' THEN ARRAY['experience', 'previous_experience']
    WHEN 'experience.what_worked' THEN ARRAY['experience', 'what_worked']
    WHEN 'experience.what_did_not_work' THEN ARRAY['experience', 'what_did_not_work']
    WHEN 'lifestyle.schedule' THEN ARRAY['lifestyle', 'schedule']
    WHEN 'lifestyle.sleep' THEN ARRAY['lifestyle', 'sleep']
    WHEN 'lifestyle.activity' THEN ARRAY['lifestyle', 'activity']
    WHEN 'lifestyle.constraints' THEN ARRAY['lifestyle', 'constraints']
    WHEN 'collaboration.daily_tracking' THEN ARRAY['collaboration', 'daily_tracking']
    WHEN 'collaboration.feedback_style' THEN ARRAY['collaboration', 'feedback_style']
    WHEN 'collaboration.expectations_from_curator' THEN ARRAY['collaboration', 'expectations_from_curator']
    WHEN 'health.chronic_conditions_status' THEN ARRAY['health', 'chronic_conditions_status']
    WHEN 'health.chronic_conditions' THEN ARRAY['health', 'chronic_conditions']
    WHEN 'health.medications_status' THEN ARRAY['health', 'medications_status']
    WHEN 'health.medications' THEN ARRAY['health', 'medications']
    WHEN 'health.injuries_operations_status' THEN ARRAY['health', 'injuries_operations_status']
    WHEN 'health.injuries_operations' THEN ARRAY['health', 'injuries_operations']
    WHEN 'health.allergies_status' THEN ARRAY['health', 'allergies_status']
    WHEN 'health.allergies' THEN ARRAY['health', 'allergies']
    WHEN 'health.pregnancy_lactation' THEN ARRAY['health', 'pregnancy_lactation']
    WHEN 'health.eating_disorder_history' THEN ARRAY['health', 'eating_disorder_history']
    WHEN 'health.doctor_restrictions_status' THEN ARRAY['health', 'doctor_restrictions_status']
    WHEN 'health.doctor_restrictions' THEN ARRAY['health', 'doctor_restrictions']
    WHEN 'safety.acute_symptoms' THEN ARRAY['safety', 'acute_symptoms']
    WHEN 'safety.recent_surgery' THEN ARRAY['safety', 'recent_surgery']
    WHEN 'safety.active_ed_concern' THEN ARRAY['safety', 'active_ed_concern']
    WHEN 'safety.medical_supervision' THEN ARRAY['safety', 'medical_supervision']
    WHEN 'safety.details' THEN ARRAY['safety', 'details']
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_trial_candidate_safety_question_v1(p_question_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_question_id LIKE 'health.%' OR p_question_id LIKE 'safety.%';
$$;

CREATE OR REPLACE FUNCTION public.trial_candidate_effective_answers_v1(p_candidate_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_encrypted BYTEA;
  v_answers JSONB;
  v_revision RECORD;
  v_payload JSONB;
  v_path TEXT[];
BEGIN
  SELECT answers_encrypted INTO v_encrypted
  FROM public.trial_candidates WHERE id = p_candidate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'candidate_not_found'; END IF;
  IF v_encrypted IS NULL THEN RETURN '{}'::jsonb; END IF;

  v_answers := public.decrypt_health_data(v_encrypted);
  IF v_answers IS NULL THEN RAISE EXCEPTION 'candidate_answers_decrypt_failed'; END IF;

  FOR v_revision IN
    SELECT payload_encrypted
    FROM public.trial_candidate_answer_corrections
    WHERE candidate_id = p_candidate_id
    ORDER BY revision_no
  LOOP
    v_payload := public.decrypt_health_data(v_revision.payload_encrypted);
    IF v_payload IS NULL THEN RAISE EXCEPTION 'candidate_correction_decrypt_failed'; END IF;
    v_path := public.trial_candidate_question_path_v1(v_payload->>'question_id');
    IF v_path IS NULL OR NOT (v_payload ? 'new_value') THEN
      RAISE EXCEPTION 'candidate_correction_invalid';
    END IF;
    v_answers := jsonb_set(v_answers, v_path, v_payload->'new_value', TRUE);
  END LOOP;
  RETURN v_answers;
END;
$$;

CREATE OR REPLACE FUNCTION public.trial_candidate_answer_corrections_history_v1(p_candidate_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_revision RECORD;
  v_payload JSONB;
  v_history JSONB := '[]'::jsonb;
BEGIN
  FOR v_revision IN
    SELECT id, revision_no, request_id, actor_id, payload_encrypted, created_at
    FROM public.trial_candidate_answer_corrections
    WHERE candidate_id = p_candidate_id
    ORDER BY revision_no
  LOOP
    v_payload := public.decrypt_health_data(v_revision.payload_encrypted);
    IF v_payload IS NULL THEN RAISE EXCEPTION 'candidate_correction_decrypt_failed'; END IF;
    v_history := v_history || jsonb_build_array(
      jsonb_build_object(
        'id', v_revision.id,
        'revision_no', v_revision.revision_no,
        'request_id', v_revision.request_id,
        'actor_id', v_revision.actor_id,
        'created_at', v_revision.created_at
      ) || v_payload
    );
  END LOOP;
  RETURN v_history;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_trial_decision_checklist_v2(p_checklist JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_checklist IS NOT NULL
    AND jsonb_typeof(p_checklist) = 'object'
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_object_keys(p_checklist) AS fields(field_name)
      WHERE fields.field_name NOT IN (
        'within_scope', 'understands_boundaries', 'ready_to_track',
        'realistic_expectations', 'safe_format'
      )
    )
    AND (
      SELECT COUNT(*) = 5
      FROM jsonb_each(p_checklist) AS fields(field_name, field_value)
      WHERE fields.field_name IN (
        'within_scope', 'understands_boundaries', 'ready_to_track',
        'realistic_expectations', 'safe_format'
      ) AND jsonb_typeof(fields.field_value) = 'boolean'
    );
$$;

CREATE OR REPLACE FUNCTION public.admin_add_trial_candidate_answer_correction_v1(
  p_candidate_id UUID,
  p_question_id TEXT,
  p_new_value JSONB,
  p_communication_channel TEXT,
  p_comment TEXT,
  p_confirmed_from_candidate BOOLEAN,
  p_safety_confirmed BOOLEAN,
  p_request_id UUID,
  p_reverses_correction_id UUID DEFAULT NULL,
  p_curator_id UUID DEFAULT NULL,
  p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_candidate public.trial_candidates%ROWTYPE;
  v_path TEXT[];
  v_original JSONB;
  v_effective JSONB;
  v_next_effective JSONB;
  v_validation TEXT;
  v_payload JSONB;
  v_existing RECORD;
  v_existing_payload JSONB;
  v_reversed_payload JSONB;
  v_revision_no INTEGER;
  v_correction_id UUID;
  v_updated_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_candidate
  FROM public.trial_candidates
  WHERE id = p_candidate_id AND curator_id = p_curator_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'forbidden'); END IF;

  SELECT id, revision_no, actor_id, payload_encrypted INTO v_existing
  FROM public.trial_candidate_answer_corrections
  WHERE candidate_id = p_candidate_id AND request_id = p_request_id;
  IF FOUND THEN
    v_existing_payload := public.decrypt_health_data(v_existing.payload_encrypted);
    IF v_existing_payload IS NULL THEN RAISE EXCEPTION 'candidate_correction_decrypt_failed'; END IF;
    IF v_existing.actor_id = p_curator_id
       AND v_existing_payload->>'question_id' = p_question_id
       AND v_existing_payload->'new_value' IS NOT DISTINCT FROM COALESCE(p_new_value, 'null'::jsonb)
       AND v_existing_payload->>'communication_channel' = p_communication_channel
       AND v_existing_payload->>'comment' = BTRIM(COALESCE(p_comment, ''))
       AND (v_existing_payload->>'confirmed_from_candidate')::boolean IS NOT DISTINCT FROM p_confirmed_from_candidate
       AND (v_existing_payload->>'safety_confirmed')::boolean IS NOT DISTINCT FROM COALESCE(p_safety_confirmed, FALSE)
       AND NULLIF(v_existing_payload->>'reverses_correction_id', '')::uuid IS NOT DISTINCT FROM p_reverses_correction_id THEN
      RETURN jsonb_build_object(
        'success', true, 'replayed', true, 'correction_id', v_existing.id,
        'revision_no', v_existing.revision_no, 'updated_at', v_candidate.updated_at
      );
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'idempotency_conflict');
  END IF;

  IF v_candidate.status NOT IN ('completed', 'needs_clarification', 'approved_waiting_slot') THEN
    RETURN jsonb_build_object('success', false, 'error', 'correction_not_allowed');
  END IF;
  IF p_expected_updated_at IS NULL OR v_candidate.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'stale_intake', 'updated_at', v_candidate.updated_at);
  END IF;
  IF p_request_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'request_id_required'); END IF;

  v_path := public.trial_candidate_question_path_v1(p_question_id);
  IF v_path IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'unknown_question_id'); END IF;
  IF p_communication_channel IS NULL
     OR p_communication_channel NOT IN ('phone', 'messenger', 'video_call', 'other') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_communication_channel');
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_comment, '')), '') IS NULL OR length(BTRIM(p_comment)) > 1200 THEN
    RETURN jsonb_build_object('success', false, 'error', 'correction_comment_required');
  END IF;
  IF p_confirmed_from_candidate IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'candidate_confirmation_required');
  END IF;
  IF public.is_trial_candidate_safety_question_v1(p_question_id)
     AND p_safety_confirmed IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'safety_confirmation_required');
  END IF;
  IF p_reverses_correction_id IS NOT NULL THEN
    SELECT public.decrypt_health_data(payload_encrypted) INTO v_reversed_payload
    FROM public.trial_candidate_answer_corrections
    WHERE id = p_reverses_correction_id AND candidate_id = p_candidate_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'reversed_correction_not_found');
    END IF;
    IF v_reversed_payload IS NULL THEN RAISE EXCEPTION 'candidate_correction_decrypt_failed'; END IF;
    IF v_reversed_payload->>'question_id' <> p_question_id
       OR v_reversed_payload->'previous_effective_value'
          IS DISTINCT FROM COALESCE(p_new_value, 'null'::jsonb) THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_correction_reversal');
    END IF;
  END IF;

  v_original := public.decrypt_health_data(v_candidate.answers_encrypted);
  IF v_original IS NULL THEN RAISE EXCEPTION 'candidate_answers_decrypt_failed'; END IF;
  v_effective := public.trial_candidate_effective_answers_v1(p_candidate_id);
  v_next_effective := jsonb_set(v_effective, v_path, COALESCE(p_new_value, 'null'::jsonb), TRUE);
  v_validation := public.validate_trial_intake_answers_v2(v_next_effective, FALSE);
  IF v_validation IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', v_validation);
  END IF;

  SELECT COALESCE(MAX(revision_no), 0) + 1 INTO v_revision_no
  FROM public.trial_candidate_answer_corrections WHERE candidate_id = p_candidate_id;
  v_payload := jsonb_build_object(
    'question_id', p_question_id,
    'candidate_original_value', v_original #> v_path,
    'previous_effective_value', v_effective #> v_path,
    'new_value', COALESCE(p_new_value, 'null'::jsonb),
    'communication_channel', p_communication_channel,
    'comment', BTRIM(p_comment),
    'confirmed_from_candidate', TRUE,
    'safety_confirmed', COALESCE(p_safety_confirmed, FALSE),
    'reverses_correction_id', p_reverses_correction_id
  );

  INSERT INTO public.trial_candidate_answer_corrections(
    candidate_id, revision_no, request_id, actor_id, payload_encrypted, key_version
  ) VALUES (
    p_candidate_id, v_revision_no, p_request_id, p_curator_id,
    public.encrypt_health_data(v_payload), 1
  ) RETURNING id INTO v_correction_id;

  UPDATE public.trial_candidates
  SET status = 'completed', clarification_request_encrypted = NULL,
      clarification_sections = NULL, updated_at = clock_timestamp()
  WHERE id = p_candidate_id RETURNING updated_at INTO v_updated_at;
  UPDATE public.trial_candidate_sessions
  SET revoked_at = COALESCE(revoked_at, NOW())
  WHERE candidate_id = p_candidate_id AND revoked_at IS NULL;
  INSERT INTO public.trial_candidate_audit_events(
    candidate_id, actor_type, actor_id, action, is_health, metadata
  ) VALUES (
    p_candidate_id, 'curator', p_curator_id, 'correct_answer', TRUE,
    jsonb_build_object('correction_id', v_correction_id, 'request_id', p_request_id)
  );

  RETURN jsonb_build_object(
    'success', true, 'correction_id', v_correction_id,
    'revision_no', v_revision_no, 'updated_at', v_updated_at,
    'effective_answer', v_next_effective #> v_path
  );
END;
$$;

-- Backward-compatible read contract: `answers` is now effective; all existing
-- response keys remain, while original/history are explicit additional keys.
CREATE OR REPLACE FUNCTION public.admin_get_trial_candidate(
  p_candidate_id UUID, p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.trial_candidates%ROWTYPE;
  v_original JSONB;
  v_effective JSONB;
  v_history JSONB;
  v_note JSONB;
  v_clarification JSONB;
BEGIN
  SELECT * INTO v_row FROM public.trial_candidates
  WHERE id = p_candidate_id AND curator_id = p_curator_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'forbidden'); END IF;

  v_original := CASE WHEN v_row.answers_encrypted IS NULL THEN '{}'::jsonb
    ELSE public.decrypt_health_data(v_row.answers_encrypted) END;
  IF v_row.answers_encrypted IS NOT NULL AND v_original IS NULL THEN
    RAISE EXCEPTION 'candidate_answers_decrypt_failed';
  END IF;
  v_effective := public.trial_candidate_effective_answers_v1(p_candidate_id);
  v_history := public.trial_candidate_answer_corrections_history_v1(p_candidate_id);
  v_note := CASE WHEN v_row.review_note_encrypted IS NULL THEN NULL
    ELSE public.decrypt_health_data(v_row.review_note_encrypted) END;
  v_clarification := CASE WHEN v_row.clarification_request_encrypted IS NULL THEN NULL
    ELSE public.decrypt_health_data(v_row.clarification_request_encrypted) END;

  INSERT INTO public.trial_candidate_audit_events(candidate_id, actor_type, actor_id, action, is_health)
  VALUES (p_candidate_id, 'curator', p_curator_id, 'read_intake', TRUE);
  RETURN jsonb_build_object('success', true, 'intake', jsonb_build_object(
    'candidate_id', v_row.id, 'status', v_row.status, 'schema_version', v_row.schema_version,
    'current_step', v_row.current_step, 'answers', v_effective,
    'original_answers', v_original, 'answer_corrections', v_history,
    'internal_note', CASE WHEN v_note IS NULL THEN NULL ELSE v_note->>'text' END,
    'decision_checklist', CASE WHEN v_note IS NULL THEN NULL ELSE v_note->'checklist' END,
    'clarification_request', CASE WHEN v_clarification IS NULL THEN NULL ELSE v_clarification->>'text' END,
    'clarification_sections', v_row.clarification_sections,
    'decision_reason', v_row.decision_reason, 'updated_at', v_row.updated_at));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_trial_candidate_v4(
  p_candidate_id UUID,
  p_action TEXT,
  p_reason_code TEXT,
  p_internal_note TEXT,
  p_decision_checklist JSONB,
  p_curator_id UUID DEFAULT NULL,
  p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_candidate public.trial_candidates%ROWTYPE;
  v_effective JSONB;
  v_validation TEXT;
  v_conversion JSONB;
  v_client_id UUID;
  v_pin TEXT;
BEGIN
  SELECT * INTO v_candidate FROM public.trial_candidates
  WHERE id = p_candidate_id AND curator_id = p_curator_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'forbidden'); END IF;

  IF v_candidate.status = 'promoted' AND p_action = 'approved' THEN
    RETURN jsonb_build_object('success', true, 'status', 'promoted',
      'client_id', v_candidate.client_id, 'already_applied', true);
  END IF;
  IF v_candidate.status = 'rejected' AND p_action = 'rejected' THEN
    RETURN jsonb_build_object('success', true, 'status', 'rejected', 'already_applied', true);
  END IF;
  IF v_candidate.status NOT IN ('completed', 'needs_clarification', 'approved_waiting_slot') THEN
    RETURN jsonb_build_object('success', false, 'error', 'review_not_allowed');
  END IF;
  IF p_expected_updated_at IS NULL OR v_candidate.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'stale_intake', 'updated_at', v_candidate.updated_at);
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_action');
  END IF;
  IF NOT public.validate_trial_decision_checklist_v2(p_decision_checklist) THEN
    RETURN jsonb_build_object('success', false, 'error', 'decision_checklist_required');
  END IF;
  IF length(COALESCE(p_internal_note, '')) > 2000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'internal_note_too_long');
  END IF;

  IF p_action = 'approved' THEN
    IF EXISTS (SELECT 1 FROM jsonb_each(p_decision_checklist) AS field(key, value)
      WHERE field.value <> 'true'::jsonb) THEN
      RETURN jsonb_build_object('success', false, 'error', 'approval_checklist_failed');
    END IF;
    v_effective := public.trial_candidate_effective_answers_v1(p_candidate_id);
    v_validation := public.validate_trial_intake_answers_v2(v_effective, TRUE);
    IF v_validation IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error', v_validation);
    END IF;

    v_conversion := public.admin_convert_lead(v_candidate.lead_id, p_curator_id);
    IF COALESCE((v_conversion->>'success')::boolean, FALSE) IS NOT TRUE THEN RETURN v_conversion; END IF;
    v_client_id := (v_conversion->>'client_id')::uuid;
    v_pin := v_conversion->>'pin';
    UPDATE public.trial_intakes
    SET schema_version = v_candidate.schema_version, status = 'approved',
        current_step = v_candidate.current_step,
        answers_encrypted = public.encrypt_health_data(v_effective), answers_key_version = 1,
        review_note_encrypted = public.encrypt_health_data(jsonb_build_object(
          'text', NULLIF(BTRIM(COALESCE(p_internal_note, '')), ''),
          'checklist', p_decision_checklist)),
        started_at = v_candidate.started_at, completed_at = v_candidate.completed_at,
        reviewed_at = NOW(), updated_at = NOW()
    WHERE client_id = v_client_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'promoted_trial_intake_missing'; END IF;

    UPDATE public.trial_candidates
    SET status = 'promoted', client_id = v_client_id, reviewed_at = NOW(), updated_at = NOW()
    WHERE id = p_candidate_id;
    UPDATE public.trial_candidate_sessions
    SET revoked_at = COALESCE(revoked_at, NOW())
    WHERE candidate_id = p_candidate_id AND revoked_at IS NULL;
    INSERT INTO public.trial_candidate_audit_events(candidate_id, actor_type, actor_id, action, is_health)
    VALUES (p_candidate_id, 'curator', p_curator_id, 'promote_to_client', TRUE);
    RETURN jsonb_build_object('success', true, 'status', 'promoted',
      'client_id', v_client_id, 'pin', v_pin, 'intake_url', 'https://app.heyslab.ru/');
  END IF;

  IF p_reason_code IS NULL OR p_reason_code NOT IN (
    'out_of_scope', 'safety', 'unrealistic_expectations',
    'format_mismatch', 'candidate_withdrew'
  ) OR NULLIF(BTRIM(COALESCE(p_internal_note, '')), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'rejection_reason_required');
  END IF;
  UPDATE public.trial_candidates
  SET status = 'rejected', decision_reason = p_reason_code,
      review_note_encrypted = public.encrypt_health_data(jsonb_build_object(
        'text', BTRIM(p_internal_note), 'checklist', p_decision_checklist)),
      clarification_request_encrypted = NULL, clarification_sections = NULL,
      reviewed_at = NOW(), retention_delete_at = NOW() + INTERVAL '30 days', updated_at = NOW()
  WHERE id = p_candidate_id;
  UPDATE public.trial_candidate_sessions SET revoked_at = COALESCE(revoked_at, NOW())
  WHERE candidate_id = p_candidate_id AND revoked_at IS NULL;
  INSERT INTO public.trial_candidate_audit_events(
    candidate_id, actor_type, actor_id, action, is_health, metadata
  ) VALUES (
    p_candidate_id, 'curator', p_curator_id, 'review_intake', TRUE,
    jsonb_build_object('action', 'rejected', 'reason_code', p_reason_code)
  );
  RETURN jsonb_build_object('success', true, 'status', 'rejected');
END;
$$;

-- DSAR parity after promotion: the client receives the effective promoted
-- snapshot plus the immutable original/correction ledger retained by candidate.
CREATE OR REPLACE FUNCTION public.export_my_data_by_session(p_session_token TEXT)
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
  v_candidate public.trial_candidates%ROWTYPE;
  v_candidate_history JSONB;
  v_original JSONB;
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
  ) INTO v_intake FROM public.trial_intakes ti WHERE ti.client_id = v_client_id;

  SELECT * INTO v_candidate FROM public.trial_candidates WHERE client_id = v_client_id;
  IF FOUND THEN
    v_original := CASE WHEN v_candidate.answers_encrypted IS NULL THEN '{}'::jsonb
      ELSE public.decrypt_health_data(v_candidate.answers_encrypted) END;
    IF v_candidate.answers_encrypted IS NOT NULL AND v_original IS NULL THEN
      RAISE EXCEPTION 'candidate_answers_decrypt_failed';
    END IF;
    v_candidate_history := jsonb_build_object(
      'candidate_id', v_candidate.id,
      'schema_version', v_candidate.schema_version,
      'original_answers', v_original,
      'effective_answers', public.trial_candidate_effective_answers_v1(v_candidate.id),
      'answer_corrections', public.trial_candidate_answer_corrections_history_v1(v_candidate.id),
      'created_at', v_candidate.created_at,
      'reviewed_at', v_candidate.reviewed_at
    );
  END IF;

  PERFORM public.log_data_access(
    'client_self', v_client_id, v_client_id, 'export_my_data', NULL, true,
    NULL, NULL, jsonb_build_object(
      'includes_trial_intake', v_intake IS NOT NULL,
      'includes_candidate_history', v_candidate_history IS NOT NULL
    )
  );
  RETURN jsonb_build_object(
    'success', true, 'exported_at', NOW(), 'client', v_client,
    'consents', v_consents, 'kv_store', v_kv, 'subscription', v_subs,
    'leads_history', v_leads, 'trial_intake', v_intake,
    'trial_candidate_history', v_candidate_history,
    'disclaimer', 'Это экспорт всех ваших персональных данных, хранящихся в сервисе HEYS на момент запроса.'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trial_candidate_question_path_v1(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_trial_candidate_safety_question_v1(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trial_candidate_effective_answers_v1(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trial_candidate_answer_corrections_history_v1(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_trial_decision_checklist_v2(JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_add_trial_candidate_answer_correction_v1(
  UUID, TEXT, JSONB, TEXT, TEXT, BOOLEAN, BOOLEAN, UUID, UUID, UUID, TIMESTAMPTZ
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_review_trial_candidate_v4(
  UUID, TEXT, TEXT, TEXT, JSONB, UUID, TIMESTAMPTZ
) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_rpc') THEN
    REVOKE ALL ON TABLE public.trial_candidate_answer_corrections FROM heys_rpc;
    REVOKE EXECUTE ON FUNCTION public.trial_candidate_question_path_v1(TEXT) FROM heys_rpc;
    REVOKE EXECUTE ON FUNCTION public.is_trial_candidate_safety_question_v1(TEXT) FROM heys_rpc;
    REVOKE EXECUTE ON FUNCTION public.trial_candidate_effective_answers_v1(UUID) FROM heys_rpc;
    REVOKE EXECUTE ON FUNCTION public.trial_candidate_answer_corrections_history_v1(UUID) FROM heys_rpc;
    REVOKE EXECUTE ON FUNCTION public.validate_trial_decision_checklist_v2(JSONB) FROM heys_rpc;
    REVOKE EXECUTE ON FUNCTION public.admin_convert_lead(UUID, UUID) FROM heys_rpc;
    GRANT EXECUTE ON FUNCTION public.admin_get_trial_candidate(UUID, UUID) TO heys_rpc;
    GRANT EXECUTE ON FUNCTION public.admin_add_trial_candidate_answer_correction_v1(
      UUID, TEXT, JSONB, TEXT, TEXT, BOOLEAN, BOOLEAN, UUID, UUID, UUID, TIMESTAMPTZ
    ) TO heys_rpc;
    GRANT EXECUTE ON FUNCTION public.admin_review_trial_candidate_v4(
      UUID, TEXT, TEXT, TEXT, JSONB, UUID, TIMESTAMPTZ
    ) TO heys_rpc;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_admin') THEN
    REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
      ON TABLE public.trial_candidate_answer_corrections FROM heys_admin;
    GRANT SELECT, INSERT ON TABLE public.trial_candidate_answer_corrections TO heys_admin;
    GRANT EXECUTE ON FUNCTION public.trial_candidate_question_path_v1(TEXT) TO heys_admin;
    GRANT EXECUTE ON FUNCTION public.is_trial_candidate_safety_question_v1(TEXT) TO heys_admin;
    GRANT EXECUTE ON FUNCTION public.trial_candidate_effective_answers_v1(UUID) TO heys_admin;
    GRANT EXECUTE ON FUNCTION public.trial_candidate_answer_corrections_history_v1(UUID) TO heys_admin;
    GRANT EXECUTE ON FUNCTION public.validate_trial_decision_checklist_v2(JSONB) TO heys_admin;
    GRANT EXECUTE ON FUNCTION public.admin_get_trial_candidate(UUID, UUID) TO heys_admin;
    GRANT EXECUTE ON FUNCTION public.admin_add_trial_candidate_answer_correction_v1(
      UUID, TEXT, JSONB, TEXT, TEXT, BOOLEAN, BOOLEAN, UUID, UUID, UUID, TIMESTAMPTZ
    ) TO heys_admin;
    GRANT EXECUTE ON FUNCTION public.admin_review_trial_candidate_v4(
      UUID, TEXT, TEXT, TEXT, JSONB, UUID, TIMESTAMPTZ
    ) TO heys_admin;
    -- Lower-level conversion remains owner-only for the nested SECURITY DEFINER call.
    GRANT EXECUTE ON FUNCTION public.admin_convert_lead(UUID, UUID) TO heys_admin;
  END IF;
END;
$$;
