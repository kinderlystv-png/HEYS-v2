-- Удаляем записи с двойным client_id в ключе
DELETE FROM client_kv_store
WHERE 
  client_id = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a'
  AND k LIKE '%ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a%';

-- Также чистим heys_dayv2_date из client_kv_store (это глобальный ключ)
DELETE FROM client_kv_store
WHERE k = 'heys_dayv2_date';
