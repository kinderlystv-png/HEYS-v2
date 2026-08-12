-- internalAccount flag: permanent exclude for health-minimization purge + release gates.
-- One-time seed for existing family account (UUID only in migration, not in app source).
-- Removing internalAccount from heys_profile re-opens profile to purge on next run.

CREATE OR REPLACE FUNCTION public.is_internal_account_client(p_client_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT (kv.v->>'internalAccount')::boolean
      FROM public.client_kv_store kv
     WHERE kv.client_id = p_client_id
       AND kv.k = 'heys_profile'
     LIMIT 1
  ), false);
$$;

COMMENT ON FUNCTION public.is_internal_account_client(UUID) IS
  'True when heys_profile.internalAccount=true. Used by purge/inventory; not writable via MCP.';

-- One-time seed (owner decision 2026-08-12).
UPDATE public.client_kv_store kv
   SET v = jsonb_set(COALESCE(kv.v, '{}'::jsonb), '{internalAccount}', 'true'::jsonb, true),
       updated_at = NOW()
 WHERE kv.k = 'heys_profile'
   AND kv.client_id = '4545ee50-4f5f-4fc0-b862-7ca45fa1bafc'::uuid
   AND COALESCE(kv.v->>'internalAccount', 'false') <> 'true';

DROP FUNCTION IF EXISTS public.inventory_health_minimization_purge_v1();

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

  SELECT 'internal_account',
         'profiles with internalAccount=true',
         COUNT(*)::bigint
    FROM public.client_kv_store kv
   WHERE kv.k = 'heys_profile'
     AND (kv.v->>'internalAccount') = 'true'

  UNION ALL

  SELECT 'optional_features',
         '[purge] profiles cycleTrackingEnabled=true',
         COUNT(*)::bigint
    FROM public.client_kv_store kv
   WHERE kv.k = 'heys_profile'
     AND (kv.v->>'cycleTrackingEnabled') = 'true'
     AND NOT public.is_internal_account_client(kv.client_id)

  UNION ALL

  SELECT 'optional_features',
         '[keep:internalAccount] profiles cycleTrackingEnabled=true',
         COUNT(*)::bigint
    FROM public.client_kv_store kv
   WHERE kv.k = 'heys_profile'
     AND (kv.v->>'cycleTrackingEnabled') = 'true'
     AND public.is_internal_account_client(kv.client_id)

  UNION ALL

  SELECT 'optional_features',
         '[purge] profiles with any cycle* key',
         COUNT(*)::bigint
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
     AND NOT public.is_internal_account_client(kv.client_id)

  UNION ALL

  SELECT 'optional_features',
         '[keep:internalAccount] profiles with any cycle* key',
         COUNT(*)::bigint
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
     AND public.is_internal_account_client(kv.client_id)

  UNION ALL

  SELECT 'optional_features',
         '[purge] day rows with cycle payload (cycleDay|cycleStatus non-empty)',
         COUNT(*)::bigint
    FROM public.client_kv_store kv
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND (
       NULLIF(kv.v->>'cycleDay', '') IS NOT NULL
       OR NULLIF(kv.v->>'cycleStatus', '') IS NOT NULL
     )
     AND NOT public.is_internal_account_client(kv.client_id)

  UNION ALL

  SELECT 'optional_features',
         '[keep:internalAccount] day rows with cycle payload',
         COUNT(*)::bigint
    FROM public.client_kv_store kv
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND (
       NULLIF(kv.v->>'cycleDay', '') IS NOT NULL
       OR NULLIF(kv.v->>'cycleStatus', '') IS NOT NULL
     )
     AND public.is_internal_account_client(kv.client_id)

  UNION ALL

  SELECT 'optional_features',
         '[purge] day rows with any cycle* key (incl. empty stubs)',
         COUNT(*)::bigint
    FROM public.client_kv_store kv
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND (
       kv.v ? 'cycleDay' OR kv.v ? 'cycleStatus'
       OR kv.v ? 'cycleAnsweredAt' OR kv.v ? 'cycleUpdatedAt'
     )
     AND NOT public.is_internal_account_client(kv.client_id)

  UNION ALL

  SELECT 'optional_features',
         '[keep:internalAccount] day rows with any cycle* key',
         COUNT(*)::bigint
    FROM public.client_kv_store kv
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND (
       kv.v ? 'cycleDay' OR kv.v ? 'cycleStatus'
       OR kv.v ? 'cycleAnsweredAt' OR kv.v ? 'cycleUpdatedAt'
     )
     AND public.is_internal_account_client(kv.client_id)

  UNION ALL

  SELECT 'optional_features',
         '[purge] day rows with measurements',
         COUNT(*)::bigint
    FROM public.client_kv_store kv
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND kv.v ? 'measurements'
     AND kv.v->'measurements' IS NOT NULL
     AND kv.v->'measurements' <> 'null'::jsonb
     AND NOT public.is_internal_account_client(kv.client_id)

  UNION ALL

  SELECT 'optional_features',
         '[keep:internalAccount] day rows with measurements',
         COUNT(*)::bigint
    FROM public.client_kv_store kv
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND kv.v ? 'measurements'
     AND kv.v->'measurements' IS NOT NULL
     AND kv.v->'measurements' <> 'null'::jsonb
     AND public.is_internal_account_client(kv.client_id)

  UNION ALL

  SELECT 'optional_features',
         '[purge] day rows with supplements',
         COUNT(*)::bigint
    FROM public.client_kv_store kv
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND (
       (kv.v ? 'supplementsPlanned' AND jsonb_typeof(kv.v->'supplementsPlanned') = 'array' AND jsonb_array_length(kv.v->'supplementsPlanned') > 0)
       OR (kv.v ? 'supplementsTaken' AND jsonb_typeof(kv.v->'supplementsTaken') = 'array' AND jsonb_array_length(kv.v->'supplementsTaken') > 0)
     )
     AND NOT public.is_internal_account_client(kv.client_id)

  UNION ALL

  SELECT 'optional_features',
         '[keep:internalAccount] day rows with supplements',
         COUNT(*)::bigint
    FROM public.client_kv_store kv
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND (
       (kv.v ? 'supplementsPlanned' AND jsonb_typeof(kv.v->'supplementsPlanned') = 'array' AND jsonb_array_length(kv.v->'supplementsPlanned') > 0)
       OR (kv.v ? 'supplementsTaken' AND jsonb_typeof(kv.v->'supplementsTaken') = 'array' AND jsonb_array_length(kv.v->'supplementsTaken') > 0)
     )
     AND public.is_internal_account_client(kv.client_id)

  UNION ALL

  SELECT 'optional_features',
         '[purge] profiles with customSupplements',
         COUNT(*)::bigint
    FROM public.client_kv_store kv
   WHERE kv.k = 'heys_profile'
     AND jsonb_typeof(kv.v->'customSupplements') = 'array'
     AND jsonb_array_length(kv.v->'customSupplements') > 0
     AND NOT public.is_internal_account_client(kv.client_id)

  UNION ALL

  SELECT 'optional_features',
         '[keep:internalAccount] profiles with customSupplements',
         COUNT(*)::bigint
    FROM public.client_kv_store kv
   WHERE kv.k = 'heys_profile'
     AND jsonb_typeof(kv.v->'customSupplements') = 'array'
     AND jsonb_array_length(kv.v->'customSupplements') > 0
     AND public.is_internal_account_client(kv.client_id)

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
  'Read-only inventory before health-minimization purge. Split [purge] vs [keep:internalAccount].';

