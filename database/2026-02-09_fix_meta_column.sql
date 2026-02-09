-- Fix admin_activate_trial v4.2 and admin_extend_trial v2.2
-- Issues: 1) column is 'meta' not 'event_data'
--         2) Add new event types to CHECK constraint

-- 1. Extend CHECK constraint to allow new event types
ALTER TABLE trial_queue_events DROP CONSTRAINT IF EXISTS trial_queue_events_event_type_check;
ALTER TABLE trial_queue_events ADD CONSTRAINT trial_queue_events_event_type_check 
  CHECK (event_type = ANY (ARRAY[
    'queued', 'offer_sent', 'claimed', 'offer_expired', 
    'canceled', 'canceled_by_purchase', 'purchased',
    'trial_extended_by_curator', 'trial_activated_by_curator'
  ]));

-- 2. Fix admin_activate_trial: event_data -> meta
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
  IF NOT EXISTS (SELECT 1 FROM clients WHERE id = p_client_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'client_not_found');
  END IF;

  IF p_start_date <= CURRENT_DATE THEN
    v_trial_start := NOW();
    v_trial_end := NOW() + (p_trial_days || ' days')::INTERVAL;
    v_is_future := false;
  ELSE
    v_trial_start := p_start_date::TIMESTAMPTZ;
    v_trial_end := p_start_date::TIMESTAMPTZ + (p_trial_days || ' days')::INTERVAL;
    v_is_future := true;
  END IF;

  IF v_is_future THEN
    v_status := 'trial_pending';
  ELSE
    v_status := 'trial';
  END IF;

  UPDATE clients
  SET subscription_status = v_status,
      trial_started_at = v_trial_start,
      trial_ends_at = v_trial_end,
      updated_at = NOW()
  WHERE id = p_client_id;

  INSERT INTO subscriptions (client_id, trial_started_at, trial_ends_at, active_until)
  VALUES (p_client_id, v_trial_start, v_trial_end, v_trial_end)
  ON CONFLICT (client_id) DO UPDATE SET
    trial_started_at = v_trial_start,
    trial_ends_at = v_trial_end,
    active_until = v_trial_end,
    updated_at = NOW();

  IF p_curator_id IS NOT NULL THEN
    INSERT INTO trial_queue_events (client_id, event_type, meta)
    VALUES (
      p_client_id,
      'claimed',
      jsonb_build_object(
        'curator_id', p_curator_id,
        'trial_days', p_trial_days,
        'start_date', p_start_date,
        'is_future', v_is_future,
        'source', 'admin_activate_trial_v4.2'
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

-- 3. Fix admin_extend_trial: event_data -> meta, no payment_method
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

  IF v_client.trial_ends_at IS NULL OR v_client.trial_ends_at < NOW() THEN
    v_new_trial_ends := NOW() + (p_days || ' days')::interval;
  ELSE
    v_new_trial_ends := v_client.trial_ends_at + (p_days || ' days')::interval;
  END IF;

  UPDATE clients
  SET subscription_status = 'trial',
      trial_ends_at = v_new_trial_ends,
      updated_at = NOW()
  WHERE id = p_client_id;

  UPDATE subscriptions
  SET trial_ends_at = v_new_trial_ends,
      active_until = v_new_trial_ends,
      updated_at = NOW()
  WHERE client_id = p_client_id;

  IF p_curator_id IS NOT NULL THEN
    INSERT INTO trial_queue_events (client_id, event_type, meta)
    VALUES (
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

COMMENT ON FUNCTION admin_activate_trial(UUID, DATE, INTEGER, UUID) IS 'v4.2: Fixed meta column + no payment_method';
COMMENT ON FUNCTION admin_extend_trial(UUID, INTEGER, UUID) IS 'v2.2: Fixed meta column + no payment_method';
