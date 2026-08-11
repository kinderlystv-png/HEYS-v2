-- HEYS: ограничитель PIN-входа возвращается к номеру клиента
--
-- Что случилось. В `verify_client_pin_v2` счётчик неудач жил на записи клиента
-- (`clients.pin_failed_attempts` + `pin_locked_until`): пять промахов — пауза,
-- смена адреса не помогала. В `verify_client_pin_v3` его заменили на пару
-- (телефон, IP) через `check_pin_rate_limit` / `increment_pin_attempt`, и в
-- коде это помечено как усиление: «🔐 P1: С rate-limit по IP!».
--
-- Замена оказалась потерей. IP берётся из заголовка `X-Forwarded-For`, который
-- присылает сам клиент: 2026-08-11 это подтверждено экспериментом на живом
-- `/leads` — сервер записал ровно тот адрес, что был в заголовке. Значит новый
-- заголовок на каждом запросе = новая строка счётчика, блокировка не наступает
-- никогда, а четырёхзначный PIN к незасекреченному номеру перебирается без
-- ограничений. Вход по PIN отключён 2026-08-11 до этой правки.
--
-- Что здесь. Счётчик по клиенту возвращается из v2, и к нему добавлено то,
-- чего в v2 не было: нарастающая пауза и заморозка после трёх блокировок
-- подряд. IP остаётся, но только как вспомогательный признак в журнале
-- безопасности — ключом он быть не может: у мобильного оператора адрес
-- меняется легально, так что и в честном виде он не годится.

BEGIN;

CREATE OR REPLACE FUNCTION public.verify_client_pin_v3(
  p_phone TEXT,
  p_pin TEXT,
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
  v_token TEXT;
  v_session_id UUID;
BEGIN
  v_phone_normalized := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');

  SELECT * INTO v_client
    FROM public.clients
   WHERE regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = v_phone_normalized
     AND pin_hash IS NOT NULL
   ORDER BY created_at DESC
   LIMIT 1
     FOR UPDATE;
  v_found := FOUND;

  -- Блокировка проверяется до сверки кода и живёт на клиенте, а не на паре с
  -- адресом: сменить номер атакующий не может, сменить заголовок — может.
  IF v_found AND v_client.pin_locked_until IS NOT NULL AND v_client.pin_locked_until > now() THEN
    PERFORM public.log_security_event(
      'pin_locked', v_phone_normalized, v_client.id, p_ip, p_user_agent,
      jsonb_build_object('locked_until', v_client.pin_locked_until)
    );
    -- Текст говорит, что делать, а не «попробуйте позже»: заморозку снимает
    -- куратор новым одноразовым кодом, и человек не должен решить, что сломался
    -- сервис. Особенно на сутках блокировки — в выходной ждать до утра иначе
    -- выглядит как отказ входа.
    RETURN jsonb_build_object(
      'success', false, 'error', 'pin_rate_limited',
      'locked_until', v_client.pin_locked_until,
      'message', 'Слишком много попыток входа. Напишите куратору — он выдаст новый код для входа.'
    );
  END IF;

  IF v_found THEN
    v_correct := (v_client.pin_hash = crypt(p_pin, v_client.pin_hash));
  END IF;

  IF NOT v_found OR NOT v_correct THEN
    IF v_found THEN
      v_attempts := COALESCE(v_client.pin_failed_attempts, 0) + 1;
      -- Нарастающая пауза: 5 промахов — 15 минут, 10 — час, 15 — сутки.
      -- Заморозка на сутки и есть «три блокировки подряд»: дальше вход
      -- открывает куратор, выдав новый одноразовый код.
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

    -- IP и user-agent остаются в журнале: как признак они полезны для разбора
    -- инцидента, как ключ блокировки — нет.
    PERFORM public.log_security_event(
      'pin_failed', v_phone_normalized,
      CASE WHEN v_found THEN v_client.id ELSE NULL END,
      p_ip, p_user_agent,
      jsonb_build_object('reason', 'invalid_credentials', 'client_exists', v_found,
                         'attempts', COALESCE(v_attempts, 0))
    );
    RETURN jsonb_build_object('success', false, 'error', 'invalid_credentials');
  END IF;

  UPDATE public.clients
     SET pin_failed_attempts = 0, pin_locked_until = NULL
   WHERE id = v_client.id;

  v_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.client_sessions (token_hash, client_id, expires_at, user_agent, ip_address)
  VALUES (encode(digest(v_token, 'sha256'), 'hex'), v_client.id, now() + interval '30 days',
          LEFT(p_user_agent, 500),
          CASE WHEN NULLIF(BTRIM(COALESCE(p_ip, '')), '') IS NOT NULL THEN p_ip::inet ELSE NULL END)
  RETURNING id INTO v_session_id;

  PERFORM public.log_security_event(
    'pin_success', v_phone_normalized, v_client.id, p_ip, p_user_agent,
    jsonb_build_object('session_id', v_session_id)
  );

  RETURN jsonb_build_object(
    'success', true, 'client_id', v_client.id, 'session_token', v_token,
    'expires_at', (now() + interval '30 days')
  );
END;
$$;

COMMIT;

-- Проверка после применения: пять неудач по одному номеру с РАЗНЫХ адресов
-- обязаны привести к блокировке. Ровно это же проверяет автотест
-- TESTS/db/pin-lockout.test.mjs — без него правку легко потерять снова.
