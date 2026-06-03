-- 2026-06-03 L2: reads expose revision (DORMANT — clients receive it but ignore it).
--
-- Rewrites the session read functions to surface per-row `revision` + `updated_at`
-- and a top-level `server_revision`, and adds a per-scope `marker_revisions` map +
-- `server_revision` to the markers response. Requires _L1.sql applied first.
--
-- ADDITIVE / backward-compat is the whole point:
--   * batch_get: extra item fields (updated_at, revision) + top-level server_revision.
--     Old clients read item.k/item.v and ignore the rest.
--   * markers: the `markers` object KEEPS its existing shape {scope: changed_at} so
--     un-upgraded clients (which compare changed_at as a timestamp) keep working during
--     deploy-lag. We add `marker_revisions` {scope: changed_revision} + `server_revision`
--     as NEW sibling fields — we deliberately do NOT fold revision into the markers map
--     (that would break the timestamp comparison in old bundles).
-- The curator hot-sync path reads via REST (no RPC variant); its widening lives in the
-- REST CF column whitelist + heys_yandex_api_v1.js, not here.
-- Idempotent: CREATE OR REPLACE preserves existing grants; GRANTs re-asserted for safety.

CREATE OR REPLACE FUNCTION public.batch_get_client_kv_by_session(p_session_token text, p_keys text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
declare
  v_client_id uuid;
  v_results jsonb := '[]'::jsonb;
  rec record;
  key_hex text;
  encryption_disabled boolean;
  has_key boolean;
  v_value jsonb;
begin
  -- 1. Validate session
  select client_id into v_client_id
  from client_sessions
  where token_hash = digest(p_session_token, 'sha256')
    and expires_at > now()
    and revoked_at is null;

  if v_client_id is null then
    return jsonb_build_object('error', 'invalid_session');
  end if;

  -- 2. Read encryption settings once
  key_hex := current_setting('heys.encryption_key', true);
  encryption_disabled := coalesce(
    current_setting('heys.encryption_disabled', true) = '1',
    false
  );
  has_key := key_hex is not null and length(key_hex) >= 32;

  -- 3. Fetch all matching keys in ONE query (PK index on client_id, k)
  for rec in
    select kv.k, kv.v, kv.v_encrypted, kv.key_version, kv.updated_at, kv.revision
    from client_kv_store kv
    where kv.client_id = v_client_id
      and kv.k = any(p_keys)
  loop
    if rec.key_version is not null and rec.v_encrypted is not null then
      if encryption_disabled or not has_key then
        v_value := rec.v;
      else
        v_value := coalesce(decrypt_health_data(rec.v_encrypted), rec.v);
      end if;
    else
      v_value := rec.v;
    end if;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'k', rec.k,
        'v', v_value,
        'updated_at', rec.updated_at,
        'revision', rec.revision
      )
    );
  end loop;

  return jsonb_build_object(
    'success', true,
    'items', v_results,
    'server_revision', coalesce((select max(revision) from client_kv_store where client_id = v_client_id), 0)
  );

exception
  when others then
    return jsonb_build_object('success', false, 'error', SQLERRM);
end$function$;

CREATE OR REPLACE FUNCTION public.get_change_markers_by_session(p_session_token text, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
declare
  v_client_id uuid;
  v_markers jsonb;
  v_marker_revisions jsonb;
  v_server_revision bigint;
begin
  select client_id into v_client_id
  from client_sessions
  where token_hash = digest(p_session_token, 'sha256')
    and expires_at > now()
    and revoked_at is null;

  if v_client_id is null then
    return jsonb_build_object('error', 'invalid_session');
  end if;

  select coalesce(max(revision), 0) into v_server_revision
  from client_kv_store where client_id = v_client_id;

  if p_since is not null then
    -- Delta: only scopes changed after the given timestamp
    select coalesce(jsonb_object_agg(scope, changed_at), '{}'::jsonb),
           coalesce(jsonb_object_agg(scope, changed_revision), '{}'::jsonb)
    into v_markers, v_marker_revisions
    from client_change_markers
    where client_id = v_client_id
      and changed_at > p_since;
  else
    -- Full: all scopes
    select coalesce(jsonb_object_agg(scope, changed_at), '{}'::jsonb),
           coalesce(jsonb_object_agg(scope, changed_revision), '{}'::jsonb)
    into v_markers, v_marker_revisions
    from client_change_markers
    where client_id = v_client_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'markers', v_markers,
    'marker_revisions', v_marker_revisions,
    'server_revision', v_server_revision
  );

exception
  when others then
    return jsonb_build_object('success', false, 'error', SQLERRM);
end$function$;

GRANT EXECUTE ON FUNCTION public.batch_get_client_kv_by_session(text, text[]) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.get_change_markers_by_session(text, timestamptz) TO heys_rpc;
