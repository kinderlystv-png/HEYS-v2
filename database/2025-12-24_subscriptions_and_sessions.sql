-- ═══════════════════════════════════════════════════════════════════
-- 🎫 HEYS Subscriptions & Client Sessions
-- Created: 2025-12-24
-- Purpose: Trial-машина + Read-only режим (без платёжки)
-- Безопасность: session_token вместо client_id для PIN-auth
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- 📦 1) Таблица client_sessions — сессии для PIN-клиентов
-- ═══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.client_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,

  token_hash bytea NOT NULL UNIQUE,           -- digest(token, 'sha256')
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  
  -- Метаданные (опционально)
  user_agent text,
  ip_address inet
);

COMMENT ON TABLE public.client_sessions IS 'Сессии PIN-клиентов (токен хранится хешем)';

CREATE INDEX IF NOT EXISTS client_sessions_client_id_idx 
  ON public.client_sessions(client_id);
CREATE INDEX IF NOT EXISTS client_sessions_expires_at_idx 
  ON public.client_sessions(expires_at) WHERE revoked_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════
-- 📦 2) Таблица subscriptions — подписки (статус вычисляемый!)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.subscriptions (
  client_id uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,

  trial_started_at timestamptz,
  trial_ends_at    timestamptz,

  active_until     timestamptz,        -- выставит платежка/админка
  canceled_at      timestamptz,        -- если надо фиксировать отмену

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT trial_range_chk CHECK (
    (trial_started_at IS NULL AND trial_ends_at IS NULL)
    OR (trial_started_at IS NOT NULL AND trial_ends_at IS NOT NULL AND trial_ends_at > trial_started_at)
  )
);

COMMENT ON TABLE public.subscriptions IS 'Подписки клиентов (статус вычисляется из дат)';

-- Trigger для updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Автосоздание строки подписки при создании клиента
CREATE OR REPLACE FUNCTION public.ensure_subscription_row()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.subscriptions(client_id)
  VALUES (NEW.id)
  ON CONFLICT (client_id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_clients_ensure_subscription ON public.clients;
CREATE TRIGGER trg_clients_ensure_subscription
AFTER INSERT ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.ensure_subscription_row();

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 3) Хелпер: require_client_id(session_token) — проверка сессии
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.require_client_id(p_session_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
BEGIN
  SELECT s.client_id
    INTO v_client_id
  FROM public.client_sessions s
  WHERE s.token_hash = digest(p_session_token, 'sha256')
    AND s.revoked_at IS NULL
    AND s.expires_at > now()
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'invalid_session';
  END IF;

  -- Обновляем last_seen_at
  UPDATE public.client_sessions
    SET last_seen_at = now()
  WHERE token_hash = digest(p_session_token, 'sha256');

  RETURN v_client_id;
END;
$$;

REVOKE ALL ON FUNCTION public.require_client_id(text) FROM PUBLIC;

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 4) Выдача сессии (вызывается из verify_client_pin_v2)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.issue_client_session(p_client_id uuid, p_ttl_hours int DEFAULT 720)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  -- 32 байта = 64 hex-символа
  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.client_sessions(client_id, token_hash, expires_at)
  VALUES (p_client_id, digest(v_token, 'sha256'), now() + make_interval(hours => greatest(p_ttl_hours, 1)));

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_client_session(uuid, int) FROM PUBLIC;

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 5) verify_client_pin_v2 — возвращает client_id + session_token
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.verify_client_pin_v2(
  p_phone text,
  p_pin_hash text
)
RETURNS TABLE(client_id uuid, session_token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE 
  c record;
  now_ts timestamptz := now();
  new_fail_count int;
  v_token text;
BEGIN
  SELECT id, pin_hash, pin_locked_until, pin_failed_attempts
    INTO c
    FROM public.clients
   WHERE phone = p_phone
   LIMIT 1;

  IF c.id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text;
    RETURN;
  END IF;

  IF c.pin_locked_until IS NOT NULL AND c.pin_locked_until > now_ts THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text;
    RETURN;
  END IF;

  IF c.pin_hash IS NULL OR c.pin_hash <> p_pin_hash THEN
    new_fail_count := coalesce(c.pin_failed_attempts, 0) + 1;

    UPDATE public.clients
       SET pin_failed_attempts = new_fail_count,
           pin_locked_until = CASE
             WHEN new_fail_count >= 10 THEN now_ts + interval '10 minutes'
             ELSE pin_locked_until
           END
     WHERE id = c.id;

    RETURN QUERY SELECT NULL::uuid, NULL::text;
    RETURN;
  END IF;

  -- Успех → сброс счётчика
  UPDATE public.clients
     SET pin_failed_attempts = 0,
         pin_locked_until = NULL
   WHERE id = c.id;

  -- Выдаём сессию (30 дней = 720 часов)
  v_token := public.issue_client_session(c.id, 720);

  RETURN QUERY SELECT c.id, v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_client_pin_v2(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_client_pin_v2(text, text) TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 6) Вычисляемый статус подписки
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_effective_subscription_status(p_client_id uuid)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT
    CASE
      WHEN s.active_until IS NOT NULL AND s.active_until > now() THEN 'active'
      WHEN s.trial_ends_at IS NOT NULL AND s.trial_ends_at > now() THEN 'trial'
      WHEN s.trial_started_at IS NOT NULL OR s.active_until IS NOT NULL OR s.canceled_at IS NOT NULL THEN 'read_only'
      ELSE 'none'
    END
  FROM public.subscriptions s
  WHERE s.client_id = p_client_id
$$;

REVOKE ALL ON FUNCTION public.get_effective_subscription_status(uuid) FROM PUBLIC;

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 7) RPC для PIN-клиентов: получить статус по session_token
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_subscription_status_by_session(p_session_token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
BEGIN
  v_client_id := public.require_client_id(p_session_token);
  RETURN COALESCE(public.get_effective_subscription_status(v_client_id), 'none');
END;
$$;

REVOKE ALL ON FUNCTION public.get_subscription_status_by_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_subscription_status_by_session(text) TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 8) RPC для PIN-клиентов: старт триала (идемпотентно)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.start_trial_by_session(p_session_token text, p_days int DEFAULT 7)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
  v_status text;
