-- 2025-01-04: Allow NULL user_id in client_kv_store for PIN auth
-- ═══════════════════════════════════════════════════════════════════════════
-- ПРОБЛЕМА:
--   PIN auth клиенты не имеют user_id (это curator-only поле)
--   SQL функция batch_upsert_client_kv_by_session не передаёт user_id
--   Таблица требует user_id NOT NULL → INSERT fails
--
-- РЕШЕНИЕ:
--   Сделать user_id NULLABLE — NULL для PIN auth, UUID для curator клиентов
--
-- ⚠️ ВНИМАНИЕ: Выполнить ПОСЛЕ 2025-01-02_fix_client_kv_store_pk_v2.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Диагностика: проверить текущее состояние
DO $$
DECLARE
    is_nullable BOOLEAN;
    pk_cols TEXT;
BEGIN
    -- Проверяем nullable статус user_id
    SELECT is_nullable = 'YES'
    INTO is_nullable
    FROM information_schema.columns
    WHERE table_name = 'client_kv_store' AND column_name = 'user_id';
    
    IF is_nullable THEN
        RAISE NOTICE '✅ user_id is already NULLABLE - no action needed';
    ELSE
        RAISE NOTICE '🔧 user_id is NOT NULL - will fix';
    END IF;
    
    -- Проверяем PK
    SELECT string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position)
    INTO pk_cols
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'client_kv_store'
        AND tc.constraint_type = 'PRIMARY KEY';
    
    RAISE NOTICE '📊 Current PRIMARY KEY: %', COALESCE(pk_cols, 'NONE');
    
    IF pk_cols != 'client_id, k' THEN
        RAISE EXCEPTION '❌ PRIMARY KEY must be (client_id, k) before running this migration. Run 2025-01-02_fix_client_kv_store_pk_v2.sql first!';
    END IF;
END $$;

-- 2. Снять NOT NULL constraint с user_id
ALTER TABLE client_kv_store ALTER COLUMN user_id DROP NOT NULL;

-- 3. Финальная проверка
DO $$
DECLARE
    is_nullable BOOLEAN;
BEGIN
    SELECT is_nullable = 'YES'
    INTO is_nullable
    FROM information_schema.columns
    WHERE table_name = 'client_kv_store' AND column_name = 'user_id';
    
    IF is_nullable THEN
        RAISE NOTICE '🎉 Migration SUCCESS! user_id is now NULLABLE';
        RAISE NOTICE '   → PIN auth clients can now save data without user_id';
        RAISE NOTICE '   → Curator clients will continue to have user_id populated';
    ELSE
        RAISE EXCEPTION '❌ Migration FAILED! user_id is still NOT NULL';
    END IF;
END $$;

SELECT '✅ client_kv_store.user_id is now NULLABLE for PIN auth support!' AS status;
