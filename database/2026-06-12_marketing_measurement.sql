-- =====================================================
-- Marketing measurement funnel (22 п.1.2)
-- Date: 2026-06-12
-- Purpose:
--   DB is the source of truth for launch funnel metrics. Yandex Metrica is
--   best-effort on top, never the only copy of conversion data.
--
-- Security:
--   funnel_events has no public INSERT grants. Runtime code writes through
--   SECURITY DEFINER functions only. metadata must not contain PII
--   (name/phone/email/user_agent/ip_address); store segments and technical
--   attribution only.
-- =====================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS promo_code TEXT,
  ADD COLUMN IF NOT EXISTS how_heard TEXT,
  ADD COLUMN IF NOT EXISTS ym_client_id TEXT,
  ADD COLUMN IF NOT EXISTS quiz_segment TEXT,
  ADD COLUMN IF NOT EXISTS readiness TEXT,
  ADD COLUMN IF NOT EXISTS ab_variant TEXT;

COMMENT ON COLUMN public.leads.promo_code IS
  'Optional non-PII promo/source recovery code from landing/bot.';
COMMENT ON COLUMN public.leads.how_heard IS
  'Optional controlled source-recovery dropdown value from landing.';
COMMENT ON COLUMN public.leads.ym_client_id IS
  'Yandex Metrica ClientID. Store only when form consent was accepted.';
COMMENT ON COLUMN public.leads.quiz_segment IS
  'Lead magnet result segment. Non-PII.';
COMMENT ON COLUMN public.leads.readiness IS
  'Readiness/qualification marker. Non-PII.';
COMMENT ON COLUMN public.leads.ab_variant IS
  'A/B variant string passed from landing; no extra UI required.';

