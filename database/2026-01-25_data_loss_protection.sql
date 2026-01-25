-- =====================================================
-- 🛡️ DATA LOSS PROTECTION — Защита от перезаписи дней с данными пустыми днями
-- 
-- ПРОБЛЕМА: При синхронизации с нового устройства пустой localStorage
-- может перезаписать облачные данные с meals. Это потеря данных клиента!
--
-- РЕШЕНИЕ: SQL функция проверяет что мы НЕ перезаписываем день с meals
-- пустым днём. Если в БД есть meals, а в новых данных нет — блокируем.
-- =====================================================

-- Функция проверки: можно ли сохранить новые данные дня?
-- Возвращает TRUE если:
-- 1. Ключ не день (heys_dayv2_*)
-- 2. В БД нет данных для этого ключа
-- 3. В БД пустой день (0 meals)
-- 4. В новых данных есть meals (≥1)
-- 5. В новых данных updatedAt свежее чем в БД
--
-- Возвращает FALSE (БЛОКИРУЕТ) если:
-- - В БД день с meals > 0, а в новых данных meals = 0 И updatedAt не сильно свежее
CREATE OR REPLACE FUNCTION check_day_overwrite_allowed(
  p_client_id UUID,
  p_key TEXT,
  p_new_value JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing JSONB;
  v_existing_meals INT;
  v_new_meals INT;
  v_existing_updated BIGINT;
  v_new_updated BIGINT;
BEGIN
  -- 1. Не день? Разрешаем
  IF p_key NOT LIKE 'heys_dayv2_%' THEN
    RETURN TRUE;
  END IF;

  -- 2. Получаем существующие данные
  SELECT v INTO v_existing
  FROM client_kv_store
  WHERE client_id = p_client_id AND k = p_key;
  
  -- 3. Нет существующих данных? Разрешаем
  IF v_existing IS NULL THEN
    RETURN TRUE;
  END IF;

  -- 4. Считаем meals
  v_existing_meals := COALESCE(jsonb_array_length(v_existing->'meals'), 0);
  v_new_meals := COALESCE(jsonb_array_length(p_new_value->'meals'), 0);
  
  -- 5. В БД пусто или в новых данных есть meals? Разрешаем
  IF v_existing_meals = 0 OR v_new_meals > 0 THEN
    RETURN TRUE;
  END IF;

  -- 6. КРИТИЧЕСКИЙ КЕЙС: В БД есть meals, в новых нет
  -- Проверяем timestamps
  v_existing_updated := COALESCE((v_existing->>'updatedAt')::BIGINT, 0);
  v_new_updated := COALESCE((p_new_value->>'updatedAt')::BIGINT, 0);
  
  -- Разрешаем только если новый timestamp ЗНАЧИТЕЛЬНО свежее (>1 час)
  -- Это защита от случайных перезаписей, но позволяет намеренные удаления
  IF v_new_updated > v_existing_updated + 3600000 THEN
    -- Логируем в отдельную таблицу для аудита
    INSERT INTO data_loss_audit (
      client_id, key, action, existing_meals, new_meals,
      existing_updated, new_updated, allowed, reason
    ) VALUES (
      p_client_id, p_key, 'overwrite_check',
      v_existing_meals, v_new_meals,
      v_existing_updated, v_new_updated,
      TRUE, 'new_data_much_fresher'
    );
    RETURN TRUE;
  END IF;

  -- 7. БЛОКИРУЕМ — это потенциальная потеря данных!
  INSERT INTO data_loss_audit (
    client_id, key, action, existing_meals, new_meals,
    existing_updated, new_updated, allowed, reason
  ) VALUES (
    p_client_id, p_key, 'overwrite_blocked',
    v_existing_meals, v_new_meals,
    v_existing_updated, v_new_updated,
    FALSE, 'would_lose_meals'
  );
  
  RETURN FALSE;
END;
$$;

-- Таблица аудита потенциальных потерь данных
CREATE TABLE IF NOT EXISTS data_loss_audit (
  id SERIAL PRIMARY KEY,
  client_id UUID NOT NULL,
  key TEXT NOT NULL,
  action TEXT NOT NULL,
  existing_meals INT,
  new_meals INT,
  existing_updated BIGINT,
  new_updated BIGINT,
  allowed BOOLEAN NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индекс для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_data_loss_audit_client 
ON data_loss_audit(client_id, created_at DESC);

-- БЕЗОПАСНАЯ функция upsert с защитой от потери данных
CREATE OR REPLACE FUNCTION safe_upsert_client_kv(
  p_client_id UUID,
  p_key TEXT,
  p_value JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_allowed BOOLEAN;
BEGIN
  -- Проверяем разрешено ли перезаписывать
  v_allowed := check_day_overwrite_allowed(p_client_id, p_key, p_value);
  
  IF NOT v_allowed THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'data_loss_protection',
      'message', 'Cannot overwrite day with meals by empty day'
    );
  END IF;

  -- Безопасно — делаем upsert
  INSERT INTO client_kv_store (client_id, k, v, updated_at)
  VALUES (p_client_id, p_key, p_value, NOW())
  ON CONFLICT (client_id, k) DO UPDATE
  SET v = EXCLUDED.v, updated_at = NOW();
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Обновляем основную функцию upsert_client_kv_by_session чтобы использовать защиту
CREATE OR REPLACE FUNCTION upsert_client_kv_by_session(
  p_session_token TEXT,
  p_key TEXT,
  p_value JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client_id UUID;
  v_allowed BOOLEAN;
BEGIN
  -- Validate session
  SELECT client_id INTO v_client_id
  FROM client_sessions
  WHERE token_hash = digest(p_session_token, 'sha256')
    AND expires_at > NOW()
    AND revoked_at IS NULL;
  
  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('error', 'invalid_session');
  END IF;

  -- 🛡️ DATA LOSS PROTECTION: Проверяем разрешено ли перезаписывать
  v_allowed := check_day_overwrite_allowed(v_client_id, p_key, p_value);
  
  IF NOT v_allowed THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'data_loss_protection',
      'message', 'Cannot overwrite day with meals by empty day. Use force=true to override.'
    );
  END IF;

  -- Write with auto-encrypt (если есть функция)
  BEGIN
    PERFORM write_client_kv_value(v_client_id, p_key, p_value);
  EXCEPTION WHEN undefined_function THEN
    -- Fallback если write_client_kv_value не существует
    INSERT INTO client_kv_store (client_id, k, v, updated_at)
    VALUES (v_client_id, p_key, p_value, NOW())
    ON CONFLICT (client_id, k) DO UPDATE
    SET v = EXCLUDED.v, updated_at = NOW();
  END;
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- GRANT для Cloud Functions
GRANT EXECUTE ON FUNCTION check_day_overwrite_allowed TO heys_admin;
GRANT EXECUTE ON FUNCTION safe_upsert_client_kv TO heys_admin;
GRANT EXECUTE ON FUNCTION upsert_client_kv_by_session TO heys_admin;
GRANT SELECT, INSERT ON data_loss_audit TO heys_admin;
GRANT USAGE, SELECT ON SEQUENCE data_loss_audit_id_seq TO heys_admin;

-- Комментарии
COMMENT ON FUNCTION check_day_overwrite_allowed IS 
'🛡️ Защита от потери данных: проверяет что день с meals не перезаписывается пустым днём';

COMMENT ON TABLE data_loss_audit IS 
'Аудит всех попыток перезаписи дней — для диагностики и восстановления';

COMMENT ON FUNCTION safe_upsert_client_kv IS 
'Безопасный upsert с защитой от потери данных дневника';
