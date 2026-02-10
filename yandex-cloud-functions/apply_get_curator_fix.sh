#!/bin/bash
# Применение миграции get_curator_clients на продакшн БД

export PGHOST="rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net"
export PGPORT="6432"
export PGDATABASE="heys_production"
export PGUSER="heys_admin"
export PGPASSWORD="heys007670"
export PGSSLMODE="require"

echo "📄 Применяю миграцию get_curator_clients..."

psql <<'EOSQL'
-- ============================================================================
-- HEYS Fix get_curator_clients — 2026-02-10
-- ============================================================================
DROP FUNCTION IF EXISTS get_curator_clients(UUID);

CREATE OR REPLACE FUNCTION get_curator_clients(p_curator_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    phone TEXT,
    subscription_status TEXT,
    subscription_plan TEXT,
    trial_ends_at TIMESTAMPTZ,
    subscription_ends_at TIMESTAMPTZ,
    active_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id, 
        c.name,
        c.phone_normalized as phone, 
        c.subscription_status,
        c.subscription_plan,
        c.trial_ends_at,
        s.active_until as subscription_ends_at,
        s.active_until,
        c.updated_at as created_at
    FROM clients c
    LEFT JOIN subscriptions s ON c.id = s.client_id
    WHERE c.curator_id = p_curator_id
    ORDER BY c.updated_at DESC;
END;
$$;

COMMENT ON FUNCTION get_curator_clients IS 'Список клиентов куратора с subscription_ends_at и active_until (v2.1)';
GRANT EXECUTE ON FUNCTION get_curator_clients TO heys_admin;
EOSQL

echo "✅ Готово!"
