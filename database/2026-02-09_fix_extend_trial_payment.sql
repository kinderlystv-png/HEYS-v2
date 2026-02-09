-- Fix admin_extend_trial v2.1: remove payment_method column reference

CREATE OR REPLACE FUNCTION admin_extend_trial(
  p_client_id UUID,
  p_days INTEGER DEFAULT 30,
  p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client RECORD;
  v_new_trial_ends TIMESTAMPTZ;
BEGIN
  -- Get client
  SELECT id, name, subscription_status, trial_ends_at
  INTO v_client
  FROM clients
  WHERE id = p_client_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'client_not_found',
      'message', 'Client not found'
    );
  END IF;

  -- Calculate new date
  -- If trial expired - extend from now, otherwise from current end date
  IF v_client.trial_ends_at IS NULL OR v_client.trial_ends_at < NOW() THEN
    v_new_trial_ends := NOW() + (p_days || ' days')::interval;
  ELSE
    v_new_trial_ends := v_client.trial_ends_at + (p_days || ' days')::interval;
  END IF;

  -- Update clients
  UPDATE clients
  SET
    subscription_status = 'trial',
    trial_ends_at = v_new_trial_ends,
    updated_at = NOW()
  WHERE id = p_client_id;

  -- Update subscriptions (if exists) - no payment_method column
  UPDATE subscriptions
  SET
    trial_ends_at = v_new_trial_ends,
    active_until = v_new_trial_ends,
    updated_at = NOW()
  WHERE client_id = p_client_id;

  -- AUDIT LOG
  IF p_curator_id IS NOT NULL THEN
    INSERT INTO trial_queue_events (
      client_id,
      event_type,
      event_data
    ) VALUES (
      p_client_id,
      'trial_extended_by_curator',
      jsonb_build_object(
        'curator_id', p_curator_id,
        'days_added', p_days,
        'new_trial_ends', v_new_trial_ends,
        'old_trial_ends', v_client.trial_ends_at
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'trial',
    'trial_ends_at', v_new_trial_ends,
    'days_added', p_days,
    'client_name', v_client.name
  );
END;
$$;

COMMENT ON FUNCTION admin_extend_trial(UUID, INTEGER, UUID) IS 'v2.1: Fixed - removed payment_method column reference';
