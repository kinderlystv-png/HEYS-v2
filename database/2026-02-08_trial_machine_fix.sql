-- ═══════════════════════════════════════════════════════════════════════════════════
-- 🔧 FIX: Trial Machine — разделение одобрения и старта таймера
-- Дата: 2026-02-08
-- 
-- Проблема:
--   admin_activate_trial сразу ставил trial_ends_at = NOW() + 7 дней,
--   но по бизнес-логике таймер должен стартовать при ПЕРВОМ логине клиента.
--
-- Корректный флоу:
--   1. Клиент оставляет заявку на лендинге → request_trial() → pending
--   2. Куратор проверяет → admin_activate_trial() → trial_approved (таймер НЕ стартует)
--   3. Куратор создаёт аккаунт (phone + PIN) и даёт клиенту доступ
--   4. Клиент логинится → activate_trial_timer_by_session() → trial (7 дней)
--   5. 7 дней истекли → read_only → paywall
--
-- Изменения:
--   1. Новая колонка: subscriptions.trial_approved_at
--   2. admin_activate_trial: ставит trial_approved_at, НЕ ставит trial_started_at
--   3. Новая функция: activate_trial_timer_by_session — стартует 7 дней
--   4. Обновлён get_effective_subscription_status — учитывает trial_pending
-- ═══════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 1. Добавляем колонку trial_approved_at
-- ═══════════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS trial_approved_at timestamptz;

COMMENT ON COLUMN public.subscriptions.trial_approved_at
  IS 'Момент одобрения триала куратором. Таймер 7 дней начнётся при первом логине.';

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 2. ОБНОВЛЁННАЯ admin_activate_trial
--    Теперь НЕ ставит trial_started_at/trial_ends_at — только одобряет.
--    Таймер стартует при первом логине через activate_trial_timer_by_session.
-- ═══════════════════════════════════════════════════════════════════════════════════

-- Удаляем старые версии функций, если сигнатура отличается (чтобы избежать ошибки return type)
DROP FUNCTION IF EXISTS public.admin_activate_trial(UUID, INT);
DROP FUNCTION IF EXISTS public.admin_activate_trial(UUID, INT, TEXT);

