-- Health minimization purge: exclude spouse account from cycle data deletion.
-- Owner exception 2026-08-12: Александра (4545ee50-4f5f-4fc0-b862-7ca45fa1bafc).
-- Replaces prior purge_health_minimization_data_v1 signature; do not run until owner command.

DROP FUNCTION IF EXISTS public.purge_health_minimization_data_v1(TEXT);
DROP FUNCTION IF EXISTS public.purge_health_minimization_data_v1(TEXT, BIGINT, BIGINT, BIGINT, BIGINT);

CREATE OR REPLACE FUNCTION public.purge_health_minimization_data_v1(
  p_actor TEXT DEFAULT 'system',
  p_expected_profiles_enabled BIGINT DEFAULT 0,
  p_expected_profiles_cycle_keys BIGINT DEFAULT 2,
  p_expected_day_cycle_payload BIGINT DEFAULT 0,
  p_expected_day_cycle_keys BIGINT DEFAULT 245,
  p_exclude_client_ids UUID[] DEFAULT ARRAY['4545ee50-4f5f-4fc0-b862-7ca45fa1bafc']::uuid[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exclude UUID[] := COALESCE(p_exclude_client_ids, ARRAY[]::uuid[]);
  v_intakes BIGINT := 0;
  v_candidates BIGINT := 0;
  v_profiles_enabled_before BIGINT := 0;
  v_profiles_cycle_keys_before BIGINT := 0;
  v_profiles_cycle_cleared BIGINT := 0;
  v_profiles_enabled_after BIGINT := 0;
  v_profiles_cycle_keys_after BIGINT := 0;
  v_days_cycle_payload_before BIGINT := 0;
  v_days_cycle_keys_before BIGINT := 0;
  v_days_cycle_cleared BIGINT := 0;
  v_days_cycle_payload_after BIGINT := 0;
  v_days_cycle_keys_after BIGINT := 0;
  v_days_measurements BIGINT := 0;
  v_days_supplements BIGINT := 0;
  v_profiles_custom BIGINT := 0;
  v_trial_consents BIGINT := 0;
  v_client_consents BIGINT := 0;
  v_kept_profiles_enabled BIGINT := 0;
  v_kept_profiles_cycle_keys BIGINT := 0;
  v_kept_day_cycle_payload BIGINT := 0;
  v_kept_day_cycle_keys BIGINT := 0;
BEGIN
  -- ---- Control counts BEFORE (cycle), excluding allowlisted clients ----
  SELECT COUNT(*) INTO v_profiles_enabled_before
    FROM public.client_kv_store kv
   WHERE kv.k = 'heys_profile'
     AND (kv.v->>'cycleTrackingEnabled') = 'true'
     AND NOT (kv.client_id = ANY (v_exclude));

  SELECT COUNT(*) INTO v_profiles_cycle_keys_before
    FROM public.client_kv_store kv
   WHERE kv.k = 'heys_profile'
     AND (
       kv.v ? 'cycleTrackingEnabled'
       OR kv.v ? 'cycleLength'
       OR kv.v ? 'cycleStart'
       OR kv.v ? 'avgCycleLength'
       OR kv.v ? 'lastPeriodDate'
       OR kv.v ? 'periodLength'
     )
     AND NOT (kv.client_id = ANY (v_exclude));

  SELECT COUNT(*) INTO v_days_cycle_payload_before
    FROM public.client_kv_store kv
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND (
       NULLIF(kv.v->>'cycleDay', '') IS NOT NULL
       OR NULLIF(kv.v->>'cycleStatus', '') IS NOT NULL
     )
     AND NOT (kv.client_id = ANY (v_exclude));

  SELECT COUNT(*) INTO v_days_cycle_keys_before
    FROM public.client_kv_store kv
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND (
       kv.v ? 'cycleDay' OR kv.v ? 'cycleStatus'
       OR kv.v ? 'cycleAnsweredAt' OR kv.v ? 'cycleUpdatedAt'
     )
     AND NOT (kv.client_id = ANY (v_exclude));

  -- Kept (excluded) inventory — for act / owner report
  SELECT COUNT(*) INTO v_kept_profiles_enabled
    FROM public.client_kv_store kv
   WHERE kv.k = 'heys_profile'
     AND (kv.v->>'cycleTrackingEnabled') = 'true'
     AND kv.client_id = ANY (v_exclude);

  SELECT COUNT(*) INTO v_kept_profiles_cycle_keys
    FROM public.client_kv_store kv
   WHERE kv.k = 'heys_profile'
     AND (
       kv.v ? 'cycleTrackingEnabled'
       OR kv.v ? 'cycleLength'
       OR kv.v ? 'cycleStart'
       OR kv.v ? 'avgCycleLength'
       OR kv.v ? 'lastPeriodDate'
       OR kv.v ? 'periodLength'
     )
     AND kv.client_id = ANY (v_exclude);

  SELECT COUNT(*) INTO v_kept_day_cycle_payload
    FROM public.client_kv_store kv
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND (
       NULLIF(kv.v->>'cycleDay', '') IS NOT NULL
       OR NULLIF(kv.v->>'cycleStatus', '') IS NOT NULL
     )
     AND kv.client_id = ANY (v_exclude);

  SELECT COUNT(*) INTO v_kept_day_cycle_keys
    FROM public.client_kv_store kv
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND (
       kv.v ? 'cycleDay' OR kv.v ? 'cycleStatus'
       OR kv.v ? 'cycleAnsweredAt' OR kv.v ? 'cycleUpdatedAt'
     )
     AND kv.client_id = ANY (v_exclude);

  IF v_profiles_enabled_before <> p_expected_profiles_enabled THEN
    RAISE EXCEPTION
      'purge_aborted: profiles cycleTrackingEnabled=true before=% expected=% — re-inventory',
      v_profiles_enabled_before, p_expected_profiles_enabled;
  END IF;
  IF v_profiles_cycle_keys_before <> p_expected_profiles_cycle_keys THEN
    RAISE EXCEPTION
      'purge_aborted: profiles with cycle* keys before=% expected=% — re-inventory',
      v_profiles_cycle_keys_before, p_expected_profiles_cycle_keys;
  END IF;
  IF v_days_cycle_payload_before <> p_expected_day_cycle_payload THEN
    RAISE EXCEPTION
      'purge_aborted: day cycle payload before=% expected=% — re-inventory',
      v_days_cycle_payload_before, p_expected_day_cycle_payload;
  END IF;
  IF v_days_cycle_keys_before <> p_expected_day_cycle_keys THEN
    RAISE EXCEPTION
      'purge_aborted: day cycle keys before=% expected=% — re-inventory',
      v_days_cycle_keys_before, p_expected_day_cycle_keys;
  END IF;

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

  -- ---- CYCLE: flags FIRST, then days (skip excluded clients) ----
  UPDATE public.client_kv_store kv
     SET v = kv.v
       - 'cycleTrackingEnabled'
       - 'cycleLength'
       - 'cycleStart'
       - 'avgCycleLength'
       - 'lastPeriodDate'
       - 'periodLength',
         updated_at = NOW()
   WHERE kv.k = 'heys_profile'
     AND NOT (kv.client_id = ANY (v_exclude))
     AND (
       kv.v ? 'cycleTrackingEnabled'
       OR kv.v ? 'cycleLength'
       OR kv.v ? 'cycleStart'
       OR kv.v ? 'avgCycleLength'
       OR kv.v ? 'lastPeriodDate'
       OR kv.v ? 'periodLength'
     );
  GET DIAGNOSTICS v_profiles_cycle_cleared = ROW_COUNT;

  SELECT COUNT(*) INTO v_profiles_enabled_after
    FROM public.client_kv_store kv
   WHERE kv.k = 'heys_profile'
     AND (kv.v->>'cycleTrackingEnabled') = 'true'
     AND NOT (kv.client_id = ANY (v_exclude));
  SELECT COUNT(*) INTO v_profiles_cycle_keys_after
    FROM public.client_kv_store kv
   WHERE kv.k = 'heys_profile'
     AND NOT (kv.client_id = ANY (v_exclude))
     AND (
       kv.v ? 'cycleTrackingEnabled'
       OR kv.v ? 'cycleLength'
       OR kv.v ? 'cycleStart'
       OR kv.v ? 'avgCycleLength'
       OR kv.v ? 'lastPeriodDate'
       OR kv.v ? 'periodLength'
     );

  IF v_profiles_cycle_cleared <> v_profiles_cycle_keys_before THEN
    RAISE EXCEPTION
      'purge_aborted: profiles cleared=% before_keys=%',
      v_profiles_cycle_cleared, v_profiles_cycle_keys_before;
  END IF;
  IF v_profiles_enabled_after <> 0 OR v_profiles_cycle_keys_after <> 0 THEN
    RAISE EXCEPTION
      'purge_aborted: profile cycle remain enabled=% keys=% (expected 0/0 among non-excluded)',
      v_profiles_enabled_after, v_profiles_cycle_keys_after;
  END IF;

  UPDATE public.client_kv_store kv
     SET v = kv.v
       - 'cycleDay' - 'cycleStatus' - 'cycleAnsweredAt' - 'cycleUpdatedAt',
         updated_at = NOW()
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND NOT (kv.client_id = ANY (v_exclude))
     AND (
       kv.v ? 'cycleDay' OR kv.v ? 'cycleStatus'
       OR kv.v ? 'cycleAnsweredAt' OR kv.v ? 'cycleUpdatedAt'
     );
  GET DIAGNOSTICS v_days_cycle_cleared = ROW_COUNT;

  SELECT COUNT(*) INTO v_days_cycle_payload_after
    FROM public.client_kv_store kv
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND NOT (kv.client_id = ANY (v_exclude))
     AND (
       NULLIF(kv.v->>'cycleDay', '') IS NOT NULL
       OR NULLIF(kv.v->>'cycleStatus', '') IS NOT NULL
     );
  SELECT COUNT(*) INTO v_days_cycle_keys_after
    FROM public.client_kv_store kv
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND NOT (kv.client_id = ANY (v_exclude))
     AND (
       kv.v ? 'cycleDay' OR kv.v ? 'cycleStatus'
       OR kv.v ? 'cycleAnsweredAt' OR kv.v ? 'cycleUpdatedAt'
     );

  IF v_days_cycle_cleared <> v_days_cycle_keys_before THEN
    RAISE EXCEPTION
      'purge_aborted: days cleared=% before_keys=%',
      v_days_cycle_cleared, v_days_cycle_keys_before;
  END IF;
  IF v_days_cycle_payload_after <> 0 OR v_days_cycle_keys_after <> 0 THEN
    RAISE EXCEPTION
      'purge_aborted: day cycle remain payload=% keys=% (expected 0/0 among non-excluded)',
      v_days_cycle_payload_after, v_days_cycle_keys_after;
  END IF;

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
      'exclude_client_ids', to_jsonb(v_exclude),
      'kept_reason', 'owner_exception_spouse_cycle_tracking',
      'trial_intakes_stripped', v_intakes,
      'trial_candidates_stripped', v_candidates,
      'profiles_cycle_enabled_before', v_profiles_enabled_before,
      'profiles_cycle_keys_before', v_profiles_cycle_keys_before,
      'profiles_cycle_cleared', v_profiles_cycle_cleared,
      'profiles_cycle_enabled_after', v_profiles_enabled_after,
      'profiles_cycle_keys_after', v_profiles_cycle_keys_after,
      'days_cycle_payload_before', v_days_cycle_payload_before,
      'days_cycle_keys_before', v_days_cycle_keys_before,
      'days_cycle_cleared', v_days_cycle_cleared,
      'days_cycle_payload_after', v_days_cycle_payload_after,
      'days_cycle_keys_after', v_days_cycle_keys_after,
      'kept_profiles_enabled', v_kept_profiles_enabled,
      'kept_profiles_cycle_keys', v_kept_profiles_cycle_keys,
      'kept_day_cycle_payload', v_kept_day_cycle_payload,
      'kept_day_cycle_keys', v_kept_day_cycle_keys,
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
    'exclude_client_ids', to_jsonb(v_exclude),
    'kept_reason', 'owner_exception_spouse_cycle_tracking',
    'trial_intakes_stripped', v_intakes,
    'trial_candidates_stripped', v_candidates,
    'profiles_cycle_enabled_before', v_profiles_enabled_before,
    'profiles_cycle_keys_before', v_profiles_cycle_keys_before,
    'profiles_cycle_cleared', v_profiles_cycle_cleared,
    'profiles_cycle_enabled_after', v_profiles_enabled_after,
    'profiles_cycle_keys_after', v_profiles_cycle_keys_after,
    'days_cycle_payload_before', v_days_cycle_payload_before,
    'days_cycle_keys_before', v_days_cycle_keys_before,
    'days_cycle_cleared', v_days_cycle_cleared,
    'days_cycle_payload_after', v_days_cycle_payload_after,
    'days_cycle_keys_after', v_days_cycle_keys_after,
    'kept_profiles_enabled', v_kept_profiles_enabled,
    'kept_profiles_cycle_keys', v_kept_profiles_cycle_keys,
    'kept_day_cycle_payload', v_kept_day_cycle_payload,
    'kept_day_cycle_keys', v_kept_day_cycle_keys,
    'days_measurements_cleared', v_days_measurements,
    'days_supplements_cleared', v_days_supplements,
    'profiles_custom_supplements_cleared', v_profiles_custom,
    'trial_candidate_health_consents_revoked', v_trial_consents,
    'client_health_consents_revoked', v_client_consents
  );
END;
$$;

COMMENT ON FUNCTION public.purge_health_minimization_data_v1(TEXT, BIGINT, BIGINT, BIGINT, BIGINT, UUID[]) IS
  'Destructive health-minimization purge. Excludes cycle data for p_exclude_client_ids (default: spouse). Owner command required.';

REVOKE ALL ON FUNCTION public.purge_health_minimization_data_v1(TEXT, BIGINT, BIGINT, BIGINT, BIGINT, UUID[]) FROM PUBLIC;
