\set ON_ERROR_STOP on
-- =============================================================================
-- HEYS Trial Queue — SQL Smoke Test v3.2 (strict/non-strict restore)
-- =============================================================================
-- ВАЖНО: 
--   • Выполнять на staging или на тест-клиентах!
--   • По умолчанию режим ROLLBACK (безопасный, strict restore check)
--   • Для end-to-end: psql -v commit_mode=1 (COMMIT, non-strict из-за шума)
-- =============================================================================
-- Скрипт меняет: trial_queue, subscriptions, curator_trial_limits
-- =============================================================================

-- =============================================================================
-- 🛡️ EARLY TOKEN VALIDATION (fail fast)
-- =============================================================================
\if :{?token_a}
  \echo 'Using token_a from command line'
\else
  \echo ''
  \echo 'FAIL: token_a not provided. Use:'
  \echo '  psql -v token_a=xxx -v token_b=yyy -f smoke_test_trial_queue.sql'
  \echo ''
  \quit 1
\endif

\if :{?token_b}
  \echo 'Using token_b from command line'
\else
  \echo ''
  \echo 'FAIL: token_b not provided. Use:'
  \echo '  psql -v token_a=xxx -v token_b=yyy -f smoke_test_trial_queue.sql'
  \echo ''
  \quit 1
\endif

-- 🔧 Сохраняем исходные значения для cleanup
\set original_max_trials 3

-- =============================================================================
-- 🚀 НАЧАЛО ТРАНЗАКЦИИ
-- =============================================================================
BEGIN;

-- � Make psql variables available inside DO blocks via current_setting()
SELECT set_config('token_a', :'token_a', true);
SELECT set_config('token_b', :'token_b', true);
-- 🔍 SANITY CHECK 1: Verify tokens are accessible via current_setting()
\echo ''
\echo 'Sanity check: tokens accessible via current_setting()...'
SELECT current_setting('token_a', true) AS token_a_present,
       current_setting('token_b', true) AS token_b_present;

-- 🔍 SANITY CHECK 2: Verify subscriptions table has required columns
\echo 'Sanity check: subscriptions columns exist...'
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='subscriptions'
    AND column_name IN ('trial_started_at','trial_ends_at','active_until');
  
  IF v_count != 3 THEN
    RAISE EXCEPTION 'FAIL: subscriptions missing required columns. Found % of 3', v_count;
  END IF;
  RAISE NOTICE '✅ subscriptions has all 3 trial columns';
END $$;
-- �🔧 Определяем режим строгости для restore check (внутри транзакции!)
-- ROLLBACK mode = strict (slots_restored == slots_before)
-- COMMIT mode = non-strict (slots_restored >= slots_before, допускаем шум)
-- is_local=true: флаг живёт только внутри этой транзакции
\if :{?commit_mode}
  SELECT set_config('smoke.strict_restore', 'false', true);
  \echo 'Mode: COMMIT (non-strict restore check)'
\else
  SELECT set_config('smoke.strict_restore', 'true', true);
  \echo 'Mode: ROLLBACK (strict restore check)'
\endif

-- =============================================================================
-- 📋 1) PREFLIGHT: Проверить валидность токенов + источник истины (поведенчески)
-- =============================================================================
\echo ''
\echo '╔═══════════════════════════════════════════════════════════════════════════╗'
\echo '║  1) PREFLIGHT: проверка токенов + источник истины                         ║'
\echo '╚═══════════════════════════════════════════════════════════════════════════╝'

-- Проверяем токены
DO $$
DECLARE
  v_status_a jsonb;
  v_status_b jsonb;
