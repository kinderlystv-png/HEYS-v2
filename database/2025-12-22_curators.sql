-- ═══════════════════════════════════════════════════════════════════════════
-- HEYS: Таблица curators для собственной аутентификации
-- Создано: 2025-12-22
-- Заменяет: Supabase Auth
-- ═══════════════════════════════════════════════════════════════════════════

-- Таблица кураторов
CREATE TABLE IF NOT EXISTS curators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    name TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_curators_email ON curators(email);
CREATE INDEX IF NOT EXISTS idx_curators_active ON curators(is_active) WHERE is_active = true;

-- Триггер обновления updated_at
CREATE OR REPLACE FUNCTION update_curators_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_curators_updated_at ON curators;
CREATE TRIGGER update_curators_updated_at
    BEFORE UPDATE ON curators
    FOR EACH ROW
    EXECUTE FUNCTION update_curators_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- Миграция: Создание первого куратора (основатель)
-- Email: kinderlystv@gmail.com
-- Password: заменить на реальный хеш после первого входа
-- ═══════════════════════════════════════════════════════════════════════════

-- Временно вставляем куратора с известным паролем
-- Password: HeysAdmin2024 (будет захеширован при первом входе)
-- Соль и хеш сгенерированы с помощью PBKDF2 (100000 итераций, SHA-512)

-- НЕ ВЫПОЛНЯТЬ В PRODUCTION БЕЗ ЗАМЕНЫ ПАРОЛЯ!
-- Это placeholder — реальные credentials нужно установить вручную

INSERT INTO curators (id, email, password_hash, password_salt, name, is_active)
VALUES (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',  -- Фиксированный UUID для миграции curator_id в clients
    'kinderlystv@gmail.com',
    -- Placeholder hash для пароля 'HeysAdmin2024' 
    -- ВАЖНО: Пересоздать с реальным паролем!
    'placeholder_hash_replace_me',
    'placeholder_salt_replace_me',
    'Антон Поплавский',
    true
)
ON CONFLICT (email) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- Комментарии
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE curators IS 'Кураторы HEYS — аутентификация через собственный JWT';
COMMENT ON COLUMN curators.password_hash IS 'PBKDF2-SHA512 хеш пароля (100000 итераций)';
COMMENT ON COLUMN curators.password_salt IS '16-байтная соль в hex формате';
