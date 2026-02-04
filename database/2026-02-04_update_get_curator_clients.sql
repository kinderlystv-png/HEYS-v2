-- Update get_curator_clients to return subscription info
-- Note: Uses UUID parameter to match original function signature

-- Сначала удаляем старую функцию (если типы изменились)
DROP FUNCTION IF EXISTS get_curator_clients(UUID);

CREATE OR REPLACE FUNCTION get_curator_clients(p_curator_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    phone TEXT,
    subscription_status TEXT,
    subscription_plan TEXT,
    trial_ends_at TIMESTAMPTZ,
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
        c.updated_at as created_at
    FROM clients c
    WHERE c.curator_id = p_curator_id
    ORDER BY c.updated_at DESC;
END;
$$;
