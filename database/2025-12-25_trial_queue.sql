-- ═══════════════════════════════════════════════════════════════════
-- 🎫 Trial Queue System Migration (Yandex Cloud PostgreSQL)
-- ═══════════════════════════════════════════════════════════════════
-- Версия: 1.0.0
-- Дата: 2025-12-25
-- Автор: HEYS Team
-- 
-- Система умной очереди на бесплатный триал:
-- - Ограничение нагрузки на куратора (max_active_trials)
-- - Честная очередь FIFO с приоритетами
-- - Offer window 2 часа на подтверждение
-- - Покупка всегда без очереди (bypass)
-- 
-- Зависимости:
-- - public.clients (таблица клиентов)
-- - public.client_sessions (сессии PIN-auth)
-- - public.subscriptions (подписки)
-- - pgcrypto extension (для sha256)
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- 📦 1) Таблица trial_queue — очередь на триал
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.trial_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Клиент (одна актуальная запись на клиента)
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  
  -- Назначенный куратор (опционально, для v2 с шардированием)
  curator_id uuid,
  
  -- Статус записи в очереди
  status text NOT NULL DEFAULT 'queued' 
    CHECK (status IN ('queued', 'offer', 'assigned', 'canceled', 'canceled_by_purchase', 'expired')),
  
  -- Timestamps
  queued_at timestamptz NOT NULL DEFAULT now(),      -- Время постановки в очередь
  offer_sent_at timestamptz,                         -- Время отправки offer
  offer_expires_at timestamptz,                      -- Дедлайн на claim
  assigned_at timestamptz,                           -- Время старта триала
  canceled_at timestamptz,                           -- Время отмены
  
  -- Meta
  source text,                                       -- landing / app / referral / utm_*
  priority int DEFAULT 0,                            -- Приоритет (referral, депозит)
  notification_channel text DEFAULT 'telegram',      -- Канал уведомлений
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- ⚠️ Одна актуальная запись на клиента (история в trial_queue_events)
  CONSTRAINT trial_queue_client_id_unique UNIQUE (client_id)
);

-- Индексы для эффективных запросов
CREATE INDEX IF NOT EXISTS idx_trial_queue_status_queued 
  ON public.trial_queue(priority DESC, queued_at ASC) 
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_trial_queue_status_offer 
  ON public.trial_queue(offer_expires_at) 
  WHERE status = 'offer';

CREATE INDEX IF NOT EXISTS idx_trial_queue_client_id 
  ON public.trial_queue(client_id);

COMMENT ON TABLE public.trial_queue IS 'Очередь на бесплатный триал с лимитом нагрузки куратора';

-- Триггер updated_at
DROP TRIGGER IF EXISTS trg_trial_queue_updated_at ON public.trial_queue;
CREATE TRIGGER trg_trial_queue_updated_at
BEFORE UPDATE ON public.trial_queue
FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();


-- ═══════════════════════════════════════════════════════════════════
-- 📦 2) Таблица curator_trial_limits — лимиты куратора
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.curator_trial_limits (
  -- Для MVP: один глобальный лимит (curator_id = NULL означает "глобально")
  -- Для v2: per-curator лимиты
  curator_id uuid PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  
  -- Максимум активных триалов одновременно
  max_active_trials int NOT NULL DEFAULT 3,
  
  -- Пауза приёма новых триалов
  is_accepting_trials boolean DEFAULT true,
  
  -- Настройки offer window
  offer_window_minutes int DEFAULT 120,              -- 2 часа по умолчанию
  trial_days int DEFAULT 7,                          -- Длительность триала
  
  -- Timestamps
  updated_at timestamptz DEFAULT now()
);

-- Вставляем дефолтный глобальный лимит
INSERT INTO public.curator_trial_limits (curator_id, max_active_trials, is_accepting_trials)
VALUES ('00000000-0000-0000-0000-000000000000'::uuid, 3, true)
ON CONFLICT (curator_id) DO NOTHING;

COMMENT ON TABLE public.curator_trial_limits IS 'Лимиты триалов на куратора (MVP: глобальный лимит)';


