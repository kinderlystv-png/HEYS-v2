-- ═══════════════════════════════════════════════════════════════════════════════
-- HEYS: Patch для 2026-05-20_compliance_overhaul.sql
-- Дата: 2026-05-20
-- ═══════════════════════════════════════════════════════════════════════════════
-- Что чиним:
--   1. log_consents() — убираем ON CONFLICT (нет такого UNIQUE constraint
--      на (client_id, consent_type, document_version) — был дропнут раньше).
--      Также учитываем существующую колонку consents.is_active.
--   2. admin_convert_lead() — убираем ON CONFLICT DO NOTHING на INSERT в consents
--      (по той же причине). Вместо этого простой INSERT — при дубле
--      будет ошибка, но при свежей конверсии лида дубля быть не может.
--   3. delete_my_account — добавляем is_active = false при detach consents
--      (для consistency).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1) log_consents: без ON CONFLICT + поддержка is_active ──────────────────

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
        v_version := COALESCE(v_consent->>'version', '1.1');
        v_signature := COALESCE(v_consent->>'signature_method', 'checkbox');

        IF v_type NOT IN ('user_agreement', 'personal_data', 'health_data',
                          'marketing', 'payment_oferta',
                          'push_notifications', 'curator_access') THEN
            CONTINUE;
        END IF;

        -- Деактивируем активные согласия этого типа (без удаления — audit-trail)
        UPDATE consents
        SET granted = false,
            is_active = false,
            revoked_at = NOW()
        WHERE client_id = p_client_id
          AND consent_type = v_type
          AND granted = true;

        -- Вставляем новое
        INSERT INTO consents (
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

-- ─── 2) admin_convert_lead: убираем ON CONFLICT ──────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_convert_lead(
    p_lead_id UUID,
    p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

    v_pin := LPAD(((random() * 9000)::INT + 1000)::TEXT, 4, '0');
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

    -- 🔑 Перенос consent из leads → consents (закрытие дыры #5)
    v_consent_version := COALESCE(v_lead.consent_privacy_version, '1.0');
    v_signed_at := COALESCE(v_lead.consent_accepted_at, v_lead.created_at);
    v_consent_method := COALESCE(v_lead.consent_method, 'checkbox');
    v_consent_ua := COALESCE(v_lead.consent_user_agent, v_lead.user_agent);
    v_consent_ip := CASE WHEN v_lead.ip_address IS NOT NULL AND v_lead.ip_address <> ''
                         THEN v_lead.ip_address::inet ELSE NULL END;

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

    RETURN jsonb_build_object('success', true, 'client_id', v_client_id,
        'pin', v_pin, 'pin_token', v_pin_token, 'pin_token_expires_at', v_pin_token_expires,
        'phone', v_phone_clean, 'phone_normalized', v_phone_normalized);
END;
$$;

-- ─── 3) delete_my_account: is_active = false на detach ───────────────────────

CREATE OR REPLACE FUNCTION public.delete_my_account(p_session_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_deleted INT := 0;
BEGIN
  v_client_id := public.require_client_id(p_session_token);

  PERFORM set_config('app.consents_writer', 'authorized', true);
  UPDATE consents
     SET ip_address = NULL,
         user_agent = '[deleted]',
         is_active = false
   WHERE client_id = v_client_id;

  PERFORM public.log_data_access('client_self', v_client_id, v_client_id,
    'account_deleted', NULL, true, NULL, NULL, '{}');

  DELETE FROM clients WHERE id = v_client_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('success', v_deleted > 0, 'deleted_client_id', v_client_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMIT;
