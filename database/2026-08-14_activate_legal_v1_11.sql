-- HEYS legal consent registry: activate document package 1.11.
-- Forward-only. Historical consent evidence and immutable snapshots keep
-- their original version/hash.
--
-- personal_data becomes a separate consent 1.0 (not the privacy policy).
-- privacy_policy 1.8 is the landing/lead application document.
-- health_data 1.5 is retired from the required set; snapshot stays archived.
--
-- Lawyer sign-off 14.08: docs/release/vychitka-1.11-2026-08-14.md
-- («Замечаний нет. Пакет можно регистрировать.»).
-- Apply only with the matching frontend / payments / bot release.
-- Applying triggers re-consent for five own accounts.
-- Cross-border transfer still waits for the ~27.08 notification window.

INSERT INTO public.legal_consent_registry (
  consent_type,
  document_version,
  document_sha256,
  document_path,
  status,
  effective_at,
  legal_signoff_ref
) VALUES
  ('user_agreement', '1.11', '9d4645844bd409b9a84381e0cddc307a181060516f82aefd586603676040c29e', 'apps/web/public/docs/v1.11/user-agreement.md', 'active', '2026-08-14 00:00:00+03', 'docs/release/vychitka-1.11-2026-08-14.md'),
  ('payment_oferta', '1.11', '9d4645844bd409b9a84381e0cddc307a181060516f82aefd586603676040c29e', 'apps/web/public/docs/v1.11/user-agreement.md', 'active', '2026-08-14 00:00:00+03', 'docs/release/vychitka-1.11-2026-08-14.md'),
  ('privacy_policy', '1.8', 'd306c2eaab111a43868ca2e58699f7e13ce7b32768af17b1c2698fa1bfeddcfb', 'apps/web/public/docs/v1.8/privacy-policy.md', 'active', '2026-08-14 00:00:00+03', 'docs/release/vychitka-1.11-2026-08-14.md'),
  ('personal_data', '1.0', '0fa643d3238157fd5505185e673009effac2b2b04c7ba172d2edfc46c709231d', 'apps/web/public/docs/v1.0/personal-data-consent.md', 'active', '2026-08-14 00:00:00+03', 'docs/release/vychitka-1.11-2026-08-14.md'),
  ('refund', '1.2', '5416bacfc9c0f644172cd7db4693fdc1852c8e105143141692e606f388092cdd', 'apps/web/public/docs/v1.2/refund.md', 'active', '2026-08-14 00:00:00+03', 'docs/release/vychitka-1.11-2026-08-14.md'),
  ('marketing', '1.4', '710a741e5681cab2d91b1d91a1315dcef2f75d3c3eebdaab7c9987a1cf906f7b', 'apps/web/public/docs/v1.4/marketing-consent.md', 'active', '2026-08-14 00:00:00+03', 'docs/release/vychitka-1.11-2026-08-14.md'),
  ('push_notifications', '1.1', '99433c270c3432dd8f13a23db1eca61fe13b5379ed51aec15bdab3bcb8083bab', 'apps/web/public/docs/v1.1/push-notifications-consent.md', 'active', '2026-08-14 00:00:00+03', 'docs/release/vychitka-1.11-2026-08-14.md'),
  ('pep_agreement', '1.1', 'c70000fe4362ce08b4b68eb79056f5f21871df412d1d62c1e4147ecb8353b0e6', 'apps/web/public/docs/v1.1/pep-agreement.md', 'active', '2026-08-14 00:00:00+03', 'docs/release/vychitka-1.11-2026-08-14.md'),
  ('curator_access', '1.1', 'fd235890934df7bfaf55fdb15ac703cca0836feddb773648baf55b9c5ddfd12b', 'apps/web/public/docs/v1.1/curator-access-consent.md', 'active', '2026-08-14 00:00:00+03', 'docs/release/vychitka-1.11-2026-08-14.md'),
  ('speech_transcription', '1.2', '6748cc9e45b03b26d03cef2b99dd48f098778c611471e350a5d4f6b265e646f6', 'apps/web/public/docs/v1.2/speech-transcription-consent.md', 'active', '2026-08-14 00:00:00+03', 'docs/release/vychitka-1.11-2026-08-14.md'),
  ('warning_intake', '1.0', '2dd546b41f683018acad431734d306374c9ce4c8e98727f1e88cb633fd93d45f', 'apps/web/public/docs/v1.0/warning-intake.md', 'active', '2026-08-14 00:00:00+03', 'docs/release/vychitka-1.11-2026-08-14.md'),
  ('body_measurements', '1.0', 'db51751753de4725a8d79ed0c9e2d5509b269d900b66d320fd3c9e2613a9111b', 'apps/web/public/docs/v1.0/body-measurements-consent.md', 'active', '2026-08-14 00:00:00+03', 'docs/release/vychitka-1.11-2026-08-14.md'),
  ('supplements_tracking', '1.0', '4aa7a696020ba5f0f74c8a69c2beed54d7e27b0b611bac74a737988a1354827f', 'apps/web/public/docs/v1.0/supplements-consent.md', 'active', '2026-08-14 00:00:00+03', 'docs/release/vychitka-1.11-2026-08-14.md'),
  ('health_data', '1.5', 'a05365f23b7758deb1d6858d6816e7ee34fd5239c9d1fc84b2786c6027428256', 'apps/web/public/docs/v1.5/health-data-consent.md', 'retired', '2026-07-27 00:00:00+03', 'docs/release/vychitka-1.11-2026-08-14.md')