BEGIN
  v_status_a := public.get_trial_queue_status(current_setting('token_a'));
  v_status_b := public.get_trial_queue_status(current_setting('token_b'));
  
  IF (v_status_a->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL: Token A invalid: %', v_status_a;
  END IF;
  
  IF (v_status_b->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL: Token B invalid: %', v_status_b;
  END IF;
  
  RAISE NOTICE '✅ Token A valid';
  RAISE NOTICE '✅ Token B valid';
END $$;

-- Поведенческая проверка источника истины:
-- capacity должна реагировать на изменение trial в subscriptions
\echo 'Checking source of truth (behavioral test)...'
DO $$
DECLARE
  v_client_a uuid;
  v_slots_before int;
  v_slots_with_trial int;
  v_slots_restored int;
BEGIN
  v_client_a := public.require_client_id(current_setting('token_a'));
  
  -- 1) Сохраняем состояние A (чтобы потом вернуть)
  -- Сначала лимит 1 временно для теста
  INSERT INTO public.curator_trial_limits (curator_id, max_active_trials, is_accepting_trials)
  VALUES ('00000000-0000-0000-0000-000000000000', 1, TRUE)
  ON CONFLICT (curator_id) DO UPDATE
  SET max_active_trials = 1, is_accepting_trials = TRUE;
  
  -- 2) Очищаем A от триала
  UPDATE public.subscriptions
  SET trial_started_at = NULL, trial_ends_at = NULL, active_until = NULL
  WHERE client_id = v_client_a;
  DELETE FROM public.trial_queue WHERE client_id = v_client_a;
  
  -- 3) Получаем slots_before
  SELECT (public.get_public_trial_capacity()->>'available_slots')::int INTO v_slots_before;
  RAISE NOTICE 'slots_before (no trial): %', v_slots_before;
  
  -- 4) Форсим триал в subscriptions
  UPDATE public.subscriptions
  SET trial_started_at = NOW(),
      trial_ends_at = NOW() + INTERVAL '7 days'
  WHERE client_id = v_client_a;
  
  -- 5) Получаем slots_with_trial
  SELECT (public.get_public_trial_capacity()->>'available_slots')::int INTO v_slots_with_trial;
  RAISE NOTICE 'slots_with_trial: %', v_slots_with_trial;
  
  -- 6) Убираем триал
  UPDATE public.subscriptions
  SET trial_started_at = NULL, trial_ends_at = NULL
  WHERE client_id = v_client_a;
  
  -- 7) Проверяем восстановление
  SELECT (public.get_public_trial_capacity()->>'available_slots')::int INTO v_slots_restored;
  RAISE NOTICE 'slots_restored: %', v_slots_restored;
  
  -- ASSERT: capacity должна была уменьшиться при активном триале
  IF NOT (v_slots_with_trial < v_slots_before) THEN
    RAISE EXCEPTION 'FAIL: capacity does NOT react to trial in subscriptions! before=%, with_trial=%',
      v_slots_before, v_slots_with_trial;
  END IF;
  
  -- ASSERT: capacity должна восстановиться
  -- Режим определяется через smoke.strict_restore:
  --   true  (ROLLBACK) = strict: slots_restored == slots_before
  --   false (COMMIT)   = non-strict: slots_restored >= slots_before (допускаем шум)
  IF current_setting('smoke.strict_restore', true) = 'true' THEN
    -- STRICT MODE: точное равенство
    IF v_slots_restored != v_slots_before THEN
      RAISE EXCEPTION 'FAIL [STRICT]: slots_restored (%) != slots_before (%). No external noise expected in ROLLBACK mode.',
        v_slots_restored, v_slots_before;
    END IF;
    RAISE NOTICE '✅ Source of truth = subscriptions (STRICT restore check passed)';
  ELSE
    -- NON-STRICT MODE: допускаем внешний шум
    IF v_slots_restored < v_slots_before THEN
      RAISE EXCEPTION 'FAIL [NON-STRICT]: slots_restored (%) < slots_before (%). Capacity decreased unexpectedly.',
        v_slots_restored, v_slots_before;
    END IF;
    IF v_slots_restored > v_slots_before THEN
      RAISE WARNING 'WARN: slots_restored (%) > slots_before (%) — possible external trial ended during test',
        v_slots_restored, v_slots_before;
    END IF;
    RAISE NOTICE '✅ Source of truth = subscriptions (NON-STRICT restore check passed)';
  END IF
END $$;

-- =============================================================================
-- 📋 2) Подготовка: глобальный лимит 1 слот
-- =============================================================================
\echo ''
\echo '╔═══════════════════════════════════════════════════════════════════════════╗'
\echo '║  2) Подготовка: лимит 1 слот                                              ║'
\echo '╚═══════════════════════════════════════════════════════════════════════════╝'