-- ═══════════════════════════════════════════════════════════════════
-- 📦 3) Таблица trial_queue_events — аналитика и история
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.trial_queue_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  
  -- Тип события
  event_type text NOT NULL 
    CHECK (event_type IN ('queued', 'offer_sent', 'claimed', 'offer_expired', 'canceled', 'canceled_by_purchase', 'purchased')),
  
  -- Дополнительные данные (позиция, причина и т.д.)
  meta jsonb,
  
  -- Timestamps
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trial_queue_events_client 
  ON public.trial_queue_events(client_id);

CREATE INDEX IF NOT EXISTS idx_trial_queue_events_type 
  ON public.trial_queue_events(event_type, created_at);

COMMENT ON TABLE public.trial_queue_events IS 'История событий очереди триалов для аналитики';


-- ═══════════════════════════════════════════════════════════════════
-- 🔧 4) Функция: get_public_trial_capacity()
-- Публичный виджет для лендинга (без auth)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_public_trial_capacity()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limits RECORD;
  v_used_slots int;
  v_queue_size int;
  v_available int;
BEGIN
  -- Получаем лимиты (MVP: глобальный)
  SELECT 
    COALESCE(max_active_trials, 3) as max_active_trials,
    COALESCE(is_accepting_trials, true) as is_accepting_trials,
    COALESCE(offer_window_minutes, 120) as offer_window_minutes,
    COALESCE(trial_days, 7) as trial_days
  INTO v_limits
  FROM public.curator_trial_limits
  WHERE curator_id = '00000000-0000-0000-0000-000000000000'::uuid;
  
  -- Если нет записи лимитов — дефолты
  IF v_limits IS NULL THEN
    v_limits := ROW(3, true, 120, 7);
  END IF;
  
  -- Считаем занятые слоты (активные триалы)
  SELECT COUNT(*) INTO v_used_slots
  FROM public.subscriptions s
  WHERE s.trial_started_at IS NOT NULL
    AND s.trial_ends_at > now()
    AND s.canceled_at IS NULL;
  
  -- Считаем размер очереди
  SELECT COUNT(*) INTO v_queue_size
  FROM public.trial_queue
  WHERE status = 'queued';
  
  -- Вычисляем доступные слоты
  v_available := GREATEST(0, v_limits.max_active_trials - v_used_slots);
  
  RETURN jsonb_build_object(
    'available_slots', v_available,
    'total_slots', v_limits.max_active_trials,
    'queue_size', v_queue_size,
    'is_accepting', v_limits.is_accepting_trials AND (v_available > 0 OR v_limits.is_accepting_trials),
    'offer_window_minutes', v_limits.offer_window_minutes,
    'trial_days', v_limits.trial_days
  );
END;
$$;

COMMENT ON FUNCTION public.get_public_trial_capacity() IS 'Публичный виджет мест на лендинге';