ON CONFLICT (consent_type, document_version) DO UPDATE SET
  document_sha256 = EXCLUDED.document_sha256,
  document_path = EXCLUDED.document_path,
  status = EXCLUDED.status,
  effective_at = EXCLUDED.effective_at,
  legal_signoff_ref = EXCLUDED.legal_signoff_ref;

UPDATE public.legal_consent_registry
SET status = 'retired'
WHERE status = 'active'
  AND (
    (consent_type IN ('user_agreement', 'payment_oferta') AND document_version <> '1.11')
    OR (consent_type = 'personal_data' AND document_version <> '1.0')
    OR (consent_type = 'privacy_policy' AND document_version <> '1.8')
    OR (consent_type = 'marketing' AND document_version <> '1.4')
    OR (consent_type = 'push_notifications' AND document_version <> '1.1')
    OR (consent_type = 'curator_access' AND document_version <> '1.1')
    OR (consent_type = 'speech_transcription' AND document_version <> '1.2')
    OR (consent_type = 'refund' AND document_version <> '1.2')
    OR (consent_type = 'health_data')
  );

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
      'supplements_tracking',
      'warning_intake'
    ));
END $$;

CREATE OR REPLACE FUNCTION public.check_required_consents_v2(
  p_client_id UUID,
  p_expected_versions JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_required TEXT[] := ARRAY['user_agreement','personal_data'];
  v_type TEXT;
  v_expected TEXT;
  v_expected_hash TEXT;
  v_actual_version TEXT;
  v_actual_hash TEXT;
  v_accepted_at TIMESTAMPTZ;
  v_missing TEXT[] := ARRAY[]::TEXT[];
  v_outdated JSONB := '[]'::jsonb;
  v_outdated_since TIMESTAMPTZ;
  v_grace_expires TIMESTAMPTZ;
  v_grace_status TEXT;
  v_age_confirmed BOOLEAN;
BEGIN
  -- p_expected_versions is retained only for wire compatibility. Server registry owns expectations.
  FOREACH v_type IN ARRAY v_required LOOP
    SELECT document_version, document_sha256 INTO v_expected, v_expected_hash
      FROM public.legal_consent_registry
     WHERE consent_type = v_type AND status = 'active';
    IF v_expected IS NULL THEN
      RETURN jsonb_build_object('success', false, 'valid', false, 'must_block', true,
        'error', 'required_consent_registry_missing', 'consent_type', v_type);
    END IF;

    SELECT document_version, document_sha256, accepted_at
      INTO v_actual_version, v_actual_hash, v_accepted_at
      FROM public.consents
     WHERE client_id = p_client_id AND consent_type = v_type
       AND granted = true AND is_active = true AND revoked_at IS NULL
     ORDER BY created_at DESC LIMIT 1;

    IF NOT FOUND THEN
      v_missing := array_append(v_missing, v_type);
    ELSIF v_actual_version <> v_expected OR v_actual_hash IS DISTINCT FROM v_expected_hash
       OR v_accepted_at IS NULL THEN
      v_outdated := v_outdated || jsonb_build_object(
        'type', v_type, 'current', v_actual_version, 'expected', v_expected,
        'proof_complete', v_actual_hash = v_expected_hash AND v_accepted_at IS NOT NULL);
    END IF;
  END LOOP;

  SELECT consent_outdated_since, (birth_year IS NOT NULL)
    INTO v_outdated_since, v_age_confirmed FROM public.clients WHERE id = p_client_id;
  IF array_length(v_missing, 1) IS NOT NULL OR jsonb_array_length(v_outdated) > 0 THEN
    IF v_outdated_since IS NULL THEN
      UPDATE public.clients SET consent_outdated_since = NOW() WHERE id = p_client_id;
      v_outdated_since := NOW();
    END IF;
    v_grace_expires := v_outdated_since + INTERVAL '7 days';
    v_grace_status := CASE WHEN NOW() > v_grace_expires THEN 'expired' ELSE 'active' END;
  ELSE
    IF v_outdated_since IS NOT NULL THEN
      UPDATE public.clients SET consent_outdated_since = NULL WHERE id = p_client_id;
    END IF;
    v_grace_status := 'none';
  END IF;

  RETURN jsonb_build_object(
    'valid', array_length(v_missing, 1) IS NULL AND jsonb_array_length(v_outdated) = 0,
    'missing', to_jsonb(v_missing), 'outdated', v_outdated,
    'outdated_since', v_outdated_since, 'grace_expires_at', v_grace_expires,
    'grace_status', v_grace_status,
    'must_block', array_length(v_missing, 1) IS NOT NULL OR jsonb_array_length(v_outdated) > 0,
    'age_confirmed', COALESCE(v_age_confirmed, false)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_required_consents_v2(UUID, JSONB) FROM PUBLIC, heys_rpc;

-- Landing/Telegram lead proof is the public policy, not the in-app personal_data consent.
CREATE OR REPLACE FUNCTION public.enforce_lead_consent_proof()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_privacy_hash TEXT;
  v_marketing_hash TEXT;
BEGIN
  IF NEW.consent_privacy_version IS NULL THEN
    NEW.consent_privacy_sha256 := NULL;
    NEW.consent_accepted_at := NULL;
    NEW.consent_marketing_version := NULL;
    NEW.consent_marketing_sha256 := NULL;
    NEW.consent_marketing_accepted_at := NULL;
    RETURN NEW;
  END IF;

  SELECT document_sha256 INTO v_privacy_hash
    FROM public.legal_consent_registry
   WHERE consent_type = 'privacy_policy'
     AND document_version = NEW.consent_privacy_version
     AND status = 'active';
  IF v_privacy_hash IS NULL THEN
    RAISE EXCEPTION 'consent_version_not_allowed:privacy_policy:%', NEW.consent_privacy_version
      USING ERRCODE = '22023';
  END IF;

  NEW.consent_privacy_sha256 := v_privacy_hash;
  NEW.consent_accepted_at := NOW();

  IF NEW.consent_marketing_version IS NULL THEN
    NEW.consent_marketing_sha256 := NULL;
    NEW.consent_marketing_accepted_at := NULL;
  ELSE
    SELECT document_sha256 INTO v_marketing_hash
      FROM public.legal_consent_registry
     WHERE consent_type = 'marketing'
       AND document_version = NEW.consent_marketing_version
       AND status = 'active';
    IF v_marketing_hash IS NULL THEN
      RAISE EXCEPTION 'consent_version_not_allowed:marketing:%', NEW.consent_marketing_version
        USING ERRCODE = '22023';
    END IF;
    NEW.consent_marketing_sha256 := v_marketing_hash;
    NEW.consent_marketing_accepted_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;
