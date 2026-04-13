-- ═══════════════════════════════════════════════════════════════════════════════
-- heys_rpc: права для heys-api-auth и heys-api-rest (прямой доступ к таблицам)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Выполнять от роли с правом GRANT (обычно heys_admin / владелец схемы).
-- Нужно, если Cloud Functions подключаются как PG_USER=heys_rpc (не как heys_admin).
-- ═══════════════════════════════════════════════════════════════════════════════

-- heys-api-auth
GRANT SELECT, INSERT, UPDATE ON curators TO heys_rpc;
GRANT SELECT, INSERT, UPDATE, DELETE ON clients TO heys_rpc;
GRANT SELECT ON subscriptions TO heys_rpc;
GRANT SELECT ON client_kv_store TO heys_rpc;

-- heys-api-rest (whitelist-таблицы)
GRANT SELECT ON shared_products TO heys_rpc;
GRANT SELECT ON shared_products_blocklist TO heys_rpc;
GRANT SELECT, INSERT, UPDATE, DELETE ON shared_products_pending TO heys_rpc;
