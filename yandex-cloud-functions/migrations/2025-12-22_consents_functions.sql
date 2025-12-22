-- ═══════════════════════════════════════════════════════════════════════════════
-- HEYS: Функции для работы с согласиями (consents)
-- Версия: 1.1 (исправления после тестирования)
-- Дата: 2025-12-22
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- 📋 Обновление структуры таблицы consents
-- ═══════════════════════════════════════════════════════════════════════════════

-- Добавляем недостающую колонку granted (синоним is_active для совместимости)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'consents' AND column_name = 'granted') THEN
        ALTER TABLE public.consents ADD COLUMN granted BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;
END $$;

-- Constraint на consent_type если его нет
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'consents_consent_type_check'
    ) THEN
        ALTER TABLE public.consents 
        ADD CONSTRAINT consents_consent_type_check 
        CHECK (consent_type IN ('user_agreement', 'personal_data', 'health_data', 'marketing'));
    END IF;
END $$;

-- Constraint на signature_method если его нет
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'consents_signature_method_check'
    ) THEN
        ALTER TABLE public.consents 
        ADD CONSTRAINT consents_signature_method_check 
        CHECK (signature_method IS NULL OR signature_method IN (
            'checkbox', 'sms_code', 'one_time_code', 'messenger_code', 'button'
        ));
    END IF;
END $$;

-- Уникальный constraint если его нет (один активный consent_type на клиента)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_active_consent_per_client'
    ) THEN
        -- Создаём partial unique index вместо constraint для гибкости
        CREATE UNIQUE INDEX IF NOT EXISTS unique_active_consent_per_client 
        ON public.consents(client_id, consent_type, document_version) 
        WHERE granted = TRUE;
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 🔧 RPC функция: log_consents
-- Логирование согласий пользователя
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.log_consents(
    p_client_id UUID,
    p_consents JSONB,          -- [{type, granted, version?, signature_method?}]
    p_ip TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_consent JSONB;
    v_result JSONB := '[]'::jsonb;
    v_type TEXT;
    v_granted BOOLEAN;
    v_version TEXT;
    v_signature TEXT;
BEGIN
    -- Проверяем что клиент существует
    IF NOT EXISTS (SELECT 1 FROM clients WHERE id = p_client_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Client not found');
    END IF;

    -- Обрабатываем каждое согласие
    FOR v_consent IN SELECT * FROM jsonb_array_elements(p_consents)
    LOOP
        v_type := v_consent->>'type';
        v_granted := COALESCE((v_consent->>'granted')::boolean, true);
        v_version := COALESCE(v_consent->>'version', '1.1');
        v_signature := COALESCE(v_consent->>'signature_method', 'checkbox');
        
        -- Проверяем валидность типа
        IF v_type NOT IN ('user_agreement', 'personal_data', 'health_data', 'marketing') THEN
            CONTINUE; -- Пропускаем неизвестные типы
        END IF;

        -- Деактивируем старые согласия этого типа
        UPDATE consents 
        SET granted = false, 
            is_active = false,
            revoked_at = NOW()
        WHERE client_id = p_client_id 
          AND consent_type = v_type 
          AND granted = true;

        -- Вставляем новое согласие
        INSERT INTO consents (
            client_id,
            consent_type,
            document_version,
            signature_method,
            granted,
            is_active,
            ip_address,
            user_agent,
            created_at
        ) VALUES (
            p_client_id,
            v_type,
            v_version,
            v_signature,
            v_granted,
            v_granted, -- is_active = granted
            CASE WHEN p_ip IS NOT NULL THEN p_ip::inet ELSE NULL END,  -- Cast TEXT to INET
            p_user_agent,
            NOW()
        );

        v_result := v_result || jsonb_build_object(
            'type', v_type,
            'granted', v_granted,
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

-- ═══════════════════════════════════════════════════════════════════════════════
-- 🔧 RPC функция: check_required_consents
-- Проверка наличия обязательных согласий
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.check_required_consents(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_missing TEXT[] := ARRAY[]::TEXT[];
    v_has_agreement BOOLEAN;
    v_has_personal BOOLEAN;
    v_has_health BOOLEAN;
BEGIN
    -- Проверяем обязательные согласия
    SELECT 
        EXISTS (SELECT 1 FROM consents WHERE client_id = p_client_id AND consent_type = 'user_agreement' AND granted = true),
        EXISTS (SELECT 1 FROM consents WHERE client_id = p_client_id AND consent_type = 'personal_data' AND granted = true),
        EXISTS (SELECT 1 FROM consents WHERE client_id = p_client_id AND consent_type = 'health_data' AND granted = true)
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

-- ═══════════════════════════════════════════════════════════════════════════════
-- 🔧 RPC функция: revoke_consent
-- Отзыв согласия
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.revoke_consent(
    p_client_id UUID,
    p_consent_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Проверяем что клиент существует
    IF NOT EXISTS (SELECT 1 FROM clients WHERE id = p_client_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Client not found');
    END IF;

    -- Отзываем согласие
    UPDATE consents 
    SET 
        granted = false,
        is_active = false,
        revoked_at = NOW()
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
        'revoked_at', NOW()
    );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 🔧 RPC функция: get_client_consents
-- Получение всех согласий клиента
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_client_consents(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'type', consent_type,
            'granted', granted,
            'version', document_version,
            'signature_method', signature_method,
            'created_at', created_at,
            'revoked_at', revoked_at
        )
    )
    INTO v_result
    FROM consents
    WHERE client_id = p_client_id
    ORDER BY created_at DESC;

    RETURN jsonb_build_object(
        'success', true,
        'consents', COALESCE(v_result, '[]'::jsonb),
        'client_id', p_client_id
    );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ✅ Проверка создания функций
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_functions TEXT[] := ARRAY['log_consents', 'check_required_consents', 'revoke_consent', 'get_client_consents'];
    f TEXT;
BEGIN
    FOREACH f IN ARRAY v_functions LOOP
        IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = f) THEN
            RAISE NOTICE '✅ Функция %() создана', f;
        ELSE
            RAISE NOTICE '❌ Функция %() НЕ найдена!', f;
        END IF;
    END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 🎉 Миграция consents_functions завершена!
-- ═══════════════════════════════════════════════════════════════════════════════
