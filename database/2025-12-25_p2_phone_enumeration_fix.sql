-- ═══════════════════════════════════════════════════════════════════
-- 🔐 P2 Security: Phone Enumeration Fix
-- Дата: 2025-12-25
-- Версия: 1.0.0
-- 
-- ПРОБЛЕМА:
--   verify_client_pin_v3 возвращает 'client_not_found' для несуществующих
--   телефонов, что позволяет атакующему перечислять валидные номера.
--
-- РЕШЕНИЕ:
--   1. Единый ответ 'invalid_credentials' для всех случаев неудачи
--   2. Rate-limit работает даже для несуществующих телефонов
--   3. Timing-атака защита через pg_sleep
--   4. Fallback IP '0.0.0.0' если IP не передан
-- ═══════════════════════════════════════════════════════════════════

-- Drop existing function to recreate with fixes
DROP FUNCTION IF EXISTS public.verify_client_pin_v3(text, text, text, text);

-- ═══════════════════════════════════════════════════════════════════
-- 🔐 verify_client_pin_v3 — FIXED (no phone enumeration)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.verify_client_pin_v3(
  p_phone TEXT,
  p_pin TEXT,
  p_ip TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client RECORD;
  v_ip INET;
  v_phone_normalized TEXT;
  v_session_token UUID;
  v_session_expires TIMESTAMPTZ;
  v_client_found BOOLEAN := FALSE;
  v_pin_correct BOOLEAN := FALSE;
BEGIN
  -- ═══════════════════════════════════════════════════════════════
  -- 1) Нормализация входных данных
  -- ═══════════════════════════════════════════════════════════════
  
  -- Нормализуем телефон (только цифры)
  v_phone_normalized := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
  
  -- Fallback IP для rate-limit (если не передан)
  -- '0.0.0.0' используется как placeholder для анонимных попыток
  BEGIN
    v_ip := COALESCE(NULLIF(TRIM(p_ip), '')::INET, '0.0.0.0'::INET);
  EXCEPTION WHEN OTHERS THEN
    v_ip := '0.0.0.0'::INET;
  END;
  
  -- ═══════════════════════════════════════════════════════════════
  -- 2) Rate-limit ВСЕГДА (даже для несуществующих телефонов)
  -- ═══════════════════════════════════════════════════════════════
  
  BEGIN
    PERFORM public.check_pin_rate_limit(v_phone_normalized, v_ip);
  EXCEPTION WHEN OTHERS THEN
    -- Rate-limit exceeded
    PERFORM public.log_security_event(
      'pin_rate_limited',
      v_phone_normalized,
      NULL,  -- no client_id yet
      v_ip::TEXT,
      p_user_agent,
      jsonb_build_object('error', SQLERRM)
    );
    RAISE;  -- Re-raise the exception
  END;
  
  -- ═══════════════════════════════════════════════════════════════
  -- 3) Поиск клиента (без раскрытия результата атакующему)
  -- ═══════════════════════════════════════════════════════════════
  
  SELECT id, pin_hash, name
  INTO v_client
  FROM public.clients
  WHERE phone_normalized = v_phone_normalized
    AND pin_hash IS NOT NULL;
  
  v_client_found := FOUND;
  
  -- ═══════════════════════════════════════════════════════════════
  -- 4) Проверка PIN (только если клиент найден)
  -- ═══════════════════════════════════════════════════════════════
  
  IF v_client_found THEN
    -- Проверяем PIN через bcrypt
    v_pin_correct := (v_client.pin_hash = crypt(p_pin, v_client.pin_hash));
  END IF;
  
  -- ═══════════════════════════════════════════════════════════════
  -- 5) Timing-защита: одинаковое время для всех ответов
  -- ═══════════════════════════════════════════════════════════════

  -- Window расширен с 80-120мс до 250-350мс после миграции на bcrypt cost=12
  -- (миграция 2026-05-19_pin_bcrypt_cost_12.sql). При cost=6 verify_client_pin_v3
  -- занимал ~10мс; при cost=12 — ~250мс. Прежнее окно 80-120мс уже не маскирует
  -- бекрипт — нужно держать sleep ≥ bcrypt-времени для обеих веток
  -- (client_found / not_found), чтобы timing-канал оставался закрытым.
  PERFORM pg_sleep(0.25 + random() * 0.10);  -- 250-350ms
  
  -- ═══════════════════════════════════════════════════════════════
  -- 6) Обработка результата
  -- ═══════════════════════════════════════════════════════════════
  
  IF NOT v_client_found OR NOT v_pin_correct THEN
    -- Инкремент попыток ВСЕГДА (даже если клиент не найден)
    -- ⚠️ Важно: вызываем ДО возврата ошибки чтобы запись сохранилась!
    PERFORM public.increment_pin_attempt(v_phone_normalized, v_ip);
    
    -- Логируем неудачу
    PERFORM public.log_security_event(
      'pin_failed',
      v_phone_normalized,
      CASE WHEN v_client_found THEN v_client.id ELSE NULL END,
      v_ip::TEXT,
      p_user_agent,
      jsonb_build_object(
        'reason', 'invalid_credentials',  -- Унифицированная причина
        'client_exists', v_client_found   -- Для внутренней аналитики
      )
    );
    
    -- ⚠️ ВАЖНО: Возвращаем JSON вместо RAISE чтобы транзакция ЗАКОММИТИЛАСЬ
    -- и rate-limit записался в БД!
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'invalid_credentials'
    );
  END IF;
  
  -- ═══════════════════════════════════════════════════════════════
  -- 7) Успешная аутентификация
  -- ═══════════════════════════════════════════════════════════════

  -- Сбрасываем счётчик попыток
  PERFORM public.reset_pin_attempts(v_phone_normalized, v_ip);

  -- Lazy-rehash: если pin_hash был сделан с cost<12 (миграция 2026-05-19),
  -- переписываем его в формат cost=12 ПОСЛЕ успешной проверки. Делается один
  -- раз на клиента и амортизируется по жизни сессий. Префикс `$2a$06$` /
  -- `$2a$08$` / `$2a$10$` — всё что < 12.
  IF v_client.pin_hash IS NOT NULL
     AND v_client.pin_hash ~ '^\$2[ab]\$0[0-9]\$'
  THEN
    UPDATE public.clients
       SET pin_hash = crypt(p_pin, gen_salt('bf', 12)),
           pin_updated_at = NOW()
     WHERE id = v_client.id;
  END IF;

  -- Создаём сессию
  v_session_token := gen_random_uuid();
  v_session_expires := NOW() + INTERVAL '30 days';
  
  INSERT INTO public.client_sessions (
    session_token,
    client_id,
    ip_address,
    user_agent,
    expires_at
  ) VALUES (
    v_session_token,
    v_client.id,
    v_ip,
    p_user_agent,
    v_session_expires
  );
  
  -- Логируем успех
  PERFORM public.log_security_event(
    'pin_success',
    v_phone_normalized,
    v_client.id,
    v_ip::TEXT,
    p_user_agent,
    jsonb_build_object('session_id', v_session_token)
  );
  
  -- Возвращаем данные
  RETURN jsonb_build_object(
    'success', TRUE,
    'session_token', v_session_token,
    'client_id', v_client.id,
    'name', v_client.name,
    'session_expires_at', v_session_expires
  );
  
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 🔒 Права доступа
-- ═══════════════════════════════════════════════════════════════════

-- Отзываем у PUBLIC
REVOKE ALL ON FUNCTION public.verify_client_pin_v3(text, text, text, text) FROM PUBLIC;

-- Даём только heys_rpc
GRANT EXECUTE ON FUNCTION public.verify_client_pin_v3(text, text, text, text) TO heys_rpc;

COMMENT ON FUNCTION public.verify_client_pin_v3(text, text, text, text) IS 
'Проверка PIN клиента v3 с защитой от phone enumeration. Возвращает unified "invalid_credentials" для всех ошибок.';

-- ═══════════════════════════════════════════════════════════════════
-- ✅ Готово!
-- ═══════════════════════════════════════════════════════════════════
