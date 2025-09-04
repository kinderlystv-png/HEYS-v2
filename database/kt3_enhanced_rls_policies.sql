-- КТ3: Enhanced RLS Policies
-- Усиленные политики Row Level Security для всех пользовательских таблиц
-- Включает детальный контроль доступа и аудит

--------------------------------------------------
-- 1. Включение RLS для новых таблиц
--------------------------------------------------
alter table user_profiles enable row level security;
alter table user_preferences enable row level security;
alter table user_sessions enable row level security;
alter table audit_logs enable row level security;

--------------------------------------------------
-- 2. Удаление старых политик (идемпотентно)
--------------------------------------------------
do $$
begin
  -- user_profiles
  begin execute 'drop policy user_profiles_select on user_profiles'; exception when undefined_object then null; end;
  begin execute 'drop policy user_profiles_insert on user_profiles'; exception when undefined_object then null; end;
  begin execute 'drop policy user_profiles_update on user_profiles'; exception when undefined_object then null; end;
  begin execute 'drop policy user_profiles_delete on user_profiles'; exception when undefined_object then null; end;
  
  -- user_preferences
  begin execute 'drop policy user_preferences_select on user_preferences'; exception when undefined_object then null; end;
  begin execute 'drop policy user_preferences_insert on user_preferences'; exception when undefined_object then null; end;
  begin execute 'drop policy user_preferences_update on user_preferences'; exception when undefined_object then null; end;
  begin execute 'drop policy user_preferences_delete on user_preferences'; exception when undefined_object then null; end;
  
  -- user_sessions
  begin execute 'drop policy user_sessions_select on user_sessions'; exception when undefined_object then null; end;
  begin execute 'drop policy user_sessions_insert on user_sessions'; exception when undefined_object then null; end;
  begin execute 'drop policy user_sessions_update on user_sessions'; exception when undefined_object then null; end;
  begin execute 'drop policy user_sessions_delete on user_sessions'; exception when undefined_object then null; end;
  
  -- audit_logs
  begin execute 'drop policy audit_logs_select on audit_logs'; exception when undefined_object then null; end;
  begin execute 'drop policy audit_logs_insert on audit_logs'; exception when undefined_object then null; end;
  begin execute 'drop policy audit_logs_update on audit_logs'; exception when undefined_object then null; end;
  begin execute 'drop policy audit_logs_delete on audit_logs'; exception when undefined_object then null; end;
end$$;

--------------------------------------------------
-- 3. Вспомогательные функции для проверки ролей
--------------------------------------------------
create or replace function auth.has_role(required_role text) returns boolean as $$
begin
  return exists (
    select 1 from user_profiles 
    where user_id = auth.uid() 
      and role = required_role 
      and is_active = true 
      and is_suspended = false
  );
end$$ language plpgsql security definer;

create or replace function auth.has_permission(required_permission text) returns boolean as $$
begin
  return exists (
    select 1 from user_profiles 
    where user_id = auth.uid() 
      and is_active = true 
      and is_suspended = false
      and (
        role in ('admin', 'super_admin') 
        or permissions ? required_permission
      )
  );
end$$ language plpgsql security definer;

create or replace function auth.is_admin() returns boolean as $$
begin
  return auth.has_role('admin') or auth.has_role('super_admin');
end$$ language plpgsql security definer;

create or replace function auth.can_manage_user(target_user_id uuid) returns boolean as $$
begin
  -- Супер админ может управлять всеми
  if auth.has_role('super_admin') then
    return true;
  end if;
  
  -- Админ может управлять обычными пользователями и кураторами
  if auth.has_role('admin') then
    return exists (
      select 1 from user_profiles 
      where user_id = target_user_id 
        and role not in ('admin', 'super_admin')
    );
  end if;
  
  -- Обычные пользователи могут управлять только собой
  return auth.uid() = target_user_id;
end$$ language plpgsql security definer;

--------------------------------------------------
-- 4. RLS политики для user_profiles
--------------------------------------------------
-- Пользователи могут видеть свой профиль + админы видят всех
create policy user_profiles_select on user_profiles for select using (
  auth.uid() = user_id 
  or auth.is_admin()
  or (
    -- Кураторы могут видеть профили своих клиентов
    auth.has_role('curator') 
    and exists (
      select 1 from clients c 
      where c.curator_id = auth.uid() 
        and c.curator_id = user_profiles.user_id
    )
  )
);

-- Создание профиля только для себя
create policy user_profiles_insert on user_profiles for insert with check (
  auth.uid() = user_id 
  or auth.has_permission('manage_profiles')
);

-- Обновление своего профиля или с правами управления
create policy user_profiles_update on user_profiles for update using (
  auth.can_manage_user(user_id)
) with check (
  auth.can_manage_user(user_id)
  and (
    -- Обычные пользователи не могут менять свою роль
    auth.is_admin() 
    or old.role = new.role
  )
);

-- Удаление только админами
create policy user_profiles_delete on user_profiles for delete using (
  auth.has_role('super_admin')
  or (auth.has_role('admin') and role not in ('admin', 'super_admin'))
);

