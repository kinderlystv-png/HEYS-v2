-- HEYS health minimization — destructive purge (owner-approved only).
-- Run ONLY after audit_health_feature_data_v1() review and explicit owner command.
-- Shows inventory first; destructive function at the bottom.

-- 1) Inventory summary (safe to run anytime)
CREATE OR REPLACE FUNCTION public.inventory_health_minimization_purge_v1()
RETURNS TABLE (
  category TEXT,
  item TEXT,
  row_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'trial_intake_answers'::text,
         'legacy health/safety keys in trial_intakes'::text,
         COUNT(*)::bigint
    FROM public.trial_intakes ti
   WHERE ti.answers_encrypted IS NOT NULL
     AND (
       public.decrypt_health_data(ti.answers_encrypted) ? 'health'
       OR public.decrypt_health_data(ti.answers_encrypted) ? 'safety'
     )

  UNION ALL

  SELECT 'trial_intake_answers',
         'legacy health/safety keys in trial_candidates',
         COUNT(*)::bigint
    FROM public.trial_candidates tc
   WHERE tc.answers_encrypted IS NOT NULL
     AND (
       public.decrypt_health_data(tc.answers_encrypted) ? 'health'
       OR public.decrypt_health_data(tc.answers_encrypted) ? 'safety'
     )

  UNION ALL

  SELECT 'optional_features',
         'day rows with cycle fields',
         COUNT(*)::bigint
    FROM public.client_kv_store kv
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND (
       NULLIF(kv.v->>'cycleDay', '') IS NOT NULL
       OR NULLIF(kv.v->>'cycleStatus', '') IS NOT NULL
     )

  UNION ALL

  SELECT 'optional_features',
         'day rows with measurements',
         COUNT(*)::bigint
    FROM public.client_kv_store kv
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND kv.v ? 'measurements'
     AND kv.v->'measurements' IS NOT NULL
     AND kv.v->'measurements' <> 'null'::jsonb

  UNION ALL

  SELECT 'optional_features',
         'day rows with supplements',
         COUNT(*)::bigint
    FROM public.client_kv_store kv
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND (
       (kv.v ? 'supplementsPlanned' AND jsonb_typeof(kv.v->'supplementsPlanned') = 'array' AND jsonb_array_length(kv.v->'supplementsPlanned') > 0)
       OR (kv.v ? 'supplementsTaken' AND jsonb_typeof(kv.v->'supplementsTaken') = 'array' AND jsonb_array_length(kv.v->'supplementsTaken') > 0)
     )

  UNION ALL

  SELECT 'optional_features',
         'profiles with customSupplements',
         COUNT(*)::bigint
    FROM public.client_kv_store kv
   WHERE kv.k = 'heys_profile'
     AND jsonb_typeof(kv.v->'customSupplements') = 'array'
     AND jsonb_array_length(kv.v->'customSupplements') > 0

  UNION ALL

  SELECT 'trial_consents',
         'active trial_candidate_consents health_data',
         COUNT(*)::bigint
    FROM public.trial_candidate_consents
   WHERE consent_type = 'health_data'
     AND is_active
     AND granted
     AND revoked_at IS NULL

  UNION ALL

  SELECT 'client_consents',
         'active consents health_data',
         COUNT(*)::bigint
    FROM public.consents
   WHERE consent_type = 'health_data'
     AND granted
     AND revoked_at IS NULL;
$$;

COMMENT ON FUNCTION public.inventory_health_minimization_purge_v1() IS
  'Read-only inventory before health minimization destructive purge. Owner review gate.';

-- 2) Destructive purge — requires explicit owner approval before execution.
CREATE OR REPLACE FUNCTION public.purge_health_minimization_data_v1(p_actor TEXT DEFAULT 'system')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_intakes BIGINT := 0;
  v_candidates BIGINT := 0;
  v_days_cycle BIGINT := 0;
  v_days_measurements BIGINT := 0;
  v_days_supplements BIGINT := 0;
  v_profiles_custom BIGINT := 0;
  v_trial_consents BIGINT := 0;
  v_client_consents BIGINT := 0;
