-- =============================================================================
-- L2 — Live DB security audit (READ-ONLY).
-- Снимает ЗАДЕПЛОЕННОЕ состояние грантов/RLS/политик (миграции = намерение,
-- этот скрипт = факт). Безопасен: только SELECT по системным каталогам.
--
-- Запуск:  bash scripts/db/psql.sh -f scripts/security/audit-db.sql
-- Результат → переноси находки в docs/SECURITY_REVIEW.md (Журнал + Раздел 0 + Facts).
-- =============================================================================
\pset pager off
\timing off

\echo ''
\echo '== 1. SECURITY DEFINER функции БЕЗ явного search_path (риск hijack) =='
\echo '   Ожидаем: пусто. Любая строка — потенциальная привилегированная эскалация.'
SELECT n.nspname AS schema,
       p.proname AS function,
       pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosecdef
  AND n.nspname = 'public'
  AND NOT EXISTS (
    SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) c
    WHERE c LIKE 'search_path=%'
  )
ORDER BY 2;

\echo ''
\echo '== 2. Функции, исполнимые ролью PUBLIC (sensitive не должны) =='
SELECT n.nspname AS schema,
       p.proname AS function,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND has_function_privilege('public', p.oid, 'EXECUTE')
ORDER BY 2;

\echo ''
\echo '== 3. Гранты EXECUTE по runtime-ролям (least-privilege проверка) =='
SELECT grantee,
       routine_name,
       string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
FROM information_schema.role_routine_grants
WHERE specific_schema = 'public'
  AND grantee IN ('heys_rpc', 'heys_rest', 'anon', 'authenticated', 'PUBLIC')
GROUP BY grantee, routine_name
ORDER BY grantee, routine_name;

\echo ''
\echo '== 4. Таблицы public БЕЗ включённого RLS =='
\echo '   Sensitive-таблицы (client_*, payments, sessions, consents) тут быть НЕ должны.'
SELECT c.relname AS table,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relrowsecurity, c.relname;

\echo ''
\echo '== 5. RLS-политики (pg_policies) =='
SELECT tablename, policyname, cmd, roles, qual AS using_expr, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

\echo ''
\echo '== 6. Прямой доступ к таблицам у anon/authenticated/PUBLIC =='
\echo '   Ожидаем: пусто/минимум. Прямой SELECT/INSERT в обход RPC — риск.'
SELECT grantee,
       table_name,
       string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated', 'PUBLIC')
GROUP BY grantee, table_name
ORDER BY grantee, table_name;

\echo ''
\echo '== 7. FK на clients(id): тип ON DELETE (orphan-leak проверка) =='
\echo '   confdeltype: a=NO ACTION, r=RESTRICT, c=CASCADE, n=SET NULL, d=SET DEFAULT'
\echo '   Ожидаем c (или n для leads). a/r у per-client таблицы = будущая утечка сирот.'
SELECT conrelid::regclass AS table,
       conname AS constraint,
       confdeltype AS on_delete
FROM pg_constraint
WHERE confrelid = 'public.clients'::regclass AND contype = 'f'
ORDER BY 1;

\echo ''
\echo '== 8. Прод-проверка инварианта №8: UPSERT с auth-триггерами =='
\echo '   (ручная сверка) убедись, что client_kv_store ON CONFLICT делает'
\echo '   SET user_id = EXCLUDED.user_id — иначе stale user_id блокирует writes.'

\echo ''
\echo '== Готово. Перенеси находки в docs/SECURITY_REVIEW.md =='
