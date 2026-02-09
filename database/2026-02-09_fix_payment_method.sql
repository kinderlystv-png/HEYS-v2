-- Fix admin_activate_trial v4.1: remove payment_method column reference
-- The subscriptions table does not have a payment_method column

CREATE OR REPLACE FUNCTION admin_activate_trial(
  p_client_id UUID,
  p_start_date DATE DEFAULT CURRENT_DATE,
  p_trial_days INTEGER DEFAULT 7,
  p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_trial_start TIMESTAMPTZ;
  v_trial_end TIMESTAMPTZ;
  v_status TEXT;
  v_is_future BOOLEAN;
BEGIN
  -- 1. Check client exists
  IF NOT EXISTS (SELECT 1 FROM clients WHERE id = p_client_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'client_not_found');
  END IF;

  -- 2. Calculate dates
  IF p_start_date <= CURRENT_DATE THEN
    v_trial_start := NOW();
    v_trial_end := NOW() + (p_trial_days || ' days')::INTERVAL;
    v_is_future := false;
  ELSE
    v_trial_start := p_start_date::TIMESTAMPTZ;
    v_trial_end := p_start_date::TIMESTAMPTZ + (p_trial_days || ' days')::INTERVAL;
    v_is_future := true;
  END IF;

  -- 3. Determine status
  IF v_is_future THEN
    v_status := 'trial_pending';
  ELSE
    v_status := 'trial';
  END IF;

  -- 4. Update clients
  UPDATE clients
  SET 
    subscription_status = v_status,
    trial_started_at = v_trial_start,
    trial_ends_at = v_trial_end,
    updated_at = NOW()
  WHERE id = p_client_id;

  -- 5. UPSERT subscriptions (source of truth) - no payment_method column
  INSERT INTO subscriptions (client_id, trial_started_at, trial_ends_at, active_until)
  VALUES (p_client_id, v_trial_start, v_trial_end, v_trial_end)
  ON CONFLICT (client_id) DO UPDATE SET
    trial_started_at = v_trial_start,
    trial_ends_at = v_trial_end,
    active_until = v_trial_end,
    updated_at = NOW();

  -- 6. AUDIT LOG
  IF p_curator_id IS NOT NULL THEN
    INSERT INTO trial_queue_events (
      client_id, 
      event_type, 
      event_data
    ) VALUES (
      p_client_id,
      'claimed',
      jsonb_build_object(
        'curator_id', p_curator_id,
        'trial_days', p_trial_days,
        'start_date', p_start_date,
        'is_future', v_is_future,
        'source', 'admin_activate_trial_v4.1'
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', v_status,
    'trial_started_at', v_trial_start,
    'trial_ends_at', v_trial_end,
    'is_future', v_is_future
  );
END;
$$;

COMMENT ON FUNCTION admin_activate_trial(UUID, DATE, INTEGER, UUID) IS 'v4.1: Fixed - removed payment_method column reference';
