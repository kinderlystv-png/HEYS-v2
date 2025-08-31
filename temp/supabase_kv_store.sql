
-- supabase_kv_store.sql — создать таблицу зеркалирования localStorage и включить RLS

-- Таблица клиентов
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clients enable row level security;

create policy "clients select own" on public.clients
for select using (auth.uid() = user_id);

create policy "clients insert own" on public.clients
for insert with check (auth.uid() = user_id);

create policy "clients update own" on public.clients
for update using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "clients delete own" on public.clients
for delete using (auth.uid() = user_id);

-- Основная таблица key-value
create table if not exists public.kv_store (
  user_id uuid not null references auth.users(id) on delete cascade,
  k text not null,
  v jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, k)
);

alter table public.kv_store enable row level security;

create policy "kv select own" on public.kv_store
for select using (auth.uid() = user_id);

create policy "kv insert own" on public.kv_store
for insert with check (auth.uid() = user_id);

create policy "kv update own" on public.kv_store
for update using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "kv delete own" on public.kv_store
for delete using (auth.uid() = user_id);

-- Таблица клиентских данных
create table if not exists public.client_kv_store (
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  k text not null,
  v jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, client_id, k)
);

alter table public.client_kv_store enable row level security;

create policy "client_kv select own" on public.client_kv_store
for select using (auth.uid() = user_id);

create policy "client_kv insert own" on public.client_kv_store
for insert with check (auth.uid() = user_id);

create policy "client_kv update own" on public.client_kv_store
for update using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "client_kv delete own" on public.client_kv_store
for delete using (auth.uid() = user_id);
