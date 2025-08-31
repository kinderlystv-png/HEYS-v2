-- supabase_full_setup.sql — полная и идемпотентная схема для проекта HEYS
-- Запускайте целиком в SQL Editor Supabase. Скрипт безопасно создаёт/обновляет структуру.
-- Включает:
--  * Расширение pgcrypto (UUID генератор)
--  * Таблицы: clients, kv_store (глобальные ключи), client_kv_store (клиентские ключи)
--  * Индексы
--  * RLS + политики доступа
--  * Универсальные триггеры обновления updated_at
--  * Мягкую миграцию user_id -> curator_id в clients (если вдруг старое поле)

--------------------------------------------------
-- 1. Расширение
--------------------------------------------------
create extension if not exists pgcrypto;

--------------------------------------------------
-- 2. Миграция старого столбца (если нужен) user_id -> curator_id
--------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_name='clients' and column_name='user_id'
  ) and not exists (
    select 1 from information_schema.columns 
    where table_name='clients' and column_name='curator_id'
  ) then
    execute 'alter table clients rename column user_id to curator_id';
  end if;
exception when undefined_table then null; -- если таблицы ещё нет
end$$;

--------------------------------------------------
-- 3. Таблица clients
--    curator_id — пользователь (куратор), владеющий клиентом
--------------------------------------------------
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  curator_id uuid references auth.users(id) on delete cascade,
  name text not null,
  email text,
  created_at timestamptz default timezone('utc', now())
);

--------------------------------------------------
-- 4. Таблица client_kv_store — ключи, привязанные к конкретному клиенту
--    (heys_profile, heys_products, heys_hr_zones, heys_norms, heys_dayv2_YYYY-MM-DD ...)
--------------------------------------------------
create table if not exists client_kv_store (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  k text not null,
  v jsonb,
  updated_at timestamptz default timezone('utc', now()),
  unique (client_id, k)
);

--------------------------------------------------
-- 5. Таблица kv_store — глобальные (не клиентские) ключи пользователя
--    (используется bootstrapSync для общих данных при необходимости)
--------------------------------------------------
create table if not exists kv_store (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  k text not null,
  v jsonb,
  updated_at timestamptz default timezone('utc', now()),
  unique (user_id, k)
);

--------------------------------------------------
-- 6. Индексы
--------------------------------------------------
create index if not exists idx_clients_curator_id on clients(curator_id);
create index if not exists idx_client_kv_store_client_id on client_kv_store(client_id);
create index if not exists idx_kv_store_user_id on kv_store(user_id);

--------------------------------------------------
-- 7. Включение RLS
--------------------------------------------------
alter table clients enable row level security;
alter table client_kv_store enable row level security;
alter table kv_store enable row level security;

--------------------------------------------------
-- 8. Удаление старых политик (идемпотентно)
--------------------------------------------------
do $$
begin
  -- clients
  begin execute 'drop policy clients_sel on clients'; exception when undefined_object then null; end;
  begin execute 'drop policy clients_ins on clients'; exception when undefined_object then null; end;
  begin execute 'drop policy clients_upd on clients'; exception when undefined_object then null; end;
  begin execute 'drop policy clients_del on clients'; exception when undefined_object then null; end;
  -- kv_store
  begin execute 'drop policy kv_sel on kv_store'; exception when undefined_object then null; end;
  begin execute 'drop policy kv_ins on kv_store'; exception when undefined_object then null; end;
  begin execute 'drop policy kv_upd on kv_store'; exception when undefined_object then null; end;
  begin execute 'drop policy kv_del on kv_store'; exception when undefined_object then null; end;
  -- client_kv_store
  begin execute 'drop policy ckv_sel on client_kv_store'; exception when undefined_object then null; end;
  begin execute 'drop policy ckv_ins on client_kv_store'; exception when undefined_object then null; end;
  begin execute 'drop policy ckv_upd on client_kv_store'; exception when undefined_object then null; end;
  begin execute 'drop policy ckv_del on client_kv_store'; exception when undefined_object then null; end;
end$$;

--------------------------------------------------
-- 9. Новые политики доступа
--------------------------------------------------
-- Таблица clients: доступ только своему куратору
create policy clients_sel on clients for select using (auth.uid() = curator_id);
create policy clients_ins on clients for insert with check (auth.uid() = curator_id);
create policy clients_upd on clients for update using (auth.uid() = curator_id) with check (auth.uid() = curator_id);
create policy clients_del on clients for delete using (auth.uid() = curator_id);

-- kv_store: пользователь видит/меняет только свои ключи
create policy kv_sel on kv_store for select using (auth.uid() = user_id);
create policy kv_ins on kv_store for insert with check (auth.uid() = user_id);
create policy kv_upd on kv_store for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy kv_del on kv_store for delete using (auth.uid() = user_id);

-- client_kv_store: доступ к ключам клиента, если клиент принадлежит куратору
create policy ckv_sel on client_kv_store for select using (
  exists (select 1 from clients c where c.id = client_kv_store.client_id and c.curator_id = auth.uid())
);
create policy ckv_ins on client_kv_store for insert with check (
  exists (select 1 from clients c where c.id = client_kv_store.client_id and c.curator_id = auth.uid())
);
create policy ckv_upd on client_kv_store for update using (
  exists (select 1 from clients c where c.id = client_kv_store.client_id and c.curator_id = auth.uid())
) with check (
  exists (select 1 from clients c where c.id = client_kv_store.client_id and c.curator_id = auth.uid())
);
create policy ckv_del on client_kv_store for delete using (
  exists (select 1 from clients c where c.id = client_kv_store.client_id and c.curator_id = auth.uid())
);

--------------------------------------------------
-- 10. Функция и триггеры автообновления updated_at (только при UPDATE)
--------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end$$ language plpgsql;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname='trg_clients_updated_at') then
    execute 'create trigger trg_clients_updated_at before update on clients for each row execute function set_updated_at()';
  end if;
  if not exists (select 1 from pg_trigger where tgname='trg_client_kv_store_updated_at') then
    execute 'create trigger trg_client_kv_store_updated_at before update on client_kv_store for each row execute function set_updated_at()';
  end if;
  if not exists (select 1 from pg_trigger where tgname='trg_kv_store_updated_at') then
    execute 'create trigger trg_kv_store_updated_at before update on kv_store for each row execute function set_updated_at()';
  end if;
end$$;

--------------------------------------------------
-- 11. (Опционально) проверка — раскомментируйте для диагностики
--------------------------------------------------
-- select 'clients', count(*) from clients;
-- select 'client_kv_store', count(*) from client_kv_store;
-- select 'kv_store', count(*) from kv_store;

-- Конец скрипта
