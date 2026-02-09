-- ============================================================
-- Migration: JWT-only for ALL admin functions
-- Date: 2026-02-09
-- Description: Replace p_curator_session_token with p_curator_id UUID
--              for ALL curator functions. Auth is now handled by
--              cloud function (JWT verification), not by DB.
-- ============================================================

-- ============================================================
-- 1. admin_get_trial_queue_list
--    OLD: Decoded JWT inside function to get curator_id
--    NEW: Receives p_curator_id directly from cloud function
-- ============================================================
DROP FUNCTION IF EXISTS admin_get_trial_queue_list(TEXT, TEXT, TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION admin_get_trial_queue_list(
  p_curator_id UUID,
  p_status_filter TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_total INT;
BEGIN
  -- Count total matching records
  SELECT COUNT(*) INTO v_total
  FROM trial_queue tq
  LEFT JOIN clients c ON tq.client_id = c.id
  WHERE tq.curator_id = p_curator_id
    AND (p_status_filter IS NULL OR tq.status = p_status_filter)
    AND (p_search IS NULL OR c.name ILIKE '%' || p_search || '%' OR c.phone_normalized ILIKE '%' || p_search || '%');

  -- Build result
  SELECT jsonb_build_object(
    'success', true,
    'curator_id', p_curator_id,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'items', COALESCE(jsonb_agg(item ORDER BY item->>'queued_at' DESC), '[]'::jsonb)
  ) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'id', tq.id,
      'client_id', tq.client_id,
      'client_name', COALESCE(c.name, ''),
      'client_phone', COALESCE(c.phone_normalized, ''),
      'curator_id', tq.curator_id,
      'status', tq.status,
      'source', tq.source,
      'priority', tq.priority,
      'notification_channel', tq.notification_channel,
      'queued_at', tq.queued_at,
      'offer_sent_at', tq.offer_sent_at,
      'offer_expires_at', tq.offer_expires_at,
      'assigned_at', tq.assigned_at,
      'canceled_at', tq.canceled_at,
      'rejected_at', tq.rejected_at,
      'rejection_reason', tq.rejection_reason,
      'created_at', tq.created_at,
      'updated_at', tq.updated_at
    ) AS item
    FROM trial_queue tq
    LEFT JOIN clients c ON tq.client_id = c.id
    WHERE tq.curator_id = p_curator_id
      AND (p_status_filter IS NULL OR tq.status = p_status_filter)
      AND (p_search IS NULL OR c.name ILIKE '%' || p_search || '%' OR c.phone_normalized ILIKE '%' || p_search || '%')
    ORDER BY tq.queued_at DESC
    LIMIT p_limit OFFSET p_offset
  ) sub;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION admin_get_trial_queue_list(UUID, TEXT, TEXT, INTEGER, INTEGER)
IS 'v2.0 JWT-only: p_curator_id from JWT, no session token validation';

