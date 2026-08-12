-- ============================================================================
-- HEYS Health minimization — optional cycle / measurements / supplements
-- Date: 2026-08-11
-- ============================================================================
-- Adds optional consent types for health feature opt-in, disables tracking flags
-- for all existing profiles, and provides audit helper for owner review.
-- Idempotent: safe to run repeatedly.
-- ============================================================================

BEGIN;

-- 1) Optional client consent types.
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
      'speech_transcription',
      'cycle_tracking',
      'body_measurements',
      'supplements_tracking'
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

        IF v_type NOT IN (
          'user_agreement', 'personal_data', 'health_data',
          'marketing', 'payment_oferta',
          'push_notifications', 'curator_access',
          'speech_transcription',
          'cycle_tracking', 'body_measurements', 'supplements_tracking'
        ) THEN
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
  'Логирование согласий (v1.4 2026-08-11: + cycle_tracking, body_measurements, supplements_tracking).';

-- 2) Disable optional health feature flags for all existing profiles.
CREATE OR REPLACE FUNCTION public.disable_optional_health_features_v1()
RETURNS TABLE (
  client_id UUID,
  profile_updated BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH updated AS (
    UPDATE public.client_kv_store kv
       SET v = jsonb_set(
             jsonb_set(
               jsonb_set(
                 COALESCE(kv.v, '{}'::jsonb),
                 '{cycleTrackingEnabled}', 'false'::jsonb, true
               ),
               '{measurementsTrackingEnabled}', 'false'::jsonb, true
             ),
             '{supplementsTrackingEnabled}', 'false'::jsonb, true
           ),
           updated_at = NOW()
     WHERE kv.k = 'heys_profile'
       AND (
         COALESCE(kv.v->>'cycleTrackingEnabled', 'false') <> 'false'
         OR COALESCE(kv.v->>'measurementsTrackingEnabled', 'false') <> 'false'
         OR COALESCE(kv.v->>'supplementsTrackingEnabled', 'false') <> 'false'
       )
    RETURNING kv.client_id
  )
  SELECT u.client_id, TRUE AS profile_updated
    FROM updated u;
END;
$$;

COMMENT ON FUNCTION public.disable_optional_health_features_v1() IS
  'Sets cycle/measurements/supplements tracking flags to false for all heys_profile rows.';

-- 3) Audit helper — non-destructive inventory for owner review.
CREATE OR REPLACE FUNCTION public.audit_health_feature_data_v1()
RETURNS TABLE (
  client_id UUID,
  day_key TEXT,
  feature TEXT,
  field_name TEXT,
  sample_value TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT kv.client_id,
         kv.k AS day_key,
         'cycle'::text AS feature,
         fld.field_name,
         LEFT(COALESCE(kv.v->>fld.field_name, ''), 120) AS sample_value
    FROM public.client_kv_store kv
    CROSS JOIN (
      VALUES ('cycleDay'), ('cycleStatus'), ('cycleAnsweredAt'), ('cycleUpdatedAt')
    ) AS fld(field_name)
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND kv.v ? fld.field_name
     AND NULLIF(kv.v->>fld.field_name, '') IS NOT NULL

  UNION ALL

  SELECT kv.client_id,
         kv.k,
         'measurements'::text,
         'measurements',
         LEFT(COALESCE((kv.v->'measurements')::text, ''), 120)
    FROM public.client_kv_store kv
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND kv.v ? 'measurements'
     AND kv.v->'measurements' IS NOT NULL
     AND kv.v->'measurements' <> 'null'::jsonb

  UNION ALL

  SELECT kv.client_id,
         kv.k,
         'supplements'::text,
         fld.field_name,
         LEFT(COALESCE((kv.v->fld.field_name)::text, ''), 120)
    FROM public.client_kv_store kv
    CROSS JOIN (
      VALUES ('supplementsPlanned'), ('supplementsTaken')
    ) AS fld(field_name)
   WHERE kv.k ~ '^heys_dayv2_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND kv.v ? fld.field_name
     AND (
       (jsonb_typeof(kv.v->fld.field_name) = 'array' AND jsonb_array_length(kv.v->fld.field_name) > 0)
       OR NULLIF(kv.v->>fld.field_name, '') IS NOT NULL
     )

  UNION ALL

  SELECT kv.client_id,
         kv.k,
         'supplements_profile'::text,
         fld.field_name,
         LEFT(COALESCE((kv.v->fld.field_name)::text, ''), 120)
    FROM public.client_kv_store kv
    CROSS JOIN (
      VALUES ('plannedSupplements'), ('customSupplements')
    ) AS fld(field_name)
   WHERE kv.k = 'heys_profile'
     AND kv.v ? fld.field_name
     AND (
       (jsonb_typeof(kv.v->fld.field_name) = 'array' AND jsonb_array_length(kv.v->fld.field_name) > 0)
       OR (jsonb_typeof(kv.v->fld.field_name) = 'object' AND kv.v->fld.field_name <> '{}'::jsonb)
     );
$$;

COMMENT ON FUNCTION public.audit_health_feature_data_v1() IS
  'Read-only inventory of cycle/measurements/supplements data still present in client_kv_store.';

COMMIT;
