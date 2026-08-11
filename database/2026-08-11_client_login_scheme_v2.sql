-- HEYS: серверная часть новой схемы входа (prompt-login-server)
--
-- Одноразовый PIN куратора (3 суток, сгорает после первого входа),
-- собственный код доступа клиента, доверенные устройства (30 дней),
-- разделение входа и подписания, журнал подписания, push-очередь,
-- обход блокировки с зарегистрированного устройства.
--
-- Apply:
--   ./scripts/db/psql.sh -f database/2026-08-11_client_login_scheme_v2.sql

BEGIN;

-- ─── 1. Схема ───────────────────────────────────────────────────────────────

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS onetime_pin_hash TEXT,
  ADD COLUMN IF NOT EXISTS onetime_pin_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onetime_pin_consumed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS access_code_hash TEXT,
  ADD COLUMN IF NOT EXISTS access_code_set_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS access_code_failed_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS access_code_locked_until TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.client_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL CHECK (device_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  user_agent TEXT,
  UNIQUE (client_id, device_id)
);

CREATE INDEX IF NOT EXISTS client_devices_client_active_idx
  ON public.client_devices (client_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.client_auth_push_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('new_device_login', 'access_code_reset')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS client_auth_push_queue_pending_idx
  ON public.client_auth_push_queue (created_at)
  WHERE sent_at IS NULL;

ALTER TABLE public.consents
  ADD COLUMN IF NOT EXISTS device_id TEXT,
  ADD COLUMN IF NOT EXISTS session_auth_method TEXT,
  ADD COLUMN IF NOT EXISTS document_text_snapshot TEXT;

COMMENT ON COLUMN public.consents.device_id IS
  'Идентификатор устройства при подписании (pin_confirm).';
COMMENT ON COLUMN public.consents.session_auth_method IS
  'Способ подтверждения сессии при подписании: access_code, device_trust и т.д.';
COMMENT ON COLUMN public.consents.document_text_snapshot IS
  'Неизменяемый текст документа на момент подписания (журнал ПЭП).';

-- ─── 2. Внутренние хелперы ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_weak_access_code(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s TEXT := COALESCE(p_code, '');
  i INT;
  asc_seq BOOLEAN := TRUE;
  desc_seq BOOLEAN := TRUE;
BEGIN
  IF s !~ '^\d{4}$' THEN
    RETURN TRUE;
  END IF;
  IF s ~ '^(\d)\1{3}$' THEN
    RETURN TRUE;
  END IF;
  FOR i IN 1..3 LOOP
    IF substr(s, i + 1, 1)::INT <> substr(s, i, 1)::INT + 1 THEN
      asc_seq := FALSE;
    END IF;
    IF substr(s, i + 1, 1)::INT <> substr(s, i, 1)::INT - 1 THEN
      desc_seq := FALSE;
    END IF;
  END LOOP;
  RETURN asc_seq OR desc_seq;
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_client_session_v2(
  p_client_id UUID,
  p_user_agent TEXT DEFAULT NULL,
  p_ip TEXT DEFAULT NULL,
  p_ttl_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token TEXT;
  v_session_id UUID;
BEGIN
  v_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.client_sessions (client_id, token_hash, expires_at, user_agent, ip_address)
  VALUES (
    p_client_id,
    digest(v_token, 'sha256'),
    now() + make_interval(days => GREATEST(p_ttl_days, 1)),
    LEFT(p_user_agent, 500),
    CASE WHEN NULLIF(BTRIM(COALESCE(p_ip, '')), '') IS NOT NULL THEN p_ip::inet ELSE NULL END
  )
  RETURNING id INTO v_session_id;

  RETURN jsonb_build_object(
    'session_token', v_token,
    'session_id', v_session_id,
    'expires_at', now() + make_interval(days => GREATEST(p_ttl_days, 1))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_client_device_trusted(
  p_client_id UUID,
  p_device_id TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.client_devices d
     WHERE d.client_id = p_client_id
       AND d.device_id = p_device_id
       AND d.revoked_at IS NULL
       AND d.expires_at > now()
  );
$$;

CREATE OR REPLACE FUNCTION public.register_client_device(
  p_client_id UUID,
  p_device_id TEXT,
  p_user_agent TEXT DEFAULT NULL,
  p_ttl_days INT DEFAULT 30
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_device_id IS NULL OR p_device_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'invalid_device_id' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.client_devices (client_id, device_id, registered_at, expires_at, last_seen_at, user_agent)
  VALUES (
    p_client_id,
    p_device_id,
    now(),
    now() + make_interval(days => GREATEST(p_ttl_days, 1)),
    now(),
    LEFT(p_user_agent, 500)
  )
  ON CONFLICT (client_id, device_id) DO UPDATE
     SET expires_at = now() + make_interval(days => GREATEST(p_ttl_days, 1)),
         last_seen_at = now(),
         revoked_at = NULL,
         user_agent = COALESCE(EXCLUDED.user_agent, public.client_devices.user_agent);
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_client_auth_push(
  p_client_id UUID,
  p_event_type TEXT,
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.client_auth_push_queue (client_id, event_type, payload)
  VALUES (p_client_id, p_event_type, COALESCE(p_payload, '{}'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_onetime_pin_for_client(
  p_client_id UUID,
  p_pin TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pin TEXT;
BEGIN
  v_pin := COALESCE(
    p_pin,
    LPAD((floor(random() * 9000)::INT + 1000)::TEXT, 4, '0')
  );
  IF v_pin !~ '^\d{4,6}$' THEN
    RAISE EXCEPTION 'invalid_pin_format' USING ERRCODE = '22023';
  END IF;

  UPDATE public.clients
     SET onetime_pin_hash = crypt(v_pin, gen_salt('bf', 12)),
         onetime_pin_expires_at = now() + interval '3 days',
         onetime_pin_consumed_at = NULL,
         access_code_hash = NULL,
         access_code_set_at = NULL,
         access_code_failed_attempts = 0,
         access_code_locked_until = NULL,
         pin_failed_attempts = 0,
         pin_locked_until = NULL,
         pin_updated_at = now(),
         updated_at = now()
   WHERE id = p_client_id;

  RETURN v_pin;
END;
$$;

-- ─── 3. Куратор: одноразовый PIN ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_set_client_pin(
    p_client_id UUID,
    p_pin TEXT,
    p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_client RECORD;
    v_revoked INT;
    v_pin TEXT;
BEGIN
    SELECT id, curator_id INTO v_client FROM public.clients WHERE id = p_client_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'client_not_found');
    END IF;

    IF p_curator_id IS NOT NULL AND v_client.curator_id IS DISTINCT FROM p_curator_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'forbidden');
    END IF;

    IF p_pin IS NULL OR p_pin !~ '^\d{4,6}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_pin_format');
    END IF;

    v_pin := public.issue_onetime_pin_for_client(p_client_id, p_pin);
    v_revoked := public.revoke_all_client_sessions(p_client_id);
    PERFORM public.enqueue_client_auth_push(
      p_client_id,
      'access_code_reset',
      jsonb_build_object('source', 'admin_set_client_pin')
    );

    RETURN jsonb_build_object(
        'success', true,
        'client_id', p_client_id,
        'pin', v_pin,
        'onetime_pin_expires_at', (SELECT onetime_pin_expires_at FROM public.clients WHERE id = p_client_id),
        'sessions_revoked', v_revoked
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_regenerate_pin(
    p_client_id UUID,
    p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_client RECORD;
    v_pin TEXT;
    v_pin_token UUID := gen_random_uuid();
    v_pin_token_expires TIMESTAMPTZ := NOW() + INTERVAL '7 days';
    v_revoked INT := 0;
BEGIN
    SELECT id, curator_id, telegram_chat_id
      INTO v_client
      FROM public.clients
     WHERE id = p_client_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'client_not_found');
    END IF;

    IF p_curator_id IS NOT NULL AND v_client.curator_id IS DISTINCT FROM p_curator_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'forbidden');
    END IF;

    v_pin := public.issue_onetime_pin_for_client(p_client_id, NULL);

    UPDATE public.clients
       SET pin_token = v_pin_token,
           pin_token_expires_at = v_pin_token_expires,
           telegram_chat_id = NULL,
           drip_sent_stages = '[]'::jsonb
     WHERE id = p_client_id;

    v_revoked := public.revoke_all_client_sessions(p_client_id);
    PERFORM public.enqueue_client_auth_push(
      p_client_id,
      'access_code_reset',
      jsonb_build_object('source', 'admin_regenerate_pin')
    );

    RETURN jsonb_build_object(
        'success', true,
        'client_id', p_client_id,
        'pin', v_pin,
        'onetime_pin_expires_at', (SELECT onetime_pin_expires_at FROM public.clients WHERE id = p_client_id),
        'pin_token', v_pin_token,
        'pin_token_expires_at', v_pin_token_expires,
        'sessions_revoked', v_revoked,
        'telegram_binding_cleared', v_client.telegram_chat_id IS NOT NULL
    );
END;
$$;

-- ─── 4. Первый вход по одноразовому PIN ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.verify_client_onetime_pin(
  p_phone TEXT,
  p_pin TEXT,
  p_device_id TEXT DEFAULT NULL,
  p_ip TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_phone_normalized TEXT;
  v_client public.clients%ROWTYPE;
  v_found BOOLEAN := false;
  v_correct BOOLEAN := false;
  v_attempts INT;
  v_lock INTERVAL;
  v_session JSONB;
  v_trusted BOOLEAN := false;
BEGIN
  v_phone_normalized := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');

  SELECT * INTO v_client
    FROM public.clients
   WHERE regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = v_phone_normalized
   ORDER BY created_at DESC
   LIMIT 1
     FOR UPDATE;
  v_found := FOUND;

  IF v_found AND p_device_id IS NOT NULL THEN
    v_trusted := public.is_client_device_trusted(v_client.id, p_device_id);
  END IF;

  IF v_found AND NOT v_trusted
     AND v_client.pin_locked_until IS NOT NULL AND v_client.pin_locked_until > now() THEN
    PERFORM public.log_security_event(
      'pin_locked', v_phone_normalized, v_client.id, p_ip, p_user_agent,
      jsonb_build_object('locked_until', v_client.pin_locked_until)
    );
    RETURN jsonb_build_object(
      'success', false, 'error', 'pin_rate_limited',
      'locked_until', v_client.pin_locked_until,
      'message', 'Слишком много попыток входа. Напишите куратору — он выдаст новый код для входа.'
    );
  END IF;

  IF v_trusted THEN
    UPDATE public.clients
       SET pin_failed_attempts = 0,
           pin_locked_until = NULL,
           access_code_failed_attempts = 0,
           access_code_locked_until = NULL
     WHERE id = v_client.id;
  END IF;

  IF v_found THEN
    IF v_client.onetime_pin_hash IS NOT NULL
       AND v_client.onetime_pin_consumed_at IS NULL
       AND (v_client.onetime_pin_expires_at IS NULL OR v_client.onetime_pin_expires_at > now()) THEN
      v_correct := (v_client.onetime_pin_hash = crypt(p_pin, v_client.onetime_pin_hash));
    ELSIF v_client.pin_hash IS NOT NULL AND v_client.access_code_hash IS NULL THEN
      -- Legacy: многоразовый PIN, пока клиент не задал свой код.
      v_correct := (v_client.pin_hash = crypt(p_pin, v_client.pin_hash));
    END IF;
  END IF;

  IF NOT v_found OR NOT v_correct THEN
    IF v_found AND NOT v_trusted THEN
      v_attempts := COALESCE(v_client.pin_failed_attempts, 0) + 1;
      v_lock := CASE
        WHEN v_attempts >= 15 THEN interval '24 hours'
        WHEN v_attempts >= 10 THEN interval '1 hour'
        WHEN v_attempts >= 5 THEN interval '15 minutes'
        ELSE NULL
      END;
      UPDATE public.clients
         SET pin_failed_attempts = v_attempts,
             pin_locked_until = CASE WHEN v_lock IS NULL THEN pin_locked_until ELSE now() + v_lock END
       WHERE id = v_client.id;
    END IF;

    PERFORM public.log_security_event(
      'pin_failed', v_phone_normalized,
      CASE WHEN v_found THEN v_client.id ELSE NULL END,
      p_ip, p_user_agent,
      jsonb_build_object('reason', 'invalid_credentials', 'client_exists', v_found)
    );
    RETURN jsonb_build_object('success', false, 'error', 'invalid_credentials');
  END IF;

  UPDATE public.clients
     SET pin_failed_attempts = 0,
         pin_locked_until = NULL,
         onetime_pin_consumed_at = CASE
           WHEN onetime_pin_hash IS NOT NULL AND onetime_pin_consumed_at IS NULL
             THEN now()
           ELSE onetime_pin_consumed_at
         END
   WHERE id = v_client.id;

  v_session := public.issue_client_session_v2(v_client.id, p_user_agent, p_ip, 30);

  PERFORM public.log_security_event(
    'onetime_pin_success', v_phone_normalized, v_client.id, p_ip, p_user_agent,
    jsonb_build_object('session_id', v_session->>'session_id', 'needs_access_code', v_client.access_code_hash IS NULL)
  );

  RETURN jsonb_build_object(
    'success', true,
    'client_id', v_client.id,
    'session_token', v_session->>'session_token',
    'expires_at', v_session->>'expires_at',
    'needs_access_code', v_client.access_code_hash IS NULL
  );
END;
$$;

-- ─── 5. Создание / смена кода доступа ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_client_access_code(
  p_session_token TEXT,
  p_access_code TEXT,
  p_device_id TEXT,
  p_ip TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client_id UUID;
  v_client public.clients%ROWTYPE;
BEGIN
  v_client_id := public.require_client_id(p_session_token);
  SELECT * INTO v_client FROM public.clients WHERE id = v_client_id FOR UPDATE;

  IF public.is_weak_access_code(p_access_code) THEN
    RETURN jsonb_build_object('success', false, 'error', 'weak_access_code');
  END IF;

  IF v_client.onetime_pin_hash IS NOT NULL
     AND v_client.onetime_pin_consumed_at IS NULL
     AND v_client.onetime_pin_hash = crypt(p_access_code, v_client.onetime_pin_hash) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_code_matches_onetime_pin');
  END IF;

  UPDATE public.clients
     SET access_code_hash = crypt(p_access_code, gen_salt('bf', 12)),
         access_code_set_at = now(),
         access_code_failed_attempts = 0,
         access_code_locked_until = NULL,
         updated_at = now()
   WHERE id = v_client_id;

  PERFORM public.register_client_device(v_client_id, p_device_id, p_user_agent, 30);

  RETURN jsonb_build_object('success', true, 'client_id', v_client_id, 'device_registered', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.change_client_access_code_by_session(
  p_session_token TEXT,
  p_current_code TEXT,
  p_new_code TEXT,
  p_device_id TEXT DEFAULT NULL,
  p_ip TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client_id UUID;
  v_client public.clients%ROWTYPE;
BEGIN
  v_client_id := public.require_client_id(p_session_token);
  SELECT * INTO v_client FROM public.clients WHERE id = v_client_id FOR UPDATE;

  IF v_client.access_code_hash IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_code_not_set');
  END IF;
  IF v_client.access_code_hash <> crypt(p_current_code, v_client.access_code_hash) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_access_code');
  END IF;
  IF public.is_weak_access_code(p_new_code) THEN
    RETURN jsonb_build_object('success', false, 'error', 'weak_access_code');
  END IF;
  IF v_client.onetime_pin_hash IS NOT NULL
     AND v_client.onetime_pin_hash = crypt(p_new_code, v_client.onetime_pin_hash) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_code_matches_onetime_pin');
  END IF;

  UPDATE public.clients
     SET access_code_hash = crypt(p_new_code, gen_salt('bf', 12)),
         access_code_set_at = now(),
         access_code_failed_attempts = 0,
         access_code_locked_until = NULL,
         updated_at = now()
   WHERE id = v_client_id;

  IF p_device_id IS NOT NULL THEN
    PERFORM public.register_client_device(v_client_id, p_device_id, p_user_agent, 30);
  END IF;

  RETURN jsonb_build_object('success', true, 'client_id', v_client_id);
END;
$$;

-- ─── 6. Вход с устройства / с кодом ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.login_client_v1(
  p_phone TEXT,
  p_device_id TEXT,
  p_access_code TEXT DEFAULT NULL,
  p_ip TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_phone_normalized TEXT;
  v_client public.clients%ROWTYPE;
  v_found BOOLEAN := false;
  v_trusted BOOLEAN := false;
  v_session JSONB;
  v_attempts INT;
  v_lock INTERVAL;
  v_is_new_device BOOLEAN := false;
BEGIN
  v_phone_normalized := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');

  SELECT * INTO v_client
    FROM public.clients
   WHERE regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = v_phone_normalized
   ORDER BY created_at DESC
   LIMIT 1
     FOR UPDATE;
  v_found := FOUND;

  IF NOT v_found OR v_client.access_code_hash IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_code_not_set');
  END IF;

  IF p_device_id IS NULL OR p_device_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_device_id');
  END IF;

  v_trusted := public.is_client_device_trusted(v_client.id, p_device_id);

  IF NOT v_trusted
     AND v_client.pin_locked_until IS NOT NULL AND v_client.pin_locked_until > now() THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'pin_rate_limited',
      'locked_until', v_client.pin_locked_until,
      'message', 'Слишком много попыток входа. Напишите куратору — он выдаст новый код для входа.'
    );
  END IF;

  IF v_trusted THEN
    UPDATE public.clients
       SET pin_failed_attempts = 0,
           pin_locked_until = NULL,
           access_code_failed_attempts = 0,
           access_code_locked_until = NULL
     WHERE id = v_client.id;

    v_session := public.issue_client_session_v2(v_client.id, p_user_agent, p_ip, 30);
    PERFORM public.register_client_device(v_client.id, p_device_id, p_user_agent, 30);

    RETURN jsonb_build_object(
      'success', true,
      'client_id', v_client.id,
      'session_token', v_session->>'session_token',
      'expires_at', v_session->>'expires_at',
      'auth_method', 'device_trust'
    );
  END IF;

  IF p_access_code IS NULL OR p_access_code = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_code_required');
  END IF;

  IF v_client.access_code_locked_until IS NOT NULL AND v_client.access_code_locked_until > now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_code_rate_limited',
      'locked_until', v_client.access_code_locked_until);
  END IF;

  IF v_client.access_code_hash <> crypt(p_access_code, v_client.access_code_hash) THEN
    v_attempts := COALESCE(v_client.access_code_failed_attempts, 0) + 1;
    v_lock := CASE
      WHEN v_attempts >= 15 THEN interval '24 hours'
      WHEN v_attempts >= 10 THEN interval '1 hour'
      WHEN v_attempts >= 5 THEN interval '15 minutes'
      ELSE NULL
    END;
    UPDATE public.clients
       SET access_code_failed_attempts = v_attempts,
           access_code_locked_until = CASE WHEN v_lock IS NULL THEN access_code_locked_until ELSE now() + v_lock END,
           pin_failed_attempts = v_attempts,
           pin_locked_until = CASE WHEN v_lock IS NULL THEN pin_locked_until ELSE now() + v_lock END
     WHERE id = v_client.id;
    RETURN jsonb_build_object('success', false, 'error', 'invalid_access_code');
  END IF;

  UPDATE public.clients
     SET access_code_failed_attempts = 0,
         access_code_locked_until = NULL,
         pin_failed_attempts = 0,
         pin_locked_until = NULL
   WHERE id = v_client.id;

  v_is_new_device := TRUE;
  v_session := public.issue_client_session_v2(v_client.id, p_user_agent, p_ip, 30);
  PERFORM public.register_client_device(v_client.id, p_device_id, p_user_agent, 30);

  IF v_is_new_device THEN
    PERFORM public.enqueue_client_auth_push(
      v_client.id,
      'new_device_login',
      jsonb_build_object('device_id', p_device_id)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'client_id', v_client.id,
    'session_token', v_session->>'session_token',
    'expires_at', v_session->>'expires_at',
    'auth_method', 'access_code',
    'new_device', v_is_new_device
  );
END;
$$;

-- ─── 7. Подписание с кодом (вход ≠ подписание) ──────────────────────────────

CREATE OR REPLACE FUNCTION public.sign_consents_with_access_code_by_session(
  p_session_token TEXT,
  p_access_code TEXT,
  p_consents JSONB,
  p_device_id TEXT,
  p_ip TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client_id UUID;
  v_client public.clients%ROWTYPE;
  v_consent JSONB;
  v_type TEXT;
  v_version TEXT;
  v_hash TEXT;
  v_text TEXT;
  v_result JSONB := '[]'::jsonb;
  v_signature TEXT := 'pin_confirm';
BEGIN
  v_client_id := public.require_client_id(p_session_token);
  SELECT * INTO v_client FROM public.clients WHERE id = v_client_id FOR UPDATE;

  IF v_client.access_code_hash IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_code_not_set');
  END IF;
  IF p_access_code IS NULL OR BTRIM(p_access_code) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_code_required');
  END IF;
  IF v_client.access_code_hash <> crypt(p_access_code, v_client.access_code_hash) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_access_code');
  END IF;
  IF p_device_id IS NULL OR p_device_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_device_id');
  END IF;
  IF jsonb_typeof(p_consents) <> 'array' OR jsonb_array_length(p_consents) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_consents_payload');
  END IF;

  FOR v_consent IN SELECT * FROM jsonb_array_elements(p_consents) LOOP
    v_type := v_consent->>'type';
    v_version := v_consent->>'version';
    v_text := v_consent->>'document_text';
    SELECT document_sha256 INTO v_hash
      FROM public.legal_consent_registry
     WHERE consent_type = v_type AND document_version = v_version AND status = 'active';
    IF v_hash IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'consent_version_not_allowed',
        'consent_type', v_type, 'document_version', v_version);
    END IF;
    IF v_text IS NULL OR encode(digest(v_text, 'sha256'), 'hex') <> v_hash THEN
      RETURN jsonb_build_object('success', false, 'error', 'document_text_hash_mismatch',
        'consent_type', v_type, 'document_version', v_version);
    END IF;
  END LOOP;

  PERFORM set_config('app.consents_writer', 'authorized', true);
  FOR v_consent IN SELECT * FROM jsonb_array_elements(p_consents) LOOP
    v_type := v_consent->>'type';
    v_version := v_consent->>'version';
    v_text := v_consent->>'document_text';

    UPDATE public.consents
       SET granted = false, is_active = false, revoked_at = NOW()
     WHERE client_id = v_client_id AND consent_type = v_type
       AND granted = true AND revoked_at IS NULL;

    INSERT INTO public.consents (
      client_id, consent_type, document_version, signature_method,
      granted, is_active, ip_address, user_agent,
      device_id, session_auth_method, document_text_snapshot
    ) VALUES (
      v_client_id, v_type, v_version, v_signature,
      COALESCE((v_consent->>'granted')::boolean, true),
      COALESCE((v_consent->>'granted')::boolean, true),
      CASE WHEN NULLIF(BTRIM(p_ip), '') IS NOT NULL THEN p_ip::inet ELSE NULL END,
      LEFT(p_user_agent, 500),
      p_device_id,
      'access_code',
      v_text
    );

    SELECT document_sha256 INTO v_hash FROM public.legal_consent_registry
     WHERE consent_type = v_type AND document_version = v_version;
    v_result := v_result || jsonb_build_object(
      'type', v_type,
      'version', v_version,
      'document_sha256', v_hash,
      'device_id', p_device_id,
      'session_auth_method', 'access_code',
      'signature_method', v_signature,
      'logged', true
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'consents', v_result, 'client_id', v_client_id);
END;
$$;

-- log_consents: pin_confirm без кода отклоняется (подписание только через sign_consents_with_access_code)
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

  FOR v_consent IN SELECT * FROM jsonb_array_elements(p_consents) LOOP
    v_type := v_consent->>'type';
    v_version := v_consent->>'version';
    v_signature := COALESCE(v_consent->>'signature_method', 'checkbox');
    IF v_signature = 'pin_confirm' THEN
      RETURN jsonb_build_object('success', false, 'error', 'pin_confirm_requires_access_code',
        'hint', 'sign_consents_with_access_code_by_session');
    END IF;
    SELECT document_sha256 INTO v_hash
      FROM public.legal_consent_registry
     WHERE consent_type = v_type AND document_version = v_version AND status = 'active';
    IF v_hash IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'consent_version_not_allowed',
        'consent_type', v_type, 'document_version', v_version);
    END IF;
    IF v_signature NOT IN ('checkbox', 'one_time_code', 'button', 'pin_confirm') THEN
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

-- ─── 8. Grants ────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.verify_client_onetime_pin(TEXT, TEXT, TEXT, TEXT, TEXT) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.set_client_access_code(TEXT, TEXT, TEXT, TEXT, TEXT) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.change_client_access_code_by_session(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.login_client_v1(TEXT, TEXT, TEXT, TEXT, TEXT) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.sign_consents_with_access_code_by_session(TEXT, TEXT, JSONB, TEXT, TEXT, TEXT) TO heys_rpc;

COMMIT;
