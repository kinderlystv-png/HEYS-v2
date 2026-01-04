-- 2025-01-04: COMPLETE FIX for PIN auth KV storage
-- ═══════════════════════════════════════════════════════════════════════════
-- Этот скрипт объединяет ОБЕ необходимые миграции:
--   1. Изменить PRIMARY KEY с (user_id, client_id, k) на (client_id, k)
--   2. Сделать user_id NULLABLE для PIN auth клиентов
--
-- ВЫПОЛНИТЬ НА PRODUCTION DATABASE:
--   Host: rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net
--   Database: heys_production
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1: Диагностика текущего состояния
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
    pk_cols TEXT;
    is_nullable BOOLEAN;
BEGIN
    -- Проверяем PK
    SELECT string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position)
    INTO pk_cols
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'client_kv_store'
        AND tc.constraint_type = 'PRIMARY KEY';
    
    RAISE NOTICE '📊 Current PRIMARY KEY: %', COALESCE(pk_cols, 'NONE');
    
    -- Проверяем nullable
    SELECT c.is_nullable = 'YES'
    INTO is_nullable
    FROM information_schema.columns c
    WHERE c.table_name = 'client_kv_store' AND c.column_name = 'user_id';
    
    RAISE NOTICE '📊 user_id is nullable: %', COALESCE(is_nullable::text, 'N/A');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2: Удалить дубликаты по (client_id, k) если есть
-- ═══════════════════════════════════════════════════════════════════════════
DELETE FROM client_kv_store a 
USING client_kv_store b
WHERE a.ctid < b.ctid  -- Удаляем более старую запись
    AND a.client_id = b.client_id 
    AND a.k = b.k;

DO $$ 
BEGIN 
    RAISE NOTICE '✅ Duplicates removed (if any)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 3: Изменить PRIMARY KEY (если нужно)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
    pk_cols TEXT;
BEGIN
    SELECT string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position)
    INTO pk_cols
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'client_kv_store'
        AND tc.constraint_type = 'PRIMARY KEY';
    
    IF pk_cols = 'client_id, k' THEN
        RAISE NOTICE '✅ PRIMARY KEY already correct (client_id, k)';
    ELSE
        RAISE NOTICE '🔧 Changing PRIMARY KEY from (%) to (client_id, k)', pk_cols;
        
        -- Удаляем старый PK
        ALTER TABLE client_kv_store DROP CONSTRAINT IF EXISTS client_kv_store_pkey;
        
        -- Создаём новый PK
        ALTER TABLE client_kv_store ADD PRIMARY KEY (client_id, k);
        
        RAISE NOTICE '✅ PRIMARY KEY changed to (client_id, k)';
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 4: Сделать user_id NULLABLE (если нужно)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
    is_nullable BOOLEAN;
BEGIN
    SELECT c.is_nullable = 'YES'
    INTO is_nullable
    FROM information_schema.columns c
    WHERE c.table_name = 'client_kv_store' AND c.column_name = 'user_id';
    
    IF is_nullable THEN
        RAISE NOTICE '✅ user_id is already NULLABLE';
    ELSE
        RAISE NOTICE '🔧 Making user_id NULLABLE for PIN auth support';
        ALTER TABLE client_kv_store ALTER COLUMN user_id DROP NOT NULL;
        RAISE NOTICE '✅ user_id is now NULLABLE';
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 5: Создать/проверить индексы для производительности
-- ═══════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_client_kv_store_user_id ON client_kv_store(user_id);
CREATE INDEX IF NOT EXISTS idx_client_kv_store_user_client ON client_kv_store(user_id, client_id);

DO $$ BEGIN RAISE NOTICE '✅ Indexes created/verified'; END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 6: Финальная проверка
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
    pk_cols TEXT;
    is_nullable BOOLEAN;
BEGIN
    -- Проверяем PK
    SELECT string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position)
    INTO pk_cols
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'client_kv_store'
        AND tc.constraint_type = 'PRIMARY KEY';
    
    -- Проверяем nullable
    SELECT c.is_nullable = 'YES'
    INTO is_nullable
    FROM information_schema.columns c
    WHERE c.table_name = 'client_kv_store' AND c.column_name = 'user_id';
    
    -- Валидация
    IF pk_cols = 'client_id, k' AND is_nullable THEN
        RAISE NOTICE '';
        RAISE NOTICE '═══════════════════════════════════════════════════════════════════';
        RAISE NOTICE '🎉 ALL MIGRATIONS SUCCESSFUL!';
        RAISE NOTICE '═══════════════════════════════════════════════════════════════════';
        RAISE NOTICE '   ✅ PRIMARY KEY: (client_id, k)';
        RAISE NOTICE '   ✅ user_id: NULLABLE';
        RAISE NOTICE '   ✅ PIN auth clients can now save data!';
        RAISE NOTICE '═══════════════════════════════════════════════════════════════════';
    ELSE
        RAISE EXCEPTION '❌ Migration verification FAILED! PK=%, nullable=%', pk_cols, is_nullable;
    END IF;
END $$;

COMMIT;

SELECT '🎉 Migration complete! PIN auth should now work.' AS status;
