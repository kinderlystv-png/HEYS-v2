-- ═══════════════════════════════════════════════════════════════════════════════
-- HEYS: Миграция — поддержка payment_oferta consent + session-safe RPC
-- Версия: 1.0
-- Дата: 2026-03-01
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Что делает эта миграция:
--   1. Расширяет CHECK constraint consents_consent_type_check — добавляет 'payment_oferta'
--   2. Обновляет log_consents — теперь принимает 'payment_oferta' как валидный тип
--   3. Создаёт log_consents_by_session — session-safe версия (IDOR protection)
--   4. Создаёт check_payment_consent_by_session — проверка наличия payment_oferta
--
-- Идемпотентна: можно выполнять повторно.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1) Расширяем CHECK constraint — добавляем 'payment_oferta'
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    -- Удаляем старый constraint если существует
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'consents_consent_type_check'
    ) THEN
        ALTER TABLE public.consents DROP CONSTRAINT consents_consent_type_check;
    END IF;

    -- Создаём новый с payment_oferta
    ALTER TABLE public.consents
    ADD CONSTRAINT consents_consent_type_check
    CHECK (consent_type IN (
        'user_agreement',
        'personal_data',
        'health_data',
        'marketing',
        'payment_oferta'
    ));

    RAISE NOTICE '✅ consents_consent_type_check обновлён — добавлен payment_oferta';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2) Обновляем log_consents — принимает 'payment_oferta'
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

        -- Проверяем валидность типа (включая payment_oferta)
        IF v_type NOT IN ('user_agreement', 'personal_data', 'health_data', 'marketing', 'payment_oferta') THEN
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
            CASE WHEN p_ip IS NOT NULL THEN p_ip::inet ELSE NULL END,
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

COMMENT ON FUNCTION public.log_consents(UUID, JSONB, TEXT, TEXT) IS
  'Логирование согласий (v1.1 + payment_oferta). Типы: user_agreement, personal_data, health_data, marketing, payment_oferta';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3) log_consents_by_session — session-safe версия (IDOR protection)
--    Паттерн: client_id ВСЕГДА из сессии, НИКОГДА из параметра
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.log_consents_by_session(
    p_session_token TEXT,
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
    v_client_id UUID;
BEGIN
    -- 🔐 Извлекаем client_id из сессии (безопасно!)
    v_client_id := public.require_client_id(p_session_token);

    -- Делегируем в основную функцию
    RETURN public.log_consents(v_client_id, p_consents, p_ip, p_user_agent);

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

COMMENT ON FUNCTION public.log_consents_by_session(TEXT, JSONB, TEXT, TEXT) IS
  '🔐 Session-safe: client_id из сессии, не из параметра. Prevents IDOR. Делегирует в log_consents.';

GRANT EXECUTE ON FUNCTION public.log_consents_by_session(TEXT, JSONB, TEXT, TEXT) TO heys_rpc;
REVOKE ALL ON FUNCTION public.log_consents_by_session(TEXT, JSONB, TEXT, TEXT) FROM PUBLIC;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4) check_payment_consent_by_session — проверка payment_oferta перед оплатой
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.check_payment_consent_by_session(
    p_session_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_client_id UUID;
    v_has_consent BOOLEAN;
    v_consent_version TEXT;
    v_consent_date TIMESTAMPTZ;
BEGIN
    -- 🔐 Извлекаем client_id из сессии
    v_client_id := public.require_client_id(p_session_token);

    -- Проверяем наличие активного payment_oferta
    SELECT
        true,
        document_version,
        created_at
    INTO v_has_consent, v_consent_version, v_consent_date
    FROM consents
    WHERE client_id = v_client_id
      AND consent_type = 'payment_oferta'
      AND granted = true
    ORDER BY created_at DESC
    LIMIT 1;

    v_has_consent := COALESCE(v_has_consent, false);

    RETURN jsonb_build_object(
        'success', true,
        'has_payment_consent', v_has_consent,
        'consent_version', v_consent_version,
        'consent_date', v_consent_date,
        'client_id', v_client_id
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

COMMENT ON FUNCTION public.check_payment_consent_by_session(TEXT) IS
  '🔐 Session-safe: проверяет наличие payment_oferta consent перед оплатой. IDOR-protected.';

GRANT EXECUTE ON FUNCTION public.check_payment_consent_by_session(TEXT) TO heys_rpc;
REVOKE ALL ON FUNCTION public.check_payment_consent_by_session(TEXT) FROM PUBLIC;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ✅ Проверка
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_functions TEXT[] := ARRAY[
        'log_consents',
        'log_consents_by_session',
        'check_payment_consent_by_session'
    ];
    f TEXT;
BEGIN
    FOREACH f IN ARRAY v_functions LOOP
        IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = f) THEN
            RAISE NOTICE '✅ Функция %() создана/обновлена', f;
        ELSE
            RAISE NOTICE '❌ Функция %() НЕ найдена!', f;
        END IF;
    END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 🎉 Миграция payment_oferta_consent завершена!
-- ═══════════════════════════════════════════════════════════════════════════════
