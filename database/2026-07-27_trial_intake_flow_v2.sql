-- HEYS: protected trial-candidate intake v2
-- Additive forward migration: explicit invite delivery, client-visible
-- clarifications, mandatory safety answers, waiting-list approval and
-- abandoned/reapplication lifecycle.
-- NO ROLLBACK: once v2 statuses, client clarifications and decision records
-- exist, restoring the v1 constraints/functions would make persisted workflow
-- state unreadable. Recovery must use a forward-fix migration.

ALTER TABLE public.trial_intakes
  ADD COLUMN IF NOT EXISTS invite_prepared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invite_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_client_activity_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clarification_request_encrypted BYTEA,
  ADD COLUMN IF NOT EXISTS clarification_sections TEXT[];

ALTER TABLE public.trial_intakes
  ALTER COLUMN schema_version SET DEFAULT '1.1';

ALTER TABLE public.trial_intakes
  DROP CONSTRAINT IF EXISTS trial_intakes_status_check;
ALTER TABLE public.trial_intakes
  ADD CONSTRAINT trial_intakes_status_check
  CHECK (status IN (
    'not_invited', 'invite_prepared', 'invite_sent', 'invited',
    'in_progress', 'completed', 'needs_clarification',
    'approved', 'approved_waiting_slot', 'rejected'
  ));

UPDATE public.trial_intakes
SET invite_prepared_at = COALESCE(invite_prepared_at, invited_at, created_at),
    invite_sent_at = CASE
      WHEN status IN (
        'invited', 'in_progress', 'completed', 'needs_clarification',
        'approved', 'approved_waiting_slot', 'rejected'
      ) THEN COALESCE(invite_sent_at, invited_at, created_at)
      ELSE invite_sent_at
    END,
    last_client_activity_at = CASE
      WHEN status IN ('in_progress', 'completed', 'needs_clarification',
                      'approved', 'approved_waiting_slot', 'rejected')
      THEN COALESCE(last_client_activity_at, completed_at, updated_at)
      ELSE last_client_activity_at
    END
WHERE invite_prepared_at IS NULL
   OR (invite_sent_at IS NULL AND status <> 'not_invited')
   OR (last_client_activity_at IS NULL AND status IN (
     'in_progress', 'completed', 'needs_clarification',
     'approved', 'approved_waiting_slot', 'rejected'
   ));

CREATE INDEX IF NOT EXISTS trial_intakes_abandoned_idx
  ON public.trial_intakes (
    COALESCE(last_client_activity_at, invite_sent_at, invite_prepared_at, created_at)
  )
  WHERE status IN (
    'invite_prepared', 'invite_sent', 'invited',
    'in_progress', 'needs_clarification'
  );

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
  IF v_unknown_field IS NOT NULL THEN
    RETURN 'unknown_answer_section';
  END IF;

  v_schema_version := COALESCE(p_answers #>> '{meta,schema_version}', '');
  IF v_schema_version NOT IN ('1.0', '1.1') THEN
    RETURN 'unsupported_schema_version';
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
    IF v_unknown_field IS NOT NULL THEN
      RETURN 'unknown_answer_field';
    END IF;

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
    IF v_invalid_field IS NOT NULL THEN
      RETURN 'invalid_answer_type';
    END IF;
  END LOOP;

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

  IF v_schema_version = '1.1' THEN
    FOREACH v_safety_field IN ARRAY ARRAY[
      'acute_symptoms', 'recent_surgery', 'active_ed_concern', 'medical_supervision'
    ] LOOP
      IF COALESCE(p_answers #>> ARRAY['safety', v_safety_field], '') NOT IN (
        '', 'no', 'yes', 'prefer_not'
      ) THEN
        RETURN 'invalid_answer_option';
      END IF;
    END LOOP;

    FOREACH v_safety_field IN ARRAY ARRAY[
      'chronic_conditions_status', 'medications_status',
      'injuries_operations_status', 'allergies_status',
      'doctor_restrictions_status'
    ] LOOP
      IF COALESCE(p_answers #>> ARRAY['health', v_safety_field], '') NOT IN (
        '', 'no', 'yes', 'prefer_not'
      ) THEN
        RETURN 'invalid_answer_option';
      END IF;
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
  ) THEN
    RETURN 'required_answers_missing';
  END IF;

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
  ) THEN
    RETURN 'required_answers_missing';
  END IF;

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
  ) THEN
    RETURN 'conditional_details_missing';
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
  v_clarification JSONB;
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

  v_answers := CASE WHEN v_row.answers_encrypted IS NULL THEN '{}'::jsonb
    ELSE public.decrypt_health_data(v_row.answers_encrypted) END;
  v_clarification := CASE
    WHEN v_row.status <> 'needs_clarification'
      OR v_row.clarification_request_encrypted IS NULL THEN NULL
    ELSE public.decrypt_health_data(v_row.clarification_request_encrypted)
  END;

  IF (v_row.answers_encrypted IS NOT NULL AND v_answers IS NULL)
     OR (v_row.clarification_request_encrypted IS NOT NULL
         AND v_row.status = 'needs_clarification' AND v_clarification IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'decrypt_failed');
  END IF;

  PERFORM public.log_data_access(
    'client_self', v_client_id, v_client_id, 'read_trial_intake',
    ARRAY['trial_intake_v2'], true, NULL, NULL,
    jsonb_build_object('schema_version', v_row.schema_version)
  );

  RETURN jsonb_build_object(
    'success', true,
    'intake', jsonb_build_object(
      'schema_version', v_row.schema_version,
      'status', v_row.status,
      'current_step', v_row.current_step,
      'answers', v_answers,
      'clarification_request', CASE
        WHEN v_clarification IS NULL THEN NULL ELSE v_clarification->>'text' END,
      'clarification_sections', COALESCE(to_jsonb(v_row.clarification_sections), '[]'::jsonb),
      'invite_prepared_at', v_row.invite_prepared_at,
      'invite_sent_at', v_row.invite_sent_at,
      'started_at', v_row.started_at,
      'completed_at', v_row.completed_at,
      'reviewed_at', v_row.reviewed_at,
      'updated_at', v_row.updated_at
    )
  );
