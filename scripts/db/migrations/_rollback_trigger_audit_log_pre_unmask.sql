CREATE OR REPLACE FUNCTION public.trigger_audit_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  audit_action text;
  old_data jsonb;
  new_data jsonb;
  key_val text;
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

  -- Special handling for client_kv_store
  if TG_TABLE_NAME = 'client_kv_store' then
    key_val := coalesce(NEW.k, OLD.k);

    -- Mask v for health_data keys
    if key_val is not null and is_health_key(key_val) then
      if old_data is not null then
        old_data := jsonb_set(old_data, '{v}', to_jsonb('[MASKED]'::text), true);
      end if;
      if new_data is not null then
        new_data := jsonb_set(new_data, '{v}', to_jsonb('[MASKED]'::text), true);
      end if;
    end if;

    -- Use client_id as resource id (no id column)
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
    null,  -- user_id set via RPC context if needed
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
end$function$

