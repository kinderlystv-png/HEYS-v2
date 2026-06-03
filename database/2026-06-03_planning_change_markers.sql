-- 2026-06-03: classify planning/chrono KV writes as planning change markers.
-- Without this, planning changes are reported as "other", forcing broad hot-sync
-- pulls and hiding the real scope in diagnostics.

CREATE OR REPLACE FUNCTION public.fn_bump_change_marker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
declare
  v_scope text;
  v_key text;
  v_cid uuid;
begin
  v_key := coalesce(NEW.k, OLD.k);
  v_cid := coalesce(NEW.client_id, OLD.client_id);

  if not exists (select 1 from clients where id = v_cid) then
    return coalesce(NEW, OLD);
  end if;

  if v_key ~ '^heys_dayv2_\d{4}-\d{2}-\d{2}$' then
    v_scope := 'day:' || substring(v_key from '\d{4}-\d{2}-\d{2}$');
  elsif v_key like '%widget_layout%' then
    v_scope := 'widgets';
  elsif v_key = 'heys_profile' then
    v_scope := 'profile';
  elsif v_key = 'heys_norms' then
    v_scope := 'norms';
  elsif v_key = 'heys_hr_zones' then
    v_scope := 'hr_zones';
  elsif v_key like 'heys_planning_%' then
    v_scope := 'planning';
  elsif v_key like '%products%' then
    v_scope := 'products';
  else
    v_scope := 'other';
  end if;

  insert into client_change_markers (client_id, scope, changed_at)
  values (v_cid, v_scope, now())
  on conflict (client_id, scope)
  do update set changed_at = now();

  return coalesce(NEW, OLD);
end$function$;
