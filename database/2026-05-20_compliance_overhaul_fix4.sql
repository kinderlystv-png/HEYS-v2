-- ═══════════════════════════════════════════════════════════════════════════════
-- HEYS: Patch fix4 для 2026-05-20_compliance_overhaul.sql
-- Дата: 2026-05-21
-- ═══════════════════════════════════════════════════════════════════════════════
-- Что добавляем:
--   check_required_consents_v2 возвращает дополнительно `age_confirmed` (boolean)
--   — это нужно ComplianceBoundary в браузере для решения показывать ли
--   AgeGateModal (без отдельного profile fetch).
--   `age_confirmed = (clients.birth_year IS NOT NULL)`.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.check_required_consents_v2(
  p_client_id UUID,
  p_expected_versions JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_required TEXT[] := ARRAY['user_agreement','personal_data','health_data'];
  v_type TEXT;
  v_expected TEXT;
  v_actual_version TEXT;
  v_granted BOOLEAN;
  v_missing TEXT[] := ARRAY[]::TEXT[];
  v_outdated JSONB := '[]'::jsonb;
  v_outdated_since TIMESTAMPTZ;
  v_grace_expires TIMESTAMPTZ;
  v_grace_status TEXT;
  v_age_confirmed BOOLEAN;
BEGIN
  FOREACH v_type IN ARRAY v_required LOOP
    v_expected := p_expected_versions->>v_type;

    SELECT document_version, granted
      INTO v_actual_version, v_granted
      FROM consents
     WHERE client_id = p_client_id
       AND consent_type = v_type
       AND granted = true
       AND revoked_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1;

    IF NOT FOUND OR NOT COALESCE(v_granted, false) THEN
      v_missing := array_append(v_missing, v_type);
    ELSIF v_expected IS NOT NULL AND v_actual_version <> v_expected THEN
      v_outdated := v_outdated || jsonb_build_object(
        'type', v_type,
        'current', v_actual_version,
        'expected', v_expected
      );
    END IF;
  END LOOP;

  -- Server-side grace tracking + age_confirmed read in same query
  SELECT consent_outdated_since, (birth_year IS NOT NULL)
    INTO v_outdated_since, v_age_confirmed
    FROM clients WHERE id = p_client_id;

  IF jsonb_array_length(v_outdated) > 0 THEN
    IF v_outdated_since IS NULL THEN
      UPDATE clients SET consent_outdated_since = now() WHERE id = p_client_id;
      v_outdated_since := now();
    END IF;
    v_grace_expires := v_outdated_since + INTERVAL '7 days';
    v_grace_status := CASE WHEN now() > v_grace_expires THEN 'expired' ELSE 'active' END;
  ELSE
    IF v_outdated_since IS NOT NULL THEN
      UPDATE clients SET consent_outdated_since = NULL WHERE id = p_client_id;
    END IF;
    v_grace_status := 'none';
  END IF;

  RETURN jsonb_build_object(
    'valid', array_length(v_missing, 1) IS NULL AND v_grace_status <> 'expired',
    'missing', to_jsonb(v_missing),
    'outdated', v_outdated,
    'outdated_since', v_outdated_since,
    'grace_expires_at', v_grace_expires,
    'grace_status', v_grace_status,
    'must_block', v_grace_status = 'expired',
    'age_confirmed', COALESCE(v_age_confirmed, false)
  );
END;
$$;

COMMIT;
