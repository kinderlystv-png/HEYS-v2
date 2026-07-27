-- HEYS consent proof hardening (forward-only, no historical backfill)
-- Prepared: 2026-07-27. Apply only through an explicitly approved release flow.

BEGIN;

CREATE TABLE IF NOT EXISTS public.legal_consent_registry (
  consent_type TEXT NOT NULL,
  document_version TEXT NOT NULL,
  document_sha256 TEXT NOT NULL CHECK (document_sha256 ~ '^[0-9a-f]{64}$'),
  document_path TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'candidate', 'retired')),
  effective_at TIMESTAMPTZ,
  legal_signoff_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (consent_type, document_version)
);

COMMENT ON TABLE public.legal_consent_registry IS
  'Server-owned allowlist of exact consent type/version/document hashes. Only status=active can be accepted.';

INSERT INTO public.legal_consent_registry (
  consent_type, document_version, document_sha256, document_path, status, effective_at, legal_signoff_ref
) VALUES
  ('user_agreement', '1.7', '8712caf2ad433b2618b01ce168efd101786555c4b9697de7c53342b0bff29b74', 'apps/web/public/docs/v1.7/user-agreement.md', 'active', '2026-07-27 00:00:00+03', NULL),
  ('personal_data', '1.7', 'e31fd13099952da2458bee27c76e8d2bcf632d6b34d14220bd68ca1dc1955c5c', 'apps/web/public/docs/v1.7/privacy-policy.md', 'active', '2026-07-27 00:00:00+03', NULL),
  ('health_data', '1.5', 'a05365f23b7758deb1d6858d6816e7ee34fd5239c9d1fc84b2786c6027428256', 'apps/web/public/docs/v1.5/health-data-consent.md', 'active', '2026-07-27 00:00:00+03', NULL),
  ('marketing', '1.3', '99cf6dc012948a19423e750ea8039afb11f56b44ccf35e319f123f47539cc81d', 'apps/web/public/docs/v1.3/marketing-consent.md', 'active', '2026-07-27 00:00:00+03', NULL),
  ('payment_oferta', '1.7', '8712caf2ad433b2618b01ce168efd101786555c4b9697de7c53342b0bff29b74', 'apps/web/public/docs/v1.7/user-agreement.md', 'active', '2026-07-27 00:00:00+03', NULL),
  ('push_notifications', '1.0', 'a4b2f8dc1a43eec77a5bb7cdacfb55771f7c84cfe9517a7325adea99b4e1e292', 'apps/web/public/docs/v1.0/push-notifications-consent.md', 'active', '2026-05-20 00:00:00+03', NULL),
  ('curator_access', '1.0', '75cd5fadf7db8e3d065e799ab27525e7db293538c60a465660cbc010f0da5a11', 'apps/web/public/docs/v1.0/curator-access-consent.md', 'active', '2026-05-20 00:00:00+03', NULL),
  ('speech_transcription', '1.1', '75f42b06d3b616e1a9c76f4cb5c4b9bb02bb4e0737c44735394816b484f1df1f', 'apps/web/public/docs/v1.1/speech-transcription-consent.md', 'active', '2026-07-27 00:00:00+03', NULL),
  ('health_data', '2.0', '44086e492df447ca989c39fa06c4a39acaa58772424c5b4ad079458a7aaa2e8d', 'docs/legal/candidates/health-data-consent-v2.0.md', 'candidate', NULL, 'REQUIRED_BEFORE_ACTIVATION')
ON CONFLICT (consent_type, document_version) DO UPDATE SET
  document_sha256 = EXCLUDED.document_sha256,
  document_path = EXCLUDED.document_path,
  status = EXCLUDED.status,
  effective_at = EXCLUDED.effective_at,
  legal_signoff_ref = EXCLUDED.legal_signoff_ref;

ALTER TABLE public.consents
  ADD COLUMN IF NOT EXISTS document_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

