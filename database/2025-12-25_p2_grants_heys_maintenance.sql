-- =============================================================================
-- 🔐 P2 SECURITY: GRANT минимум для heys_maintenance
-- Дата: 2025-12-25
-- Контекст: Отдельный пользователь для CF heys-maintenance (cleanup cron)
-- =============================================================================

-- Только USAGE на schema public
GRANT USAGE ON SCHEMA public TO heys_maintenance;

-- Только EXECUTE на cleanup_security_logs — ничего больше!
GRANT EXECUTE ON FUNCTION public.cleanup_security_logs(integer) TO heys_maintenance;

-- ❌ НЕ ДАЁМ:
-- - SELECT/INSERT/UPDATE/DELETE на таблицы
-- - EXECUTE на другие функции
-- - CONNECT на другие БД
-- 
-- Даже если CF heys-maintenance скомпрометирован, злоумышленник может только
-- очищать старые логи — не читать KV, не менять подписки, не создавать клиентов.

-- Проверка (выполнить под heys_admin):
-- SELECT routine_name 
-- FROM information_schema.routine_privileges 
-- WHERE grantee = 'heys_maintenance';
-- Ожидается: только cleanup_security_logs