INSERT INTO public.curator_trial_limits (curator_id, max_active_trials, is_accepting_trials)
VALUES ('00000000-0000-0000-0000-000000000000', 1, TRUE)
ON CONFLICT (curator_id) DO UPDATE
SET max_active_trials = 1,
    is_accepting_trials = TRUE,
    updated_at = NOW();

-- ASSERT: лимит установлен
DO $$
DECLARE
  v_limit int;
BEGIN
  SELECT max_active_trials INTO v_limit
  FROM public.curator_trial_limits 
  WHERE curator_id = '00000000-0000-0000-0000-000000000000';
  
  IF v_limit != 1 THEN
    RAISE EXCEPTION 'FAIL: Expected max_active_trials=1, got=%', v_limit;
  END IF;
  RAISE NOTICE '✅ max_active_trials = 1';
END $$;

-- =============================================================================
-- 📋 3) Очистка: убрать A и B из очереди + сбросить subscriptions
-- =============================================================================
\echo ''
\echo '╔═══════════════════════════════════════════════════════════════════════════╗'
\echo '║  3) Очистка очереди и subscriptions                                       ║'
\echo '╚═══════════════════════════════════════════════════════════════════════════╝'

SELECT public.cancel_trial_queue(:'token_a') AS cancel_a;
SELECT public.cancel_trial_queue(:'token_b') AS cancel_b;

DO $$
DECLARE
  v_client_a uuid;
  v_client_b uuid;
BEGIN
  v_client_a := public.require_client_id(current_setting('token_a'));
  v_client_b := public.require_client_id(current_setting('token_b'));

  -- Сбрасываем триалы в subscriptions
  UPDATE public.subscriptions
  SET trial_started_at = NULL,
      trial_ends_at = NULL,
      active_until = NULL,
      updated_at = NOW()
  WHERE client_id IN (v_client_a, v_client_b);

  -- Удаляем записи из trial_queue полностью (для чистоты теста)
  DELETE FROM public.trial_queue WHERE client_id IN (v_client_a, v_client_b);
  
  RAISE NOTICE '✅ Cleaned up clients A=% and B=%', v_client_a, v_client_b;
END $$;

-- ASSERT: capacity должна показать свободный слот
DO $$
DECLARE
  v_cap jsonb;
BEGIN
  v_cap := public.get_public_trial_capacity();
  IF (v_cap->>'available_slots')::int < 1 THEN
    RAISE EXCEPTION 'FAIL: Expected available_slots >= 1 after cleanup, got=%', v_cap;
  END IF;
  RAISE NOTICE '✅ available_slots >= 1 after cleanup';
END $$;

-- =============================================================================
-- 📋 4) Сценарий "1 слот": A получает offer, B в очередь
-- =============================================================================
\echo ''
\echo '╔═══════════════════════════════════════════════════════════════════════════╗'
\echo '║  4) Сценарий: A=offer, B=queued                                           ║'
\echo '╚═══════════════════════════════════════════════════════════════════════════╝'

-- A запрашивает триал
SELECT public.request_trial(:'token_a', 'smoke_test') AS request_a;

-- ASSERT: A получил offer
DO $$
DECLARE
  v_status jsonb;
BEGIN
  v_status := public.get_trial_queue_status(current_setting('token_a'));
  IF (v_status->>'status') IS DISTINCT FROM 'offer' THEN
    RAISE EXCEPTION 'FAIL: Expected A status=offer, got=%', v_status;
  END IF;
  IF (v_status->>'offer_expires_at') IS NULL THEN
    RAISE EXCEPTION 'FAIL: A should have offer_expires_at set, got=%', v_status;
  END IF;
  RAISE NOTICE '✅ A status=offer, offer_expires_at=%', v_status->>'offer_expires_at';
END $$;

-- B запрашивает триал
SELECT public.request_trial(:'token_b', 'smoke_test') AS request_b;

-- ASSERT: B ушёл в очередь
DO $$
DECLARE
  v_status jsonb;
BEGIN
  v_status := public.get_trial_queue_status(current_setting('token_b'));
  IF (v_status->>'status') IS DISTINCT FROM 'queued' THEN
    RAISE EXCEPTION 'FAIL: Expected B status=queued, got=%', v_status;
  END IF;
  IF (v_status->>'position')::int != 1 THEN
    RAISE EXCEPTION 'FAIL: Expected B position=1, got=%', v_status;
  END IF;
  RAISE NOTICE '✅ B status=queued, position=1';