ALTER TABLE public.curator_consents
  ADD COLUMN IF NOT EXISTS document_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS consent_privacy_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS consent_marketing_version TEXT,
  ADD COLUMN IF NOT EXISTS consent_marketing_sha256 TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consents_document_sha256_format') THEN
    ALTER TABLE public.consents ADD CONSTRAINT consents_document_sha256_format
      CHECK (document_sha256 IS NULL OR document_sha256 ~ '^[0-9a-f]{64}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'curator_consents_document_sha256_format') THEN
    ALTER TABLE public.curator_consents ADD CONSTRAINT curator_consents_document_sha256_format
      CHECK (document_sha256 IS NULL OR document_sha256 ~ '^[0-9a-f]{64}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_consent_hash_format') THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_consent_hash_format CHECK (
      (consent_privacy_sha256 IS NULL OR consent_privacy_sha256 ~ '^[0-9a-f]{64}$') AND
      (consent_marketing_sha256 IS NULL OR consent_marketing_sha256 ~ '^[0-9a-f]{64}$')
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_consent_document_proof()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hash TEXT;
BEGIN
  SELECT document_sha256 INTO v_hash
    FROM public.legal_consent_registry
   WHERE consent_type = NEW.consent_type
     AND document_version = NEW.document_version
     AND status = 'active';

  IF v_hash IS NULL THEN
    RAISE EXCEPTION 'consent_version_not_allowed:%:%', NEW.consent_type, NEW.document_version
      USING ERRCODE = '22023';
  END IF;

  NEW.document_sha256 := v_hash;
  IF current_setting('app.consent_proof_source', true) = 'lead_conversion' THEN
    NEW.accepted_at := COALESCE(NEW.accepted_at, NOW());
  ELSE
    NEW.accepted_at := NOW();
  END IF;
  NEW.created_at := NEW.accepted_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS consents_document_proof_insert ON public.consents;
CREATE TRIGGER consents_document_proof_insert
  BEFORE INSERT ON public.consents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_consent_document_proof();

DROP TRIGGER IF EXISTS curator_consents_document_proof_insert ON public.curator_consents;
CREATE TRIGGER curator_consents_document_proof_insert
  BEFORE INSERT ON public.curator_consents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_consent_document_proof();

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
  -- Non-landing sources may create an operational lead without claiming a
  -- consent proof. They must leave every proof field NULL and collect a real
  -- consent later; this is safer than fabricating a version/timestamp.
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
   WHERE consent_type = 'personal_data'
     AND document_version = NEW.consent_privacy_version
     AND status = 'active';
  IF v_privacy_hash IS NULL THEN
    RAISE EXCEPTION 'consent_version_not_allowed:personal_data:%', NEW.consent_privacy_version
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

DROP TRIGGER IF EXISTS leads_consent_proof_insert ON public.leads;
CREATE TRIGGER leads_consent_proof_insert
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.enforce_lead_consent_proof();

CREATE OR REPLACE FUNCTION public.log_consents(
  p_client_id UUID,
  p_consents JSONB,
  p_ip TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_consent JSONB;
  v_result JSONB := '[]'::jsonb;
  v_type TEXT;
  v_granted BOOLEAN;
  v_version TEXT;
  v_signature TEXT;
  v_hash TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = p_client_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'client_not_found');
  END IF;
  IF jsonb_typeof(p_consents) <> 'array' OR jsonb_array_length(p_consents) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_consents_payload');
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_consents) item
     GROUP BY item->>'type' HAVING COUNT(*) > 1
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'duplicate_consent_type');
  END IF;

  -- Validate the whole request before revoking or inserting anything.
  FOR v_consent IN SELECT * FROM jsonb_array_elements(p_consents) LOOP
    v_type := v_consent->>'type';
    v_version := v_consent->>'version';
    v_signature := COALESCE(v_consent->>'signature_method', 'checkbox');
    SELECT document_sha256 INTO v_hash
      FROM public.legal_consent_registry
     WHERE consent_type = v_type AND document_version = v_version AND status = 'active';
    IF v_hash IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'consent_version_not_allowed',
        'consent_type', v_type, 'document_version', v_version);
    END IF;
    IF v_signature NOT IN ('checkbox', 'sms_code', 'one_time_code', 'messenger_code', 'button') THEN
      RETURN jsonb_build_object('success', false, 'error', 'signature_method_not_allowed');
    END IF;
  END LOOP;

  PERFORM set_config('app.consents_writer', 'authorized', true);
  FOR v_consent IN SELECT * FROM jsonb_array_elements(p_consents) LOOP
    v_type := v_consent->>'type';
    v_version := v_consent->>'version';
    v_granted := COALESCE((v_consent->>'granted')::boolean, true);
    v_signature := COALESCE(v_consent->>'signature_method', 'checkbox');

    UPDATE public.consents
       SET granted = false, is_active = false, revoked_at = NOW()
     WHERE client_id = p_client_id AND consent_type = v_type
       AND granted = true AND revoked_at IS NULL;

    INSERT INTO public.consents (
      client_id, consent_type, document_version, signature_method,
      granted, is_active, ip_address, user_agent
    ) VALUES (
      p_client_id, v_type, v_version, v_signature, v_granted, v_granted,
      CASE WHEN NULLIF(BTRIM(p_ip), '') IS NOT NULL THEN p_ip::inet ELSE NULL END,
      LEFT(p_user_agent, 500)
    );

    SELECT document_sha256 INTO v_hash FROM public.legal_consent_registry
     WHERE consent_type = v_type AND document_version = v_version;
    v_result := v_result || jsonb_build_object(
      'type', v_type, 'version', v_version, 'document_sha256', v_hash,
      'granted', v_granted, 'logged', true);
  END LOOP;
  RETURN jsonb_build_object('success', true, 'consents', v_result, 'client_id', p_client_id);
