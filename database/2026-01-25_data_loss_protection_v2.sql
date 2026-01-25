-- =====================================================
-- 🛡️ DATA LOSS PROTECTION v2 — Защита на уровне write_client_kv_value
-- 
-- КРИТИЧНО: Защита должна быть на самом низком уровне!
-- write_client_kv_value вызывается из:
--   - upsert_client_kv_by_session
--   - batch_upsert_client_kv_by_session  
--   - прямые вызовы
--
-- Если защита здесь — ВСЕ пути защищены!
-- =====================================================

-- Обновляем write_client_kv_value с защитой от потери данных
CREATE OR REPLACE FUNCTION write_client_kv_value(
  p_client_id UUID,
  p_key TEXT,
  p_value JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  should_encrypt BOOLEAN;
  encrypted_val BYTEA;
  v_allowed BOOLEAN;
BEGIN
  -- 🛡️ ЗАЩИТА ОТ ПОТЕРИ ДАННЫХ (для дней)
  v_allowed := check_day_overwrite_allowed(p_client_id, p_key, p_value);
  
  IF NOT v_allowed THEN
    -- Логируем и выходим БЕЗ записи
    RAISE NOTICE '[DATA_LOSS_PROTECTION] Blocked overwrite of % for client %', p_key, p_client_id;
    RETURN;
  END IF;

  -- Проверяем нужно ли шифровать
  should_encrypt := is_health_key(p_key);
  
  IF should_encrypt THEN
    encrypted_val := encrypt_health_data(p_value);
    
    INSERT INTO client_kv_store (client_id, k, v, v_encrypted, key_version, updated_at)
    VALUES (p_client_id, p_key, '{}'::jsonb, encrypted_val, 1, NOW())
    ON CONFLICT (client_id, k) DO UPDATE SET
      v = '{}'::jsonb,
      v_encrypted = encrypted_val,
      key_version = 1,
      updated_at = NOW();
  ELSE
    INSERT INTO client_kv_store (client_id, k, v, v_encrypted, key_version, updated_at)
    VALUES (p_client_id, p_key, p_value, NULL, NULL, NOW())
    ON CONFLICT (client_id, k) DO UPDATE SET
      v = p_value,
      v_encrypted = NULL,
      key_version = NULL,
      updated_at = NOW();
  END IF;
END;
$$;

-- Упрощаем upsert_client_kv_by_session — защита теперь в write_client_kv_value
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

  -- Write (защита внутри write_client_kv_value)
  PERFORM write_client_kv_value(v_client_id, p_key, p_value);
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- batch тоже теперь защищена через write_client_kv_value
-- (не нужно менять — она уже вызывает write_client_kv_value)

COMMENT ON FUNCTION write_client_kv_value IS 
'🛡️ v2: Низкоуровневая запись с защитой от потери данных. 
Проверяет check_day_overwrite_allowed перед записью дней.';

-- =====================================================
-- 🔔 ALERT SYSTEM — Уведомления о попытках потери данных
-- =====================================================

-- Функция для отправки алерта (можно вызывать из триггера или cron)
CREATE OR REPLACE FUNCTION get_recent_data_loss_alerts(
  p_hours INT DEFAULT 24
) RETURNS TABLE (
  client_id UUID,
  key TEXT,
  existing_meals INT,
  new_meals INT,
  reason TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT client_id, key, existing_meals, new_meals, reason, created_at
  FROM data_loss_audit
  WHERE allowed = FALSE
    AND created_at > NOW() - (p_hours || ' hours')::INTERVAL
  ORDER BY created_at DESC;
$$;

-- =====================================================
-- 📊 MONITORING — Мониторинг целостности данных
-- =====================================================

-- Функция проверки "подозрительных" дней (были meals, стали 0)
CREATE OR REPLACE FUNCTION check_suspicious_days(
  p_days_back INT DEFAULT 7
) RETURNS TABLE (
  client_id UUID,
  day_key TEXT,
  meals_count INT,
  last_audit_action TEXT,
  last_audit_reason TEXT
)
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT 
    kv.client_id,
    kv.k AS day_key,
    COALESCE(jsonb_array_length(kv.v->'meals'), 0) AS meals_count,
    a.action AS last_audit_action,
    a.reason AS last_audit_reason
  FROM client_kv_store kv
  LEFT JOIN LATERAL (
    SELECT action, reason
    FROM data_loss_audit
    WHERE data_loss_audit.client_id = kv.client_id
      AND data_loss_audit.key = kv.k
    ORDER BY created_at DESC
    LIMIT 1
  ) a ON TRUE
  WHERE kv.k LIKE 'heys_dayv2_%'
    AND kv.updated_at > NOW() - (p_days_back || ' days')::INTERVAL
    AND COALESCE(jsonb_array_length(kv.v->'meals'), 0) = 0
    AND a.action IS NOT NULL;  -- Был аудит = были попытки изменения
$$;

-- GRANT
GRANT EXECUTE ON FUNCTION get_recent_data_loss_alerts TO heys_admin;
GRANT EXECUTE ON FUNCTION check_suspicious_days TO heys_admin;
