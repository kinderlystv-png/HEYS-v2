
-- Update get_curator_clients to return subscription info
-- Note: Uses UUID parameter to match original function signature
CREATE OR REPLACE FUNCTION get_curator_clients(p_curator_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    phone_normalized TEXT,
    created_at TIMESTAMPTZ,
    subscription_status VARCHAR,
    trial_ends_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id, 
        c.name, 
        c.phone_normalized, 
        c.updated_at as created_at,
        c.subscription_status,
        c.trial_ends_at
    FROM clients c
    WHERE c.curator_id = p_curator_id
    ORDER BY c.updated_at DESC;
END;
$$;
