-- =====================================================
-- curator_sessions — Сессии кураторов для авторизации
-- Version: 1.0.0
-- Date: 2025-01-10
-- =====================================================

-- Включаем расширение для digest() если не включено
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================
-- 1. Таблица curator_sessions
-- =====================================================
CREATE TABLE IF NOT EXISTS curator_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Связь с куратором
    user_id UUID NOT NULL REFERENCES curators(id) ON DELETE CASCADE,
    
    -- Токен сессии (хранится только хеш)
    token_hash BYTEA NOT NULL,
    
    -- Время жизни сессии
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Метаданные для безопасности
    ip_address INET,
    user_agent TEXT,
    
    -- Статус сессии
    is_revoked BOOLEAN DEFAULT false,
    revoked_at TIMESTAMPTZ
);

-- =====================================================
-- 2. Индексы для производительности
-- =====================================================

-- Быстрый поиск по токену (используется в каждом запросе)
CREATE UNIQUE INDEX IF NOT EXISTS idx_curator_sessions_token_hash 
    ON curator_sessions(token_hash) 
    WHERE is_revoked = false;

-- Поиск по куратору (для revoke all sessions)
CREATE INDEX IF NOT EXISTS idx_curator_sessions_user_id 
    ON curator_sessions(user_id);

-- Очистка истёкших сессий
CREATE INDEX IF NOT EXISTS idx_curator_sessions_expires 
    ON curator_sessions(expires_at) 
    WHERE is_revoked = false;

-- =====================================================
-- 3. Функция создания сессии
-- =====================================================
CREATE OR REPLACE FUNCTION create_curator_session(
    p_user_id UUID,
    p_token TEXT,
    p_expires_in_hours INT DEFAULT 24,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session_id UUID;
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- Проверяем что куратор существует и активен
    IF NOT EXISTS (SELECT 1 FROM curators WHERE id = p_user_id AND is_active = true) THEN
        RETURN jsonb_build_object('success', false, 'error', 'curator_not_found_or_inactive');
    END IF;
    
    v_expires_at := NOW() + (p_expires_in_hours || ' hours')::INTERVAL;
    
    -- Создаём сессию
    INSERT INTO curator_sessions (user_id, token_hash, expires_at, ip_address, user_agent)
    VALUES (
        p_user_id,
        digest(p_token, 'sha256'),
        v_expires_at,
        p_ip_address,
        p_user_agent
    )
    RETURNING id INTO v_session_id;
    
    -- Обновляем last_login_at куратора
    UPDATE curators SET last_login_at = NOW() WHERE id = p_user_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'session_id', v_session_id,
        'expires_at', v_expires_at
    );
END;
$$;

-- =====================================================
-- 4. Функция валидации сессии
-- =====================================================
CREATE OR REPLACE FUNCTION validate_curator_session(
    p_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_curator_name TEXT;
    v_curator_email TEXT;
BEGIN
    -- Ищем активную сессию
    SELECT cs.user_id, c.name, c.email
    INTO v_user_id, v_curator_name, v_curator_email
    FROM curator_sessions cs
    JOIN curators c ON c.id = cs.user_id
    WHERE cs.token_hash = digest(p_token, 'sha256')
      AND cs.expires_at > NOW()
      AND cs.is_revoked = false
      AND c.is_active = true;
    
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_or_expired_session');
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_user_id,
        'name', v_curator_name,
        'email', v_curator_email
    );
END;
$$;

-- =====================================================
-- 5. Функция отзыва сессии
-- =====================================================
CREATE OR REPLACE FUNCTION revoke_curator_session(
    p_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_affected INT;
BEGIN
    UPDATE curator_sessions
    SET is_revoked = true, revoked_at = NOW()
    WHERE token_hash = digest(p_token, 'sha256')
      AND is_revoked = false;
    
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    
    RETURN jsonb_build_object(
        'success', true,
        'revoked_count', v_affected
    );
END;
$$;

-- =====================================================
-- 6. Функция отзыва всех сессий куратора
-- =====================================================
CREATE OR REPLACE FUNCTION revoke_all_curator_sessions(
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_affected INT;
BEGIN
    UPDATE curator_sessions
    SET is_revoked = true, revoked_at = NOW()
    WHERE user_id = p_user_id
      AND is_revoked = false;
    
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    
    RETURN jsonb_build_object(
        'success', true,
        'revoked_count', v_affected
    );
END;
$$;

-- =====================================================
-- 7. Функция очистки истёкших сессий (для cron)
-- =====================================================
CREATE OR REPLACE FUNCTION cleanup_expired_curator_sessions()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted INT;
BEGIN
    -- Удаляем сессии истёкшие более 30 дней назад
    DELETE FROM curator_sessions
    WHERE expires_at < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    
    RETURN jsonb_build_object(
        'success', true,
        'deleted_count', v_deleted
    );
END;
$$;

-- =====================================================
-- 8. Права доступа
-- =====================================================
-- Запрещаем публичный доступ
REVOKE ALL ON TABLE curator_sessions FROM PUBLIC;

-- Функции доступны через RPC
REVOKE ALL ON FUNCTION create_curator_session FROM PUBLIC;
REVOKE ALL ON FUNCTION validate_curator_session FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_curator_session FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_all_curator_sessions FROM PUBLIC;
REVOKE ALL ON FUNCTION cleanup_expired_curator_sessions FROM PUBLIC;

-- =====================================================
-- 9. Комментарии
-- =====================================================
COMMENT ON TABLE curator_sessions IS 'Сессии авторизации кураторов. Токен хранится в хешированном виде.';
COMMENT ON COLUMN curator_sessions.user_id IS 'UUID куратора из таблицы curators';
COMMENT ON COLUMN curator_sessions.token_hash IS 'SHA256 хеш токена сессии';
COMMENT ON COLUMN curator_sessions.expires_at IS 'Время истечения сессии';
COMMENT ON COLUMN curator_sessions.is_revoked IS 'Отозвана ли сессия (logout)';
