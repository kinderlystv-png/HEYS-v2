-- Fix stale trial_queue rows after admin activation.
--
-- Problem:
-- admin_activate_trial updated trial_queue only from status='queued' to
-- status='assigned'. Legacy/current rows may be 'offer' or 'pending', so the
-- client becomes trial/active while the curator UI still shows it in
-- "waiting for trial".

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_activate_trial(
    p_client_id UUID,
    p_start_date DATE DEFAULT CURRENT_DATE,
    p_trial_days INTEGER DEFAULT 7,
    p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_client RECORD;
    v_curator RECORD;
    v_trial_start_at TIMESTAMPTZ;
    v_trial_ends_at TIMESTAMPTZ;
    v_is_future BOOLEAN;
BEGIN
    IF p_curator_id IS NOT NULL THEN
        SELECT id, name INTO v_curator FROM curators WHERE id = p_curator_id;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'curator_not_found');
        END IF;
    END IF;

    SELECT * INTO v_client FROM clients WHERE id = p_client_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'client_not_found');
    END IF;

    IF v_client.subscription_status IN ('trial', 'active') THEN
        UPDATE trial_queue
        SET status = 'assigned',
            assigned_at = COALESCE(assigned_at, v_client.trial_started_at, NOW()),
            updated_at = NOW()
        WHERE client_id = p_client_id
          AND status IN ('queued', 'pending', 'offer');

        RETURN jsonb_build_object(
            'success', true,
            'already_active', true,
            'status', v_client.subscription_status,
            'current_status', v_client.subscription_status,
            'trial_started_at', v_client.trial_started_at,
            'trial_ends_at', v_client.trial_ends_at
        );
    END IF;

    v_is_future := (p_start_date > CURRENT_DATE);

    IF v_is_future THEN
        UPDATE clients
        SET subscription_status = 'trial_pending',
            trial_started_at = p_start_date::TIMESTAMPTZ,
            trial_ends_at = (p_start_date + (p_trial_days || ' days')::interval)::TIMESTAMPTZ,
            updated_at = NOW()
        WHERE id = p_client_id
        RETURNING trial_started_at, trial_ends_at
        INTO v_trial_start_at, v_trial_ends_at;
    ELSE
        UPDATE clients
        SET subscription_status = 'trial',
            trial_started_at = NOW(),
            trial_ends_at = NOW() + (p_trial_days || ' days')::interval,
            updated_at = NOW()
        WHERE id = p_client_id
        RETURNING trial_started_at, trial_ends_at
        INTO v_trial_start_at, v_trial_ends_at;
    END IF;

    INSERT INTO subscriptions (client_id, trial_started_at, trial_ends_at, trial_approved_at)
    VALUES (p_client_id, v_trial_start_at, v_trial_ends_at, NOW())
    ON CONFLICT (client_id) DO UPDATE SET
        trial_started_at = EXCLUDED.trial_started_at,
        trial_ends_at = EXCLUDED.trial_ends_at,
        trial_approved_at = NOW();

    UPDATE trial_queue
    SET status = 'assigned',
        assigned_at = NOW(),
        updated_at = NOW()
    WHERE client_id = p_client_id
      AND status IN ('queued', 'pending', 'offer');

    INSERT INTO trial_queue_events (client_id, event_type, meta)
    VALUES (p_client_id, 'claimed', jsonb_build_object(
        'curator_id', p_curator_id,
        'start_date', p_start_date,
        'trial_days', p_trial_days,
        'is_future', v_is_future,
        'synced_subscriptions', true,
        'source', 'admin_activate_trial'
    ));

    PERFORM public.record_funnel_event(
      p_event_type := 'trial_active',
      p_client_id := p_client_id,
      p_metadata := jsonb_build_object(
        'curator_id', p_curator_id,
        'trial_days', p_trial_days,
        'is_future', v_is_future,
        'source', 'admin_activate_trial'
      ),
      p_dedupe_key := 'trial_active:client:' || p_client_id::text || ':' || v_trial_start_at::date::text,
      p_occurred_at := v_trial_start_at
    );

    RETURN jsonb_build_object(
        'success', true,
        'status', CASE WHEN v_is_future THEN 'trial_pending' ELSE 'trial' END,
        'trial_started_at', v_trial_start_at,
        'trial_ends_at', v_trial_ends_at,
        'is_future', v_is_future
    );
END;
$function$;

COMMENT ON FUNCTION public.admin_activate_trial(UUID, DATE, INTEGER, UUID) IS
  'Активация триала: sync subscriptions, idempotent active guard, trial_queue queued/pending/offer -> assigned';

UPDATE trial_queue tq
SET status = 'assigned',
    assigned_at = COALESCE(tq.assigned_at, c.trial_started_at, NOW()),
    updated_at = NOW()
FROM clients c
WHERE tq.client_id = c.id
  AND tq.status IN ('queued', 'pending', 'offer')
  AND c.subscription_status IN ('trial', 'trial_pending', 'active');

COMMIT;
