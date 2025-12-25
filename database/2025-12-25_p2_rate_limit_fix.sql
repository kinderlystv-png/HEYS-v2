-- ═══════════════════════════════════════════════════════════════════════════
-- P2 SECURITY: Rate-limit lock fix
-- Date: 2025-12-25
-- Purpose: Fix rate-limit to actually set locked_until when attempts >= 5
-- 
-- PROBLEM:
-- - check_pin_rate_limit checks attempts BEFORE increment
-- - increment_pin_attempt increments but doesn't set locked_until
-- - Result: locked_until never gets set until 6th attempt
--
-- SOLUTION:
-- - Move lock-setting logic INTO increment_pin_attempt (single atomic UPSERT)
-- - Simplify check_pin_rate_limit to only check locked_until
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 1) FIXED: increment_pin_attempt - sets locked_until in same UPSERT
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
DECLARE
  v_max_attempts INT := 5;
  v_lock_minutes INT := 15;
  v_window INTERVAL := INTERVAL '10 minutes';
  v_result RECORD;
BEGIN
  p_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
  
  INSERT INTO public.pin_login_attempts (phone, ip_address, attempts, first_attempt_at, last_attempt_at, locked_until)
  VALUES (p_phone, p_ip, 1, NOW(), NOW(), NULL)
  ON CONFLICT (phone, ip_address)
  DO UPDATE SET 
    -- Increment attempts (reset if window expired)
    attempts = CASE 
      WHEN pin_login_attempts.first_attempt_at > NOW() - v_window
      THEN pin_login_attempts.attempts + 1
      ELSE 1
    END,
    -- Reset window start if expired
    first_attempt_at = CASE
      WHEN pin_login_attempts.first_attempt_at > NOW() - v_window
      THEN pin_login_attempts.first_attempt_at
      ELSE NOW()
    END,
    last_attempt_at = NOW(),
    -- Set locked_until when reaching max attempts (atomic!)
    locked_until = CASE
      -- Если окно истекло — начинаем заново, старую блокировку сбрасываем
      WHEN pin_login_attempts.first_attempt_at <= NOW() - v_window THEN NULL
      -- Если мы в окне и достигаем лимита — ставим/продлеваем lock
      WHEN pin_login_attempts.first_attempt_at > NOW() - v_window
           AND (pin_login_attempts.attempts + 1) >= v_max_attempts
      THEN GREATEST(
        COALESCE(pin_login_attempts.locked_until, 'epoch'::timestamptz), 
        NOW() + make_interval(mins => v_lock_minutes)
      )
      ELSE pin_login_attempts.locked_until
    END
  RETURNING attempts, locked_until INTO v_result;
  
  -- Log lock event if just locked
  IF v_result.locked_until IS NOT NULL AND v_result.attempts = v_max_attempts THEN
    INSERT INTO public.security_events (event_type, phone, ip_address, meta)
    VALUES ('pin_locked', p_phone, p_ip, jsonb_build_object(
      'attempts', v_result.attempts,
      'lock_duration_minutes', v_lock_minutes
    ));
  END IF;
END;
$$;

COMMENT ON FUNCTION public.increment_pin_attempt(TEXT, INET) IS 
'Инкрементирует счётчик неудачных попыток PIN. Автоматически устанавливает locked_until при достижении лимита.';

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 2) SIMPLIFIED: check_pin_rate_limit - only checks locked_until
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
  v_locked_until TIMESTAMPTZ;
BEGIN
  p_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
  
  -- Только читаем состояние блокировки (без побочных эффектов)
  SELECT locked_until INTO v_locked_until
  FROM public.pin_login_attempts
  WHERE phone = p_phone AND ip_address = p_ip;
  
  -- Если заблокирован — бросаем исключение
  IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
    RAISE EXCEPTION 'pin_rate_limited:% minutes', 
      EXTRACT(MINUTE FROM (v_locked_until - NOW()))::int + 1;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.check_pin_rate_limit(TEXT, INET) IS 
'Проверяет rate-limit для попыток ввода PIN. RAISE EXCEPTION если заблокирован.';

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 3) Grant execute to heys_rpc
-- ═══════════════════════════════════════════════════════════════════

-- По умолчанию EXECUTE есть у PUBLIC — это нам не подходит
REVOKE ALL ON FUNCTION public.increment_pin_attempt(TEXT, INET) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_pin_rate_limit(TEXT, INET) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.increment_pin_attempt(TEXT, INET) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.check_pin_rate_limit(TEXT, INET) TO heys_rpc;

-- ═══════════════════════════════════════════════════════════════════
-- ✅ Verification queries (run manually after migration)
-- ═══════════════════════════════════════════════════════════════════
/*
-- Clean test data
DELETE FROM pin_login_attempts WHERE phone = '1111111111';
DELETE FROM security_events WHERE phone = '1111111111';

-- Test 1: 5 failed attempts should set locked_until
SELECT increment_pin_attempt('1111111111', '1.1.1.1'::inet);
SELECT increment_pin_attempt('1111111111', '1.1.1.1'::inet);
SELECT increment_pin_attempt('1111111111', '1.1.1.1'::inet);
SELECT increment_pin_attempt('1111111111', '1.1.1.1'::inet);
SELECT increment_pin_attempt('1111111111', '1.1.1.1'::inet);

-- Should show attempts=5, locked_until NOT NULL
SELECT phone, attempts, locked_until FROM pin_login_attempts WHERE phone = '1111111111';

-- Test 2: 6th attempt should be blocked by check_pin_rate_limit
SELECT check_pin_rate_limit('1111111111', '1.1.1.1'::inet);
-- Expected: ERROR: pin_rate_limited:15 minutes

-- Cleanup
DELETE FROM pin_login_attempts WHERE phone = '1111111111';
DELETE FROM security_events WHERE phone = '1111111111';
*/
