-- 2026-01-24: Audit masking + client_kv_store trigger
-- Phase 1 (audit): mask health_data values in audit logs
-- Dependencies: none (is_health_key included inline)

-- 0) Helper: is_health_key (centralized regex)
create or replace function is_health_key(p_key text) returns boolean as $$
  select p_key ~ '^heys_(profile|dayv2_|hr_zones)';
$$ language sql immutable;

-- 1) Create audit_logs table if not exists (Yandex Cloud PostgreSQL)
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,  -- nullable for PIN-auth
  session_id uuid,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  old_values jsonb,
  new_values jsonb,
  metadata jsonb default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  request_id text,
  success boolean default true,
  error_message text,
  response_time_ms integer,
  created_at timestamptz default timezone('utc', now())
);

create index if not exists idx_audit_logs_resource on audit_logs(resource_type, resource_id);
create index if not exists idx_audit_logs_created_at on audit_logs(created_at);

-- 2) Update audit trigger to mask health_data values for client_kv_store
create or replace function trigger_audit_log() returns trigger as $$
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
end$$ language plpgsql security definer;

-- 2) Add audit trigger for client_kv_store (idempotent)
do $$
begin
  if not exists (select 1 from pg_trigger where tgname='audit_client_kv_store') then
    execute 'create trigger audit_client_kv_store after insert or update or delete on client_kv_store for each row execute function trigger_audit_log()';
  end if;
end$$;
