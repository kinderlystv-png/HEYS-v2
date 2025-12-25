-- ═══════════════════════════════════════════════════════════════════
-- 🔐 P1 Security: Rate-limit PIN + Security Logs
-- Дата: 2025-12-25
-- Версия: 1.1.0
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- ⚠️ 0) DROP старых сигнатур (INET → TEXT)
-- Без этого Postgres держит обе версии и GRANT/вызовы идут "не туда"
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.verify_client_pin_v3(text, text, inet);
DROP FUNCTION IF EXISTS public.log_security_event(text, text, uuid, inet, text, jsonb);

-- ═══════════════════════════════════════════════════════════════════
-- 📊 1) Таблица security_events (логи безопасности)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,  -- pin_failed, pin_rate_limited, pin_success, session_revoked, write_blocked, etc.
  phone TEXT,                -- Телефон (если известен)
  client_id UUID,            -- Client ID (если известен)
  ip_address INET,           -- IP адрес запроса
  user_agent TEXT,           -- User-Agent браузера
  meta JSONB,                -- Дополнительные данные
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Индексы для быстрого поиска атак
CREATE INDEX IF NOT EXISTS idx_security_events_type ON public.security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_phone ON public.security_events(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_security_events_ip ON public.security_events(ip_address) WHERE ip_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_security_events_created ON public.security_events(created_at);

-- Автоочистка старых записей (30 дней)
CREATE INDEX IF NOT EXISTS idx_security_events_cleanup ON public.security_events(created_at) 
  WHERE created_at < NOW() - INTERVAL '30 days';

COMMENT ON TABLE public.security_events IS 'Логи событий безопасности для мониторинга атак';

-- ═══════════════════════════════════════════════════════════════════
-- 🧹 Функция очистки старых записей (вызывать по cron)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cleanup_security_logs(p_days_to_keep INT DEFAULT 30)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT;
BEGIN
  -- Удаляем старые security_events
  WITH deleted AS (
    DELETE FROM public.security_events
    WHERE created_at < NOW() - (p_days_to_keep || ' days')::INTERVAL
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted FROM deleted;
  
  -- Удаляем старые pin_login_attempts (не нужны после разблокировки)
  DELETE FROM public.pin_login_attempts
  WHERE last_attempt_at < NOW() - INTERVAL '7 days';
  
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.cleanup_security_logs(INT) IS 
'Очистка старых security_events и pin_login_attempts. Вызывать по cron раз в день.';

-- ═══════════════════════════════════════════════════════════════════
-- 📊 2) Таблица pin_login_attempts (rate-limit PIN)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.pin_login_attempts (
  phone TEXT NOT NULL,
  ip_address INET NOT NULL,
  attempts INT NOT NULL DEFAULT 1,
  first_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until TIMESTAMPTZ,
  PRIMARY KEY (phone, ip_address)
);

-- Индекс для быстрой очистки старых записей
CREATE INDEX IF NOT EXISTS idx_pin_attempts_cleanup ON public.pin_login_attempts(last_attempt_at);

COMMENT ON TABLE public.pin_login_attempts IS 'Rate-limit для попыток ввода PIN';

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 3) Функция: проверка rate-limit для PIN
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.check_pin_rate_limit(
  p_phone TEXT,
  p_ip INET
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt RECORD;
  v_window INTERVAL := INTERVAL '10 minutes';
  v_max_attempts INT := 5;
  v_lock_duration INTERVAL := INTERVAL '15 minutes';
BEGIN
  -- Нормализуем телефон
  p_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
  
  -- Очистка старых записей (за пределами окна)
  DELETE FROM public.pin_login_attempts
  WHERE last_attempt_at < NOW() - v_window
    AND locked_until IS NULL;
  
  -- Получаем текущие попытки
  SELECT * INTO v_attempt
  FROM public.pin_login_attempts
  WHERE phone = p_phone AND ip_address = p_ip;
  
  -- Проверяем блокировку
  IF v_attempt IS NOT NULL AND v_attempt.locked_until IS NOT NULL THEN
    IF v_attempt.locked_until > NOW() THEN
      -- Логируем попытку при блокировке
      INSERT INTO public.security_events (event_type, phone, ip_address, meta)
      VALUES ('pin_rate_limited', p_phone, p_ip, jsonb_build_object(
        'locked_until', v_attempt.locked_until,
        'attempts', v_attempt.attempts
      ));
      
      RAISE EXCEPTION 'pin_rate_limited:% minutes', 
        EXTRACT(MINUTE FROM (v_attempt.locked_until - NOW()))::int + 1;
    ELSE
      -- Блокировка истекла — сбрасываем
      DELETE FROM public.pin_login_attempts
      WHERE phone = p_phone AND ip_address = p_ip;
    END IF;
  END IF;
  
  -- Проверяем количество попыток в окне
  IF v_attempt IS NOT NULL THEN
    IF v_attempt.first_attempt_at > NOW() - v_window THEN
      IF v_attempt.attempts >= v_max_attempts THEN
        -- Блокируем!
        UPDATE public.pin_login_attempts
        SET locked_until = NOW() + v_lock_duration,
            last_attempt_at = NOW()
        WHERE phone = p_phone AND ip_address = p_ip;
        
        -- Логируем блокировку
        INSERT INTO public.security_events (event_type, phone, ip_address, meta)
        VALUES ('pin_locked', p_phone, p_ip, jsonb_build_object(
          'attempts', v_attempt.attempts + 1,
          'lock_duration_minutes', 15
        ));
        
        RAISE EXCEPTION 'pin_rate_limited:15 minutes';
      END IF;
    END IF;
  END IF;
  
  -- Всё ок — функция завершается без ошибки
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 4) Функция: инкремент попыток при неудаче
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.increment_pin_attempt(
  p_phone TEXT,
  p_ip INET
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  p_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
  
  INSERT INTO public.pin_login_attempts (phone, ip_address, attempts, first_attempt_at, last_attempt_at)
  VALUES (p_phone, p_ip, 1, NOW(), NOW())
  ON CONFLICT (phone, ip_address)
  DO UPDATE SET 
    attempts = CASE 
      WHEN pin_login_attempts.first_attempt_at > NOW() - INTERVAL '10 minutes'
      THEN pin_login_attempts.attempts + 1
      ELSE 1  -- Сбрасываем если окно истекло
    END,
    first_attempt_at = CASE
      WHEN pin_login_attempts.first_attempt_at > NOW() - INTERVAL '10 minutes'
      THEN pin_login_attempts.first_attempt_at
      ELSE NOW()
    END,
    last_attempt_at = NOW();
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 5) Функция: сброс попыток при успехе
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.reset_pin_attempts(
  p_phone TEXT,
  p_ip INET
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  p_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
  
  DELETE FROM public.pin_login_attempts
  WHERE phone = p_phone AND ip_address = p_ip;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 6) verify_client_pin_v3 — с rate-limit и IP
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.verify_client_pin_v3(
  p_phone TEXT,
  p_pin TEXT,
  p_ip TEXT DEFAULT NULL  -- Принимаем TEXT, кастуем в INET внутри (безопаснее)
)
RETURNS TABLE(client_id UUID, session_token TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client RECORD;
  v_token TEXT;
  v_normalized_phone TEXT;
  v_ip INET;
BEGIN
  -- Нормализуем телефон
  v_normalized_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
  
  -- Безопасный каст IP (NULL если невалидный)
  BEGIN
    v_ip := p_ip::inet;
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL;
  END;
  
  -- 🔐 P1-1: Проверяем rate-limit СНАЧАЛА (до проверки PIN!)
  IF v_ip IS NOT NULL THEN
    PERFORM public.check_pin_rate_limit(v_normalized_phone, v_ip);
  END IF;
  
  -- Ищем клиента
  SELECT * INTO v_client
  FROM public.clients c
  WHERE c.phone = v_normalized_phone
    AND c.pin_hash IS NOT NULL;

  IF NOT FOUND THEN
    -- Логируем попытку с несуществующим телефоном
    INSERT INTO public.security_events (event_type, phone, ip_address, meta)
    VALUES ('pin_client_not_found', v_normalized_phone, v_ip, NULL);
    
    IF v_ip IS NOT NULL THEN
      PERFORM public.increment_pin_attempt(v_normalized_phone, v_ip);
    END IF;
    
    RAISE EXCEPTION 'client_not_found';
  END IF;

  -- Проверка блокировки на уровне клиента (legacy, на всякий случай)
  IF v_client.pin_locked_until IS NOT NULL AND v_client.pin_locked_until > NOW() THEN
    INSERT INTO public.security_events (event_type, phone, client_id, ip_address, meta)
    VALUES ('pin_client_locked', v_normalized_phone, v_client.id, v_ip, 
      jsonb_build_object('locked_until', v_client.pin_locked_until));
    
    RAISE EXCEPTION 'pin_locked_until_%', v_client.pin_locked_until;
  END IF;

  -- Проверка PIN
  IF v_client.pin_hash <> crypt(p_pin, v_client.pin_hash) THEN
    -- Неверный PIN — инкрементируем попытки
    IF v_ip IS NOT NULL THEN
      PERFORM public.increment_pin_attempt(v_normalized_phone, v_ip);
    END IF;
    
    -- 🔐 P1: Throttle логирования (anti-DoS на security_events)
    -- Логируем только: каждую 3-ю попытку ИЛИ при блокировке (>=5)
    DECLARE
      v_current_attempts INT;
    BEGIN
      SELECT COALESCE(pin_failed_attempts, 0) + 1 INTO v_current_attempts
      FROM public.clients WHERE id = v_client.id;
      
      -- Логируем если: attempt % 3 = 0 ИЛИ будет блокировка
      IF v_current_attempts % 3 = 0 OR v_current_attempts >= 5 THEN
        INSERT INTO public.security_events (event_type, phone, client_id, ip_address, meta)
        VALUES ('pin_failed', v_normalized_phone, v_client.id, v_ip, 
          jsonb_build_object('attempt', v_current_attempts));
      END IF;
    END;
    
    -- Обновляем legacy счётчик на клиенте
    UPDATE public.clients
    SET pin_failed_attempts = COALESCE(pin_failed_attempts, 0) + 1,
        pin_locked_until = CASE
          WHEN COALESCE(pin_failed_attempts, 0) >= 4
          THEN NOW() + INTERVAL '15 minutes'
          ELSE NULL
        END
    WHERE id = v_client.id;
    
    RAISE EXCEPTION 'invalid_pin';
  END IF;

  -- ✅ Успех! Сбрасываем всё
  IF v_ip IS NOT NULL THEN
    PERFORM public.reset_pin_attempts(v_normalized_phone, v_ip);
  END IF;
  
  UPDATE public.clients
  SET pin_failed_attempts = 0,
      pin_locked_until = NULL
  WHERE id = v_client.id;

  -- Выдаём сессию (30 дней)
  v_token := public.issue_client_session(v_client.id, 720);
  
  -- Логируем успешный вход
  INSERT INTO public.security_events (event_type, phone, client_id, ip_address, meta)
  VALUES ('pin_success', v_normalized_phone, v_client.id, v_ip, NULL);

  RETURN QUERY SELECT v_client.id, v_token;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 7) Функция логирования security event (универсальная)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.log_security_event(
  p_event_type TEXT,
  p_phone TEXT DEFAULT NULL,
  p_client_id UUID DEFAULT NULL,
  p_ip TEXT DEFAULT NULL,  -- TEXT для безопасного приёма из CF
  p_user_agent TEXT DEFAULT NULL,
  p_meta JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_ip INET;
BEGIN
  -- Safe cast TEXT → INET
  BEGIN
    v_ip := p_ip::inet;
  EXCEPTION WHEN others THEN
    v_ip := NULL;
  END;
  
  INSERT INTO public.security_events (event_type, phone, client_id, ip_address, user_agent, meta)
  VALUES (p_event_type, p_phone, p_client_id, v_ip, p_user_agent, p_meta)
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 🔐 Права доступа (минимальные)
-- ═══════════════════════════════════════════════════════════════════

-- Таблицы: только для heys_admin (миграции) и будущего heys_rpc
REVOKE ALL ON TABLE public.security_events FROM PUBLIC;
REVOKE ALL ON TABLE public.pin_login_attempts FROM PUBLIC;

-- Функции: только EXECUTE для runtime
REVOKE ALL ON FUNCTION public.check_pin_rate_limit(TEXT, INET) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_pin_attempt(TEXT, INET) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_pin_attempts(TEXT, INET) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_client_pin_v3(TEXT, TEXT, INET) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_security_event(TEXT, TEXT, UUID, INET, TEXT, JSONB) FROM PUBLIC;

-- Гранты для heys_admin (пока runtime, потом заменим на heys_rpc)
GRANT SELECT, INSERT ON TABLE public.security_events TO heys_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pin_login_attempts TO heys_admin;

GRANT EXECUTE ON FUNCTION public.check_pin_rate_limit(TEXT, INET) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.increment_pin_attempt(TEXT, INET) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.reset_pin_attempts(TEXT, INET) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.verify_client_pin_v3(TEXT, TEXT, INET) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.log_security_event(TEXT, TEXT, UUID, INET, TEXT, JSONB) TO heys_admin;

-- ═══════════════════════════════════════════════════════════════════
-- ✅ Готово
-- ═══════════════════════════════════════════════════════════════════

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ P1 Security установлен!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '🔐 Rate-limit PIN:';
  RAISE NOTICE '   • 5 попыток за 10 минут на пару phone+IP';
  RAISE NOTICE '   • Блокировка на 15 минут при превышении';
  RAISE NOTICE '   • verify_client_pin_v3(phone, pin, ip) — новая версия';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Security logs:';
  RAISE NOTICE '   • security_events — все события безопасности';
  RAISE NOTICE '   • pin_login_attempts — счётчик попыток';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  Не забудь:';
  RAISE NOTICE '   1. Обновить Cloud Function: передавать IP в verify_client_pin_v3';
  RAISE NOTICE '   2. Добавить verify_client_pin_v3 в ALLOWED_FUNCTIONS';
  RAISE NOTICE '';
END $$;
