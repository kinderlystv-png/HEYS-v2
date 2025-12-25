-- ═══════════════════════════════════════════════════════════════════
-- 🔐 Subscriptions & Sessions Migration (Yandex Cloud PostgreSQL)
-- ═══════════════════════════════════════════════════════════════════
-- Версия: 1.0 (адаптировано для Yandex Cloud, без Supabase ролей)
-- Дата: 2025-12-24
-- Автор: HEYS Team
-- 
-- Изменения относительно Supabase-версии:
-- - Убраны GRANT TO anon, authenticated (нет таких ролей)
-- - Убраны RLS политики (не нужны без Supabase)
-- - Доступ контролируется на уровне API (Yandex Cloud Functions)
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- 📦 1) Таблица client_sessions
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.client_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  
  -- Токен: храним хэш, не raw
  token_hash bytea NOT NULL,
  
  -- TTL
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  
  -- Метаинфа
  user_agent text,
  ip_address inet,
  
  -- Отзыв сессии
  revoked_at timestamptz,
  
  CONSTRAINT client_sessions_token_hash_unique UNIQUE (token_hash)
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_client_sessions_client_id 
  ON public.client_sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_client_sessions_expires_at 
  ON public.client_sessions(expires_at) WHERE revoked_at IS NULL;

COMMENT ON TABLE public.client_sessions IS 'Сессии PIN-клиентов (30 дней TTL)';

-- ═══════════════════════════════════════════════════════════════════
-- 📦 2) Таблица subscriptions
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  
  -- Триал (7 дней)
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  
  -- Платная подписка
  active_until timestamptz,
  
  -- Отмена
  canceled_at timestamptz,
  
  -- Метаданные
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Индекс для куратора (список клиентов по статусу)
CREATE INDEX IF NOT EXISTS idx_subscriptions_active_until 
  ON public.subscriptions(active_until) WHERE active_until IS NOT NULL;

COMMENT ON TABLE public.subscriptions IS 'Подписки клиентов (статус вычисляемый)';

