-- =====================================================
-- HEYS: Удаление аккаунта + удаление health-данных по отзыву согласия
-- Версия: 1.0.1 (исправлены имена колонок, использован require_client_id)
-- Дата: 2026-05-14
-- Описание:
--   Две RPC-функции для соответствия 152-ФЗ:
--
--   1. purge_health_data(p_client_id) — вызывается после revoke_consent
--      для consent_type='health_data'. Удаляет из client_kv_store
--      health-ключи клиента (дневник, вес, активность, сон, цикл,
--      самочувствие). Записи consents остаются для compliance-аудита.
--
--   2. delete_my_account(p_session_token) — права субъекта ПДн
--      (ст. 21 152-ФЗ). Использует существующую require_client_id()
--      для безопасного маппинга session_token → client_id (это та же
--      функция, что вызывается во всех *_by_session RPC). Удаляет
--      клиента — FK ON DELETE CASCADE автоматически чистит:
--      consents, client_sessions, subscriptions, trial_queue,
--      leaderboard_snapshots, client_kv_store.
--
-- Обе функции SECURITY DEFINER.
-- =====================================================

-- ---------------------------------------------------------------
-- 1. purge_health_data
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.purge_health_data(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INT;
BEGIN
  IF p_client_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'client_id required');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM clients WHERE id = p_client_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Client not found');
  END IF;

  -- Удаляем ключи с health-данными из client_kv_store (колонка `k`).
  -- Префиксы из docs/legal/health-data-consent.md §3.
  -- Системные ключи (heys_session_*, heys_settings_*) не трогаем.
  DELETE FROM client_kv_store
   WHERE client_id = p_client_id
     AND (
       k LIKE 'heys_diary_%'           -- дневник питания (food log)
       OR k LIKE 'heys_weight%'        -- вес и его динамика
       OR k LIKE 'heys_activity%'      -- физическая активность
       OR k LIKE 'heys_sleep%'         -- сон
       OR k LIKE 'heys_cycle%'         -- менструальный цикл
       OR k LIKE 'heys_mood%'          -- самочувствие
       OR k LIKE 'heys_water%'         -- водный баланс
       OR k LIKE 'heys_meals_%'        -- приёмы пищи (legacy)
     );
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'client_id', p_client_id,
    'deleted_keys', v_deleted_count,
    'purged_at', NOW()
  );
END;
$$;

COMMENT ON FUNCTION public.purge_health_data(UUID) IS
  'Удаляет health-данные клиента из client_kv_store. Вызывается после '
  'revoke_consent(client_id, ''health_data''). 152-ФЗ ст. 21.';

-- ---------------------------------------------------------------
-- 2. delete_my_account
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_my_account(p_session_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
BEGIN
  IF p_session_token IS NULL OR length(trim(p_session_token)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_token required');
  END IF;

  -- require_client_id выполняет хеширование токена и валидацию сессии
  -- (expires_at, revoked_at). Бросает исключение при невалидной сессии,
  -- которое мы перехватываем и преобразуем в structured-ответ.
  BEGIN
    v_client_id := public.require_client_id(p_session_token);
  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'invalid or expired session'
      );
  END;

  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'session has no client_id');
  END IF;

  -- Логируем намерение в security_events до удаления. client_id не
  -- передаём в колонку (cascade удалит), а кладём в meta для аудита.
  INSERT INTO security_events (event_type, meta)
  VALUES (
    'account_deleted',
    jsonb_build_object('deleted_client_id', v_client_id)
  );

  -- Удаляем клиента. FK ON DELETE CASCADE автоматически чистит:
  --   consents, client_sessions, subscriptions, trial_queue,
  --   leaderboard_snapshots, client_kv_store.
  DELETE FROM clients WHERE id = v_client_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'client already deleted');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_at', NOW()
  );
END;
$$;

COMMENT ON FUNCTION public.delete_my_account(TEXT) IS
  'Удаляет аккаунт текущего клиента по session_token (152-ФЗ ст. 21). '
  'Использует require_client_id() для безопасной валидации сессии.';
