-- Harden client_kv_store writes against auth/session key pollution.
--
-- REST /rest/client_kv_store writes route through safe_upsert_client_kv().
-- RPC paths also have a JS blacklist, but the table trigger below is the final
-- guard for old deployed functions, old clients, and any future fallback.

CREATE OR REPLACE FUNCTION public.is_client_kv_non_client_key(p_key text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT regexp_replace(coalesce(p_key, ''), '^heys_[0-9a-f-]{36}_', 'heys_', 'i') = ANY (ARRAY[
    'heys_clients',
    'heys_client_current',
    'heys_curator_session',
    'heys_supabase_auth_token',
    'heys_pin_auth_client',
    'heys_session_token',
    'heys_debug_events',
    'heys_iw_config_cache_v1',
    'heys_iw_config_cache_meta_v1',
    'heys_docs_cache_version',
    'heys_update_in_progress',
    'heys_boot_perf_baseline_v1',
    'heys_last_client_id',
    'heys_theme',
    'heys_theme_pref',
    'heys_theme_explicit',
    'heys_whats_new_last_seen',
    'heys_whats_new_last_acknowledged',
    'heys_push_onboarded',
    'heys_widget_layout_v1',
    'heys_shared_harm_backfill_v1'
  ]);
$function$;

CREATE OR REPLACE FUNCTION public.reject_client_kv_non_client_key()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF public.is_client_kv_non_client_key(NEW.k) THEN
    BEGIN
      INSERT INTO public.data_loss_audit (client_id, key, action, allowed, reason)
      VALUES (NEW.client_id, NEW.k, 'non_client_data_rejected', false, 'client_kv_store_trigger_blacklist');
    EXCEPTION WHEN others THEN
      NULL;
    END;

    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS client_kv_reject_non_client_key ON public.client_kv_store;

CREATE TRIGGER client_kv_reject_non_client_key
BEFORE INSERT OR UPDATE ON public.client_kv_store
FOR EACH ROW
EXECUTE FUNCTION public.reject_client_kv_non_client_key();

CREATE OR REPLACE FUNCTION public.safe_upsert_client_kv(
  p_client_id uuid,
  p_key text,
  p_value jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_allowed boolean;
BEGIN
  IF public.is_client_kv_non_client_key(p_key) THEN
    BEGIN
      INSERT INTO public.data_loss_audit (client_id, key, action, allowed, reason)
      VALUES (p_client_id, p_key, 'non_client_data_rejected', false, 'safe_upsert_client_kv_blacklist');
    EXCEPTION WHEN others THEN
      NULL;
    END;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'non_client_data',
      'message', 'Non-client data key cannot be written to client_kv_store'
    );
  END IF;

  -- Проверяем разрешено ли перезаписывать
  v_allowed := check_day_overwrite_allowed(p_client_id, p_key, p_value);

  IF NOT v_allowed THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'data_loss_protection',
      'message', 'Cannot overwrite day with meals by empty day'
    );
  END IF;

  -- Безопасно — делаем upsert
  INSERT INTO public.client_kv_store (client_id, k, v, updated_at)
  VALUES (p_client_id, p_key, p_value, now())
  ON CONFLICT (client_id, k) DO UPDATE
  SET v = EXCLUDED.v, updated_at = now();

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.safe_upsert_client_kv(uuid, text, jsonb) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.safe_upsert_client_kv(uuid, text, jsonb) TO heys_rest;
GRANT EXECUTE ON FUNCTION public.is_client_kv_non_client_key(text) TO heys_admin;
GRANT EXECUTE ON FUNCTION public.is_client_kv_non_client_key(text) TO heys_rest;
GRANT EXECUTE ON FUNCTION public.is_client_kv_non_client_key(text) TO heys_rpc;

COMMENT ON FUNCTION public.safe_upsert_client_kv(uuid, text, jsonb) IS
  'Safe client_kv_store upsert with day data-loss protection and DB-level non-client/auth/session key blacklist.';

COMMENT ON FUNCTION public.is_client_kv_non_client_key(text) IS
  'Returns true for global auth/session/UI keys that must never be stored in client_kv_store, including scoped legacy forms.';

COMMENT ON FUNCTION public.reject_client_kv_non_client_key() IS
  'BEFORE trigger guard that silently skips auth/session/UI writes to client_kv_store from any write path.';
