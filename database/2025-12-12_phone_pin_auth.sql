-- 2025-12-12_phone_pin_auth.sql — Phone+PIN auth для клиентов (куратор выдаёт креды)
-- Важно: этот файл нужно применить в Supabase (SQL Editor) вручную.
-- Политики RLS на clients остаются (см. database_clients_rls_policies.sql).

begin;

-- Нужно для digest(...)
create extension if not exists pgcrypto;

-- 1) Поля для phone+PIN в clients
alter table public.clients add column if not exists phone text;
alter table public.clients add column if not exists pin_salt text;
alter table public.clients add column if not exists pin_hash text;
alter table public.clients add column if not exists pin_failed_attempts integer not null default 0;
alter table public.clients add column if not exists pin_locked_until timestamptz;

-- Уникальный телефон (E.164 нормализованный вид ожидается на входе)
create unique index if not exists clients_phone_unique
  on public.clients(phone)
  where phone is not null;

-- 2) RPC: получить соль по телефону
-- Чтобы не облегчать перебор, для несуществующих телефонов возвращаем детерминированную "пустую" соль.
drop function if exists public.get_client_salt(text);
create or replace function public.get_client_salt(p_phone_normalized text)
returns table(salt text)
language plpgsql
security definer
set search_path = public
as $$
declare s text;
begin
  s := (
    select c.pin_salt
      from public.clients c
     where c.phone = p_phone_normalized
     limit 1
  );

  if s is null then
    return query
      select encode(digest(coalesce(p_phone_normalized, '') || '::heys_dummy_salt', 'sha256'), 'hex');
  else
    return query select s;
  end if;
end;
$$;

revoke all on function public.get_client_salt(text) from public;
grant execute on function public.get_client_salt(text) to anon, authenticated;

-- 3) RPC: проверить PIN (hash уже вычислен на клиенте как sha256(pin + ':' + salt))
-- Лимит попыток: 10 за 10 минут (lockout через pin_locked_until)
drop function if exists public.verify_client_pin(text, text);
create or replace function public.verify_client_pin(
  p_phone_normalized text,
  p_pin_hash text
)
returns table(client_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare c record;
declare now_ts timestamptz := now();
declare new_fail_count int;
begin
  select id, pin_hash, pin_locked_until, pin_failed_attempts
    into c
    from public.clients
   where phone = p_phone_normalized
   limit 1;

  if c.id is null then
    return query select null::uuid;
    return;
  end if;

  if c.pin_locked_until is not null and c.pin_locked_until > now_ts then
    return query select null::uuid;
    return;
  end if;

  if c.pin_hash is null or c.pin_hash <> p_pin_hash then
    new_fail_count := coalesce(c.pin_failed_attempts, 0) + 1;

    update public.clients
       set pin_failed_attempts = new_fail_count,
           pin_locked_until = case
             when new_fail_count >= 10 then now_ts + interval '10 minutes'
             else pin_locked_until
           end
     where id = c.id;

    return query select null::uuid;
    return;
  end if;

  -- Успех → сброс
  update public.clients
     set pin_failed_attempts = 0,
         pin_locked_until = null
   where id = c.id;

  return query select c.id;
end;
$$;

revoke all on function public.verify_client_pin(text, text) from public;
grant execute on function public.verify_client_pin(text, text) to anon, authenticated;

-- 4) RPC: создать клиента с phone+PIN (только куратор, auth.uid обязателен)
drop function if exists public.create_client_with_pin(text, text, text, text);
create or replace function public.create_client_with_pin(
  p_name text,
  p_phone_normalized text,
  p_pin_salt text,
  p_pin_hash text
)
returns table(client_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid();
declare new_id uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_phone_normalized is null or length(trim(p_phone_normalized)) < 10 then
    raise exception 'invalid_phone';
  end if;

  if p_pin_salt is null or length(p_pin_salt) < 16 then
    raise exception 'invalid_salt';
  end if;

  if p_pin_hash is null or length(p_pin_hash) < 32 then
    raise exception 'invalid_hash';
  end if;

  insert into public.clients(
    name,
    curator_id,
    phone,
    pin_salt,
    pin_hash,
    updated_at
  ) values (
    nullif(trim(coalesce(p_name, '')), ''),
    uid,
    p_phone_normalized,
    p_pin_salt,
    p_pin_hash,
    now()
  )
  returning id into new_id;

  return query select new_id;
end;
$$;

revoke all on function public.create_client_with_pin(text, text, text, text) from public;
grant execute on function public.create_client_with_pin(text, text, text, text) to authenticated;

-- 5) RPC: сброс PIN (только куратор, владелец клиента)
drop function if exists public.reset_client_pin(uuid, text, text);
create or replace function public.reset_client_pin(
  p_client_id uuid,
  p_pin_salt text,
  p_pin_hash text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  update public.clients
     set pin_salt = p_pin_salt,
         pin_hash = p_pin_hash,
         pin_failed_attempts = 0,
         pin_locked_until = null,
         updated_at = now()
   where id = p_client_id
     and curator_id = uid;

  if not found then
    raise exception 'not_found_or_forbidden';
  end if;
end;
$$;

revoke all on function public.reset_client_pin(uuid, text, text) from public;
grant execute on function public.reset_client_pin(uuid, text, text) to authenticated;

commit;
