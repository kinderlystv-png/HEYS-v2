-- =============================================================================
-- FIX: get_public_trial_capacity() должна учитывать active offers
-- =============================================================================
-- Проблема: Функция считала occupied slots только по subscriptions (active trials),
--           но НЕ учитывала клиентов со статусом 'offer' в trial_queue.
--           Это позволяло выдать несколько offer при лимите 1 слот.
--
-- Решение: occupied = active_trials UNION active_offers
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_public_trial_capacity()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- ==========================================================================
  -- FIX: occupied = active trials + active offers
  -- ==========================================================================
  SELECT COUNT(*) INTO v_used_slots
  FROM (
    -- Активные триалы (subscriptions)
    SELECT s.client_id
    FROM public.subscriptions s
    WHERE s.trial_started_at IS NOT NULL
      AND s.trial_ends_at > NOW()
      AND s.canceled_at IS NULL

    UNION

    -- Активные offers (резервируют слот)
    SELECT q.client_id
    FROM public.trial_queue q
    WHERE q.status = 'offer'
      AND q.offer_expires_at IS NOT NULL
      AND q.offer_expires_at > NOW()
  ) occupied;

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
$function$;

-- Комментарий для документации
COMMENT ON FUNCTION public.get_public_trial_capacity() IS 
'Returns trial capacity info. occupied_slots = active_trials + active_offers (v2, 2025-12-25)';