END;
$$;

DROP FUNCTION IF EXISTS public.save_trial_intake_by_session(TEXT, JSONB, SMALLINT, BOOLEAN);
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

  v_validation_error := public.validate_trial_intake_answers_v2(p_answers, p_complete);
  IF v_validation_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', v_validation_error);
  END IF;

  IF p_current_step < 0 OR p_current_step > 5 THEN
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
    jsonb_build_object('complete', p_complete, 'current_step', p_current_step)
  );

  RETURN jsonb_build_object(
    'success', true,
    'status', v_next_status,
    'current_step', p_current_step,
    'saved_at', v_saved_at,
    'updated_at', v_saved_at
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
  IF EXISTS (
    SELECT 1 FROM public.trial_queue tq
    WHERE tq.client_id = p_client_id
      AND tq.source IN ('trial_intake_purged', 'trial_intake_health_revoked')
  ) AND NOT EXISTS (
    SELECT 1 FROM public.trial_intakes ti WHERE ti.client_id = p_client_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'reapplication_required');
  END IF;

  INSERT INTO public.trial_intakes (
    client_id, curator_id, schema_version, status,
    invite_prepared_at, invited_at, updated_at
  ) VALUES (
    p_client_id, p_curator_id, '1.1', 'invite_prepared',
    NOW(), NOW(), NOW()
  )
  ON CONFLICT (client_id) DO UPDATE SET
    curator_id = EXCLUDED.curator_id,
    status = 'invite_prepared',
    invite_prepared_at = NOW(),
    invited_at = COALESCE(trial_intakes.invited_at, NOW()),
    updated_at = NOW()
  WHERE trial_intakes.status IN ('not_invited', 'invite_prepared', 'invited')
  RETURNING status INTO v_status;

  IF v_status IS NULL THEN
    SELECT status INTO v_status
    FROM public.trial_intakes
    WHERE client_id = p_client_id;
    RETURN jsonb_build_object(
      'success', false, 'error', 'invite_not_allowed', 'status', v_status
    );
  END IF;

  INSERT INTO public.trial_queue (
    client_id, curator_id, status, queued_at, canceled_at, source, updated_at
  )
  VALUES (p_client_id, p_curator_id, 'queued', NOW(), NULL, 'trial_intake', NOW())
  ON CONFLICT (client_id) DO UPDATE SET
    curator_id = p_curator_id,
    status = 'queued', queued_at = NOW(),
    offer_sent_at = NULL, offer_expires_at = NULL, assigned_at = NULL,
    canceled_at = NULL,
    source = 'trial_intake', updated_at = NOW();

  PERFORM public.log_data_access(
    'curator', p_curator_id, p_client_id, 'prepare_trial_invite',
    ARRAY['trial_intake_v2'], false, NULL, NULL,
    jsonb_build_object('status', v_status)
  );

  RETURN jsonb_build_object(
    'success', true,
    'status', v_status,
    'intake_url', 'https://app.heyslab.ru/?intake=1'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_mark_trial_intake_invite_sent(
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
  v_sent_at TIMESTAMPTZ;
BEGIN
  IF p_curator_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = p_client_id AND c.curator_id = p_curator_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  UPDATE public.trial_intakes
  SET status = 'invite_sent',
      invite_sent_at = COALESCE(invite_sent_at, NOW()),
      updated_at = CASE WHEN status = 'invite_sent' THEN updated_at ELSE NOW() END
  WHERE client_id = p_client_id
    AND status IN ('invite_prepared', 'invite_sent', 'invited')
  RETURNING status, invite_sent_at INTO v_status, v_sent_at;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invite_not_prepared');
  END IF;

  PERFORM public.log_data_access(
    'curator', p_curator_id, p_client_id, 'mark_trial_invite_sent',
    ARRAY['trial_intake_v2'], false, NULL, NULL,
    jsonb_build_object('status', v_status)
  );

  RETURN jsonb_build_object('success', true, 'status', v_status, 'sent_at', v_sent_at);
END;
$$;

-- Atomic curator entry point: a lead is either converted and left with a
-- recoverable prepared invite, or neither change is persisted.
CREATE OR REPLACE FUNCTION public.admin_prepare_trial_candidate_from_lead(
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
  v_converted JSONB;
  v_prepared JSONB;
  v_client_id UUID;
  v_phone_lock_key TEXT;
BEGIN
  SELECT * INTO v_lead
  FROM public.leads
  WHERE id = p_lead_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'lead_not_found');
  END IF;
  IF p_curator_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'curator_id_required');
  END IF;
  IF v_lead.curator_id IS NOT NULL
     AND v_lead.curator_id IS DISTINCT FROM p_curator_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;
  IF v_lead.status = 'converted' THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'lead_already_converted', 'client_id', v_lead.client_id
    );
  END IF;
  IF v_lead.status NOT IN ('new', 'contacted')
     OR v_lead.consent_accepted_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'fresh_application_required');
  END IF;

  v_phone_lock_key := regexp_replace(COALESCE(v_lead.phone, ''), '[^0-9]', '', 'g');
  PERFORM pg_advisory_xact_lock(hashtext('trial_phone:' || v_phone_lock_key));

  BEGIN
    v_converted := public.admin_convert_lead(p_lead_id, p_curator_id);
    IF COALESCE((v_converted->>'success')::boolean, false) IS NOT TRUE THEN
      RETURN v_converted;
    END IF;

    v_client_id := (v_converted->>'client_id')::uuid;
    v_prepared := public.admin_invite_trial_intake(v_client_id, p_curator_id);
    IF COALESCE((v_prepared->>'success')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invite_prepare_failed';
    END IF;

    RETURN v_converted || jsonb_build_object(
      'intake_status', 'invite_prepared',
      'intake_url', v_prepared->>'intake_url'
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invite_prepare_failed');
  END;
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
        'invite_prepared_at', ti.invite_prepared_at,
        'invite_sent_at', ti.invite_sent_at,
        'started_at', ti.started_at,
        'completed_at', ti.completed_at,
        'reviewed_at', ti.reviewed_at,
        'updated_at', ti.updated_at,
        'decision_reason', ti.decision_reason,
        'inactive_days', GREATEST(
          0,
          FLOOR(EXTRACT(EPOCH FROM (
            NOW() - CASE
              WHEN ti.status = 'needs_clarification' THEN GREATEST(
                ti.reviewed_at, ti.updated_at, ti.last_client_activity_at, ti.created_at
              )
              ELSE COALESCE(
                ti.last_client_activity_at, ti.invite_sent_at,
                ti.invite_prepared_at, ti.created_at
              )
            END
          )) / 86400)
        )::integer
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
  v_clarification JSONB;
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
  v_clarification := CASE WHEN v_row.clarification_request_encrypted IS NULL THEN NULL
    ELSE public.decrypt_health_data(v_row.clarification_request_encrypted) END;

  IF (v_row.answers_encrypted IS NOT NULL AND v_answers IS NULL)
     OR (v_row.review_note_encrypted IS NOT NULL AND v_note IS NULL)
     OR (v_row.clarification_request_encrypted IS NOT NULL AND v_clarification IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'decrypt_failed');
  END IF;

  PERFORM public.log_data_access(
    'curator', p_curator_id, p_client_id, 'read_trial_intake',
    ARRAY['trial_intake_v2'], true, NULL, NULL,
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
      'decision_checklist', CASE WHEN v_note IS NULL THEN NULL ELSE v_note->'checklist' END,
      'clarification_request', CASE
        WHEN v_clarification IS NULL THEN NULL ELSE v_clarification->>'text' END,
      'clarification_sections', COALESCE(to_jsonb(v_row.clarification_sections), '[]'::jsonb),
      'decision_reason', v_row.decision_reason,
      'invite_prepared_at', v_row.invite_prepared_at,
      'invite_sent_at', v_row.invite_sent_at,
      'started_at', v_row.started_at,
      'completed_at', v_row.completed_at,
      'reviewed_at', v_row.reviewed_at,
      'updated_at', v_row.updated_at
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_trial_decision_checklist_v1(
  p_checklist JSONB
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_checklist IS NOT NULL
    AND jsonb_typeof(p_checklist) = 'object'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_object_keys(p_checklist) AS fields(field_name)
      WHERE fields.field_name NOT IN (
        'within_scope', 'understands_boundaries', 'ready_to_track',
        'realistic_expectations', 'safe_format', 'slot_available'
      )
    )
    AND (
      SELECT COUNT(*) = 6
      FROM jsonb_each(p_checklist) AS fields(field_name, field_value)
      WHERE fields.field_name IN (
        'within_scope', 'understands_boundaries', 'ready_to_track',
        'realistic_expectations', 'safe_format', 'slot_available'
      )
        AND jsonb_typeof(fields.field_value) = 'boolean'
    );
$$;

DROP FUNCTION IF EXISTS public.admin_review_trial_intake_v2(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT[], JSONB, UUID
);
DROP FUNCTION IF EXISTS public.admin_review_trial_intake_v2(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT[], JSONB, TIMESTAMPTZ, UUID
);
DROP FUNCTION IF EXISTS public.admin_review_trial_intake_v2(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT[], JSONB, UUID, TIMESTAMPTZ
);

CREATE FUNCTION public.admin_review_trial_intake_v2(
  p_client_id UUID,
  p_action TEXT,
  p_reason_code TEXT DEFAULT NULL,
  p_internal_note TEXT DEFAULT NULL,
  p_client_message TEXT DEFAULT NULL,
  p_clarification_sections TEXT[] DEFAULT NULL,
  p_decision_checklist JSONB DEFAULT NULL,
  p_curator_id UUID DEFAULT NULL,
  p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_status TEXT;
  v_current_updated_at TIMESTAMPTZ;
  v_saved_at TIMESTAMPTZ;
  v_note TEXT := NULLIF(BTRIM(COALESCE(p_internal_note, '')), '');
  v_client_message TEXT := NULLIF(BTRIM(COALESCE(p_client_message, '')), '');
  v_allowed_sections CONSTANT TEXT[] := ARRAY[
    'goals', 'experience', 'lifestyle', 'collaboration', 'health', 'safety'
  ];
BEGIN
  IF p_curator_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = p_client_id AND c.curator_id = p_curator_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  IF p_action NOT IN (
    'needs_clarification', 'approved', 'approved_waiting_slot', 'rejected'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_action');
  END IF;

  IF p_action = 'rejected' AND (
    p_reason_code IS NULL OR p_reason_code NOT IN (
      'out_of_scope', 'safety', 'unrealistic_expectations',
      'format_mismatch', 'candidate_withdrew'
    ) OR v_note IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'rejection_reason_required');
  END IF;

  IF p_action = 'needs_clarification' AND (
    v_client_message IS NULL
    OR COALESCE(array_length(p_clarification_sections, 1), 0) = 0
    OR EXISTS (
      SELECT 1 FROM unnest(p_clarification_sections) AS section_name
      WHERE NOT (section_name = ANY(v_allowed_sections))
    )
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'clarification_request_required');
  END IF;

  IF p_action IN ('approved', 'approved_waiting_slot', 'rejected')
     AND NOT public.validate_trial_decision_checklist_v1(p_decision_checklist) THEN
    RETURN jsonb_build_object('success', false, 'error', 'decision_checklist_required');
  END IF;

  IF p_action = 'approved' AND (
    p_decision_checklist->>'within_scope' <> 'true'
    OR p_decision_checklist->>'understands_boundaries' <> 'true'
    OR p_decision_checklist->>'ready_to_track' <> 'true'
    OR p_decision_checklist->>'realistic_expectations' <> 'true'
    OR p_decision_checklist->>'safe_format' <> 'true'
    OR p_decision_checklist->>'slot_available' <> 'true'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'approval_checklist_failed');
  END IF;

  IF p_action = 'approved_waiting_slot' AND (
    p_decision_checklist->>'within_scope' <> 'true'
    OR p_decision_checklist->>'understands_boundaries' <> 'true'
    OR p_decision_checklist->>'ready_to_track' <> 'true'
    OR p_decision_checklist->>'realistic_expectations' <> 'true'
    OR p_decision_checklist->>'safe_format' <> 'true'
    OR p_decision_checklist->>'slot_available' <> 'false'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'waiting_slot_checklist_failed');
  END IF;

  IF v_note IS NOT NULL AND length(v_note) > 2000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'internal_note_too_long');
  END IF;
  IF v_client_message IS NOT NULL AND length(v_client_message) > 1200 THEN
    RETURN jsonb_build_object('success', false, 'error', 'client_message_too_long');
  END IF;

  SELECT status, updated_at INTO v_current_status, v_current_updated_at
  FROM public.trial_intakes
  WHERE client_id = p_client_id
  FOR UPDATE;
  IF v_current_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  IF v_current_status NOT IN ('completed', 'needs_clarification') THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'review_not_allowed', 'status', v_current_status
    );
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'expected_updated_at_required');
  END IF;
  IF v_current_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'stale_intake',
      'status', v_current_status, 'updated_at', v_current_updated_at
    );
  END IF;

  UPDATE public.trial_intakes
  SET status = p_action,
      decision_reason = CASE WHEN p_action = 'rejected' THEN p_reason_code ELSE NULL END,
      review_note_encrypted = CASE
        WHEN v_note IS NULL AND p_decision_checklist IS NULL THEN NULL
        ELSE public.encrypt_health_data(jsonb_build_object(
          'text', v_note, 'checklist', p_decision_checklist
        ))
      END,
      clarification_request_encrypted = CASE
        WHEN p_action = 'needs_clarification'
          THEN public.encrypt_health_data(jsonb_build_object('text', v_client_message))
        ELSE NULL
      END,
      clarification_sections = CASE
        WHEN p_action = 'needs_clarification' THEN p_clarification_sections
        ELSE NULL
      END,
      reviewed_at = NOW(),
      retention_delete_at = CASE
        WHEN p_action = 'rejected' THEN NOW() + INTERVAL '30 days'
        ELSE NULL
      END,
      updated_at = NOW()
  WHERE client_id = p_client_id
  RETURNING updated_at INTO v_saved_at;

  PERFORM public.log_data_access(
    'curator', p_curator_id, p_client_id, 'review_trial_intake',
    ARRAY['trial_intake_v2'], true, NULL, NULL,
    jsonb_build_object(
      'action', p_action,
      'reason_code', p_reason_code,
      'clarification_sections', p_clarification_sections
    )
  );

  RETURN jsonb_build_object(
    'success', true, 'status', p_action, 'updated_at', v_saved_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_expired_trial_intakes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER := 0;
  v_client_id UUID;
BEGIN
  FOR v_client_id IN
    SELECT ti.client_id
    FROM public.trial_intakes ti
    WHERE (
      status = 'rejected'
      AND retention_delete_at IS NOT NULL
      AND retention_delete_at <= NOW()
    ) OR (
      status IN (
        'invite_prepared', 'invite_sent', 'invited',
        'in_progress', 'needs_clarification'
      )
      AND CASE
        WHEN status = 'needs_clarification'
          THEN GREATEST(reviewed_at, updated_at, last_client_activity_at, created_at)
        ELSE COALESCE(
          last_client_activity_at, invite_sent_at, invite_prepared_at, created_at
        )
      END <= NOW() - INTERVAL '30 days'
    )
    FOR UPDATE
  LOOP
    DELETE FROM public.trial_intakes WHERE client_id = v_client_id;

    UPDATE public.client_sessions
    SET revoked_at = COALESCE(revoked_at, NOW())
    WHERE client_id = v_client_id AND revoked_at IS NULL;

    INSERT INTO public.trial_queue (
      client_id, status, queued_at, canceled_at, source, updated_at
    ) VALUES (
      v_client_id, 'canceled', NOW(), NOW(), 'trial_intake_purged', NOW()
    )
    ON CONFLICT (client_id) DO UPDATE SET
      status = 'canceled',
      canceled_at = COALESCE(trial_queue.canceled_at, NOW()),
      source = 'trial_intake_purged',
      updated_at = NOW();

    PERFORM public.log_data_access(
      'system', NULL, v_client_id, 'purge_trial_intake',
      ARRAY['trial_intake_v2', 'client_sessions'], true, NULL, NULL,
      jsonb_build_object('reason', 'retention_expired')
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Override the deferred re-consent trigger from migration #8. A genuine
-- health-consent revoke removes encrypted intake data and leaves a tombstone,
-- so legacy activation can never treat the candidate as pre-intake.
CREATE OR REPLACE FUNCTION public.purge_trial_intake_on_health_revoke()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted BOOLEAN := false;
BEGIN
  IF NEW.consent_type = 'health_data'
     AND (NEW.granted = FALSE OR NEW.revoked_at IS NOT NULL)
     AND (OLD.granted IS DISTINCT FROM NEW.granted OR OLD.revoked_at IS DISTINCT FROM NEW.revoked_at)
     AND NOT EXISTS (
       SELECT 1
       FROM public.consents c
       WHERE c.client_id = NEW.client_id
         AND c.consent_type = 'health_data'
         AND c.granted = TRUE
         AND c.is_active = TRUE
         AND c.revoked_at IS NULL
     ) THEN
    DELETE FROM public.trial_intakes
    WHERE client_id = NEW.client_id
    RETURNING true INTO v_deleted;

    IF v_deleted THEN
      DELETE FROM public.client_kv_store
      WHERE client_id = NEW.client_id AND public.is_health_key(k);

      UPDATE public.client_sessions
      SET revoked_at = COALESCE(revoked_at, NOW())
      WHERE client_id = NEW.client_id AND revoked_at IS NULL;

      INSERT INTO public.trial_queue (
        client_id, status, queued_at, canceled_at, source, updated_at
      ) VALUES (
        NEW.client_id, 'canceled', NOW(), NOW(), 'trial_intake_health_revoked', NOW()
      )
      ON CONFLICT (client_id) DO UPDATE SET
        status = 'canceled', canceled_at = COALESCE(trial_queue.canceled_at, NOW()),
        source = 'trial_intake_health_revoked', updated_at = NOW();

      PERFORM public.log_data_access(
        'client_self', NEW.client_id, NEW.client_id, 'revoke_trial_intake',
        ARRAY['trial_intake_v2', 'client_sessions', 'health_kv'], true, NULL, NULL,
        jsonb_build_object('reason', 'health_consent_revoked')
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reopen_trial_candidate(
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
  v_client RECORD;
  v_intake RECORD;
  v_phone_clean TEXT;
  v_phone_normalized TEXT;
  v_pin TEXT;
  v_pin_hash TEXT;
  v_pin_token UUID := gen_random_uuid();
  v_pin_token_expires TIMESTAMPTZ := NOW() + INTERVAL '7 days';
  v_eligible_at TIMESTAMPTZ;
  v_match_count INTEGER;
  v_effective_status TEXT;
BEGIN
  SELECT * INTO v_lead
  FROM public.leads
  WHERE id = p_lead_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'lead_not_found');
  END IF;
  IF p_curator_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'curator_id_required');
  END IF;
  IF v_lead.curator_id IS NOT NULL
     AND v_lead.curator_id IS DISTINCT FROM p_curator_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;
  IF v_lead.status = 'converted' THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'lead_already_converted', 'client_id', v_lead.client_id
    );
  END IF;
  IF v_lead.status NOT IN ('new', 'contacted')
     OR v_lead.consent_accepted_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'fresh_application_required');
  END IF;

  v_phone_clean := regexp_replace(v_lead.phone, '[^0-9]', '', 'g');
  v_phone_normalized := regexp_replace(v_lead.phone, '[^0-9+]', '', 'g');

  SELECT COUNT(*) INTO v_match_count
  FROM public.clients
  WHERE phone = v_phone_clean OR phone_normalized = v_phone_normalized;
  IF v_match_count > 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'ambiguous_existing_client');
  END IF;

  SELECT * INTO v_client
  FROM public.clients
  WHERE phone = v_phone_clean OR phone_normalized = v_phone_normalized
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'existing_client_not_found');
  END IF;
  IF v_client.curator_id IS DISTINCT FROM p_curator_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'existing_client_owned_by_other_curator');
  END IF;
  v_effective_status := COALESCE(
    public.get_effective_subscription_status(v_client.id),
    v_client.subscription_status,
    'none'
  );
  IF v_effective_status IN ('trial', 'trial_pending', 'active') THEN
    RETURN jsonb_build_object('success', false, 'error', 'phone_already_has_active');
  END IF;

  SELECT * INTO v_intake
  FROM public.trial_intakes
  WHERE client_id = v_client.id
  FOR UPDATE;

  IF FOUND AND v_intake.status <> 'rejected' THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'existing_intake_in_progress',
      'status', v_intake.status
    );
  END IF;
  IF FOUND AND COALESCE(v_intake.reviewed_at, v_intake.updated_at, v_intake.created_at)
      > NOW() - INTERVAL '30 days' THEN
    v_eligible_at := COALESCE(
      v_intake.reviewed_at, v_intake.updated_at, v_intake.created_at
    ) + INTERVAL '30 days';
    RETURN jsonb_build_object(
      'success', false, 'error', 'reapply_cooldown', 'eligible_at', v_eligible_at
    );
  END IF;

  v_pin := LPAD((floor(random() * 9000)::INT + 1000)::TEXT, 4, '0');
  v_pin_hash := crypt(v_pin, gen_salt('bf', 12));

  UPDATE public.clients
  SET name = COALESCE(v_lead.name, name),
      birth_year = COALESCE(v_lead.birth_year, birth_year),
      pin_hash = v_pin_hash,
      pin_token = v_pin_token,
      pin_token_expires_at = v_pin_token_expires,
      updated_at = NOW()
  WHERE id = v_client.id;

  UPDATE public.client_sessions
  SET revoked_at = NOW()
  WHERE client_id = v_client.id AND revoked_at IS NULL;

  INSERT INTO public.trial_intakes (
    client_id, curator_id, schema_version, status, current_step,
    invite_prepared_at, invited_at, updated_at
  ) VALUES (
    v_client.id, p_curator_id, '1.1', 'invite_prepared', 0,
    NOW(), NOW(), NOW()
  )
  ON CONFLICT (client_id) DO UPDATE SET
    curator_id = EXCLUDED.curator_id,
    schema_version = '1.1',
    status = 'invite_prepared',
    current_step = 0,
    answers_encrypted = NULL,
    answers_key_version = NULL,
    review_note_encrypted = NULL,
    clarification_request_encrypted = NULL,
    clarification_sections = NULL,
    decision_reason = NULL,
    invite_prepared_at = NOW(),
    invite_sent_at = NULL,
    last_client_activity_at = NULL,
    invited_at = NOW(),
    started_at = NULL,
    completed_at = NULL,
    reviewed_at = NULL,
    retention_delete_at = NULL,
    updated_at = NOW();

  INSERT INTO public.trial_queue (
    client_id, curator_id, status, queued_at, source, updated_at
  )
  VALUES (
    v_client.id, p_curator_id, 'queued', NOW(), 'trial_intake_reapplication', NOW()
  )
  ON CONFLICT (client_id) DO UPDATE SET
    status = 'queued',
    queued_at = NOW(),
    curator_id = p_curator_id,
    offer_sent_at = NULL,
    offer_expires_at = NULL,
    assigned_at = NULL,
    canceled_at = NULL,
    source = 'trial_intake_reapplication',
    updated_at = NOW();

  INSERT INTO public.trial_queue_events (client_id, event_type, meta)
  VALUES (v_client.id, 'queued', jsonb_build_object(
    'lead_id', p_lead_id,
    'curator_id', p_curator_id,
    'source', 'trial_intake_reapplication',
    'auto_pin', true
  ));

  UPDATE public.leads
  SET status = 'converted',
      client_id = v_client.id,
      contacted_at = COALESCE(contacted_at, NOW()),
      curator_id = p_curator_id,
      updated_at = NOW()
  WHERE id = p_lead_id;

  PERFORM public.log_data_access(
    'curator', p_curator_id, v_client.id, 'reopen_trial_candidate',
    ARRAY['trial_intake_v2', 'client_sessions'], true, NULL, NULL,
    jsonb_build_object('lead_id', p_lead_id, 'old_intake_status', v_intake.status)
  );

  RETURN jsonb_build_object(
    'success', true,
    'reopened', true,
    'client_id', v_client.id,
    'pin', v_pin,
    'pin_token', v_pin_token,
    'pin_token_expires_at', v_pin_token_expires,
    'phone', v_phone_clean,
    'phone_normalized', v_phone_normalized,
    'intake_status', 'invite_prepared',
    'intake_url', 'https://app.heyslab.ru/?intake=1'
  );
