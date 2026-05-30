-- 2026-05-30: capture user_id из NEW/OLD row в trigger_audit_log
--
-- Was: audit_logs.user_id всегда null — forensics будущих pollution
-- incidents слепая (нельзя различить kто writer'ил).
-- Note: client_kv_store.user_id уже корректно set'ится в RPC layer
-- (curator_id для курaторских writes, null для PIN flow — см.
-- yandex-cloud-functions/heys-api-rpc/index.js:2025). Просто заберём
-- его в audit вместо явного null.
--
-- Rollback: \i _rollback_trigger_audit_log_post_unmask_pre_userid.sql

BEGIN;

-- Snapshot текущей версии trigger для rollback (для следующей итерации)
-- См. полный backup в _rollback_trigger_audit_log_pre_unmask.sql (от 30-05).

CREATE OR REPLACE FUNCTION public.trigger_audit_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  audit_action text;
  old_data jsonb;
  new_data jsonb;
  resource_uuid uuid;
  actor_user_id uuid;
begin
  -- Determine action type
  case TG_OP
    when 'INSERT' then
      audit_action := 'create';
      old_data := null;
      new_data := to_jsonb(NEW);
    when 'UPDATE' then
      audit_action := 'update';
      old_data := to_jsonb(OLD);
      new_data := to_jsonb(NEW);
    when 'DELETE' then
      audit_action := 'delete';
      old_data := to_jsonb(OLD);
      new_data := null;
  end case;

  -- Special handling for client_kv_store
  if TG_TABLE_NAME = 'client_kv_store' then
    resource_uuid := coalesce(NEW.client_id, OLD.client_id);
    -- 2026-05-30: capture user_id из row (curator_id или null для PIN).
    -- Identifies pollution sweep authors retroactively.
    actor_user_id := coalesce(NEW.user_id, OLD.user_id);
  else
    resource_uuid := coalesce(NEW.id, OLD.id);
    actor_user_id := null;
  end if;

  insert into audit_logs (
    user_id,
    action,
    resource_type,
    resource_id,
    old_values,
    new_values,
    metadata
  ) values (
    actor_user_id,
    audit_action,
    TG_TABLE_NAME,
    resource_uuid,
    old_data,
    new_data,
    jsonb_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'timestamp', timezone('utc', now())
    )
  );

  case TG_OP
    when 'DELETE' then return OLD;
    else return NEW;
  end case;
end$function$;

COMMIT;