END $$;

-- ASSERT: capacity = 0
DO $$
DECLARE
  v_cap jsonb;
BEGIN
  v_cap := public.get_public_trial_capacity();
  IF (v_cap->>'available_slots')::int != 0 THEN
    RAISE EXCEPTION 'FAIL: Expected available_slots=0, got=%', v_cap;
  END IF;
  RAISE NOTICE '✅ available_slots=0 (A holds the slot)';
END $$;

-- =============================================================================
-- 📋 5) A делает claim → стартует trial
-- =============================================================================
\echo ''
\echo '╔═══════════════════════════════════════════════════════════════════════════╗'
\echo '║  5) A claim offer → trial starts                                          ║'
\echo '╚═══════════════════════════════════════════════════════════════════════════╝'

SELECT public.claim_trial_offer(:'token_a') AS claim_a;

-- ASSERT: A теперь в trial (не в очереди)
DO $$
DECLARE
  v_status jsonb;
  v_client_a uuid;
  v_trial_ends timestamptz;
BEGIN
  v_status := public.get_trial_queue_status(current_setting('token_a'));
  
  -- Статус должен быть не offer/queued (скорее всего none или claimed)
  IF (v_status->>'status') IN ('offer', 'queued') THEN
    RAISE EXCEPTION 'FAIL: A should not be in offer/queued after claim, got=%', v_status;
  END IF;
  
  -- Проверяем subscriptions
  v_client_a := public.require_client_id(current_setting('token_a'));
  SELECT trial_ends_at INTO v_trial_ends FROM public.subscriptions WHERE client_id = v_client_a;
  
  IF v_trial_ends IS NULL OR v_trial_ends < NOW() THEN
    RAISE EXCEPTION 'FAIL: A should have active trial in subscriptions, trial_ends_at=%', v_trial_ends;
  END IF;
  
  RAISE NOTICE '✅ A claimed trial, trial_ends_at=%', v_trial_ends;
END $$;

-- capacity всё ещё 0 (A занял слот через активный trial)
DO $$
DECLARE
  v_cap jsonb;
BEGIN
  v_cap := public.get_public_trial_capacity();
  IF (v_cap->>'available_slots')::int != 0 THEN
    RAISE EXCEPTION 'FAIL: Expected available_slots=0 after A claim, got=%', v_cap;
  END IF;
  RAISE NOTICE '✅ available_slots=0 (A has active trial)';
END $$;

-- =============================================================================
-- 📋 6) Освободить слот: завершить trial A искусственно
-- =============================================================================
\echo ''
\echo '╔═══════════════════════════════════════════════════════════════════════════╗'
\echo '║  6) Освободить слот: trial A → expired                                    ║'
\echo '╚═══════════════════════════════════════════════════════════════════════════╝'

DO $$
DECLARE
  v_client_a uuid;
BEGIN
  v_client_a := public.require_client_id(current_setting('token_a'));
  
  UPDATE public.subscriptions
  SET trial_ends_at = NOW() - INTERVAL '1 second',
      updated_at = NOW()
  WHERE client_id = v_client_a;
  
  RAISE NOTICE '✅ Expired trial for client A: %', v_client_a;
END $$;

-- ASSERT: теперь должен быть свободный слот
DO $$
DECLARE
  v_cap jsonb;
BEGIN
  v_cap := public.get_public_trial_capacity();
  IF (v_cap->>'available_slots')::int < 1 THEN
    RAISE EXCEPTION 'FAIL: Expected available_slots >= 1 after A expired, got=%', v_cap;
  END IF;
  RAISE NOTICE '✅ available_slots >= 1 (A trial expired)';
END $$;

