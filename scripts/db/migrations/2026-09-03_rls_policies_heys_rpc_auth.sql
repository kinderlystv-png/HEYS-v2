-- 2026-09-03: политики RLS для роли heys_rpc на таблицах, с которыми работает heys-api-auth
--
-- Context: API ходит в базу под heys_admin — владельцем таблиц, а под владельцем
-- построчная защита не применяется вовсе. Поэтому точечные гранты роли heys_rpc
-- сегодня ни на что не влияют (heys/e96718, дефект подтверждён 20.08).
--
-- Переключить функцию на свою роль мешает не отсутствие грантов — они как раз есть.
-- Мешает то, что RLS включён на 55 таблицах из 74, а политик написано четыре:
-- три на ews_weekly_snapshots и одна на write_contexts. «Включено без политик»
-- означает «запрещено всё», и под любой ролью, кроме владельца, вход перестал бы
-- видеть даже таблицу клиентов.
--
-- Эта миграция закрывает разрыв для одной функции — heys-api-auth. Из девяти её
-- таблиц восемь имеют RLS и ноль политик; девятая (mobile_web_session_exchanges)
-- RLS не включает, ей политика не нужна.
--
-- Что политика даёт и чего не даёт. Она не ограничивает клиента и сама по себе
-- безопасности не добавляет: форма ровно та же, что у рабочего образца на
-- ews_weekly_snapshots — «роль видит своё всё». Выигрыш в другом: API перестаёт
-- быть владельцем таблиц. Владелец может ALTER и DROP, и его не остановит ни одна
-- политика, которая появится позже; отдельная роль — остановит.
--
-- Apply: bash scripts/db/psql.sh -f scripts/db/migrations/2026-09-03_rls_policies_heys_rpc_auth.sql
-- Rollback: см. ===== ROLLBACK ===== в конце файла.
--
-- ПРОВЕРКА ДО (ожидаем 8 — столько таблиц auth имеют RLS без единой политики):
--   SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public' AND c.relrowsecurity
--      AND c.relname IN ('auth_rate_limits','client_kv_store','client_sessions',
--                        'clients','curators','shared_products',
--                        'shared_products_pending','subscriptions')
--      AND NOT EXISTS (SELECT 1 FROM pg_policies p
--                       WHERE p.schemaname = 'public' AND p.tablename = c.relname);


-- ===== FORWARD =====
-- Идемпотентно: раннер может применить файл повторно, а CREATE POLICY на
-- существующем имени падает — снимаем прежде чем ставить.

DROP POLICY IF EXISTS heys_rpc_all_auth_rate_limits ON public.auth_rate_limits;
CREATE POLICY heys_rpc_all_auth_rate_limits ON public.auth_rate_limits
  FOR ALL USING (CURRENT_USER = 'heys_rpc'::name);

DROP POLICY IF EXISTS heys_rpc_all_client_kv_store ON public.client_kv_store;
CREATE POLICY heys_rpc_all_client_kv_store ON public.client_kv_store
  FOR ALL USING (CURRENT_USER = 'heys_rpc'::name);

DROP POLICY IF EXISTS heys_rpc_all_client_sessions ON public.client_sessions;
CREATE POLICY heys_rpc_all_client_sessions ON public.client_sessions
  FOR ALL USING (CURRENT_USER = 'heys_rpc'::name);

DROP POLICY IF EXISTS heys_rpc_all_clients ON public.clients;
CREATE POLICY heys_rpc_all_clients ON public.clients
  FOR ALL USING (CURRENT_USER = 'heys_rpc'::name);

DROP POLICY IF EXISTS heys_rpc_all_curators ON public.curators;
CREATE POLICY heys_rpc_all_curators ON public.curators
  FOR ALL USING (CURRENT_USER = 'heys_rpc'::name);

DROP POLICY IF EXISTS heys_rpc_all_shared_products ON public.shared_products;
CREATE POLICY heys_rpc_all_shared_products ON public.shared_products
  FOR ALL USING (CURRENT_USER = 'heys_rpc'::name);

DROP POLICY IF EXISTS heys_rpc_all_shared_products_pending ON public.shared_products_pending;
CREATE POLICY heys_rpc_all_shared_products_pending ON public.shared_products_pending
  FOR ALL USING (CURRENT_USER = 'heys_rpc'::name);

DROP POLICY IF EXISTS heys_rpc_all_subscriptions ON public.subscriptions;
CREATE POLICY heys_rpc_all_subscriptions ON public.subscriptions
  FOR ALL USING (CURRENT_USER = 'heys_rpc'::name);


-- ПРОВЕРКА ПОСЛЕ (ожидаем 8):
--   SELECT count(*) FROM pg_policies
--    WHERE schemaname = 'public' AND policyname LIKE 'heys_rpc_all_%';


-- ===== ROLLBACK =====
-- Снятие политик возвращает таблицы в прежнее состояние: RLS включён, политик нет,
-- то есть под heys_rpc они снова закрыты. Владельцу heys_admin это безразлично —
-- под ним RLS не применяется, и продукт продолжит работать как сейчас.
--
-- BEGIN;
-- DROP POLICY IF EXISTS heys_rpc_all_auth_rate_limits ON public.auth_rate_limits;
-- DROP POLICY IF EXISTS heys_rpc_all_client_kv_store ON public.client_kv_store;
-- DROP POLICY IF EXISTS heys_rpc_all_client_sessions ON public.client_sessions;
-- DROP POLICY IF EXISTS heys_rpc_all_clients ON public.clients;
-- DROP POLICY IF EXISTS heys_rpc_all_curators ON public.curators;
-- DROP POLICY IF EXISTS heys_rpc_all_shared_products ON public.shared_products;
-- DROP POLICY IF EXISTS heys_rpc_all_shared_products_pending ON public.shared_products_pending;
-- DROP POLICY IF EXISTS heys_rpc_all_subscriptions ON public.subscriptions;
-- COMMIT;