BEGIN
  -- Strip legacy health/safety from encrypted trial answers (schema 1.2 migration should
  -- have done this; this is idempotent cleanup).
  UPDATE public.trial_intakes ti
     SET answers_encrypted = public.encrypt_health_data(
           (public.decrypt_health_data(ti.answers_encrypted) - 'health' - 'safety')
           || jsonb_build_object('warning', COALESCE(public.decrypt_health_data(ti.answers_encrypted)->'warning', '{}'::jsonb))
           || jsonb_build_object('meta', jsonb_build_object('schema_version', '1.2'))
         ),
         schema_version = '1.2',
         updated_at = NOW()
   WHERE ti.answers_encrypted IS NOT NULL
     AND (
       public.decrypt_health_data(ti.answers_encrypted) ? 'health'
       OR public.decrypt_health_data(ti.answers_encrypted) ? 'safety'
     );
  GET DIAGNOSTICS v_intakes = ROW_COUNT;

  UPDATE public.trial_candidates tc
     SET answers_encrypted = public.encrypt_health_data(
           (public.decrypt_health_data(tc.answers_encrypted) - 'health' - 'safety')
           || jsonb_build_object('warning', COALESCE(public.decrypt_health_data(tc.answers_encrypted)->'warning', '{}'::jsonb))
           || jsonb_build_object('meta', jsonb_build_object('schema_version', '1.2'))
         ),
         schema_version = '1.2',
         updated_at = NOW()
   WHERE tc.answers_encrypted IS NOT NULL
     AND (
       public.decrypt_health_data(tc.answers_encrypted) ? 'health'
       OR public.decrypt_health_data(tc.answers_encrypted) ? 'safety'
     );
  GET DIAGNOSTICS v_candidates = ROW_COUNT;

  UPDATE public.client_kv_store kv
     SET v = kv.v
       - 'cycleDay' - 'cycleStatus' - 'cycleAnsweredAt' - 'cycleUpdatedAt',
         updated_at = NOW()
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND (
       kv.v ? 'cycleDay' OR kv.v ? 'cycleStatus'
       OR kv.v ? 'cycleAnsweredAt' OR kv.v ? 'cycleUpdatedAt'
     );
  GET DIAGNOSTICS v_days_cycle = ROW_COUNT;

  UPDATE public.client_kv_store kv
     SET v = kv.v - 'measurements',
         updated_at = NOW()
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND kv.v ? 'measurements';
  GET DIAGNOSTICS v_days_measurements = ROW_COUNT;

  UPDATE public.client_kv_store kv
     SET v = kv.v
       - 'supplementsPlanned' - 'supplementsPlannedUpdatedAt'
       - 'supplementsTaken' - 'supplementsTakenAt' - 'supplementsTakenMeta' - 'supplementsTakenUpdatedAt',
         updated_at = NOW()
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND (
       kv.v ? 'supplementsPlanned' OR kv.v ? 'supplementsTaken'
     );
  GET DIAGNOSTICS v_days_supplements = ROW_COUNT;

  UPDATE public.client_kv_store kv
     SET v = jsonb_set(
           jsonb_set(
             jsonb_set(kv.v, '{customSupplements}', '[]'::jsonb, true),
             '{plannedSupplements}', '[]'::jsonb, true
           ),
           '{supplementSettings}', '{}'::jsonb, true
         ),
         updated_at = NOW()
   WHERE kv.k = 'heys_profile'
     AND (
       jsonb_typeof(kv.v->'customSupplements') = 'array'
       AND jsonb_array_length(kv.v->'customSupplements') > 0
     );
  GET DIAGNOSTICS v_profiles_custom = ROW_COUNT;

  UPDATE public.trial_candidate_consents
     SET is_active = FALSE,
         granted = FALSE,
         revoked_at = NOW()
   WHERE consent_type = 'health_data'
     AND is_active
     AND revoked_at IS NULL;
  GET DIAGNOSTICS v_trial_consents = ROW_COUNT;

  UPDATE public.consents
     SET granted = FALSE,
         revoked_at = NOW()
   WHERE consent_type = 'health_data'
     AND granted
     AND revoked_at IS NULL;
  GET DIAGNOSTICS v_client_consents = ROW_COUNT;

  INSERT INTO public.audit_logs(action, table_name, details)
  VALUES (
    'health_minimization_purge',
    'client_kv_store',
    jsonb_build_object(
      'actor', p_actor,
      'purged_at', NOW(),
      'trial_intakes_stripped', v_intakes,
      'trial_candidates_stripped', v_candidates,
      'days_cycle_cleared', v_days_cycle,
      'days_measurements_cleared', v_days_measurements,
      'days_supplements_cleared', v_days_supplements,
      'profiles_custom_supplements_cleared', v_profiles_custom,
      'trial_candidate_health_consents_revoked', v_trial_consents,
      'client_health_consents_revoked', v_client_consents
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'actor', p_actor,
    'trial_intakes_stripped', v_intakes,
    'trial_candidates_stripped', v_candidates,
    'days_cycle_cleared', v_days_cycle,
    'days_measurements_cleared', v_days_measurements,
    'days_supplements_cleared', v_days_supplements,
    'profiles_custom_supplements_cleared', v_profiles_custom,
    'trial_candidate_health_consents_revoked', v_trial_consents,
    'client_health_consents_revoked', v_client_consents
  );
END;
$$;

COMMENT ON FUNCTION public.purge_health_minimization_data_v1(TEXT) IS
  'Destructive purge of legacy health questionnaire answers and optional feature data. Owner-approved only.';

REVOKE EXECUTE ON FUNCTION public.purge_health_minimization_data_v1(TEXT) FROM PUBLIC;