-- =============================================================================
-- 📋 7) Раздать offer из очереди → B получает offer
-- =============================================================================
-- NOTE: Вызываем assign_trials_from_queue() НАПРЯМУЮ — это e2e тест SQL pipeline.
--       cron (heys-maintenance) тестируется отдельно ручным вызовом.
--       Это быстрее и надёжнее, чем ждать scheduled trigger.
-- =============================================================================
\echo ''
\echo '╔═══════════════════════════════════════════════════════════════════════════╗'
\echo '║  7) assign_trials_from_queue → B gets offer (direct call, not cron)       ║'
\echo '╚═══════════════════════════════════════════════════════════════════════════╝'

SELECT public.assign_trials_from_queue(5) AS assign_result;

-- ASSERT: B должен стать offer
DO $$
DECLARE
  v_status jsonb;
BEGIN
  v_status := public.get_trial_queue_status(current_setting('token_b'));
  IF (v_status->>'status') IS DISTINCT FROM 'offer' THEN
    RAISE EXCEPTION 'FAIL: Expected B status=offer after assign, got=%', v_status;
  END IF;
  RAISE NOTICE '✅ B status=offer (assigned from queue)';
END $$;

-- =============================================================================
-- 📋 8) B делает claim → стартует trial
-- =============================================================================
\echo ''
\echo '╔═══════════════════════════════════════════════════════════════════════════╗'
\echo '║  8) B claim offer → trial starts                                          ║'
\echo '╚═══════════════════════════════════════════════════════════════════════════╝'

SELECT public.claim_trial_offer(:'token_b') AS claim_b;

-- ASSERT: B в trial
DO $$
DECLARE
  v_client_b uuid;
  v_trial_ends timestamptz;
BEGIN
  v_client_b := public.require_client_id(current_setting('token_b'));
  SELECT trial_ends_at INTO v_trial_ends FROM public.subscriptions WHERE client_id = v_client_b;
  
  IF v_trial_ends IS NULL OR v_trial_ends < NOW() THEN
    RAISE EXCEPTION 'FAIL: B should have active trial, trial_ends_at=%', v_trial_ends;
  END IF;
  
  RAISE NOTICE '✅ B claimed trial, trial_ends_at=%', v_trial_ends;
END $$;

-- =============================================================================
-- 📋 9) DoD: "offer не продлевается при повторном request"
-- =============================================================================
\echo ''
\echo '╔═══════════════════════════════════════════════════════════════════════════╗'
\echo '║  9) DoD: offer_expires_at не продлевается                                 ║'
\echo '╚═══════════════════════════════════════════════════════════════════════════╝'

-- Сначала вернём B в чистое состояние для теста
SELECT public.cancel_trial_queue(:'token_b');

DO $$
DECLARE
  v_client_b uuid;
BEGIN
  v_client_b := public.require_client_id(current_setting('token_b'));
  UPDATE public.subscriptions
  SET trial_started_at = NULL, trial_ends_at = NULL, updated_at = NOW()
  WHERE client_id = v_client_b;
  DELETE FROM public.trial_queue WHERE client_id = v_client_b;
END $$;

-- Запрос 1 → должен дать offer
SELECT public.request_trial(:'token_b', 'smoke_dod') AS request_b_1;

DO $$
DECLARE
  v_status_1 jsonb;
  v_expires_1 timestamptz;
  v_status_2 jsonb;
  v_expires_2 timestamptz;
BEGIN
  v_status_1 := public.get_trial_queue_status(current_setting('token_b'));
  v_expires_1 := (v_status_1->>'offer_expires_at')::timestamptz;
  
  IF (v_status_1->>'status') != 'offer' THEN
    RAISE EXCEPTION 'FAIL: Expected B status=offer, got=%', v_status_1;
  END IF;
  
  RAISE NOTICE 'offer_expires_at before sleep: %', v_expires_1;
  
  -- Подождём 2 секунды
  PERFORM pg_sleep(2);
  
  -- Повторный запрос
  PERFORM public.request_trial(current_setting('token_b'), 'smoke_dod_repeat');
  
  v_status_2 := public.get_trial_queue_status(current_setting('token_b'));
  v_expires_2 := (v_status_2->>'offer_expires_at')::timestamptz;
  
  RAISE NOTICE 'offer_expires_at after repeat: %', v_expires_2;
  
  -- ASSERT: offer_expires_at НЕ изменился
  IF v_expires_1 != v_expires_2 THEN
    RAISE EXCEPTION 'FAIL: offer_expires_at was extended! before=% after=%', v_expires_1, v_expires_2;
  END IF;
  
  RAISE NOTICE '✅ offer_expires_at NOT extended (DoD passed)';
