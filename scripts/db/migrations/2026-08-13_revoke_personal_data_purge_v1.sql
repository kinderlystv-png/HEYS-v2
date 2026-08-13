-- personal_data consent revoke: purge PDn stores (release-plan condition 8 / track B2).
-- Account row and consents.revoked_at stay for proof of consent; not delete_my_account.

-- Extend cleanup queue reasons for consent-driven bulk purge.
ALTER TABLE public.messenger_media_cleanup_queue
  DROP CONSTRAINT IF EXISTS messenger_media_cleanup_queue_reason_check;

ALTER TABLE public.messenger_media_cleanup_queue
  ADD CONSTRAINT messenger_media_cleanup_queue_reason_check
  CHECK (reason IN ('message_deleted', 'abandoned_upload', 'consent_revoked'));

CREATE OR REPLACE FUNCTION public.is_personal_data_kv_key(p_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT
    p_key LIKE 'heys_dayv2_%'
    OR p_key LIKE 'heys_morning_checkin_progress_v1_%'
    OR p_key LIKE 'heys_products_overlay_v2_rpc_tail%'
    OR p_key LIKE 'heys_products_overlay_v2_rpc_manifest%'
    OR p_key LIKE 'heys_milestone_%'
    OR p_key LIKE 'heys_insights_feedback%'
    OR p_key LIKE 'heys_ceb_%'
    OR p_key LIKE 'heys_cascade_dcs_%'
    OR p_key = ANY(ARRAY[
      'heys_profile',
      'heys_norms',
      'heys_normAbs',
      'heys_products',
      'heys_products_overlay_v2',
      'heys_game',
      'heys_hr_zones',
      'heys_ratio_zones',
      'heys_grams_history',
      'heys_meal_presets_v1',
      'heys_suggested_presets_v1',
      'heys_suggested_presets_dismissed_v1',
      'heys_hunger_energy_status_events_v1',
      'heys_insights_feedback',
      'heys_ews_snapshot',
      'heys_ews_trends_v1',
      'heys_ews_weekly_v1',
      'heys_cascade_dcs_v9',
      'heys_best_streak',
      'heys_weekly_wrap_view_count',
      'heys_push_prefs',
      'heys_advice_settings',
      'heys_advice_disclaimer_accepted_v1',
      'heys_advice_read_today',
      'heys_advice_hidden_today',
      'heys_first_meal_tip',
      'heys_best_day_last_check',
      'heys_evening_snacker_check',
      'heys_morning_skipper_check',
      'heys_last_visit',
      'heys_advice_outcomes_v1',
      'heys_advice_pending_outcomes_v1',
      'heys_advice_stats',
      'heys_tour_completed',
      'heys_insights_tour_completed',
      'heys_tour_interrupted_step',
      'heys_onboarding_complete',
      'heys_planning_projects',
      'heys_planning_tasks',
      'heys_planning_slots',
      'heys_planning_links_v1',
      'heys_planning_chrono_activities',
      'heys_planning_chrono_entries',
      'heys_planning_chrono_snapshots',
      'heys_planning_chrono_tombstones_v1',
      'heys_planning_chrono_untracked_tail_dismissed_v1',
      'heys_planning_checklists_v1',
      'heys_planning_checklist_tombstones_v1',
      'heys_planning_goals_v1',
      'heys_planning_entity_tombstones_v1',
      'heys_planning_goal_map_records_v1',
      'heys_planning_commands_v1',
      'heys_reading_preferences_v1'
    ]);
$$;

COMMENT ON FUNCTION public.is_personal_data_kv_key(TEXT) IS
  'Explicit KV key/prefix list for personal_data purge. No shape inference.';

CREATE OR REPLACE FUNCTION public.is_client_personal_data_kv_key(
  p_client_id UUID,
  p_key TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT
    public.is_personal_data_kv_key(p_key)
    OR (
      p_key LIKE 'heys_' || p_client_id::text || '_%'
      AND public.is_personal_data_kv_key(
        'heys_' || substring(p_key FROM (length('heys_' || p_client_id::text || '_') + 1))
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.purge_personal_data_for_client(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_queued_media INTEGER := 0;
  v_deleted_messages INTEGER := 0;
  v_deleted_jobs INTEGER := 0;
  v_deleted_kv INTEGER := 0;
  v_deleted_audit INTEGER := 0;
  v_scrubbed_access_log INTEGER := 0;
  v_deleted_profile_snapshots INTEGER := 0;
  v_deleted_leaderboard_snapshots INTEGER := 0;
  v_deleted_ews_snapshots INTEGER := 0;
  v_audit_trigger_disabled BOOLEAN := FALSE;
BEGIN
  IF p_client_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'client_id_required');
  END IF;

  INSERT INTO public.messenger_media_cleanup_queue (
    object_path, client_id, source_message_id, reason, status, available_at,
    claimed_at, completed_at, last_error_code, updated_at
  )
  SELECT DISTINCT
    attachment->>'path',
    p_client_id,
    m.id,
    'consent_revoked',
    'pending',
    NOW(),
    NULL::timestamptz,
    NULL::timestamptz,
    NULL::text,
    NOW()
  FROM public.client_messages m
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.attachments, '[]'::jsonb)) attachment
  WHERE m.client_id = p_client_id
    AND COALESCE(attachment->>'path', '') <> ''
    AND attachment->>'path' LIKE p_client_id::text || '/%'
  ON CONFLICT (object_path) DO UPDATE
    SET status = 'pending',
        reason = 'consent_revoked',
        available_at = NOW(),
        claimed_at = NULL,
        completed_at = NULL,
        last_error_code = NULL,
        updated_at = NOW();
  GET DIAGNOSTICS v_queued_media = ROW_COUNT;

  DELETE FROM public.message_transcription_jobs
  WHERE client_id = p_client_id;
  GET DIAGNOSTICS v_deleted_jobs = ROW_COUNT;

  DELETE FROM public.client_messages
  WHERE client_id = p_client_id;
  GET DIAGNOSTICS v_deleted_messages = ROW_COUNT;

  IF EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'audit_client_kv_store'
      AND tgrelid = 'public.client_kv_store'::regclass
      AND NOT tgisinternal
  ) THEN
    EXECUTE 'ALTER TABLE public.client_kv_store DISABLE TRIGGER audit_client_kv_store';
    v_audit_trigger_disabled := TRUE;
  END IF;

  DELETE FROM public.client_kv_store
  WHERE client_id = p_client_id
    AND public.is_client_personal_data_kv_key(p_client_id, k);
  GET DIAGNOSTICS v_deleted_kv = ROW_COUNT;

  IF v_audit_trigger_disabled THEN
    EXECUTE 'ALTER TABLE public.client_kv_store ENABLE TRIGGER audit_client_kv_store';
  END IF;

  DELETE FROM public.audit_logs
  WHERE resource_type = 'client_kv_store'
    AND resource_id = p_client_id;
  GET DIAGNOSTICS v_deleted_audit = ROW_COUNT;

  DELETE FROM public.profile_snapshots
  WHERE client_id = p_client_id;
  GET DIAGNOSTICS v_deleted_profile_snapshots = ROW_COUNT;

  DELETE FROM public.leaderboard_snapshots
  WHERE client_id = p_client_id;
  GET DIAGNOSTICS v_deleted_leaderboard_snapshots = ROW_COUNT;

  DELETE FROM public.ews_weekly_snapshots
  WHERE client_id = p_client_id;
  GET DIAGNOSTICS v_deleted_ews_snapshots = ROW_COUNT;

  UPDATE public.data_access_audit_log
  SET resource_keys = NULL,
      metadata = CASE
        WHEN action = 'revoke_consent' THEN
          COALESCE(
            jsonb_strip_nulls(jsonb_build_object(
              'consent_type', metadata->'consent_type',
              'sessions_killed', metadata->'sessions_killed',
              'deleted_push_subscriptions', metadata->'deleted_push_subscriptions'
            )),
            '{}'::jsonb
          )
        ELSE '{}'::jsonb
      END
  WHERE client_id = p_client_id
    AND (
      resource_keys IS NOT NULL
      OR COALESCE(metadata, '{}'::jsonb) <> '{}'::jsonb
    );
  GET DIAGNOSTICS v_scrubbed_access_log = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', TRUE,
    'queued_media', v_queued_media,
    'deleted_messages', v_deleted_messages,
    'deleted_transcription_jobs', v_deleted_jobs,
    'deleted_kv', v_deleted_kv,
    'deleted_audit_logs', v_deleted_audit,
    'deleted_profile_snapshots', v_deleted_profile_snapshots,
    'deleted_leaderboard_snapshots', v_deleted_leaderboard_snapshots,
    'deleted_ews_weekly_snapshots', v_deleted_ews_snapshots,
    'scrubbed_data_access_audit_log', v_scrubbed_access_log
  );