CREATE TABLE IF NOT EXISTS public.funnel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'unknown',
  campaign TEXT,
  segment TEXT,
  tariff TEXT,
  ym_client_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key TEXT,
  metrica_status TEXT NOT NULL DEFAULT 'pending',
  metrica_sent_at TIMESTAMPTZ,
  metrica_error TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS funnel_events_dedupe_idx
  ON public.funnel_events(dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS funnel_events_lead_idx
  ON public.funnel_events(lead_id)
  WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS funnel_events_client_idx
  ON public.funnel_events(client_id)
  WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS funnel_events_type_time_idx
  ON public.funnel_events(event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS funnel_events_source_time_idx
  ON public.funnel_events(source, occurred_at DESC);

COMMENT ON TABLE public.funnel_events IS
  'Marketing funnel events for Phase 0 launch measurement. No public INSERT; write through SECURITY DEFINER record_funnel_event only.';
COMMENT ON COLUMN public.funnel_events.event_type IS
  'Open event name: lead, quiz_start, quiz_complete, week_request, trial_active, payment, renewal, etc. No CHECK so bot 1.1 can add events without a migration.';
COMMENT ON COLUMN public.funnel_events.metadata IS
  'Non-PII metadata only. Never store name, phone, email, user_agent, or ip_address here.';
COMMENT ON COLUMN public.funnel_events.dedupe_key IS
  'Idempotency key from server code/webhooks. Prevents double-counting.';

REVOKE ALL ON TABLE public.funnel_events FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.funnel_events FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.funnel_events FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_rpc') THEN
    GRANT SELECT ON TABLE public.funnel_events TO heys_rpc;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_admin') THEN
    GRANT SELECT ON TABLE public.funnel_events TO heys_admin;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.funnel_metadata_strip_pii(p_metadata JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_key TEXT;
  v_value JSONB;
  v_result JSONB := '{}'::jsonb;
BEGIN
  IF p_metadata IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  IF jsonb_typeof(p_metadata) = 'object' THEN
    FOR v_key, v_value IN SELECT key, value FROM jsonb_each(p_metadata)
    LOOP
      IF lower(v_key) IN (
        'name',
        'full_name',
        'fullname',
        'phone',
        'phone_normalized',
        'phonenumber',
        'email',
        'user_agent',
        'useragent',
        'consent_user_agent',
        'ip',
        'ip_address',
        'ipaddress'
      ) THEN
        CONTINUE;
      END IF;

      v_result := v_result || jsonb_build_object(
        v_key,
        public.funnel_metadata_strip_pii(v_value)
      );
    END LOOP;

    RETURN v_result;
  END IF;

  IF jsonb_typeof(p_metadata) = 'array' THEN
    SELECT COALESCE(jsonb_agg(public.funnel_metadata_strip_pii(value)), '[]'::jsonb)
      INTO v_result
      FROM jsonb_array_elements(p_metadata);

    RETURN v_result;
  END IF;

  RETURN p_metadata;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_funnel_event(
  p_event_type TEXT,
  p_lead_id UUID DEFAULT NULL,
  p_client_id UUID DEFAULT NULL,
  p_source TEXT DEFAULT NULL,
  p_campaign TEXT DEFAULT NULL,
  p_segment TEXT DEFAULT NULL,
  p_tariff TEXT DEFAULT NULL,
  p_ym_client_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_dedupe_key TEXT DEFAULT NULL,
  p_occurred_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead RECORD;
  v_has_lead BOOLEAN := false;
  v_event_id UUID;
  v_lead_id UUID;
  v_lead_client_id UUID;
  v_lead_source TEXT;
  v_lead_campaign TEXT;
  v_lead_segment TEXT;
  v_lead_ym_client_id TEXT;
  v_lead_how_heard TEXT;
  v_lead_promo_code TEXT;
  v_lead_ab_variant TEXT;
  v_lead_consent_accepted_at TIMESTAMPTZ;
  v_source TEXT;
  v_campaign TEXT;
  v_segment TEXT;
  v_ym_client_id TEXT;
  v_lead_metadata JSONB;
  v_metadata JSONB;
  v_metrica_status TEXT;
BEGIN
  IF p_event_type IS NULL OR btrim(p_event_type) = '' THEN
    RAISE EXCEPTION 'record_funnel_event: event_type is required';
  END IF;

  IF p_lead_id IS NOT NULL THEN
    SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
    v_has_lead := FOUND;
  ELSIF p_client_id IS NOT NULL THEN
    SELECT * INTO v_lead
      FROM leads
     WHERE client_id = p_client_id
     ORDER BY created_at DESC
     LIMIT 1;
    v_has_lead := FOUND;
  END IF;

  IF v_has_lead THEN
    v_lead_id := v_lead.id;
    v_lead_client_id := v_lead.client_id;
    v_lead_source := v_lead.utm_source;
    v_lead_campaign := v_lead.utm_campaign;
    v_lead_segment := v_lead.quiz_segment;
    v_lead_ym_client_id := v_lead.ym_client_id;
    v_lead_how_heard := v_lead.how_heard;
    v_lead_promo_code := v_lead.promo_code;
    v_lead_ab_variant := v_lead.ab_variant;
    v_lead_consent_accepted_at := v_lead.consent_accepted_at;
  END IF;

  v_source := COALESCE(NULLIF(btrim(p_source), ''), NULLIF(v_lead_source, ''), 'unknown');
  v_campaign := COALESCE(NULLIF(btrim(p_campaign), ''), NULLIF(v_lead_campaign, ''));
  v_segment := COALESCE(NULLIF(btrim(p_segment), ''), NULLIF(v_lead_segment, ''));

  -- ym_client_id is persisted only for leads that accepted the form consent.
  v_ym_client_id := COALESCE(NULLIF(btrim(p_ym_client_id), ''), NULLIF(v_lead_ym_client_id, ''));
  IF v_lead_id IS NOT NULL AND v_lead_consent_accepted_at IS NULL THEN
    v_ym_client_id := NULL;
  END IF;

  v_lead_metadata := jsonb_strip_nulls(jsonb_build_object(
    'how_heard', NULLIF(v_lead_how_heard, ''),
    'promo_code', NULLIF(v_lead_promo_code, ''),
    'ab_variant', NULLIF(v_lead_ab_variant, '')
  ));
  v_metadata := v_lead_metadata
    || jsonb_strip_nulls(public.funnel_metadata_strip_pii(COALESCE(p_metadata, '{}'::jsonb)));
  v_metrica_status := CASE WHEN v_ym_client_id IS NULL THEN 'skipped:no_client_id' ELSE 'pending' END;

  INSERT INTO funnel_events (
    lead_id, client_id, event_type, source, campaign, segment, tariff,
    ym_client_id, metadata, dedupe_key, metrica_status, occurred_at
  )
  VALUES (
    COALESCE(p_lead_id, v_lead_id),
    COALESCE(p_client_id, v_lead_client_id),
    btrim(p_event_type),
    v_source,
    v_campaign,
    v_segment,
    NULLIF(btrim(p_tariff), ''),
    v_ym_client_id,
    v_metadata,
    NULLIF(btrim(p_dedupe_key), ''),
    v_metrica_status,
    COALESCE(p_occurred_at, NOW())
  )
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL AND p_dedupe_key IS NOT NULL THEN
    SELECT id INTO v_event_id FROM funnel_events WHERE dedupe_key = NULLIF(btrim(p_dedupe_key), '');
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'id', fe.id,
      'event_type', fe.event_type,
      'source', fe.source,
      'campaign', fe.campaign,
      'segment', fe.segment,
      'tariff', fe.tariff,
      'ym_client_id', fe.ym_client_id,
      'metrica_status', fe.metrica_status,
      'dedupe_key', fe.dedupe_key
    )
    FROM funnel_events fe
    WHERE fe.id = v_event_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_funnel_event_metrica_status(
  p_event_id UUID,
  p_status TEXT,
  p_error TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE funnel_events
     SET metrica_status = COALESCE(NULLIF(btrim(p_status), ''), metrica_status),
         metrica_sent_at = CASE
           WHEN COALESCE(NULLIF(btrim(p_status), ''), metrica_status) IN ('sent', 'dry_run')
             THEN NOW()
           ELSE metrica_sent_at
         END,
         metrica_error = p_error
   WHERE id = p_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_funnel_event(
  TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TIMESTAMPTZ
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_funnel_event_metrica_status(UUID, TEXT, TEXT) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_rpc') THEN
    GRANT EXECUTE ON FUNCTION public.record_funnel_event(
      TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TIMESTAMPTZ
    ) TO heys_rpc;
    GRANT EXECUTE ON FUNCTION public.mark_funnel_event_metrica_status(UUID, TEXT, TEXT) TO heys_rpc;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_admin') THEN
    GRANT EXECUTE ON FUNCTION public.record_funnel_event(
      TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TIMESTAMPTZ
    ) TO heys_admin;
    GRANT EXECUTE ON FUNCTION public.mark_funnel_event_metrica_status(UUID, TEXT, TEXT) TO heys_admin;
  END IF;
END $$;

-- Negative grant smoke: public roles must not be able to INSERT fake events.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND has_table_privilege('anon', 'public.funnel_events', 'INSERT') THEN
    RAISE EXCEPTION 'SECURITY FAIL: anon can INSERT into funnel_events';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
     AND has_table_privilege('authenticated', 'public.funnel_events', 'INSERT') THEN
    RAISE EXCEPTION 'SECURITY FAIL: authenticated can INSERT into funnel_events';
  END IF;
END $$;

DROP VIEW IF EXISTS public.weekly_funnel_by_source;

CREATE VIEW public.weekly_funnel_by_source AS
SELECT
  date_trunc('week', occurred_at)::date AS week_start,
  COALESCE(NULLIF(source, ''), 'unknown') AS source,
  COALESCE(NULLIF(campaign, ''), 'unknown') AS campaign,
  COALESCE(NULLIF(metadata->>'how_heard', ''), 'unknown') AS how_heard,
  COALESCE(NULLIF(metadata->>'ab_variant', ''), 'unknown') AS ab_variant,
  COUNT(*) FILTER (WHERE event_type = 'lead') AS leads,
  COUNT(*) FILTER (WHERE event_type = 'quiz_start') AS quiz_starts,
  COUNT(*) FILTER (WHERE event_type = 'quiz_complete') AS quiz_completes,
  COUNT(*) FILTER (WHERE event_type = 'week_request') AS week_requests,
  COUNT(*) FILTER (WHERE event_type = 'trial_active') AS trial_active,
  COUNT(*) FILTER (WHERE event_type = 'payment') AS payments,
  COUNT(*) FILTER (WHERE event_type = 'renewal') AS renewals,
  ROUND(
    COUNT(*) FILTER (WHERE event_type = 'week_request')::numeric
    / NULLIF(COUNT(*) FILTER (WHERE event_type = 'lead'), 0),
    4
  ) AS lead_to_week_request,
  ROUND(
    COUNT(*) FILTER (WHERE event_type = 'payment')::numeric
    / NULLIF(COUNT(*) FILTER (WHERE event_type = 'week_request'), 0),
    4
  ) AS week_request_to_payment
FROM public.funnel_events
GROUP BY 1, 2, 3, 4, 5
ORDER BY week_start DESC, source, campaign, how_heard, ab_variant;

REVOKE ALL ON public.weekly_funnel_by_source FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_rpc') THEN
    GRANT SELECT ON public.weekly_funnel_by_source TO heys_rpc;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_admin') THEN
    GRANT SELECT ON public.weekly_funnel_by_source TO heys_admin;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────
-- Trial Machine hooks: keep latest consent/PIN behavior and add funnel events.
-- ─────────────────────────────────────────────────────

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
  'Конвертация лида в клиента с автогенерацией PIN, consent carryover и funnel week_request.';

GRANT EXECUTE ON FUNCTION public.admin_convert_lead(UUID, UUID) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.admin_convert_lead(UUID, UUID) TO heys_admin;

CREATE OR REPLACE FUNCTION public.admin_activate_trial(
    p_client_id UUID,
    p_start_date DATE DEFAULT CURRENT_DATE,
    p_trial_days INTEGER DEFAULT 7,
    p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_client RECORD;
    v_curator RECORD;
    v_trial_start_at TIMESTAMPTZ;
    v_trial_ends_at TIMESTAMPTZ;
    v_is_future BOOLEAN;
BEGIN
    IF p_curator_id IS NOT NULL THEN
        SELECT id, name INTO v_curator FROM curators WHERE id = p_curator_id;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'curator_not_found');
        END IF;
    END IF;

    SELECT * INTO v_client FROM clients WHERE id = p_client_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'client_not_found');
    END IF;

    IF v_client.subscription_status IN ('trial', 'active') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'trial_already_active_or_had_subscription',
            'current_status', v_client.subscription_status
        );
    END IF;

    v_is_future := (p_start_date > CURRENT_DATE);

    IF v_is_future THEN
        UPDATE clients
        SET subscription_status = 'trial_pending',
            trial_started_at = p_start_date::TIMESTAMPTZ,
            trial_ends_at = (p_start_date + (p_trial_days || ' days')::interval)::TIMESTAMPTZ,
            updated_at = NOW()
        WHERE id = p_client_id
        RETURNING trial_started_at, trial_ends_at
        INTO v_trial_start_at, v_trial_ends_at;
    ELSE
        UPDATE clients
        SET subscription_status = 'trial',
            trial_started_at = NOW(),
            trial_ends_at = NOW() + (p_trial_days || ' days')::interval,
            updated_at = NOW()
        WHERE id = p_client_id
        RETURNING trial_started_at, trial_ends_at
        INTO v_trial_start_at, v_trial_ends_at;
    END IF;

    INSERT INTO subscriptions (client_id, trial_started_at, trial_ends_at, trial_approved_at)
    VALUES (p_client_id, v_trial_start_at, v_trial_ends_at, NOW())
    ON CONFLICT (client_id) DO UPDATE SET
        trial_started_at = EXCLUDED.trial_started_at,
        trial_ends_at = EXCLUDED.trial_ends_at,
        trial_approved_at = NOW();

    UPDATE trial_queue
    SET status = 'assigned',
        assigned_at = NOW(),
        updated_at = NOW()
    WHERE client_id = p_client_id AND status = 'queued';

    INSERT INTO trial_queue_events (client_id, event_type, meta)
    VALUES (p_client_id, 'claimed', jsonb_build_object(
        'curator_id', p_curator_id,
        'start_date', p_start_date,
        'trial_days', p_trial_days,
        'is_future', v_is_future,
        'synced_subscriptions', true,
        'source', 'admin_activate_trial'
    ));

    PERFORM public.record_funnel_event(
      p_event_type := 'trial_active',
      p_client_id := p_client_id,
      p_metadata := jsonb_build_object(
        'curator_id', p_curator_id,
        'trial_days', p_trial_days,
        'is_future', v_is_future,
        'source', 'admin_activate_trial'
      ),
      p_dedupe_key := 'trial_active:client:' || p_client_id::text || ':' || v_trial_start_at::date::text,
      p_occurred_at := v_trial_start_at
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

COMMENT ON FUNCTION public.admin_activate_trial(UUID, DATE, INTEGER, UUID) IS
  'Активация триала с синхронизацией subscriptions и funnel trial_active.';

GRANT EXECUTE ON FUNCTION public.admin_activate_trial(UUID, DATE, INTEGER, UUID) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.admin_activate_trial(UUID, DATE, INTEGER, UUID) TO heys_admin;