-- ═══════════════════════════════════════════════════════════════════
-- 🔧 5) Функция: request_trial(session_token, source)
-- Запрос триала: offer сразу или постановка в очередь
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.request_trial(
  p_session_token text,
  p_source text DEFAULT 'app'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
  v_subscription RECORD;
  v_existing RECORD;
  v_capacity jsonb;
  v_free_slots int;
  v_position int;
  v_offer_window interval;
  v_offer_expires timestamptz;
BEGIN
  -- ⚠️ Advisory lock для защиты от гонок
  PERFORM pg_advisory_xact_lock(hashtext('trial_capacity'));
  
  -- Получить client_id из сессии
  SELECT cs.client_id INTO v_client_id
  FROM public.client_sessions cs
  WHERE cs.token_hash = sha256(p_session_token::bytea)
    AND cs.expires_at > now()
    AND cs.revoked_at IS NULL;
  
  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_session');
  END IF;
  
  -- Проверить: уже был/есть триал?
  SELECT * INTO v_subscription 
  FROM public.subscriptions 
  WHERE client_id = v_client_id;
  
  IF v_subscription IS NOT NULL AND v_subscription.trial_started_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'trial_already_used',
      'message', 'Вы уже использовали бесплатный триал.'
    );
  END IF;
  
  -- Проверить: активная подписка?
  IF v_subscription IS NOT NULL AND v_subscription.active_until > now() THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'already_subscribed',
      'message', 'У вас уже есть активная подписка.'
    );
  END IF;
  
  -- Проверить существующую запись в очереди
  SELECT * INTO v_existing 
  FROM public.trial_queue 
  WHERE client_id = v_client_id;
  
  -- Обработка просроченного offer: переводим в expired
  IF v_existing IS NOT NULL 
     AND v_existing.status = 'offer' 
     AND v_existing.offer_expires_at IS NOT NULL 
     AND v_existing.offer_expires_at < now() 
  THEN
    UPDATE public.trial_queue
    SET status = 'expired', updated_at = now()
    WHERE client_id = v_client_id;
    
    INSERT INTO public.trial_queue_events (client_id, event_type, meta)
    VALUES (v_client_id, 'offer_expired', jsonb_build_object('expired_at', v_existing.offer_expires_at));
    
    -- Сбрасываем existing чтобы разрешить новую попытку
    v_existing := NULL;
  END IF;
  
  -- Если уже в очереди или есть активный offer — возвращаем статус (не обновляем queued_at!)
  IF v_existing IS NOT NULL AND v_existing.status IN ('queued', 'offer') THEN
    RETURN public.get_trial_queue_status(p_session_token);
  END IF;
  
  -- Получаем capacity и offer window
  v_capacity := public.get_public_trial_capacity();
  v_free_slots := (v_capacity->>'available_slots')::int;
  v_offer_window := ((v_capacity->>'offer_window_minutes')::int || ' minutes')::interval;
  v_offer_expires := now() + v_offer_window;
  
  IF v_free_slots > 0 THEN
    -- Есть слоты: выдаём offer сразу
    INSERT INTO public.trial_queue (
      client_id, status, queued_at, offer_sent_at, offer_expires_at, source
    )
    VALUES (
      v_client_id, 'offer', now(), now(), v_offer_expires, p_source
    )
    ON CONFLICT (client_id) DO UPDATE SET
      status = 'offer',
      offer_sent_at = now(),
      offer_expires_at = v_offer_expires,
      source = COALESCE(p_source, trial_queue.source),
      updated_at = now();
    
    INSERT INTO public.trial_queue_events (client_id, event_type, meta)
    VALUES (v_client_id, 'offer_sent', jsonb_build_object('source', p_source, 'expires_at', v_offer_expires));
    
    RETURN jsonb_build_object(
      'success', true,
      'status', 'offer',
      'offer_expires_at', v_offer_expires,
      'offer_window_minutes', (v_capacity->>'offer_window_minutes')::int,
      'trial_days', (v_capacity->>'trial_days')::int,
      'message', 'Место доступно! Подтвердите триал.'
    );
  ELSE
    -- Нет слотов: ставим в очередь
    INSERT INTO public.trial_queue (
      client_id, status, queued_at, source
    )
    VALUES (
      v_client_id, 'queued', now(), p_source
    )
    ON CONFLICT (client_id) DO UPDATE SET
      status = 'queued',
      queued_at = CASE 
        -- Не обновляем queued_at если уже был в очереди (антиабьюз)
        WHEN trial_queue.status IN ('queued', 'offer') THEN trial_queue.queued_at
        ELSE now()
      END,
      source = COALESCE(p_source, trial_queue.source),
      updated_at = now();
    
    -- Вычисляем позицию (1-based)
    SELECT COUNT(*) + 1 INTO v_position
    FROM public.trial_queue tq
    WHERE tq.status = 'queued'
      AND (
        tq.priority > 0  -- Более высокий приоритет
        OR (tq.priority = 0 AND tq.queued_at < (SELECT queued_at FROM public.trial_queue WHERE client_id = v_client_id))
      );
    
    INSERT INTO public.trial_queue_events (client_id, event_type, meta)
    VALUES (v_client_id, 'queued', jsonb_build_object('source', p_source, 'position', v_position));
    
    RETURN jsonb_build_object(
      'success', true,
      'status', 'queued',
      'position', v_position,
      'queue_size', (v_capacity->>'queue_size')::int + 1,
      'message', 'Вы добавлены в очередь. Мы уведомим когда освободится место.'
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.request_trial(text, text) IS 'Запрос триала: offer сразу или постановка в очередь';


-- ═══════════════════════════════════════════════════════════════════
-- 🔧 6) Функция: get_trial_queue_status(session_token)
-- Получить текущий статус в очереди
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_trial_queue_status(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
  v_queue RECORD;
  v_position int;
  v_capacity jsonb;
BEGIN
  -- Получить client_id из сессии
  SELECT cs.client_id INTO v_client_id
  FROM public.client_sessions cs
  WHERE cs.token_hash = sha256(p_session_token::bytea)
    AND cs.expires_at > now()
    AND cs.revoked_at IS NULL;
  
  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_session');
  END IF;
  
  -- Получить запись из очереди
  SELECT * INTO v_queue 
  FROM public.trial_queue 
  WHERE client_id = v_client_id;
  
  IF v_queue IS NULL THEN
    RETURN jsonb_build_object(
      'success', true, 
      'status', 'not_in_queue',
      'message', 'Вы не в очереди на триал.'
    );
  END IF;
  
  -- Вычислить позицию (только для queued)
  IF v_queue.status = 'queued' THEN
    SELECT COUNT(*) + 1 INTO v_position
    FROM public.trial_queue tq
    WHERE tq.status = 'queued'
      AND (
        tq.priority > v_queue.priority
        OR (tq.priority = v_queue.priority AND tq.queued_at < v_queue.queued_at)
      );
  END IF;
  
  -- Получаем общую информацию
  v_capacity := public.get_public_trial_capacity();
  
  RETURN jsonb_build_object(
    'success', true,
    'status', v_queue.status,
    'position', v_position,
    'queued_at', v_queue.queued_at,
    'offer_expires_at', v_queue.offer_expires_at,
    'offer_window_minutes', (v_capacity->>'offer_window_minutes')::int,
    'trial_days', (v_capacity->>'trial_days')::int,
    'queue_size', (v_capacity->>'queue_size')::int
  );
END;
$$;

COMMENT ON FUNCTION public.get_trial_queue_status(text) IS 'Получить статус в очереди на триал';


-- ═══════════════════════════════════════════════════════════════════
-- 🔧 7) Функция: claim_trial_offer(session_token)
-- Подтверждение offer и старт триала
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.claim_trial_offer(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
  v_subscription RECORD;
  v_queue RECORD;
  v_trial_days int;
  v_trial_ends timestamptz;
BEGIN
  -- Получить client_id из сессии
  SELECT cs.client_id INTO v_client_id
  FROM public.client_sessions cs
  WHERE cs.token_hash = sha256(p_session_token::bytea)
    AND cs.expires_at > now()
    AND cs.revoked_at IS NULL;
  
  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_session');
  END IF;
  
  -- Guard 1: Проверить активную подписку
  SELECT * INTO v_subscription 
  FROM public.subscriptions 
  WHERE client_id = v_client_id;
  
  IF v_subscription IS NOT NULL AND v_subscription.active_until > now() THEN
    -- Если есть подписка — закрываем очередь как canceled_by_purchase
    UPDATE public.trial_queue 
    SET status = 'canceled_by_purchase', canceled_at = now(), updated_at = now()
    WHERE client_id = v_client_id AND status IN ('queued', 'offer');
    
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'already_active',
      'message', 'У вас уже есть активная подписка.'
    );
  END IF;
  
  -- Guard 2: Триал уже стартовал (идемпотентность)
  IF v_subscription IS NOT NULL AND v_subscription.trial_started_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'already_started',
      'message', 'Триал уже активен.',
      'trial_ends_at', v_subscription.trial_ends_at
    );
  END IF;
  
  -- Получить offer из очереди
  SELECT * INTO v_queue 
  FROM public.trial_queue 
  WHERE client_id = v_client_id AND status = 'offer';
  
  IF v_queue IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'no_offer_available',
      'message', 'Нет активного предложения. Запросите триал снова.'
    );
  END IF;
  
  -- Проверить не истёк ли offer
  IF v_queue.offer_expires_at < now() THEN
    UPDATE public.trial_queue 
    SET status = 'expired', updated_at = now() 
    WHERE id = v_queue.id;
    
    INSERT INTO public.trial_queue_events (client_id, event_type, meta)
    VALUES (v_client_id, 'offer_expired', jsonb_build_object('expired_at', v_queue.offer_expires_at));
    
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'offer_expired',
      'message', 'Время истекло. Запросите триал снова.'
    );
  END IF;
  
  -- Получаем trial_days из лимитов
  SELECT COALESCE(trial_days, 7) INTO v_trial_days
  FROM public.curator_trial_limits
  WHERE curator_id = '00000000-0000-0000-0000-000000000000'::uuid;
  
  IF v_trial_days IS NULL THEN
    v_trial_days := 7;
  END IF;
  
  v_trial_ends := now() + (v_trial_days || ' days')::interval;
  
  -- Помечаем как assigned
  UPDATE public.trial_queue 
  SET status = 'assigned', assigned_at = now(), updated_at = now() 
  WHERE id = v_queue.id;
  
  -- Стартуем триал
  UPDATE public.subscriptions SET
    trial_started_at = now(),
    trial_ends_at = v_trial_ends,
    updated_at = now()
  WHERE client_id = v_client_id;
  
  -- Если subscription не существует — создаём
  IF NOT FOUND THEN
    INSERT INTO public.subscriptions (client_id, trial_started_at, trial_ends_at)
    VALUES (v_client_id, now(), v_trial_ends);
  END IF;
  
  -- Логируем событие
  INSERT INTO public.trial_queue_events (client_id, event_type, meta)
  VALUES (v_client_id, 'claimed', jsonb_build_object('trial_ends_at', v_trial_ends));
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Триал успешно начат!',
    'trial_ends_at', v_trial_ends,
    'trial_days', v_trial_days
  );