EXCEPTION WHEN invalid_text_representation THEN
  RETURN jsonb_build_object('success', false, 'error', 'invalid_consent_payload');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_consents(UUID, JSONB, TEXT, TEXT) FROM PUBLIC, heys_rpc;

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
  v_required TEXT[] := ARRAY['user_agreement','personal_data','health_data'];
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

CREATE OR REPLACE FUNCTION public.check_payment_consent_by_session(p_session_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client_id UUID;
  v_version TEXT;
  v_hash TEXT;
  v_accepted_at TIMESTAMPTZ;
BEGIN
  v_client_id := public.require_client_id(p_session_token);
  SELECT c.document_version, c.document_sha256, c.accepted_at
    INTO v_version, v_hash, v_accepted_at
    FROM public.consents c
    JOIN public.legal_consent_registry r
      ON r.consent_type = c.consent_type AND r.document_version = c.document_version
     AND r.document_sha256 = c.document_sha256 AND r.status = 'active'
   WHERE c.client_id = v_client_id AND c.consent_type = 'payment_oferta'
     AND c.granted = true AND c.is_active = true AND c.revoked_at IS NULL
     AND c.accepted_at IS NOT NULL
   ORDER BY c.created_at DESC LIMIT 1;
  RETURN jsonb_build_object('success', true, 'has_payment_consent', FOUND,
    'consent_version', v_version, 'document_sha256', v_hash,
    'consent_date', v_accepted_at, 'client_id', v_client_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_consent_proof_by_session(
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
  v_proof JSONB;
BEGIN
  v_client_id := public.require_client_id(p_session_token);
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'type', consent_type, 'version', document_version,
    'document_sha256', document_sha256, 'granted', granted,
    'signature_method', signature_method, 'ip_address', host(ip_address),
    'user_agent', user_agent, 'accepted_at', accepted_at,
    'created_at', created_at, 'revoked_at', revoked_at
  ) ORDER BY created_at DESC), '[]'::jsonb)
    INTO v_proof FROM public.consents
   WHERE client_id = v_client_id AND consent_type = p_consent_type;
  PERFORM public.log_data_access('client_self', v_client_id, v_client_id,
    'download_consent_proof', ARRAY[p_consent_type], false, NULL, NULL,
    jsonb_build_object('consent_type', p_consent_type));
  RETURN jsonb_build_object('success', true, 'client_id', v_client_id,
    'consent_type', p_consent_type, 'proof_records', v_proof, 'generated_at', NOW());
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Preserve the published trial-intake conversion contract, but only carry
-- proof that was recorded server-side under the exact active registry entry.
-- Historical leads are not backfilled and therefore produce no consent row.
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
  PERFORM set_config('app.consent_proof_source', 'lead_conversion', true);

  IF EXISTS (
    SELECT 1 FROM public.legal_consent_registry r
     WHERE r.consent_type = 'personal_data' AND r.status = 'active'
       AND r.document_version = v_lead.consent_privacy_version
       AND r.document_sha256 = v_lead.consent_privacy_sha256
       AND v_lead.consent_accepted_at IS NOT NULL
  ) THEN
    INSERT INTO public.consents (
      client_id, consent_type, document_version, document_sha256, accepted_at,
      granted, is_active, signature_method, ip_address, user_agent
    ) VALUES (
      v_client_id, 'personal_data', v_lead.consent_privacy_version,
      v_lead.consent_privacy_sha256, v_lead.consent_accepted_at,
      true, true, 'checkbox', v_consent_ip,
      COALESCE(v_lead.consent_user_agent, v_lead.user_agent)
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.legal_consent_registry r
     WHERE r.consent_type = 'marketing' AND r.status = 'active'
       AND r.document_version = v_lead.consent_marketing_version
       AND r.document_sha256 = v_lead.consent_marketing_sha256
       AND v_lead.consent_marketing_accepted_at IS NOT NULL
  ) THEN
    INSERT INTO public.consents (
      client_id, consent_type, document_version, document_sha256, accepted_at,
      granted, is_active, signature_method, ip_address, user_agent
    ) VALUES (
      v_client_id, 'marketing', v_lead.consent_marketing_version,
      v_lead.consent_marketing_sha256, v_lead.consent_marketing_accepted_at,
      true, true, 'checkbox', v_consent_ip,
      COALESCE(v_lead.consent_user_agent, v_lead.user_agent)
    );
  END IF;

  PERFORM set_config('app.consent_proof_source', '', true);

  INSERT INTO public.trial_intakes (client_id, curator_id, status, invited_at, updated_at)
  VALUES (v_client_id, p_curator_id, 'invited', NOW(), NOW());
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

COMMIT;
