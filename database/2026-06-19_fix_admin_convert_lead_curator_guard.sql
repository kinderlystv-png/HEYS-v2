-- Fix admin_convert_lead runtime failure when curator_id is not injected.
-- The API must inject p_curator_id from curator JWT, but the DB function
-- should fail with a structured error instead of a NOT NULL constraint error.

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
    v_consent_version TEXT;
    v_signed_at TIMESTAMPTZ;
    v_consent_ip INET;
    v_consent_ua TEXT;
    v_consent_method TEXT;
BEGIN
    SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'lead_not_found');
    END IF;

    IF p_curator_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'curator_id_required',
            'message', 'Curator authorization required'
        );
    END IF;

    IF v_lead.status = 'converted' THEN
        RETURN jsonb_build_object('success', false, 'error', 'lead_already_converted',
                                  'client_id', v_lead.client_id);
    END IF;

    v_phone_clean := regexp_replace(v_lead.phone, '[^0-9]', '', 'g');
    v_phone_normalized := regexp_replace(v_lead.phone, '[^0-9+]', '', 'g');
    IF length(v_phone_clean) < 10 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_phone_format');
    END IF;

    SELECT id, subscription_status
      INTO v_existing_client_id, v_existing_status
      FROM clients
     WHERE (phone = v_phone_clean OR phone_normalized = v_phone_normalized)
       AND subscription_status IN ('trial', 'trial_pending', 'active')
     LIMIT 1;
    IF v_existing_client_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'phone_already_has_active',
            'code', 'PHONE_ALREADY_TRIAL', 'client_id', v_existing_client_id,
            'subscription_status', v_existing_status,
            'message', 'У этого телефона уже есть активная заявка/триал/подписка');
    END IF;

    PERFORM 1 FROM clients
     WHERE phone = v_phone_clean OR phone_normalized = v_phone_normalized
     LIMIT 1;
    IF FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'phone_already_exists',
            'message', 'Клиент с таким телефоном уже существует');
    END IF;

    v_pin := LPAD((floor(random() * 9000)::INT + 1000)::TEXT, 4, '0');
    v_pin_hash := crypt(v_pin, gen_salt('bf', 12));

    INSERT INTO clients (
        id, name, phone, phone_normalized, email, pin_hash, curator_id,
        subscription_status, pin_token, pin_token_expires_at,
        birth_year
    ) VALUES (
        gen_random_uuid(),
        COALESCE(v_lead.name, 'Клиент'),
        v_phone_clean, v_phone_normalized, v_lead.email,
        v_pin_hash, p_curator_id,
        'none', v_pin_token, v_pin_token_expires,
        v_lead.birth_year
    )
    RETURNING id INTO v_client_id;

    INSERT INTO trial_queue (client_id, status, queued_at)
    VALUES (v_client_id, 'queued', NOW());

    INSERT INTO trial_queue_events (client_id, event_type, meta)
    VALUES (v_client_id, 'queued',
        jsonb_build_object('lead_id', p_lead_id, 'curator_id', p_curator_id,
            'phone', v_phone_clean, 'auto_pin', true, 'pin_token_generated', true));

    v_consent_version := COALESCE(v_lead.consent_privacy_version, '1.0');
    v_signed_at := COALESCE(v_lead.consent_accepted_at, v_lead.created_at);
    v_consent_method := CASE COALESCE(NULLIF(BTRIM(v_lead.consent_method), ''), 'checkbox')
        WHEN 'telegram_contact' THEN 'messenger_code'
        WHEN 'checkbox' THEN 'checkbox'
        WHEN 'sms_code' THEN 'sms_code'
        WHEN 'one_time_code' THEN 'one_time_code'
        WHEN 'messenger_code' THEN 'messenger_code'
        WHEN 'button' THEN 'button'
        ELSE 'checkbox'
    END;
    v_consent_ua := COALESCE(v_lead.consent_user_agent, v_lead.user_agent);

    BEGIN
        v_consent_ip := NULLIF(BTRIM(v_lead.ip_address::text), '')::inet;
    EXCEPTION WHEN invalid_text_representation THEN
        v_consent_ip := NULL;
    END;

    PERFORM set_config('app.consents_writer', 'authorized', true);

    INSERT INTO consents (client_id, consent_type, document_version, granted, is_active,
                          signature_method, ip_address, user_agent, created_at)
    VALUES
      (v_client_id, 'user_agreement', v_consent_version, true, true,
       v_consent_method, v_consent_ip, v_consent_ua, v_signed_at),
      (v_client_id, 'personal_data',  v_consent_version, true, true,
       v_consent_method, v_consent_ip, v_consent_ua, v_signed_at),
      (v_client_id, 'health_data',    v_consent_version, true, true,
       v_consent_method, v_consent_ip, v_consent_ua, v_signed_at);

    IF v_lead.consent_marketing_accepted_at IS NOT NULL THEN
        INSERT INTO consents (client_id, consent_type, document_version, granted, is_active,
                              signature_method, ip_address, user_agent, created_at)
        VALUES (v_client_id, 'marketing', v_consent_version, true, true,
                'checkbox', v_consent_ip, v_consent_ua,
                v_lead.consent_marketing_accepted_at);
    END IF;

    UPDATE leads
    SET status = 'converted',
        client_id = v_client_id,
        contacted_at = NOW(),
        curator_id = COALESCE(p_curator_id, curator_id),
        updated_at = NOW()
    WHERE id = p_lead_id;

    PERFORM public.record_funnel_event(
      p_event_type := 'week_request',
      p_lead_id := p_lead_id,
      p_client_id := v_client_id,
      p_metadata := jsonb_build_object('curator_id', p_curator_id, 'source', 'admin_convert_lead'),
      p_dedupe_key := 'week_request:lead:' || p_lead_id::text
    );

    RETURN jsonb_build_object('success', true, 'client_id', v_client_id,
        'pin', v_pin, 'pin_token', v_pin_token, 'pin_token_expires_at', v_pin_token_expires,
        'phone', v_phone_clean, 'phone_normalized', v_phone_normalized);
END;
$$;

COMMENT ON FUNCTION public.admin_convert_lead(UUID, UUID) IS
  'Lead conversion. 2026-06-19: fail structured when curator_id is missing; ignore malformed lead IP for consent copy.';