END;
$$;

COMMENT ON FUNCTION public.claim_trial_offer(text) IS 'Подтверждение offer и старт триала';


-- ═══════════════════════════════════════════════════════════════════
-- 🔧 8) Функция: cancel_trial_queue(session_token)
-- Отмена запроса на триал
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cancel_trial_queue(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
  v_queue RECORD;
BEGIN
  -- Получить client_id из сессии
  SELECT cs.client_id INTO v_client_id
  FROM public.client_sessions cs
  WHERE cs.token_hash = sha256(p_session_token::bytea)
    AND cs.expires_at > now()
    AND cs.revoked_at IS NULL;
  
  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_session');
  END IF;
  
  -- Получить запись из очереди
  SELECT * INTO v_queue 
  FROM public.trial_queue 
  WHERE client_id = v_client_id AND status IN ('queued', 'offer');
  
  IF v_queue IS NULL THEN
    RETURN jsonb_build_object(
      'success', true, 
      'message', 'Вы не в очереди на триал.'
    );
  END IF;
  
  -- Отменяем
  UPDATE public.trial_queue 
  SET status = 'canceled', canceled_at = now(), updated_at = now() 
  WHERE id = v_queue.id;
  
  INSERT INTO public.trial_queue_events (client_id, event_type, meta)
  VALUES (v_client_id, 'canceled', jsonb_build_object('previous_status', v_queue.status));
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Запрос на триал отменён.'
  );
