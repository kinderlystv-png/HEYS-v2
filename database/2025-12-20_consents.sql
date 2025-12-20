-- =====================================================
-- HEYS: Таблица согласий (consents)
-- Версия: 1.1
-- Дата: 2025-12-20
-- Обновлено: Добавлен signature_method для ПЭП
-- =====================================================

-- Таблица для логирования согласий пользователей
CREATE TABLE IF NOT EXISTS consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  
  -- Тип согласия
  consent_type TEXT NOT NULL CHECK (consent_type IN (
    'user_agreement',    -- Пользовательское соглашение
    'personal_data',     -- Обработка персональных данных
    'health_data',       -- Данные о здоровье (спецкатегория)
    'marketing'          -- Маркетинговые коммуникации
  )),
  
  -- Версия документа на момент согласия
  document_version TEXT NOT NULL DEFAULT '1.1',
  
  -- Статус
  granted BOOLEAN NOT NULL DEFAULT true,
  
  -- Способ подписи (для ПЭП согласно ст. 10 152-ФЗ)
  signature_method TEXT DEFAULT 'checkbox' CHECK (signature_method IN (
    'checkbox',        -- Обычная галочка (для user_agreement, personal_data, marketing)
    'sms_code',        -- Код из SMS (для health_data — ПЭП)
    'one_time_code',   -- Одноразовый код (альтернативный ПЭП)
    'messenger_code',  -- Код в мессенджер (альтернативный ПЭП)
    'button'           -- Явное нажатие кнопки
  )),
  
  -- Метаданные
  ip_address INET,
  user_agent TEXT,
  
  -- Время
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  revoked_at TIMESTAMPTZ,
  
  -- Уникальность: один тип согласия на клиента (последняя версия)
  CONSTRAINT unique_active_consent UNIQUE (client_id, consent_type, document_version)
);

-- Индексы (idempotent)
CREATE INDEX IF NOT EXISTS idx_consents_client ON consents(client_id);
CREATE INDEX IF NOT EXISTS idx_consents_type ON consents(consent_type);
CREATE INDEX IF NOT EXISTS idx_consents_created ON consents(created_at DESC);

-- RLS политики
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;

-- Удаляем старые политики (idempotent)
DROP POLICY IF EXISTS "Clients can view own consents" ON consents;
DROP POLICY IF EXISTS "System can insert consents" ON consents;
DROP POLICY IF EXISTS "Curators can view client consents" ON consents;

-- Клиент видит только свои согласия
CREATE POLICY "Clients can view own consents"
  ON consents FOR SELECT
  USING (
    client_id = (
      SELECT id FROM clients 
      WHERE id = consents.client_id 
      AND (
        -- PIN auth
        id::text = current_setting('request.headers', true)::json->>'x-client-id'
        OR
        -- Curator auth (если куратор смотрит клиента)
        curator_id = auth.uid()
      )
    )
  );

-- Вставка согласий (при регистрации через RPC)
CREATE POLICY "System can insert consents"
  ON consents FOR INSERT
  WITH CHECK (true);

-- Куратор может видеть согласия своих клиентов
CREATE POLICY "Curators can view client consents"
  ON consents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM clients 
      WHERE clients.id = consents.client_id 
      AND clients.curator_id = auth.uid()
    )
  );

-- =====================================================
-- RPC функция для логирования согласий
-- =====================================================

CREATE OR REPLACE FUNCTION log_consents(
  p_client_id UUID,
  p_consents JSONB,  -- [{type, version, granted}]
  p_ip TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_consent JSONB;
  v_result JSONB := '[]'::jsonb;
BEGIN
  -- Проверяем что клиент существует
  IF NOT EXISTS (SELECT 1 FROM clients WHERE id = p_client_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Client not found');
  END IF;

  -- Вставляем каждое согласие
  FOR v_consent IN SELECT * FROM jsonb_array_elements(p_consents)
  LOOP
    INSERT INTO consents (
      client_id,
      consent_type,
      document_version,
      granted,
      ip_address,
      user_agent
    ) VALUES (
      p_client_id,
      v_consent->>'type',
      COALESCE(v_consent->>'version', '1.0'),
      COALESCE((v_consent->>'granted')::boolean, true),
      p_ip::inet,
      p_user_agent
    )
    ON CONFLICT (client_id, consent_type, document_version) 
    DO UPDATE SET 
      granted = EXCLUDED.granted,
      created_at = now(),
      revoked_at = CASE WHEN EXCLUDED.granted THEN NULL ELSE now() END;
    
    v_result := v_result || jsonb_build_object(
      'type', v_consent->>'type',
      'logged', true
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'consents', v_result,
    'client_id', p_client_id
  );
END;
$$;

-- =====================================================
-- Функция проверки наличия всех обязательных согласий
-- =====================================================

CREATE OR REPLACE FUNCTION check_required_consents(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_missing TEXT[] := ARRAY[]::TEXT[];
  v_has_agreement BOOLEAN;
  v_has_personal BOOLEAN;
  v_has_health BOOLEAN;
BEGIN
  -- Проверяем обязательные согласия
  SELECT 
    EXISTS (SELECT 1 FROM consents WHERE client_id = p_client_id AND consent_type = 'user_agreement' AND granted = true AND revoked_at IS NULL),
    EXISTS (SELECT 1 FROM consents WHERE client_id = p_client_id AND consent_type = 'personal_data' AND granted = true AND revoked_at IS NULL),
    EXISTS (SELECT 1 FROM consents WHERE client_id = p_client_id AND consent_type = 'health_data' AND granted = true AND revoked_at IS NULL)
  INTO v_has_agreement, v_has_personal, v_has_health;

  IF NOT v_has_agreement THEN
    v_missing := array_append(v_missing, 'user_agreement');
  END IF;
  
  IF NOT v_has_personal THEN
    v_missing := array_append(v_missing, 'personal_data');
  END IF;
  
  IF NOT v_has_health THEN
    v_missing := array_append(v_missing, 'health_data');
  END IF;

  RETURN jsonb_build_object(
    'valid', array_length(v_missing, 1) IS NULL,
    'missing', to_jsonb(v_missing),
    'has_agreement', v_has_agreement,
    'has_personal_data', v_has_personal,
    'has_health_data', v_has_health
  );
END;
$$;

-- =====================================================
-- Функция отзыва согласия
-- =====================================================

CREATE OR REPLACE FUNCTION revoke_consent(
  p_client_id UUID,
  p_consent_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE consents 
  SET 
    granted = false,
    revoked_at = now()
  WHERE 
    client_id = p_client_id 
    AND consent_type = p_consent_type
    AND granted = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Consent not found or already revoked');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'consent_type', p_consent_type,
    'revoked_at', now()
  );
END;
$$;

-- =====================================================
-- Комментарии
-- =====================================================

COMMENT ON TABLE consents IS 'Логирование согласий пользователей (152-ФЗ)';
COMMENT ON COLUMN consents.consent_type IS 'Тип согласия: user_agreement, personal_data, health_data, marketing';
COMMENT ON COLUMN consents.document_version IS 'Версия документа на момент согласия';
COMMENT ON COLUMN consents.granted IS 'true = согласие дано, false = отозвано';
COMMENT ON COLUMN consents.revoked_at IS 'Время отзыва согласия';