-- Триггер updated_at
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 3) Автосоздание subscription при создании клиента
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ensure_subscription_exists()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.subscriptions (client_id)
  VALUES (NEW.id)
  ON CONFLICT (client_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clients_ensure_subscription ON public.clients;
CREATE TRIGGER trg_clients_ensure_subscription
AFTER INSERT ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.ensure_subscription_exists();

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 4) Функция: require_client_id (валидация session_token)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.require_client_id(p_session_token text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
BEGIN
  IF p_session_token IS NULL OR p_session_token = '' THEN
    RAISE EXCEPTION 'session_token_required';
  END IF;
  
  SELECT cs.client_id INTO v_client_id
  FROM public.client_sessions cs
  WHERE cs.token_hash = sha256(p_session_token::bytea)
    AND cs.expires_at > now()
    AND cs.revoked_at IS NULL;
  
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'invalid_or_expired_session';
  END IF;
  
  RETURN v_client_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 5) Функция: issue_client_session (выдача сессии)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.issue_client_session(
  p_client_id uuid,
  p_ttl_hours int DEFAULT 720  -- 30 дней
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  -- Генерируем 32 байта = 64 hex символа
  v_token := encode(gen_random_bytes(32), 'hex');
  
  INSERT INTO public.client_sessions (client_id, token_hash, expires_at)
  VALUES (
    p_client_id,
    sha256(v_token::bytea),
    now() + (p_ttl_hours || ' hours')::interval
  );
  
  RETURN v_token;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 6) Функция: verify_client_pin_v2 (возвращает session_token)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.verify_client_pin_v2(
  p_phone text,
  p_pin   text
)
RETURNS TABLE(client_id uuid, session_token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c record;
  v_token text;
BEGIN
  -- Нормализуем телефон
  SELECT * INTO c
  FROM public.clients
  WHERE phone = regexp_replace(p_phone, '[^0-9]', '', 'g')
    AND pin_hash IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'client_not_found';
  END IF;

  -- Проверка блокировки
  IF c.pin_locked_until IS NOT NULL AND c.pin_locked_until > now() THEN
    RAISE EXCEPTION 'pin_locked_until_%', c.pin_locked_until;
  END IF;

  -- Проверка PIN
  IF c.pin_hash <> crypt(p_pin, c.pin_hash) THEN
    UPDATE public.clients
       SET pin_failed_attempts = COALESCE(pin_failed_attempts, 0) + 1,
           pin_locked_until = CASE
             WHEN COALESCE(pin_failed_attempts, 0) >= 4
             THEN now() + interval '15 minutes'
             ELSE NULL
           END
     WHERE id = c.id;
    RAISE EXCEPTION 'invalid_pin';
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

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 7) Вычисляемый статус подписки
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
  WHERE s.client_id = p_client_id;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 8) Получить статус по session_token
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_subscription_status_by_session(p_session_token text)
RETURNS TABLE(
  client_id uuid,
  status text,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  active_until timestamptz,
  days_left int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
BEGIN
  v_client_id := public.require_client_id(p_session_token);
  
  RETURN QUERY
  SELECT 
    s.client_id,
    public.get_effective_subscription_status(s.client_id) AS status,
    s.trial_started_at,
    s.trial_ends_at,
    s.active_until,
    CASE
      WHEN s.active_until IS NOT NULL AND s.active_until > now() 
        THEN EXTRACT(DAY FROM (s.active_until - now()))::int
      WHEN s.trial_ends_at IS NOT NULL AND s.trial_ends_at > now()
        THEN EXTRACT(DAY FROM (s.trial_ends_at - now()))::int
      ELSE 0
    END AS days_left
  FROM public.subscriptions s
  WHERE s.client_id = v_client_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 9) Старт триала (идемпотентно)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.start_trial_by_session(
  p_session_token text,
  p_trial_days int DEFAULT 7
)
RETURNS TABLE(
  success boolean,
  message text,
  trial_ends_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
  v_subscription record;
  v_trial_end timestamptz;
BEGIN
  v_client_id := public.require_client_id(p_session_token);
  
  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE client_id = v_client_id;
  
  -- Уже есть триал или подписка?
  IF v_subscription.trial_started_at IS NOT NULL THEN
    RETURN QUERY SELECT true, 'trial_already_started'::text, v_subscription.trial_ends_at;
    RETURN;
  END IF;
  
  IF v_subscription.active_until IS NOT NULL AND v_subscription.active_until > now() THEN
    RETURN QUERY SELECT true, 'already_active'::text, v_subscription.active_until;
    RETURN;
  END IF;
  
  -- Стартуем триал
  v_trial_end := now() + (p_trial_days || ' days')::interval;
  
  UPDATE public.subscriptions
  SET trial_started_at = now(),
      trial_ends_at = v_trial_end
  WHERE client_id = v_client_id;
  
  RETURN QUERY SELECT true, 'trial_started'::text, v_trial_end;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 10) Отзыв сессии (logout)
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
  WHERE token_hash = sha256(p_session_token::bytea)
    AND revoked_at IS NULL;
  
  RETURN FOUND;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 11) Для куратора: получить статус клиента
-- ═══════════════════════════════════════════════════════════════════

-- Куратор авторизуется через heys-api-auth, передаёт JWT
-- Эта функция вызывается из Yandex Cloud Function с проверкой JWT

CREATE OR REPLACE FUNCTION public.get_subscription_status_for_curator(p_client_id uuid)
RETURNS TABLE(
  client_id uuid,
  status text,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  active_until timestamptz,
  canceled_at timestamptz,
  days_left int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.client_id,
    public.get_effective_subscription_status(s.client_id) AS status,
    s.trial_started_at,
    s.trial_ends_at,
    s.active_until,
    s.canceled_at,
    CASE
      WHEN s.active_until IS NOT NULL AND s.active_until > now() 
        THEN EXTRACT(DAY FROM (s.active_until - now()))::int
      WHEN s.trial_ends_at IS NOT NULL AND s.trial_ends_at > now()
        THEN EXTRACT(DAY FROM (s.trial_ends_at - now()))::int
      ELSE 0
    END AS days_left
  FROM public.subscriptions s
  WHERE s.client_id = p_client_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 12) Для куратора: установить active_until
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_subscription_active_until(
  p_client_id uuid,
  p_active_until timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.subscriptions
  SET active_until = p_active_until,
      canceled_at = NULL  -- Снимаем отмену если была
  WHERE client_id = p_client_id;
  
  RETURN FOUND;
END;
$$;

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