END $$;

-- =============================================================================
-- 📋 10) Покупка снимает из очереди (canceled_by_purchase)
-- =============================================================================
\echo ''
\echo '╔═══════════════════════════════════════════════════════════════════════════╗'
\echo '║  10) Покупка → canceled_by_purchase                                       ║'
\echo '╚═══════════════════════════════════════════════════════════════════════════╝'

-- Подготовка: A занимает слот, B в очереди
DO $$
DECLARE
  v_client_a uuid;
  v_client_b uuid;
BEGIN
  v_client_a := public.require_client_id(current_setting('token_a'));
  v_client_b := public.require_client_id(current_setting('token_b'));
  
  -- A = активный trial
  UPDATE public.subscriptions
  SET trial_started_at = NOW(),
      trial_ends_at = NOW() + INTERVAL '7 days',
      active_until = NULL,
      updated_at = NOW()
  WHERE client_id = v_client_a;
  
  -- B = чистый (для queued)
  UPDATE public.subscriptions
  SET trial_started_at = NULL,
      trial_ends_at = NULL,
      active_until = NULL,
      updated_at = NOW()
  WHERE client_id = v_client_b;
  
  DELETE FROM public.trial_queue WHERE client_id = v_client_b;
  
  RAISE NOTICE 'Setup: A=active trial, B=clean';
END $$;

-- ASSERT: capacity = 0
DO $$
DECLARE
  v_cap jsonb;
BEGIN
  v_cap := public.get_public_trial_capacity();
  IF (v_cap->>'available_slots')::int != 0 THEN
    RAISE EXCEPTION 'FAIL: Expected available_slots=0 for purchase test, got=%', v_cap;
  END IF;
END $$;

-- B запрашивает триал → уходит в queued
SELECT public.request_trial(:'token_b', 'smoke_purchase') AS request_b_for_purchase;

-- ASSERT: B в очереди
DO $$
DECLARE
  v_status jsonb;
BEGIN
  v_status := public.get_trial_queue_status(current_setting('token_b'));
  IF (v_status->>'status') IS DISTINCT FROM 'queued' THEN
    RAISE EXCEPTION 'FAIL: Expected B status=queued before purchase, got=%', v_status;
  END IF;
  RAISE NOTICE '✅ B in queue before purchase';
END $$;

-- Симулируем покупку: UPDATE subscriptions.active_until
DO $$
DECLARE
  v_client_b uuid;
BEGIN
  v_client_b := public.require_client_id(current_setting('token_b'));
  
  -- Покупка: устанавливаем active_until → триггер должен снять из очереди
  UPDATE public.subscriptions
  SET active_until = NOW() + INTERVAL '30 days',
      updated_at = NOW()
  WHERE client_id = v_client_b;
  
  RAISE NOTICE 'Simulated purchase for B: active_until set';
END $$;

-- ASSERT: trial_queue.status = canceled_by_purchase
DO $$
DECLARE
  v_queue_status text;
  v_client_b uuid;
BEGIN
  v_client_b := public.require_client_id(current_setting('token_b'));
  
  SELECT status INTO v_queue_status
  FROM public.trial_queue 
  WHERE client_id = v_client_b
  ORDER BY created_at DESC LIMIT 1;
  
  IF v_queue_status IS DISTINCT FROM 'canceled_by_purchase' THEN
    RAISE EXCEPTION 'FAIL: Expected B queue status=canceled_by_purchase, got=%', v_queue_status;
  END IF;
  
  RAISE NOTICE '✅ B queue status=canceled_by_purchase (purchase trigger works!)';
END $$;

-- =============================================================================
-- ✅ ALL TESTS PASSED
-- =============================================================================
\echo ''
\echo '╔═══════════════════════════════════════════════════════════════════════════╗'
\echo '║  ✅ ALL SMOKE TESTS PASSED!                                               ║'
\echo '╚═══════════════════════════════════════════════════════════════════════════╝'
\echo ''

