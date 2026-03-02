-- ============================================================================
-- Migration: Fix admin_get_leads — add missing `name` field
-- Date: 2026-03-02
-- Issue: name field was dropped in 2026-02-10_trial_chain_fixes.sql refactor
--        Curator panel shows "undefined" instead of lead name
-- ============================================================================

BEGIN;

-- Drop old signatures
DROP FUNCTION IF EXISTS admin_get_leads(TEXT);
DROP FUNCTION IF EXISTS admin_get_leads(TEXT, UUID);

CREATE OR REPLACE FUNCTION admin_get_leads(
    p_status TEXT DEFAULT 'new',
    p_curator_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    phone TEXT,
    messenger TEXT,
    status TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    created_at TIMESTAMPTZ,
    contacted_at TIMESTAMPTZ,
    curator_id UUID,
    notes TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        l.id,
        l.name,
        l.phone,
        l.messenger,
        l.status,
        l.utm_source,
        l.utm_medium,
        l.utm_campaign,
        l.created_at,
        l.contacted_at,
        l.curator_id,
        l.notes
    FROM leads l
    WHERE (p_status = 'all' OR l.status = p_status)
    ORDER BY l.created_at DESC;
END;
$$;

COMMENT ON FUNCTION admin_get_leads IS 'Получение списка лидов с лендинга. v2.1: restored name field (was dropped in trial_chain_fixes refactor).';

-- Grants
GRANT EXECUTE ON FUNCTION admin_get_leads(TEXT, UUID) TO heys_rpc;
GRANT EXECUTE ON FUNCTION admin_get_leads(TEXT, UUID) TO heys_admin;

COMMIT;

DO $$
BEGIN
    RAISE NOTICE '✅ admin_get_leads: name field restored';
END $$;