END;
$$;

COMMENT ON FUNCTION public.cancel_trial_queue(text) IS 'Отмена запроса на триал';


-- ═══════════════════════════════════════════════════════════════════
-- 🔧 9) Функция: assign_trials_from_queue(limit)
-- Воркер: раздача offers из очереди при освобождении слотов
-- Вызывается cron каждые 5-10 минут
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.assign_trials_from_queue(p_limit int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigned int := 0;
  v_expired int := 0;
  v_queue_row RECORD;
  v_capacity jsonb;
  v_available int;
  v_offer_window interval;
  v_offer_expires timestamptz;
BEGIN
  -- ⚠️ Advisory lock для защиты от гонок
  PERFORM pg_advisory_xact_lock(hashtext('trial_capacity'));
  
  -- Сначала: expired offers → пометить expired
  UPDATE public.trial_queue 
  SET status = 'expired', updated_at = now()
  WHERE status = 'offer' AND offer_expires_at < now()
  RETURNING 1 INTO v_expired;
  
  GET DIAGNOSTICS v_expired = ROW_COUNT;
  
  -- Логируем expired events
  INSERT INTO public.trial_queue_events (client_id, event_type, meta)
  SELECT client_id, 'offer_expired', jsonb_build_object('expired_at', offer_expires_at)
  FROM public.trial_queue
  WHERE status = 'expired' AND updated_at >= now() - interval '1 minute';
  
  -- Проверить доступные слоты
  v_capacity := public.get_public_trial_capacity();
  v_available := (v_capacity->>'available_slots')::int;
  
  IF v_available <= 0 THEN
    RETURN jsonb_build_object(
      'assigned', 0, 
      'expired', v_expired,
      'reason', 'no_slots_available'
    );
  END IF;
  
  -- Получаем offer window
  v_offer_window := ((v_capacity->>'offer_window_minutes')::int || ' minutes')::interval;
  v_offer_expires := now() + v_offer_window;
  
  -- Раздаём offers первым в очереди
  -- ⚠️ Фильтруем тех, кто уже купил или получил триал!
  FOR v_queue_row IN
    SELECT tq.*
    FROM public.trial_queue tq
    JOIN public.subscriptions s ON s.client_id = tq.client_id
    WHERE tq.status = 'queued'
      AND (s.active_until IS NULL OR s.active_until < now())  -- Нет активной подписки
      AND s.trial_started_at IS NULL                          -- Триал ещё не начинался
    ORDER BY tq.priority DESC, tq.queued_at ASC
    LIMIT LEAST(p_limit, v_available)
  LOOP
    UPDATE public.trial_queue SET
      status = 'offer',
      offer_sent_at = now(),
      offer_expires_at = v_offer_expires,
      updated_at = now()
    WHERE id = v_queue_row.id;
    
    INSERT INTO public.trial_queue_events (client_id, event_type, meta)
    VALUES (v_queue_row.client_id, 'offer_sent', jsonb_build_object(
      'expires_at', v_offer_expires,
      'from_assigner', true
    ));
    
    v_assigned := v_assigned + 1;
    
    -- TODO: Отправить Telegram уведомление
    -- PERFORM public.send_trial_offer_notification(v_queue_row.client_id);
  END LOOP;
  
  RETURN jsonb_build_object(
    'assigned', v_assigned,
    'expired', v_expired,
    'available_after', v_available - v_assigned
  );
END;
$$;

COMMENT ON FUNCTION public.assign_trials_from_queue(int) IS 'Воркер: раздача offers из очереди';


-- ═══════════════════════════════════════════════════════════════════
-- 🔧 10) Функция: cancel_trial_queue_on_purchase(client_id)
-- Снятие из очереди при покупке (вызывается при оплате)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cancel_trial_queue_on_purchase(p_client_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.trial_queue 
  SET status = 'canceled_by_purchase', canceled_at = now(), updated_at = now()
  WHERE client_id = p_client_id AND status IN ('queued', 'offer');
  
  INSERT INTO public.trial_queue_events (client_id, event_type, meta)
  VALUES (p_client_id, 'canceled_by_purchase', jsonb_build_object('purchased_at', now()));
END;
$$;

COMMENT ON FUNCTION public.cancel_trial_queue_on_purchase(uuid) IS 'Снятие из очереди при покупке подписки';


-- ═══════════════════════════════════════════════════════════════════
-- 🔧 11) Триггер: автоснятие из очереди при активации подписки
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trigger_cancel_trial_queue_on_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Если подписка стала активной (active_until в будущем)
  IF NEW.active_until IS NOT NULL AND NEW.active_until > now() THEN
    -- Снимаем из очереди
    PERFORM public.cancel_trial_queue_on_purchase(NEW.client_id);
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscriptions_cancel_trial_queue ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_cancel_trial_queue
AFTER UPDATE ON public.subscriptions
FOR EACH ROW
WHEN (OLD.active_until IS DISTINCT FROM NEW.active_until)
EXECUTE FUNCTION public.trigger_cancel_trial_queue_on_subscription();


-- ═══════════════════════════════════════════════════════════════════
-- ✅ COMMIT
-- ═══════════════════════════════════════════════════════════════════

COMMIT;

-- ═══════════════════════════════════════════════════════════════════
-- 📋 Тестирование (после применения миграции)
-- ═══════════════════════════════════════════════════════════════════
/*

-- 1. Проверить публичный виджет:
SELECT public.get_public_trial_capacity();

-- 2. Проверить лимиты:
SELECT * FROM public.curator_trial_limits;

-- 3. Тест request_trial (требует session_token):
-- SELECT public.request_trial('your_session_token', 'test');

-- 4. Тест assign (воркер):
-- SELECT public.assign_trials_from_queue(5);

*/
