-- HEYS trial intake health minimization v1.
-- Schema 1.2: replace health/safety questionnaire sections with warning acknowledgement.

ALTER TABLE public.trial_intakes
  DROP CONSTRAINT IF EXISTS trial_intakes_current_step_check;

ALTER TABLE public.trial_intakes
  ADD CONSTRAINT trial_intakes_current_step_check
  CHECK (current_step BETWEEN 0 AND 4);

ALTER TABLE public.trial_candidates
  DROP CONSTRAINT IF EXISTS trial_candidates_current_step_check;

ALTER TABLE public.trial_candidates
  ADD CONSTRAINT trial_candidates_current_step_check
  CHECK (current_step BETWEEN 0 AND 4);

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
  v_allowed_sections TEXT[];
  v_allowed_fields TEXT[];
  v_unknown_field TEXT;
  v_invalid_field TEXT;
  v_safety_field TEXT;
BEGIN
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object'
     OR octet_length(p_answers::text) > 65536 THEN
    RETURN 'invalid_answers';
  END IF;

  v_schema_version := COALESCE(p_answers #>> '{meta,schema_version}', '');
  IF v_schema_version NOT IN ('1.0', '1.1', '1.2') THEN
    RETURN 'unsupported_schema_version';
  END IF;

  v_allowed_sections := CASE v_schema_version
    WHEN '1.2' THEN ARRAY[
      'goals', 'experience', 'lifestyle', 'collaboration', 'warning', 'meta'
    ]
    ELSE ARRAY[
      'goals', 'experience', 'lifestyle', 'collaboration',
      'health', 'safety', 'meta'
    ]
  END;

  SELECT fields.field_name INTO v_unknown_field
  FROM jsonb_object_keys(p_answers) AS fields(field_name)
  WHERE NOT (fields.field_name = ANY(v_allowed_sections))
  LIMIT 1;
  IF v_unknown_field IS NOT NULL THEN RETURN 'unknown_answer_section'; END IF;

  FOREACH v_section IN ARRAY v_allowed_sections LOOP
    IF NOT (p_answers ? v_section)
       OR jsonb_typeof(p_answers -> v_section) <> 'object' THEN
      RETURN 'invalid_answer_section';
    END IF;

    v_allowed_fields := CASE
      WHEN v_schema_version = '1.2' AND v_section = 'warning' THEN
        ARRAY['acknowledged_at', 'text_version']
      WHEN v_section = 'goals' THEN ARRAY['primary_goal', 'success_definition', 'time_expectations']
      WHEN v_section = 'experience' THEN ARRAY['previous_experience', 'what_worked', 'what_did_not_work']
      WHEN v_section = 'lifestyle' THEN ARRAY['schedule', 'sleep', 'activity', 'constraints']
      WHEN v_section = 'collaboration' THEN ARRAY['daily_tracking', 'feedback_style', 'expectations_from_curator']
      WHEN v_section = 'health' THEN ARRAY[
        'chronic_conditions_status', 'chronic_conditions',
        'medications_status', 'medications',
        'injuries_operations_status', 'injuries_operations',
        'allergies_status', 'allergies',
        'pregnancy_lactation', 'eating_disorder_history',
        'doctor_restrictions_status', 'doctor_restrictions'
      ]
      WHEN v_section = 'safety' THEN ARRAY[
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
  ) THEN
    RETURN 'invalid_answer_option';
  END IF;

  IF v_schema_version IN ('1.0', '1.1') THEN
    IF COALESCE(p_answers #>> '{health,pregnancy_lactation}', '') NOT IN (
      '', 'no', 'pregnancy', 'lactation', 'not_applicable', 'prefer_not'
    ) OR COALESCE(p_answers #>> '{health,eating_disorder_history}', '') NOT IN (
      '', 'no', 'past', 'current', 'unsure', 'prefer_not'
    ) THEN
      RETURN 'invalid_answer_option';
    END IF;
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

  IF p_complete AND v_schema_version = '1.2' AND (
    BTRIM(COALESCE(p_answers #>> '{warning,acknowledged_at}', '')) = '' OR
    BTRIM(COALESCE(p_answers #>> '{warning,text_version}', '')) = ''
  ) THEN RETURN 'required_answers_missing'; END IF;

  RETURN NULL;
END;
$$;

DROP FUNCTION IF EXISTS public.save_trial_intake_by_session(
  TEXT, JSONB, SMALLINT, BOOLEAN, TIMESTAMPTZ
);

CREATE FUNCTION public.save_trial_intake_by_session(
  p_session_token TEXT,
  p_answers JSONB,
  p_current_step SMALLINT,
  p_complete BOOLEAN DEFAULT FALSE,
  p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
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
  v_schema_version TEXT;
  v_validation_error TEXT;
  v_updated_at TIMESTAMPTZ;
  v_saved_at TIMESTAMPTZ;
BEGIN
  SELECT cs.client_id INTO v_client_id
  FROM public.client_sessions cs
  WHERE cs.token_hash = digest(p_session_token, 'sha256')
    AND cs.expires_at > NOW()
    AND cs.revoked_at IS NULL;

  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_session');
  END IF;

  v_validation_error := public.validate_trial_intake_answers_v2(p_answers, p_complete);
  IF v_validation_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', v_validation_error);
  END IF;

  IF p_current_step < 0 OR p_current_step > 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_step');
  END IF;

  SELECT ti.status, ti.updated_at INTO v_status, v_updated_at
  FROM public.trial_intakes ti
  WHERE ti.client_id = v_client_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_invited');
  END IF;
  IF v_status NOT IN (
    'invite_sent', 'invited', 'in_progress', 'needs_clarification'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'intake_locked', 'status', v_status);
  END IF;
  IF p_expected_updated_at IS NOT NULL
     AND v_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'stale_draft',
      'status', v_status, 'updated_at', v_updated_at
    );
  END IF;

  v_schema_version := p_answers #>> '{meta,schema_version}';
  v_next_status := CASE
    WHEN p_complete THEN 'completed'
    WHEN v_status = 'needs_clarification' THEN 'needs_clarification'
    ELSE 'in_progress'
  END;

  UPDATE public.trial_intakes
  SET answers_encrypted = public.encrypt_health_data(p_answers),
      answers_key_version = 1,
      schema_version = v_schema_version,
      current_step = p_current_step,
      status = v_next_status,
      started_at = COALESCE(started_at, NOW()),
      last_client_activity_at = NOW(),
      completed_at = CASE WHEN p_complete THEN NOW() ELSE completed_at END,
      decision_reason = CASE WHEN p_complete THEN NULL ELSE decision_reason END,
      clarification_request_encrypted = CASE
        WHEN p_complete THEN NULL ELSE clarification_request_encrypted END,
      clarification_sections = CASE WHEN p_complete THEN NULL ELSE clarification_sections END,
      retention_delete_at = NULL,
      updated_at = NOW()
  WHERE client_id = v_client_id
  RETURNING updated_at INTO v_saved_at;

  PERFORM public.log_data_access(
    'client_self', v_client_id, v_client_id, 'write_trial_intake',
    ARRAY['trial_intake_v2'], true, NULL, NULL,
    jsonb_build_object('schema_version', v_schema_version, 'complete', p_complete)
  );

  RETURN jsonb_build_object(
    'success', true,
    'status', v_next_status,
    'current_step', p_current_step,
    'updated_at', v_saved_at,
    'saved_at', v_saved_at
  );
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
  v_validation := public.validate_trial_intake_answers_v2(p_answers, p_complete);
  IF v_validation IS NOT NULL THEN RETURN jsonb_build_object('success', false, 'error', v_validation); END IF;
  IF p_current_step < 0 OR p_current_step > 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_step');
  END IF;
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

UPDATE public.trial_intakes ti
SET answers_encrypted = public.encrypt_health_data(
      ((public.decrypt_health_data(ti.answers_encrypted) - 'health' - 'safety')
        || jsonb_build_object(
          'warning', '{}'::jsonb,
          'meta', jsonb_build_object('schema_version', '1.2')
        ))
    ),
    schema_version = '1.2',
    current_step = LEAST(ti.current_step, 4)
WHERE ti.answers_encrypted IS NOT NULL
  AND public.decrypt_health_data(ti.answers_encrypted) IS NOT NULL
  AND COALESCE(public.decrypt_health_data(ti.answers_encrypted) #>> '{meta,schema_version}', '') <> '1.2';

UPDATE public.trial_candidates tc
SET answers_encrypted = public.encrypt_health_data(
      ((public.decrypt_health_data(tc.answers_encrypted) - 'health' - 'safety')
        || jsonb_build_object(
          'warning', '{}'::jsonb,
          'meta', jsonb_build_object('schema_version', '1.2')
        ))
    ),
    schema_version = '1.2',
    current_step = LEAST(tc.current_step, 4)
WHERE tc.answers_encrypted IS NOT NULL
  AND public.decrypt_health_data(tc.answers_encrypted) IS NOT NULL
  AND COALESCE(public.decrypt_health_data(tc.answers_encrypted) #>> '{meta,schema_version}', '') <> '1.2';

REVOKE EXECUTE ON FUNCTION public.save_trial_intake_by_session(
  TEXT, JSONB, SMALLINT, BOOLEAN, TIMESTAMPTZ
) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_rpc') THEN
    GRANT EXECUTE ON FUNCTION public.save_trial_intake_by_session(
      TEXT, JSONB, SMALLINT, BOOLEAN, TIMESTAMPTZ
    ) TO heys_rpc;
  END IF;
END $$;
