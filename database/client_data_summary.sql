-- СВОДКА: Все данные клиента с понятными названиями
-- Используйте для быстрой проверки того, что хранится в БД

SELECT 
  CASE 
    WHEN k = 'heys_products' THEN '📦 Продукты (' || jsonb_array_length(v)::text || ')'
    WHEN k LIKE '%_dayv2_%' THEN '📅 День ' || substring(k from '\d{4}-\d{2}-\d{2}')
    WHEN k LIKE '%_profile' THEN '👤 Профиль'
    WHEN k LIKE '%_norms' THEN '🎯 Нормы питания'
    WHEN k LIKE '%_hr_zones' THEN '❤️ Зоны пульса'
    WHEN k = 'heys_client_current' THEN '🔑 ID текущего клиента'
    ELSE '📝 ' || k
  END AS description,
  pg_size_pretty(pg_column_size(v)::bigint) AS size,
  to_char(updated_at, 'YYYY-MM-DD HH24:MI') AS last_updated
FROM client_kv_store
WHERE client_id = '73a55ec7-2b48-47de-8308-06d7bec4259a'
ORDER BY updated_at DESC;
