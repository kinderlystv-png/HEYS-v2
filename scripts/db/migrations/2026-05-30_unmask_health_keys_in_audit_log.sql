-- 2026-05-30: drop is_health_key masking inside trigger_audit_log
--
-- Why: backup-restore оказался единственным способом recovery для удалённого
-- heys_profile, потому что audit_logs хранил [MASKED] вместо реального value.
-- Snapshot prior version → _rollback_trigger_audit_log_pre_unmask.sql.
-- Other usages of is_health_key (write_client_kv_value curator-block) не трогаем.
--
-- Storage impact: +5-6 MB / 30 days at current write rate (мерили).
-- Rollback: \i _rollback_trigger_audit_log_pre_unmask.sql

BEGIN;

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

  -- Special handling for client_kv_store (resource_id from client_id, no masking)
  if TG_TABLE_NAME = 'client_kv_store' then
    resource_uuid := coalesce(NEW.client_id, OLD.client_id);
  else
    resource_uuid := coalesce(NEW.id, OLD.id);
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
    null,
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