-- =============================================================================
-- 🔚 КОНЕЦ ТРАНЗАКЦИИ — режим через параметр commit_mode
-- =============================================================================
-- 
-- РЕЖИМ A (безопасный): ROLLBACK — все изменения откатятся (cleanup не нужен)
-- РЕЖИМ B (end-to-end):  COMMIT  — cleanup + commit
--
-- Запуск:
--   Safe:     psql -v token_a='xxx' -v token_b='yyy' -f smoke_test_trial_queue.sql
--   End-to-end: psql -v token_a='xxx' -v token_b='yyy' -v commit_mode=1 -f smoke_test_trial_queue.sql
--
-- =============================================================================

\if :{?commit_mode}
  -- =============================================================================
  -- 🧹 CLEANUP (только для COMMIT mode — иначе ROLLBACK сам всё откатит)
  -- =============================================================================
  \echo ''
  \echo 'Cleanup: restoring original state before COMMIT...'

  DO $$
  DECLARE
    v_client_a uuid;
    v_client_b uuid;
  BEGIN
    v_client_a := public.require_client_id(current_setting('token_a'));
    v_client_b := public.require_client_id(current_setting('token_b'));

    -- Очищаем trial_queue
    DELETE FROM public.trial_queue WHERE client_id IN (v_client_a, v_client_b);
    
    -- Сбрасываем subscriptions
    UPDATE public.subscriptions
    SET trial_started_at = NULL,
        trial_ends_at = NULL,
        active_until = NULL,
        updated_at = NOW()
    WHERE client_id IN (v_client_a, v_client_b);
    
    RAISE NOTICE 'Cleanup done for test clients';
  END $$;

  -- 🔍 SANITY CHECK 3: Verify :original_max_trials substitution
  \echo ''
  \echo 'Sanity check: original_max_trials =' :original_max_trials

  -- Восстанавливаем лимит
  UPDATE public.curator_trial_limits
  SET max_active_trials = :original_max_trials,
      updated_at = NOW()
  WHERE curator_id = '00000000-0000-0000-0000-000000000000';

  \echo 'Restored max_active_trials =' :original_max_trials

  -- 🔍 Финальная проверка cleanup (самодостаточность commit_mode)
  DO $$
  DECLARE
    v_client_a uuid;
    v_client_b uuid;
    v_queue_count int;
    v_trial_count int;
  BEGIN
    v_client_a := public.require_client_id(current_setting('token_a'));
    v_client_b := public.require_client_id(current_setting('token_b'));
    
    -- Проверяем trial_queue: не должно быть active записей
    SELECT COUNT(*) INTO v_queue_count
    FROM public.trial_queue 
    WHERE client_id IN (v_client_a, v_client_b)
      AND status IN ('queued', 'offer');
    
    IF v_queue_count > 0 THEN
      RAISE EXCEPTION 'FAIL: Cleanup incomplete: % active queue entries remain', v_queue_count;
    END IF;
    
    -- Проверяем subscriptions: trial_* должны быть NULL
    SELECT COUNT(*) INTO v_trial_count
    FROM public.subscriptions 
    WHERE client_id IN (v_client_a, v_client_b)
      AND (trial_started_at IS NOT NULL OR trial_ends_at IS NOT NULL OR active_until IS NOT NULL);
    
    IF v_trial_count > 0 THEN
      RAISE EXCEPTION 'FAIL: Cleanup incomplete: % subscriptions still have trial/active data', v_trial_count;
    END IF;
    
    RAISE NOTICE '✅ Cleanup verified: test clients are clean';
  END $$;

  COMMIT;
  \echo ''
  \echo 'Transaction COMMITTED. Changes persisted (end-to-end mode).'
\else
  -- ROLLBACK mode: cleanup не нужен, всё откатится
  ROLLBACK;
  \echo ''
  \echo 'Transaction ROLLED BACK. No changes persisted (safe mode).'
\endif

\echo ''
\echo 'Done.'
\echo ''
\echo 'Modes:'
\echo '  Safe (default): -v token_a=... -v token_b=...'
\echo '  End-to-end:     -v token_a=... -v token_b=... -v commit_mode=1'
\echo ''
\echo 'NOTE: e2e mode tests the full SQL pipeline with COMMIT.'
\echo '      cron (heys-maintenance) should be tested separately with manual trigger.'
