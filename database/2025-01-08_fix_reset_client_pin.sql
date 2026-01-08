-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX: reset_client_pin — исправление имён параметров
-- Проблема: Frontend отправляет p_pin_salt, p_pin_hash
--           Но старая функция ожидала p_pin_hash, p_salt (другой порядок и имена!)
-- 
-- 2025-01-08: Синхронизация с heys_auth_v1.js:322
-- ═══════════════════════════════════════════════════════════════════════════════

-- Удаляем все версии функции (могут быть с разными сигнатурами)
DROP FUNCTION IF EXISTS public.reset_client_pin(uuid, text, text);
DROP FUNCTION IF EXISTS public.reset_client_pin(uuid, text, text, uuid);

-- Создаём правильную версию
-- Параметры соответствуют frontend: p_client_id, p_pin_salt, p_pin_hash
CREATE OR REPLACE FUNCTION public.reset_client_pin(
    p_client_id UUID,
    p_pin_salt TEXT,
    p_pin_hash TEXT,
    p_curator_id UUID DEFAULT NULL
)
RETURNS TABLE(
    success BOOLEAN,
    error TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated INTEGER;
BEGIN
    -- Валидация salt
    IF p_pin_salt IS NULL OR length(p_pin_salt) < 16 THEN
        RETURN QUERY SELECT FALSE::BOOLEAN, 'Некорректная соль'::TEXT;
        RETURN;
    END IF;
    
    -- Валидация hash
    IF p_pin_hash IS NULL OR length(p_pin_hash) < 32 THEN
        RETURN QUERY SELECT FALSE::BOOLEAN, 'Некорректный хеш PIN'::TEXT;
        RETURN;
    END IF;
    
    -- Обновляем PIN
    IF p_curator_id IS NOT NULL THEN
        -- С проверкой куратора (вызов через JWT)
        UPDATE public.clients
        SET 
            pin_salt = p_pin_salt,
            pin_hash = p_pin_hash,
            pin_failed_attempts = 0,
            pin_locked_until = NULL,
            updated_at = NOW()
        WHERE id = p_client_id
          AND curator_id = p_curator_id;
    ELSE
        -- Без проверки куратора (самостоятельный сброс или legacy)
        UPDATE public.clients
        SET 
            pin_salt = p_pin_salt,
            pin_hash = p_pin_hash,
            pin_failed_attempts = 0,
            pin_locked_until = NULL,
            updated_at = NOW()
        WHERE id = p_client_id;
    END IF;
    
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    
    IF v_updated = 0 THEN
        IF p_curator_id IS NOT NULL THEN
            RETURN QUERY SELECT FALSE::BOOLEAN, 'Клиент не найден или не принадлежит куратору'::TEXT;
        ELSE
            RETURN QUERY SELECT FALSE::BOOLEAN, 'Клиент не найден'::TEXT;
        END IF;
        RETURN;
    END IF;
    
    RETURN QUERY SELECT TRUE::BOOLEAN, NULL::TEXT;
END;
$$;

-- Права: только для authenticated (curators) и anon (для совместимости)
REVOKE ALL ON FUNCTION public.reset_client_pin(uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_client_pin(uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_client_pin(uuid, text, text, uuid) TO anon;

-- Тест
-- SELECT * FROM public.reset_client_pin('test-uuid'::uuid, 'test-salt-16chars', 'test-hash-32charactersxxxxxxxxxx');
