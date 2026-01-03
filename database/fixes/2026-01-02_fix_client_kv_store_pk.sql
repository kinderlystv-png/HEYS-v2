-- 2026-01-02: Fix client_kv_store PRIMARY KEY
-- Проблема: ON CONFLICT (user_id, client_id, k) не работает
-- Причина: Скорее всего PRIMARY KEY не создан или создан на других колонках

-- 1. Диагностика: посмотреть текущие constraints
SELECT 
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'client_kv_store'
ORDER BY tc.constraint_type, kcu.ordinal_position;

-- 2. Посмотреть структуру таблицы
\d client_kv_store

-- 3. Если PRIMARY KEY отсутствует, добавим его
-- ВНИМАНИЕ: Сначала запустите диагностику выше!

-- Вариант A: Если PK вообще нет
-- ALTER TABLE client_kv_store ADD PRIMARY KEY (user_id, client_id, k);

-- Вариант B: Если PK на других колонках — сначала удалить, потом добавить
-- ALTER TABLE client_kv_store DROP CONSTRAINT client_kv_store_pkey;
-- ALTER TABLE client_kv_store ADD PRIMARY KEY (user_id, client_id, k);

-- Вариант C: Если есть дубликаты — сначала удалить их
-- DELETE FROM client_kv_store a USING client_kv_store b
-- WHERE a.ctid < b.ctid 
-- AND a.user_id = b.user_id 
-- AND a.client_id = b.client_id 
-- AND a.k = b.k;