CREATE OR REPLACE FUNCTION admin_activate_trial(
  p_queue_id UUID,
  p_trial_days INT DEFAULT 7,
  p_curator_session_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_curator_id UUID;
  v_queue_record RECORD;
BEGIN
  -- 1. Проверка куратора (опционально)
  IF p_curator_session_token IS NOT NULL THEN
    SELECT user_id INTO v_curator_id
    FROM curator_sessions 
    WHERE token_hash = digest(p_curator_session_token, 'sha256')
      AND expires_at > NOW();
    
    IF v_curator_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', 'unauthorized',
        'message', 'Неверная сессия куратора'
      );
    END IF;
  END IF;
  
  -- 2. Получаем запись из очереди
  SELECT 
    tq.id,
    tq.client_id,
    tq.status,
    c.name as client_name
  INTO v_queue_record
  FROM trial_queue tq
  JOIN clients c ON c.id = tq.client_id
  WHERE tq.id = p_queue_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'not_found',
      'message', 'Заявка не найдена'
    );
  END IF;
  
  IF v_queue_record.status != 'queued' THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'invalid_status',
      'current_status', v_queue_record.status,
      'message', 'Можно активировать только заявки со статусом queued'
    );
  END IF;
  
  -- 3. Ставим статус trial_pending в clients (одобрено, но таймер не запущен)
  UPDATE clients
  SET 
    subscription_status = 'trial_pending'
  WHERE id = v_queue_record.client_id;
  
  -- 4. UPSERT в subscriptions — ставим trial_approved_at, БЕЗ trial_started_at/trial_ends_at
  INSERT INTO subscriptions (client_id, trial_approved_at)
  VALUES (v_queue_record.client_id, NOW())
  ON CONFLICT (client_id) DO UPDATE SET
    trial_approved_at = NOW();
  
  -- 5. Обновляем запись в очереди
  UPDATE trial_queue
  SET 
    status = 'assigned',
    assigned_at = NOW()
  WHERE id = p_queue_id;
  
  -- 6. Логируем событие
  INSERT INTO trial_queue_events (client_id, event_type, meta)
  VALUES (v_queue_record.client_id, 'claimed', jsonb_build_object(
    'approved_by', COALESCE(v_curator_id::text, 'admin'),
    'trial_days', p_trial_days,
    'note', 'Timer starts on first client login'
  ));
  
  -- 7. Возвращаем результат
  RETURN jsonb_build_object(
    'success', true,
    'client_id', v_queue_record.client_id,
    'client_name', v_queue_record.client_name,
    'trial_days', p_trial_days,
    'note', 'Таймер 7 дней стартует при первом логине клиента'
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 3. НОВАЯ ФУНКЦИЯ: activate_trial_timer_by_session
--    Вызывается клиентом при первом логине. Стартует 7-дневный таймер.
--    Идемпотентна: если таймер уже запущен — ничего не делает.
-- ═══════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.activate_trial_timer_by_session(
  p_session_token TEXT,
  p_trial_days INT DEFAULT 7
)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  trial_ends_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_subscription RECORD;
  v_trial_end TIMESTAMPTZ;
BEGIN
  -- 1. Валидируем сессию
  v_client_id := public.require_client_id(p_session_token);
  
  -- 2. Получаем подписку
  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE client_id = v_client_id;
  
  -- Нет записи — нельзя активировать
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'no_subscription_record'::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;
  
  -- Таймер уже запущен — идемпотентно
  IF v_subscription.trial_started_at IS NOT NULL THEN
    RETURN QUERY SELECT true, 'timer_already_started'::TEXT, v_subscription.trial_ends_at;
    RETURN;
  END IF;
  
  -- Уже есть активная подписка
  IF v_subscription.active_until IS NOT NULL AND v_subscription.active_until > NOW() THEN
    RETURN QUERY SELECT true, 'already_active'::TEXT, v_subscription.active_until;
    RETURN;
  END IF;
  
  -- Триал не одобрен куратором
  IF v_subscription.trial_approved_at IS NULL THEN
    RETURN QUERY SELECT false, 'trial_not_approved'::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;
  
  -- 3. Стартуем таймер!
  v_trial_end := NOW() + (p_trial_days || ' days')::INTERVAL;
  
  UPDATE public.subscriptions
  SET trial_started_at = NOW(),
      trial_ends_at = v_trial_end
  WHERE client_id = v_client_id;
  
  -- Обновляем clients для обратной совместимости
  UPDATE public.clients
  SET subscription_status = 'trial',
      trial_started_at = NOW(),
      trial_ends_at = v_trial_end
  WHERE id = v_client_id;
  
  RETURN QUERY SELECT true, 'trial_timer_started'::TEXT, v_trial_end;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 4. ОБНОВЛЁННЫЙ get_effective_subscription_status
--    Теперь учитывает trial_pending (одобрен, но таймер не запущен)
-- ═══════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_effective_subscription_status(p_client_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT
    CASE
      -- Платная подписка — приоритет
      WHEN s.active_until IS NOT NULL AND s.active_until > NOW() THEN 'active'
      -- Триал запущен и не истёк
      WHEN s.trial_ends_at IS NOT NULL AND s.trial_ends_at > NOW() THEN 'trial'
      -- Триал одобрен, но таймер ещё не стартовал (ждём первый логин)
      WHEN s.trial_approved_at IS NOT NULL AND s.trial_started_at IS NULL THEN 'trial_pending'
      -- Триал/подписка истекли → read_only
      WHEN s.trial_started_at IS NOT NULL OR s.active_until IS NOT NULL OR s.canceled_at IS NOT NULL THEN 'read_only'
      ELSE 'none'
    END
  FROM public.subscriptions s
  WHERE s.client_id = p_client_id;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════
-- Удаляем, так как изменился возвращаемый тип (добавили trial_approved_at)
DROP FUNCTION IF EXISTS public.get_subscription_status_by_session(TEXT);

-- 5. ОБНОВЛЁННЫЙ get_subscription_status_by_session
--    Возвращает trial_approved_at для фронтенда
-- ═══════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_subscription_status_by_session(p_session_token TEXT)
RETURNS TABLE(
  client_id UUID,
  status TEXT,
  trial_approved_at TIMESTAMPTZ,
  trial_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  active_until TIMESTAMPTZ,
  days_left INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
BEGIN
  v_client_id := public.require_client_id(p_session_token);
  
  RETURN QUERY
  SELECT 
    s.client_id,
    public.get_effective_subscription_status(s.client_id) AS status,
    s.trial_approved_at,
    s.trial_started_at,
    s.trial_ends_at,
    s.active_until,
    CASE
      WHEN s.active_until IS NOT NULL AND s.active_until > NOW() 
        THEN EXTRACT(DAY FROM (s.active_until - NOW()))::INT
      WHEN s.trial_ends_at IS NOT NULL AND s.trial_ends_at > NOW()
        THEN EXTRACT(DAY FROM (s.trial_ends_at - NOW()))::INT
      ELSE 0
    END AS days_left
  FROM public.subscriptions s
  WHERE s.client_id = v_client_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 6. ОБНОВЛЁННЫЙ subscription_can_write
--    trial_pending разрешает запись (куратор одобрил, ждём старт таймера)
-- ═══════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.subscription_can_write(p_client_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT
      CASE public.get_effective_subscription_status(p_client_id)
        WHEN 'active' THEN true
        WHEN 'trial' THEN true
        WHEN 'trial_pending' THEN true
        ELSE false
      END
    ),
    false
  );
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 7. МИГРАЦИЯ: Фикс существующих клиентов
--    Клиенты у которых уже есть trial_started_at — заполняем trial_approved_at
-- ═══════════════════════════════════════════════════════════════════════════════════

UPDATE public.subscriptions
SET trial_approved_at = trial_started_at
WHERE trial_started_at IS NOT NULL
  AND trial_approved_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 8. GRANTs
-- ═══════════════════════════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION admin_activate_trial(UUID, INT, TEXT) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.activate_trial_timer_by_session(TEXT, INT) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.get_effective_subscription_status(UUID) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.get_subscription_status_by_session(TEXT) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.subscription_can_write(UUID) TO heys_rpc;

COMMIT;

DO $$
BEGIN
  RAISE NOTICE '✅ Trial Machine Fix миграция применена';
  RAISE NOTICE '  - subscriptions.trial_approved_at: новая колонка';
  RAISE NOTICE '  - admin_activate_trial: только одобряет (без таймера)';
  RAISE NOTICE '  - activate_trial_timer_by_session: стартует 7 дней при первом логине';
  RAISE NOTICE '  - get_effective_subscription_status: учитывает trial_pending';
  RAISE NOTICE '  - subscription_can_write: trial_pending разрешает запись';
END $$;