END;
$$;

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
  IF p_start_date IS NULL OR p_start_date < CURRENT_DATE
     OR p_trial_days IS NULL OR p_trial_days < 1 OR p_trial_days > 30 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_activation_params');
  END IF;
  IF p_curator_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = p_client_id AND c.curator_id = p_curator_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_client
  FROM public.clients
  WHERE id = p_client_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'client_not_found');
  END IF;

  SELECT status INTO v_intake_status
  FROM public.trial_intakes
  WHERE client_id = p_client_id
  FOR UPDATE;
  IF v_intake_status IS NULL AND EXISTS (
    SELECT 1
    FROM public.trial_queue tq
    WHERE tq.client_id = p_client_id
      AND tq.source IN ('trial_intake_purged', 'trial_intake_health_revoked')
  ) THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'intake_not_approved', 'intake_status', 'purged'
    );
  END IF;
  IF v_intake_status IS NOT NULL
     AND v_intake_status NOT IN ('approved', 'approved_waiting_slot') THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'intake_not_approved',
      'intake_status', v_intake_status
    );
  END IF;

  IF v_client.subscription_status IN ('trial', 'trial_pending', 'active') THEN
    UPDATE public.trial_queue
    SET status = 'assigned',
        assigned_at = COALESCE(assigned_at, v_client.trial_started_at, NOW()),
        updated_at = NOW()
    WHERE client_id = p_client_id AND status IN ('queued', 'pending', 'offer');
    RETURN jsonb_build_object(
      'success', true, 'already_active', true,
      'status', v_client.subscription_status,
      'trial_started_at', v_client.trial_started_at,
      'trial_ends_at', v_client.trial_ends_at
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('trial_capacity'));
  IF v_intake_status = 'approved_waiting_slot'
     AND COALESCE(
       (public.get_public_trial_capacity()->>'available_slots')::integer, 0
     ) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_available_slot');
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
  RETURNING trial_started_at, trial_ends_at
  INTO v_trial_start_at, v_trial_ends_at;

  INSERT INTO public.subscriptions (
    client_id, trial_started_at, trial_ends_at, trial_approved_at
  ) VALUES (
    p_client_id, v_trial_start_at, v_trial_ends_at, NOW()
  )
  ON CONFLICT (client_id) DO UPDATE SET
    trial_started_at = EXCLUDED.trial_started_at,
    trial_ends_at = EXCLUDED.trial_ends_at,
    trial_approved_at = NOW();

  UPDATE public.trial_intakes
  SET status = 'approved', updated_at = NOW()
  WHERE client_id = p_client_id AND status = 'approved_waiting_slot';

  UPDATE public.trial_queue
  SET status = 'assigned', assigned_at = NOW(), updated_at = NOW()
  WHERE client_id = p_client_id AND status IN ('queued', 'pending', 'offer');

  INSERT INTO public.trial_queue_events (client_id, event_type, meta)
  VALUES (p_client_id, 'claimed', jsonb_build_object(
    'curator_id', p_curator_id,
    'start_date', p_start_date,
    'trial_days', p_trial_days,
    'is_future', v_is_future,
    'source', 'approved_trial_intake'
  ));

  PERFORM public.record_funnel_event(
    p_event_type := 'trial_active',
    p_client_id := p_client_id,
    p_metadata := jsonb_build_object(
      'trial_days', p_trial_days,
      'is_future', v_is_future,
      'source', 'approved_trial_intake'
    ),
    p_dedupe_key := 'trial_active:client:' || p_client_id::text
      || ':' || v_trial_start_at::date::text,
    p_occurred_at := v_trial_start_at
  );

  PERFORM public.log_data_access(
    'curator', p_curator_id, p_client_id, 'activate_trial_intake',
    ARRAY['trial_intake_v2', 'subscription'], false, NULL, NULL,
    jsonb_build_object(
      'status', CASE WHEN v_is_future THEN 'trial_pending' ELSE 'trial' END,
      'is_future', v_is_future,
      'trial_days', p_trial_days
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'status', CASE WHEN v_is_future THEN 'trial_pending' ELSE 'trial' END,
    'trial_started_at', v_trial_start_at,
    'trial_ends_at', v_trial_ends_at,
    'is_future', v_is_future
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_remove_from_queue(
  p_client_id UUID,
  p_reason TEXT DEFAULT 'admin_removed',
  p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_status TEXT;
BEGIN
  IF p_curator_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = p_client_id AND c.curator_id = p_curator_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.trial_intakes ti WHERE ti.client_id = p_client_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'intake_managed');
  END IF;

  UPDATE public.trial_queue
  SET status = 'canceled', canceled_at = NOW(), updated_at = NOW()
  WHERE client_id = p_client_id
    AND status IN ('queued', 'pending', 'offer')
  RETURNING status INTO v_old_status;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_in_queue');
  END IF;

  INSERT INTO public.trial_queue_events (client_id, event_type, meta)
  VALUES (p_client_id, 'canceled', jsonb_build_object(
    'reason', p_reason, 'curator_id', p_curator_id, 'source', 'legacy_queue'
  ));
  RETURN jsonb_build_object('success', true, 'status', 'canceled');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_trial_intake_answers_v2(JSONB, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_trial_decision_checklist_v1(JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_trial_intake_by_session(
  TEXT, JSONB, SMALLINT, BOOLEAN, TIMESTAMPTZ
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_mark_trial_intake_invite_sent(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_prepare_trial_candidate_from_lead(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_convert_lead(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_review_trial_intake_v2(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT[], JSONB, UUID, TIMESTAMPTZ
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_reopen_trial_candidate(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_remove_from_queue(UUID, TEXT, UUID) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_rpc') THEN
    REVOKE EXECUTE ON FUNCTION public.admin_review_trial_intake(
      UUID, TEXT, TEXT, TEXT, UUID
    ) FROM heys_rpc;
    REVOKE EXECUTE ON FUNCTION public.admin_convert_lead(UUID, UUID) FROM heys_rpc;
    GRANT EXECUTE ON FUNCTION public.save_trial_intake_by_session(
      TEXT, JSONB, SMALLINT, BOOLEAN, TIMESTAMPTZ
    ) TO heys_rpc;
    GRANT EXECUTE ON FUNCTION public.admin_mark_trial_intake_invite_sent(
      UUID, UUID
    ) TO heys_rpc;
    GRANT EXECUTE ON FUNCTION public.admin_prepare_trial_candidate_from_lead(
      UUID, UUID
    ) TO heys_rpc;
    GRANT EXECUTE ON FUNCTION public.admin_review_trial_intake_v2(
      UUID, TEXT, TEXT, TEXT, TEXT, TEXT[], JSONB, UUID, TIMESTAMPTZ
    ) TO heys_rpc;
    GRANT EXECUTE ON FUNCTION public.admin_reopen_trial_candidate(
      UUID, UUID
    ) TO heys_rpc;
    GRANT EXECUTE ON FUNCTION public.admin_remove_from_queue(
      UUID, TEXT, UUID
    ) TO heys_rpc;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_admin') THEN
    REVOKE EXECUTE ON FUNCTION public.admin_review_trial_intake(
      UUID, TEXT, TEXT, TEXT, UUID
    ) FROM heys_admin;
    REVOKE EXECUTE ON FUNCTION public.admin_convert_lead(UUID, UUID) FROM heys_admin;
    GRANT EXECUTE ON FUNCTION public.validate_trial_intake_answers_v2(
      JSONB, BOOLEAN
    ) TO heys_admin;
    GRANT EXECUTE ON FUNCTION public.validate_trial_decision_checklist_v1(
      JSONB
    ) TO heys_admin;
    GRANT EXECUTE ON FUNCTION public.admin_mark_trial_intake_invite_sent(
      UUID, UUID
    ) TO heys_admin;
    GRANT EXECUTE ON FUNCTION public.admin_prepare_trial_candidate_from_lead(
      UUID, UUID
    ) TO heys_admin;
    GRANT EXECUTE ON FUNCTION public.admin_review_trial_intake_v2(
      UUID, TEXT, TEXT, TEXT, TEXT, TEXT[], JSONB, UUID, TIMESTAMPTZ
    ) TO heys_admin;
    GRANT EXECUTE ON FUNCTION public.admin_reopen_trial_candidate(
      UUID, UUID
    ) TO heys_admin;
    GRANT EXECUTE ON FUNCTION public.admin_remove_from_queue(
      UUID, TEXT, UUID
    ) TO heys_admin;
  END IF;
END;
$$;
