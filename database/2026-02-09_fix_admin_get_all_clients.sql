-- Fix admin_get_all_clients v2.1: created_at -> updated_at
-- clients table does not have created_at column

CREATE OR REPLACE FUNCTION admin_get_all_clients(
  p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT jsonb_agg(jsonb_build_object(
      'id', id,
      'name', name,
      'phone_normalized', phone_normalized,
      'subscription_status', subscription_status,
      'trial_ends_at', trial_ends_at,
      'trial_started_at', trial_started_at,
      'curator_id', curator_id,
      'created_at', updated_at
    ) ORDER BY updated_at DESC)
    FROM clients
    WHERE p_curator_id IS NULL OR curator_id = p_curator_id
  );
END;
$$;

COMMENT ON FUNCTION admin_get_all_clients(UUID) IS 'v2.1: Fixed - use updated_at instead of created_at';
