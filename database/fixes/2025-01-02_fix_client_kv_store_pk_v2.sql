-- 2025-01-02: Fix client_kv_store PRIMARY KEY
-- ═══════════════════════════════════════════════════════════════════════════
-- ПРОБЛЕМА:
--   Код использует ON CONFLICT (client_id, k), но PK = (user_id, client_id, k)
--   PostgreSQL выдаёт ошибку: ON CONFLICT не совпадает с unique constraint
--
-- РЕШЕНИЕ:
--   Изменить PK на (client_id, k) — клиент всегда принадлежит одному куратору
--
-- ⚠️ ВНИМАНИЕ: Миграция должна быть идемпотентной!
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Сначала диагностика: посмотреть текущие constraints
DO $$
DECLARE
    pk_cols TEXT;
BEGIN
    -- Получаем колонки PRIMARY KEY
    SELECT string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position)
    INTO pk_cols
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
    WHERE tc.table_name = 'client_kv_store'
        AND tc.constraint_type = 'PRIMARY KEY';
    
    RAISE NOTICE '📊 Current PRIMARY KEY columns: %', COALESCE(pk_cols, 'NONE');
    
    -- Если PK уже правильный — ничего не делаем
    IF pk_cols = 'client_id, k' THEN
        RAISE NOTICE '✅ PRIMARY KEY already correct (client_id, k)';
        RETURN;
    END IF;
    
    RAISE NOTICE '🔧 Need to migrate PRIMARY KEY from (%) to (client_id, k)', pk_cols;
END $$;

-- 2. Удаляем дубликаты (если есть) — оставляем только последнюю версию
-- Дубликаты могут появиться если один клиент был у нескольких кураторов
DELETE FROM client_kv_store a 
USING client_kv_store b
WHERE a.ctid < b.ctid  -- Удаляем более старую запись
    AND a.client_id = b.client_id 
    AND a.k = b.k;

-- 3. Удаляем старый PRIMARY KEY constraint (если есть)
-- Используем DO block для идемпотентности
DO $$
BEGIN
    -- Пробуем удалить constraint
    BEGIN
        ALTER TABLE client_kv_store DROP CONSTRAINT IF EXISTS client_kv_store_pkey;
        RAISE NOTICE '✅ Dropped old PRIMARY KEY constraint';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '⚠️ Could not drop constraint: %', SQLERRM;
    END;
END $$;

-- 4. Создаём новый PRIMARY KEY на (client_id, k)
-- Два шага: сначала UNIQUE INDEX, потом PRIMARY KEY
DO $$
BEGIN
    -- Проверяем, есть ли уже нужный индекс
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'client_kv_store' 
        AND indexname = 'client_kv_store_client_k_unique'
    ) THEN
        -- Создаём уникальный индекс
        CREATE UNIQUE INDEX client_kv_store_client_k_unique 
        ON client_kv_store (client_id, k);
        RAISE NOTICE '✅ Created UNIQUE INDEX on (client_id, k)';
    ELSE
        RAISE NOTICE 'ℹ️ UNIQUE INDEX already exists';
    END IF;
END $$;

-- 5. Добавляем PRIMARY KEY используя существующий индекс
DO $$
DECLARE
    pk_exists BOOLEAN;
BEGIN
    -- Проверяем есть ли PK
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'client_kv_store' 
        AND constraint_type = 'PRIMARY KEY'
    ) INTO pk_exists;
    
    IF NOT pk_exists THEN
        -- Добавляем PK используя индекс (PostgreSQL 11+)
        ALTER TABLE client_kv_store 
        ADD CONSTRAINT client_kv_store_pkey 
        PRIMARY KEY USING INDEX client_kv_store_client_k_unique;
        RAISE NOTICE '✅ Added PRIMARY KEY using UNIQUE INDEX';
    ELSE
        RAISE NOTICE 'ℹ️ PRIMARY KEY already exists';
    END IF;
END $$;

-- 6. Финальная проверка
DO $$
DECLARE
    pk_cols TEXT;
BEGIN
    SELECT string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position)
    INTO pk_cols
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
    WHERE tc.table_name = 'client_kv_store'
        AND tc.constraint_type = 'PRIMARY KEY';
    
    IF pk_cols = 'client_id, k' THEN
        RAISE NOTICE '🎉 Migration SUCCESS! PRIMARY KEY is now (client_id, k)';
    ELSE
        RAISE EXCEPTION '❌ Migration FAILED! PRIMARY KEY is (%), expected (client_id, k)', pk_cols;
    END IF;
END $$;

-- 7. Добавляем/проверяем индекс на user_id для запросов куратора
CREATE INDEX IF NOT EXISTS idx_client_kv_store_user_id ON client_kv_store(user_id);

-- 8. Добавляем/проверяем составной индекс для запросов куратора по клиенту
CREATE INDEX IF NOT EXISTS idx_client_kv_store_user_client ON client_kv_store(user_id, client_id);

SELECT '✅ Migration complete!' AS status;
