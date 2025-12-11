-- =============================================================================
-- ИСПРАВЛЕНИЕ: Удаление ключей с ДВОЙНЫМ client_id
-- =============================================================================
-- Проблема: Баг в saveClientKey сохранял ключи как:
--   heys_ccfe6ea3-..._ccfe6ea3-..._dayv2_2025-12-11 (НЕПРАВИЛЬНО!)
-- Вместо:
--   heys_dayv2_2025-12-11 (нормализованный ключ)
--
-- Дата: 2025-12-11
-- Клиент: Poplanton (ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a)
-- =============================================================================

-- 1. Сначала смотрим какие проблемные ключи есть
SELECT 
    ckv.k,
    ckv.client_id,
    length(ckv.k) as key_length,
    CASE 
        WHEN ckv.k LIKE '%' || ckv.client_id::text || '%' || ckv.client_id::text || '%' THEN 'DOUBLE_ID (удалить!)'
        WHEN ckv.k LIKE '%' || ckv.client_id::text || '%' THEN 'SINGLE_ID (старый формат)'
        ELSE 'NORMALIZED (OK)'
    END as status
FROM client_kv_store ckv
WHERE ckv.client_id = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a'
ORDER BY status, ckv.k;

-- 2. Считаем сколько ключей каждого типа
SELECT 
    CASE 
        WHEN ckv.k LIKE '%' || ckv.client_id::text || '%' || ckv.client_id::text || '%' THEN 'DOUBLE_ID'
        WHEN ckv.k LIKE '%' || ckv.client_id::text || '%' THEN 'SINGLE_ID'
        ELSE 'NORMALIZED'
    END as key_type,
    COUNT(*) as count
FROM client_kv_store ckv
WHERE ckv.client_id = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a'
GROUP BY 1
ORDER BY 1;

-- 3. ОПАСНО! УДАЛЕНИЕ ключей с двойным client_id
-- Раскомментируй для выполнения:

/*
DELETE FROM client_kv_store
WHERE client_id = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a'
  AND k LIKE '%' || 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a' || '%' || 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a' || '%';
*/

-- 4. Проверка: ищем ключи дней после очистки
SELECT 
    ckv.k,
    ckv.updated_at,
    LEFT(ckv.v::text, 100) as value_preview
FROM client_kv_store ckv
WHERE ckv.client_id = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a'
  AND ckv.k LIKE '%dayv2%'
ORDER BY ckv.k DESC
LIMIT 20;

-- =============================================================================
-- МИГРАЦИЯ: Конвертация старых ключей (с одним client_id) в нормализованные
-- =============================================================================
-- Это нужно сделать ПОСЛЕ очистки двойных ключей

-- 5. Смотрим какие ключи нужно мигрировать
SELECT 
    ckv.k as old_key,
    REPLACE(ckv.k, 'heys_' || ckv.client_id::text || '_', 'heys_') as new_key,
    ckv.updated_at
FROM client_kv_store ckv
WHERE ckv.client_id = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a'
  AND ckv.k LIKE 'heys_%' || ckv.client_id::text || '%'
  AND ckv.k NOT LIKE '%' || ckv.client_id::text || '%' || ckv.client_id::text || '%'
ORDER BY ckv.k
LIMIT 20;

-- 6. ОПАСНО! Миграция ключей (переименование)
-- Раскомментируй для выполнения:

/*
UPDATE client_kv_store
SET k = REPLACE(k, 'heys_' || client_id::text || '_', 'heys_')
WHERE client_id = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a'
  AND k LIKE 'heys_%' || client_id::text || '%'
  AND k NOT LIKE '%' || client_id::text || '%' || client_id::text || '%';
*/

-- 7. Проверка результатов после миграции
SELECT 
    ckv.k,
    ckv.updated_at
FROM client_kv_store ckv
WHERE ckv.client_id = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a'
ORDER BY ckv.k
LIMIT 30;