-- ============================================================
-- 2. admin_add_to_queue
--    OLD: Validated curator_session_token in curator_sessions
--    NEW: Uses p_curator_id directly
-- ============================================================
DROP FUNCTION IF EXISTS admin_add_to_queue(UUID, TEXT, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION admin_add_to_queue(
  p_client_id UUID,
  p_source TEXT DEFAULT 'admin_manual',
  p_priority INTEGER DEFAULT 10,
  p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_queue_id UUID;
  v_existing_status TEXT;
  v_position INT;
BEGIN
  -- Check if already in active queue
  SELECT status INTO v_existing_status
  FROM trial_queue
  WHERE client_id = p_client_id
    AND status IN ('queued', 'offer')
  LIMIT 1;

  IF v_existing_status IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'already_in_queue',
      'current_status', v_existing_status
    );
  END IF;

  -- Check for active subscription
  IF EXISTS (
    SELECT 1 FROM clients
    WHERE id = p_client_id
      AND subscription_status IN ('trial', 'active')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'has_active_subscription');
  END IF;

  -- Add to queue
  INSERT INTO trial_queue (client_id, curator_id, status, source, priority, queued_at)
  VALUES (
    p_client_id,
    COALESCE(p_curator_id, '00000000-0000-0000-0000-000000000000'::uuid),
    'queued',
    p_source,
    p_priority,
    NOW()
  )
  RETURNING id INTO v_queue_id;

  -- Calculate position
  SELECT COUNT(*) INTO v_position
  FROM trial_queue
  WHERE status = 'queued'
    AND (priority > p_priority OR (priority = p_priority AND queued_at <= NOW()));

  -- Log event
  INSERT INTO trial_queue_events (client_id, event_type, meta)
  VALUES (p_client_id, 'queued', jsonb_build_object(
    'source', 'admin_manual',
    'added_by', COALESCE(p_curator_id::text, 'admin')
  ));

  RETURN jsonb_build_object(
    'success', true,
    'queue_id', v_queue_id,
    'position', v_position
  );
END;
$$;

COMMENT ON FUNCTION admin_add_to_queue(UUID, TEXT, INTEGER, UUID)
IS 'v2.0 JWT-only: p_curator_id from JWT, no session token';

-- ============================================================
-- 3. admin_remove_from_queue
--    OLD: Validated curator_session_token
--    NEW: Uses p_curator_id directly
-- ============================================================
DROP FUNCTION IF EXISTS admin_remove_from_queue(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION admin_remove_from_queue(
  p_client_id UUID,
  p_reason TEXT DEFAULT 'admin_removed',
  p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_queue_id UUID;
  v_old_status TEXT;
BEGIN
  -- Find queue entry
  SELECT id, status INTO v_queue_id, v_old_status
  FROM trial_queue
  WHERE client_id = p_client_id
    AND status IN ('queued', 'offer')
  LIMIT 1;

  IF v_queue_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_in_queue');
  END IF;

  -- Update status
  UPDATE trial_queue
  SET status = 'canceled', canceled_at = NOW()
  WHERE id = v_queue_id;

  -- Log event
  INSERT INTO trial_queue_events (client_id, event_type, meta)
  VALUES (p_client_id, 'canceled', jsonb_build_object(
    'reason', p_reason,
    'removed_by', COALESCE(p_curator_id::text, 'admin'),
    'old_status', v_old_status
  ));

  RETURN jsonb_build_object(
    'success', true,
    'removed_queue_id', v_queue_id,
    'old_status', v_old_status
  );
END;
$$;

COMMENT ON FUNCTION admin_remove_from_queue(UUID, TEXT, UUID)
IS 'v2.0 JWT-only: p_curator_id from JWT';

-- ============================================================
-- 4. admin_send_offer
--    OLD: Validated curator_session_token
--    NEW: Uses p_curator_id directly
-- ============================================================
DROP FUNCTION IF EXISTS admin_send_offer(UUID, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION admin_send_offer(
  p_client_id UUID,
  p_offer_window_minutes INTEGER DEFAULT 120,
  p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_queue_id UUID;
  v_current_status TEXT;
  v_offer_expires TIMESTAMPTZ;
BEGIN
  -- Find queue entry
  SELECT id, status INTO v_queue_id, v_current_status
  FROM trial_queue
  WHERE client_id = p_client_id
    AND status IN ('queued', 'offer', 'expired')
  LIMIT 1;

  IF v_queue_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_in_queue');
  END IF;

  v_offer_expires := NOW() + (p_offer_window_minutes || ' minutes')::interval;

  UPDATE trial_queue
  SET status = 'offer', offer_sent_at = NOW(), offer_expires_at = v_offer_expires
  WHERE id = v_queue_id;

  -- Log event
  INSERT INTO trial_queue_events (client_id, event_type, meta)
  VALUES (p_client_id, 'offer_sent', jsonb_build_object(
    'sent_by', COALESCE(p_curator_id::text, 'admin'),
    'manual', true,
    'offer_expires_at', v_offer_expires
  ));

  RETURN jsonb_build_object(
    'success', true,
    'queue_id', v_queue_id,
    'offer_expires_at', v_offer_expires,
    'previous_status', v_current_status
  );
END;
$$;

COMMENT ON FUNCTION admin_send_offer(UUID, INTEGER, UUID)
IS 'v2.0 JWT-only: p_curator_id from JWT';

-- ============================================================
-- 5. admin_reject_request
--    OLD: Validated curator_session_token
--    NEW: Uses p_curator_id directly
-- ============================================================
DROP FUNCTION IF EXISTS admin_reject_request(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION admin_reject_request(
  p_queue_id UUID,
  p_reason TEXT DEFAULT 'Не указана',
  p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_queue_record RECORD;
BEGIN
  -- Find queue record
  SELECT tq.id, tq.client_id, tq.status, c.name AS client_name
  INTO v_queue_record
  FROM trial_queue tq
  LEFT JOIN clients c ON c.id = tq.client_id
  WHERE tq.id = p_queue_id;

  IF v_queue_record.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'queue_record_not_found');
  END IF;

  IF v_queue_record.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_status',
      'current_status', v_queue_record.status
    );
  END IF;

  -- Update status
  UPDATE trial_queue
  SET status = 'rejected', rejected_at = NOW(), rejection_reason = p_reason
  WHERE id = p_queue_id;

  -- Log event
  INSERT INTO trial_queue_events (client_id, event_type, meta)
  VALUES (v_queue_record.client_id, 'request_rejected', jsonb_build_object(
    'rejected_by', COALESCE(p_curator_id::text, 'admin'),
    'reason', p_reason
  ));

  RETURN jsonb_build_object(
    'success', true,
    'client_id', v_queue_record.client_id,
    'client_name', v_queue_record.client_name,
    'reason', p_reason
  );
END;
$$;

COMMENT ON FUNCTION admin_reject_request(UUID, TEXT, UUID)
IS 'v2.0 JWT-only: p_curator_id from JWT';

-- ============================================================
-- 6. admin_update_queue_settings
--    OLD: Validated curator_session_token
--    NEW: Uses p_curator_id directly
-- ============================================================
DROP FUNCTION IF EXISTS admin_update_queue_settings(BOOLEAN, INTEGER, INTEGER, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION admin_update_queue_settings(
  p_is_accepting BOOLEAN DEFAULT NULL,
  p_max_active INTEGER DEFAULT NULL,
  p_offer_window_minutes INTEGER DEFAULT NULL,
  p_trial_days INTEGER DEFAULT NULL,
  p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_curator_id UUID := COALESCE(p_curator_id, '00000000-0000-0000-0000-000000000000'::uuid);
  v_updated RECORD;
BEGIN
  -- Upsert settings
  INSERT INTO curator_trial_limits (curator_id, is_accepting_trials, max_active_trials, offer_window_minutes, trial_days)
  VALUES (
    v_curator_id,
    COALESCE(p_is_accepting, false),
    COALESCE(p_max_active, 3),
    COALESCE(p_offer_window_minutes, 120),
    COALESCE(p_trial_days, 7)
  )
  ON CONFLICT (curator_id) DO UPDATE SET
    is_accepting_trials = COALESCE(p_is_accepting, curator_trial_limits.is_accepting_trials),
    max_active_trials = COALESCE(p_max_active, curator_trial_limits.max_active_trials),
    offer_window_minutes = COALESCE(p_offer_window_minutes, curator_trial_limits.offer_window_minutes),
    trial_days = COALESCE(p_trial_days, curator_trial_limits.trial_days)
  RETURNING * INTO v_updated;

  RETURN jsonb_build_object(
    'success', true,
    'settings', jsonb_build_object(
      'is_accepting_trials', v_updated.is_accepting_trials,
      'max_active_trials', v_updated.max_active_trials,
      'offer_window_minutes', v_updated.offer_window_minutes,
      'trial_days', v_updated.trial_days
    )
  );
END;
$$;

COMMENT ON FUNCTION admin_update_queue_settings(BOOLEAN, INTEGER, INTEGER, INTEGER, UUID)
IS 'v2.0 JWT-only: p_curator_id from JWT';

-- ============================================================
-- 7. admin_get_leads - add p_curator_id (unused but needed)
-- ============================================================
DROP FUNCTION IF EXISTS admin_get_leads(TEXT);

CREATE OR REPLACE FUNCTION admin_get_leads(
  p_status TEXT DEFAULT 'new',
  p_curator_id UUID DEFAULT NULL
)
RETURNS SETOF RECORD
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    l.id,
    l.name,
    l.phone,
    l.messenger,
    l.utm_source,
    l.status,
    l.created_at,
    l.updated_at
  FROM leads l
  WHERE (p_status = 'all' OR l.status = p_status)
  ORDER BY l.created_at DESC
  LIMIT 100;
$$;

COMMENT ON FUNCTION admin_get_leads(TEXT, UUID)
IS 'v2.0 JWT-only: p_curator_id accepted (unused) for cloud function compatibility';

-- ============================================================
-- 8. admin_get_queue_stats - add p_curator_id
-- ============================================================
CREATE OR REPLACE FUNCTION admin_get_queue_stats(
  p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_queued_count INT;
  v_offer_count INT;
  v_assigned_today INT;
  v_canceled_today INT;
  v_limits RECORD;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE status = 'queued') AS queued,
    COUNT(*) FILTER (WHERE status = 'offer') AS offer,
    COUNT(*) FILTER (WHERE status = 'assigned' AND assigned_at::date = CURRENT_DATE) AS assigned_today,
    COUNT(*) FILTER (WHERE status = 'canceled' AND canceled_at::date = CURRENT_DATE) AS canceled_today
  INTO v_queued_count, v_offer_count, v_assigned_today, v_canceled_today
  FROM trial_queue;

  SELECT * INTO v_limits
  FROM curator_trial_limits
  WHERE curator_id = COALESCE(p_curator_id, '00000000-0000-0000-0000-000000000000'::uuid);

  RETURN jsonb_build_object(
    'queued', v_queued_count,
    'offer_pending', v_offer_count,
    'assigned_today', v_assigned_today,
    'canceled_today', v_canceled_today,
    'limits', jsonb_build_object(
      'max_active_trials', COALESCE(v_limits.max_active_trials, 3),
      'is_accepting_trials', COALESCE(v_limits.is_accepting_trials, false),
      'offer_window_minutes', COALESCE(v_limits.offer_window_minutes, 120),
      'trial_days', COALESCE(v_limits.trial_days, 7)
    )
  );
END;
$$;

COMMENT ON FUNCTION admin_get_queue_stats(UUID)
IS 'v2.0 JWT-only: p_curator_id for limits lookup';