--------------------------------------------------
-- 5. RLS политики для user_preferences
--------------------------------------------------
-- Пользователи видят только свои настройки
create policy user_preferences_select on user_preferences for select using (
  auth.uid() = user_id 
  or auth.can_manage_user(user_id)
);

-- Создание настроек только для себя
create policy user_preferences_insert on user_preferences for insert with check (
  auth.uid() = user_id 
  or auth.can_manage_user(user_id)
);

-- Обновление своих настроек
create policy user_preferences_update on user_preferences for update using (
  auth.uid() = user_id 
  or auth.can_manage_user(user_id)
) with check (
  auth.uid() = user_id 
  or auth.can_manage_user(user_id)
);

-- Удаление своих настроек
create policy user_preferences_delete on user_preferences for delete using (
  auth.uid() = user_id 
  or auth.can_manage_user(user_id)
);

--------------------------------------------------
-- 6. RLS политики для user_sessions
--------------------------------------------------
-- Пользователи видят только свои сессии
create policy user_sessions_select on user_sessions for select using (
  auth.uid() = user_id 
  or auth.can_manage_user(user_id)
);

-- Создание сессий только для себя
create policy user_sessions_insert on user_sessions for insert with check (
  auth.uid() = user_id
);

-- Обновление своих сессий (активность, флаги)
create policy user_sessions_update on user_sessions for update using (
  auth.uid() = user_id 
  or auth.has_permission('manage_sessions')
) with check (
  auth.uid() = user_id 
  or auth.has_permission('manage_sessions')
);

-- Удаление своих сессий или админами
create policy user_sessions_delete on user_sessions for delete using (
  auth.uid() = user_id 
  or auth.has_permission('manage_sessions')
);

--------------------------------------------------
-- 7. RLS политики для audit_logs
--------------------------------------------------
-- Только админы и владельцы действий могут видеть логи
create policy audit_logs_select on audit_logs for select using (
  auth.has_permission('view_audit_logs')
  or auth.uid() = user_id
);

-- Создание логов только системой (через service key)
create policy audit_logs_insert on audit_logs for insert with check (
  -- Разрешаем вставку только если это системный запрос
  -- или пользователь имеет специальные права
  auth.has_permission('create_audit_logs')
  or auth.jwt()->>'role' = 'service_role'
);

-- Логи аудита не подлежат изменению
create policy audit_logs_update on audit_logs for update using (false);

-- Удаление логов только супер админами
create policy audit_logs_delete on audit_logs for delete using (
  auth.has_role('super_admin')
);

--------------------------------------------------
-- 8. Политики для существующих таблиц (обновленные)
--------------------------------------------------
-- Обновляем политики для security_events
do $$
begin
  begin execute 'drop policy security_events_select on security_events'; exception when undefined_object then null; end;
  begin execute 'drop policy security_events_insert on security_events'; exception when undefined_object then null; end;
  begin execute 'drop policy security_events_update on security_events'; exception when undefined_object then null; end;
  begin execute 'drop policy security_events_delete on security_events'; exception when undefined_object then null; end;
end$$;

-- Новые политики для security_events с проверкой ролей
create policy security_events_select on security_events for select using (
  auth.has_permission('view_security_events')
  or auth.uid() = user_id
);

create policy security_events_insert on security_events for insert with check (
  auth.has_permission('create_security_events')
  or auth.jwt()->>'role' = 'service_role'
);

create policy security_events_update on security_events for update using (
  auth.has_permission('manage_security_events')
) with check (
  auth.has_permission('manage_security_events')
);

create policy security_events_delete on security_events for delete using (
  auth.has_permission('manage_security_events')
);

--------------------------------------------------
-- 9. Функция аудита изменений
--------------------------------------------------
create or replace function trigger_audit_log() returns trigger as $$
declare
  audit_action text;
  old_data jsonb;
  new_data jsonb;
begin
  -- Определяем тип действия
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

  -- Создаем запись аудита
  insert into audit_logs (
    user_id,
    action,
    resource_type,
    resource_id,
    old_values,
    new_values,
    metadata
  ) values (
    auth.uid(),
    audit_action,
    TG_TABLE_NAME,
    coalesce(NEW.id, OLD.id),
    old_data,
    new_data,
    jsonb_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'timestamp', timezone('utc', now())
    )
  );

  -- Возвращаем соответствующую запись
  case TG_OP
    when 'DELETE' then return OLD;
    else return NEW;
  end case;
end$$ language plpgsql security definer;

--------------------------------------------------
-- 10. Применение аудита к критичным таблицам
--------------------------------------------------
do $$
begin
  -- user_profiles
  if not exists (select 1 from pg_trigger where tgname='audit_user_profiles') then
    execute 'create trigger audit_user_profiles after insert or update or delete on user_profiles for each row execute function trigger_audit_log()';
  end if;
  
  -- clients
  if not exists (select 1 from pg_trigger where tgname='audit_clients') then
    execute 'create trigger audit_clients after insert or update or delete on clients for each row execute function trigger_audit_log()';
  end if;
  
  -- user_sessions (только создание и удаление)
  if not exists (select 1 from pg_trigger where tgname='audit_user_sessions') then
    execute 'create trigger audit_user_sessions after insert or delete on user_sessions for each row execute function trigger_audit_log()';
  end if;
end$$;

-- Конец усиленных RLS политик
