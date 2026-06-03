-- 2026-06-03 L3c: revision-based marker checkpoint (clock-skew immune).
--
-- get_change_markers_by_session gains an optional p_since_revision. When provided,
-- it returns scopes whose changed_revision > p_since_revision — a server-authoritative
-- delta that does NOT depend on the browser clock (the old p_since timestamp path
-- could MISS markers when the client clock ran ahead of the server). Requires _L1/_L2.
--
-- Backward-compat: p_since_revision DEFAULTs NULL → falls back to the existing
-- timestamp delta (p_since), then to "all". Un-upgraded clients keep sending only
-- p_session_token[+p_since] and behave exactly as today. Wrapped in a txn so the
-- DROP→CREATE (signature change text,timestamptz → text,timestamptz,bigint) is atomic —
-- no window where a concurrent hot-sync marker call finds the function missing.

BEGIN;

DROP FUNCTION IF EXISTS public.get_change_markers_by_session(text, timestamptz);

CREATE OR REPLACE FUNCTION public.get_change_markers_by_session(
  p_session_token text,
  p_since timestamptz DEFAULT NULL,
  p_since_revision bigint DEFAULT NULL
) RETURNS jsonb
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

  if p_since_revision is not null then
    -- L3c: revision-based delta (clock-skew immune) — preferred path.
    select coalesce(jsonb_object_agg(scope, changed_at), '{}'::jsonb),
           coalesce(jsonb_object_agg(scope, changed_revision), '{}'::jsonb)
    into v_markers, v_marker_revisions
    from client_change_markers
    where client_id = v_client_id
      and changed_revision > p_since_revision;
  elsif p_since is not null then
    -- legacy timestamp delta (un-upgraded clients).
    select coalesce(jsonb_object_agg(scope, changed_at), '{}'::jsonb),
           coalesce(jsonb_object_agg(scope, changed_revision), '{}'::jsonb)
    into v_markers, v_marker_revisions
    from client_change_markers
    where client_id = v_client_id
      and changed_at > p_since;
  else
    -- full snapshot.
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

GRANT EXECUTE ON FUNCTION public.get_change_markers_by_session(text, timestamptz, bigint) TO heys_rpc;

COMMIT;