-- Replace purge: exclude by heys_profile.internalAccount, not UUID list.
DROP FUNCTION IF EXISTS public.purge_health_minimization_data_v1(TEXT);
DROP FUNCTION IF EXISTS public.purge_health_minimization_data_v1(TEXT, BIGINT, BIGINT, BIGINT, BIGINT);
DROP FUNCTION IF EXISTS public.purge_health_minimization_data_v1(TEXT, BIGINT, BIGINT, BIGINT, BIGINT, UUID[]);

CREATE OR REPLACE FUNCTION public.purge_health_minimization_data_v1(
  p_actor TEXT DEFAULT 'system',
  p_expected_profiles_enabled BIGINT DEFAULT 0,
  p_expected_profiles_cycle_keys BIGINT DEFAULT 0,
  p_expected_day_cycle_payload BIGINT DEFAULT 0,
  p_expected_day_cycle_keys BIGINT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
  v_kept_day_measurements BIGINT := 0;
  v_kept_day_supplements BIGINT := 0;
  v_kept_profiles_custom BIGINT := 0;
  v_kept_internal_account_profiles BIGINT := 0;
  v_days_measurements_before BIGINT := 0;
  v_days_supplements_before BIGINT := 0;
  v_profiles_custom_before BIGINT := 0;
BEGIN
  SELECT COUNT(*) INTO v_kept_internal_account_profiles
    FROM public.client_kv_store kv
   WHERE kv.k = 'heys_profile'
     AND (kv.v->>'internalAccount') = 'true';

  SELECT COUNT(*) INTO v_profiles_enabled_before
    FROM public.client_kv_store kv
   WHERE kv.k = 'heys_profile'
     AND (kv.v->>'cycleTrackingEnabled') = 'true'
     AND NOT public.is_internal_account_client(kv.client_id);

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
     AND NOT public.is_internal_account_client(kv.client_id);

  SELECT COUNT(*) INTO v_days_cycle_payload_before
    FROM public.client_kv_store kv
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND (
       NULLIF(kv.v->>'cycleDay', '') IS NOT NULL
       OR NULLIF(kv.v->>'cycleStatus', '') IS NOT NULL
     )
     AND NOT public.is_internal_account_client(kv.client_id);

  SELECT COUNT(*) INTO v_days_cycle_keys_before
    FROM public.client_kv_store kv
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND (
       kv.v ? 'cycleDay' OR kv.v ? 'cycleStatus'
       OR kv.v ? 'cycleAnsweredAt' OR kv.v ? 'cycleUpdatedAt'
     )
     AND NOT public.is_internal_account_client(kv.client_id);

  SELECT COUNT(*) INTO v_days_measurements_before
    FROM public.client_kv_store kv
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND kv.v ? 'measurements'
     AND NOT public.is_internal_account_client(kv.client_id);

  SELECT COUNT(*) INTO v_days_supplements_before
    FROM public.client_kv_store kv
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND (
       kv.v ? 'supplementsPlanned' OR kv.v ? 'supplementsTaken'
     )
     AND NOT public.is_internal_account_client(kv.client_id);

  SELECT COUNT(*) INTO v_profiles_custom_before
    FROM public.client_kv_store kv
   WHERE kv.k = 'heys_profile'
     AND jsonb_typeof(kv.v->'customSupplements') = 'array'
     AND jsonb_array_length(kv.v->'customSupplements') > 0
     AND NOT public.is_internal_account_client(kv.client_id);

  SELECT COUNT(*) INTO v_kept_profiles_enabled
    FROM public.client_kv_store kv
   WHERE kv.k = 'heys_profile'
     AND (kv.v->>'cycleTrackingEnabled') = 'true'
     AND public.is_internal_account_client(kv.client_id);

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
     AND public.is_internal_account_client(kv.client_id);

  SELECT COUNT(*) INTO v_kept_day_cycle_payload
    FROM public.client_kv_store kv
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND (
       NULLIF(kv.v->>'cycleDay', '') IS NOT NULL
       OR NULLIF(kv.v->>'cycleStatus', '') IS NOT NULL
     )
     AND public.is_internal_account_client(kv.client_id);

  SELECT COUNT(*) INTO v_kept_day_cycle_keys
    FROM public.client_kv_store kv
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND (
       kv.v ? 'cycleDay' OR kv.v ? 'cycleStatus'
       OR kv.v ? 'cycleAnsweredAt' OR kv.v ? 'cycleUpdatedAt'
     )
     AND public.is_internal_account_client(kv.client_id);

  SELECT COUNT(*) INTO v_kept_day_measurements
    FROM public.client_kv_store kv
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND kv.v ? 'measurements'
     AND public.is_internal_account_client(kv.client_id);

  SELECT COUNT(*) INTO v_kept_day_supplements
    FROM public.client_kv_store kv
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND (
       kv.v ? 'supplementsPlanned' OR kv.v ? 'supplementsTaken'
     )
     AND public.is_internal_account_client(kv.client_id);

  SELECT COUNT(*) INTO v_kept_profiles_custom
    FROM public.client_kv_store kv
   WHERE kv.k = 'heys_profile'
     AND jsonb_typeof(kv.v->'customSupplements') = 'array'
     AND jsonb_array_length(kv.v->'customSupplements') > 0
     AND public.is_internal_account_client(kv.client_id);

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
     AND NOT public.is_internal_account_client(kv.client_id)
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
     AND NOT public.is_internal_account_client(kv.client_id);
  SELECT COUNT(*) INTO v_profiles_cycle_keys_after
    FROM public.client_kv_store kv
   WHERE kv.k = 'heys_profile'
     AND NOT public.is_internal_account_client(kv.client_id)
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
      'purge_aborted: profile cycle remain enabled=% keys=% (expected 0/0 among non-internal)',
      v_profiles_enabled_after, v_profiles_cycle_keys_after;
  END IF;

  UPDATE public.client_kv_store kv
     SET v = kv.v
       - 'cycleDay' - 'cycleStatus' - 'cycleAnsweredAt' - 'cycleUpdatedAt',
         updated_at = NOW()
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND NOT public.is_internal_account_client(kv.client_id)
     AND (
       kv.v ? 'cycleDay' OR kv.v ? 'cycleStatus'
       OR kv.v ? 'cycleAnsweredAt' OR kv.v ? 'cycleUpdatedAt'
     );
  GET DIAGNOSTICS v_days_cycle_cleared = ROW_COUNT;

  SELECT COUNT(*) INTO v_days_cycle_payload_after
    FROM public.client_kv_store kv
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND NOT public.is_internal_account_client(kv.client_id)
     AND (
       NULLIF(kv.v->>'cycleDay', '') IS NOT NULL
       OR NULLIF(kv.v->>'cycleStatus', '') IS NOT NULL
     );
  SELECT COUNT(*) INTO v_days_cycle_keys_after
    FROM public.client_kv_store kv
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND NOT public.is_internal_account_client(kv.client_id)
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
      'purge_aborted: day cycle remain payload=% keys=% (expected 0/0 among non-internal)',
      v_days_cycle_payload_after, v_days_cycle_keys_after;
  END IF;

  UPDATE public.client_kv_store kv
     SET v = kv.v - 'measurements',
         updated_at = NOW()
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND NOT public.is_internal_account_client(kv.client_id)
     AND kv.v ? 'measurements';
  GET DIAGNOSTICS v_days_measurements = ROW_COUNT;

  UPDATE public.client_kv_store kv
     SET v = kv.v
       - 'supplementsPlanned' - 'supplementsPlannedUpdatedAt'
       - 'supplementsTaken' - 'supplementsTakenAt' - 'supplementsTakenMeta' - 'supplementsTakenUpdatedAt',
         updated_at = NOW()
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND NOT public.is_internal_account_client(kv.client_id)
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
     AND NOT public.is_internal_account_client(kv.client_id)
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

  INSERT INTO public.audit_logs(action, resource_type, metadata)
  VALUES (
    'health_minimization_purge',
    'client_kv_store',
    jsonb_build_object(
      'actor', p_actor,
      'purged_at', NOW(),
      'kept_reason', 'internalAccount profile flag',
      'kept_internal_account_profiles', v_kept_internal_account_profiles,
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
      'days_measurements_before', v_days_measurements_before,
      'days_supplements_before', v_days_supplements_before,
      'profiles_custom_supplements_before', v_profiles_custom_before,
      'kept_profiles_enabled', v_kept_profiles_enabled,
      'kept_profiles_cycle_keys', v_kept_profiles_cycle_keys,
      'kept_day_cycle_payload', v_kept_day_cycle_payload,
      'kept_day_cycle_keys', v_kept_day_cycle_keys,
      'kept_day_measurements', v_kept_day_measurements,
      'kept_day_supplements', v_kept_day_supplements,
      'kept_profiles_custom_supplements', v_kept_profiles_custom,
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
    'kept_reason', 'internalAccount profile flag',
    'kept_internal_account_profiles', v_kept_internal_account_profiles,
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
    'days_measurements_before', v_days_measurements_before,
    'days_supplements_before', v_days_supplements_before,
    'profiles_custom_supplements_before', v_profiles_custom_before,
    'kept_profiles_enabled', v_kept_profiles_enabled,
    'kept_profiles_cycle_keys', v_kept_profiles_cycle_keys,
    'kept_day_cycle_payload', v_kept_day_cycle_payload,
    'kept_day_cycle_keys', v_kept_day_cycle_keys,
    'kept_day_measurements', v_kept_day_measurements,
    'kept_day_supplements', v_kept_day_supplements,
    'kept_profiles_custom_supplements', v_kept_profiles_custom,
    'days_measurements_cleared', v_days_measurements,
    'days_supplements_cleared', v_days_supplements,
    'profiles_custom_supplements_cleared', v_profiles_custom,
    'trial_candidate_health_consents_revoked', v_trial_consents,
    'client_health_consents_revoked', v_client_consents
  );
END;
$$;

COMMENT ON FUNCTION public.purge_health_minimization_data_v1(TEXT, BIGINT, BIGINT, BIGINT, BIGINT) IS
  'Destructive health-minimization purge. Skips clients with heys_profile.internalAccount=true. Owner command required.';

REVOKE ALL ON FUNCTION public.purge_health_minimization_data_v1(TEXT, BIGINT, BIGINT, BIGINT, BIGINT) FROM PUBLIC;