EXCEPTION
  WHEN OTHERS THEN
    IF v_audit_trigger_disabled THEN
      BEGIN
        EXECUTE 'ALTER TABLE public.client_kv_store ENABLE TRIGGER audit_client_kv_store';
      EXCEPTION
        WHEN OTHERS THEN NULL;
      END;
    END IF;
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.purge_personal_data_for_client(UUID) IS
  'Internal purge of PDn stores on personal_data consent revoke. Not delete_my_account.';

REVOKE ALL ON FUNCTION public.purge_personal_data_for_client(UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.revoke_consent_by_session(
  p_session_token TEXT,
  p_consent_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client_id UUID;
  v_deleted_keys INTEGER := 0;
  v_killed_sessions INTEGER := 0;
  v_deleted_push INTEGER := 0;
  v_purge JSONB := '{}'::jsonb;
BEGIN
  v_client_id := public.require_client_id(p_session_token);
  PERFORM set_config('app.consents_writer', 'authorized', true);

  UPDATE public.consents
  SET granted = FALSE, revoked_at = NOW()
  WHERE client_id = v_client_id
    AND consent_type = p_consent_type
    AND granted = TRUE
    AND revoked_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'consent_not_found_or_already_revoked');
  END IF;

  IF p_consent_type = 'health_data' THEN
    DELETE FROM public.client_kv_store
    WHERE client_id = v_client_id
      AND public.is_health_key(k);
    GET DIAGNOSTICS v_deleted_keys = ROW_COUNT;
  END IF;

  IF p_consent_type = 'personal_data' THEN
    v_purge := public.purge_personal_data_for_client(v_client_id);
    IF COALESCE((v_purge->>'success')::boolean, false) = false THEN
      RAISE EXCEPTION 'personal_data_purge_failed:%', COALESCE(v_purge->>'error', 'unknown');
    END IF;
    v_deleted_keys := COALESCE((v_purge->>'deleted_kv')::integer, 0);
  END IF;

  IF p_consent_type IN ('health_data', 'personal_data') THEN
    UPDATE public.client_sessions
    SET revoked_at = NOW()
    WHERE client_id = v_client_id
      AND revoked_at IS NULL;
    GET DIAGNOSTICS v_killed_sessions = ROW_COUNT;
  END IF;

  IF p_consent_type IN ('push_notifications', 'personal_data') THEN
    DELETE FROM public.push_subscriptions WHERE client_id = v_client_id;
    GET DIAGNOSTICS v_deleted_push = ROW_COUNT;
  END IF;

  PERFORM public.log_data_access(
    'client_self', v_client_id, v_client_id, 'revoke_consent',
    ARRAY[p_consent_type], p_consent_type = 'health_data', NULL, NULL,
    jsonb_build_object(
      'consent_type', p_consent_type,
      'deleted_keys', v_deleted_keys,
      'sessions_killed', v_killed_sessions,
      'deleted_push_subscriptions', v_deleted_push,
      'personal_data_purge', CASE WHEN p_consent_type = 'personal_data' THEN v_purge ELSE NULL END
    )
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'consent_type', p_consent_type,
    'deleted_keys', v_deleted_keys,
    'sessions_killed', v_killed_sessions,
    'deleted_push_subscriptions', v_deleted_push,
    'personal_data_purge', CASE WHEN p_consent_type = 'personal_data' THEN v_purge ELSE NULL END
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