BEGIN
  v_client_id := public.require_client_id(p_session_token);

  -- Гарантируем строку подписки
  INSERT INTO public.subscriptions(client_id)
  VALUES (v_client_id)
  ON CONFLICT (client_id) DO NOTHING;

  v_status := public.get_effective_subscription_status(v_client_id);
  
  -- Если уже active — не трогаем
  IF v_status = 'active' THEN
    RETURN 'active';
  END IF;

  -- Идемпотентно: если триал уже был — не перезапускаем
  UPDATE public.subscriptions s
  SET
    trial_started_at = COALESCE(s.trial_started_at, now()),
    trial_ends_at    = COALESCE(s.trial_ends_at, now() + make_interval(days => greatest(p_days, 1)))
  WHERE s.client_id = v_client_id;

  RETURN public.get_effective_subscription_status(v_client_id);
END;
$$;

REVOKE ALL ON FUNCTION public.start_trial_by_session(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_trial_by_session(text, int) TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 9) RPC для PIN-клиентов: отозвать сессию (logout)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.revoke_session(p_session_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.client_sessions
    SET revoked_at = now()
  WHERE token_hash = digest(p_session_token, 'sha256')
    AND revoked_at IS NULL;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_session(text) TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 10) RPC для куратора: получить статус клиента (через auth.uid())
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_subscription_status_for_curator(p_client_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = p_client_id AND c.curator_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN COALESCE(public.get_effective_subscription_status(p_client_id), 'none');
END;
$$;

REVOKE ALL ON FUNCTION public.get_subscription_status_for_curator(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_subscription_status_for_curator(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 11) RPC для куратора: установить active_until (после оплаты)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_subscription_active_until(
  p_client_id uuid,
  p_active_until timestamptz
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = p_client_id AND c.curator_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Гарантируем строку
  INSERT INTO public.subscriptions(client_id)
  VALUES (p_client_id)
  ON CONFLICT (client_id) DO NOTHING;

  UPDATE public.subscriptions
  SET active_until = p_active_until
  WHERE client_id = p_client_id;

  RETURN public.get_effective_subscription_status(p_client_id);
END;
$$;

REVOKE ALL ON FUNCTION public.set_subscription_active_until(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_subscription_active_until(uuid, timestamptz) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- 🔐 12) Безопасность: закрываем прямой доступ к таблицам
-- ═══════════════════════════════════════════════════════════════════

-- Всё через RPC, прямой доступ не нужен
REVOKE ALL ON TABLE public.subscriptions FROM anon, authenticated;
REVOKE ALL ON TABLE public.client_sessions FROM anon, authenticated;

-- RLS на всякий случай (хотя прямого доступа нет)
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_sessions ENABLE ROW LEVEL SECURITY;

-- Политика: никто не может читать/писать напрямую (только через RPC)
DROP POLICY IF EXISTS "subscriptions_no_direct_access" ON public.subscriptions;
CREATE POLICY "subscriptions_no_direct_access"
ON public.subscriptions
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "client_sessions_no_direct_access" ON public.client_sessions;
CREATE POLICY "client_sessions_no_direct_access"
ON public.client_sessions
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 13) Очистка старых сессий (cron job или manual)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted int;
BEGIN
  DELETE FROM public.client_sessions
  WHERE expires_at < now() - interval '7 days';
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- Только service role может вызывать очистку
REVOKE ALL ON FUNCTION public.cleanup_expired_sessions() FROM PUBLIC;

-- ═══════════════════════════════════════════════════════════════════
-- ✅ Миграция завершена
-- ═══════════════════════════════════════════════════════════════════

COMMIT;

DO $$
BEGIN
  RAISE NOTICE '✅ Subscriptions & Sessions миграция применена успешно';
  RAISE NOTICE '  - client_sessions: сессии PIN-клиентов';
  RAISE NOTICE '  - subscriptions: подписки (статус вычисляемый)';
  RAISE NOTICE '  - verify_client_pin_v2: возвращает session_token';
  RAISE NOTICE '  - get_subscription_status_by_session: статус по токену';
  RAISE NOTICE '  - start_trial_by_session: старт триала (идемпотентно)';
END $$;
