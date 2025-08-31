-- Таблица клиентов
create table if not exists clients (
    id uuid primary key default gen_random_uuid(),
    curator_id uuid references auth.users(id) on delete cascade,
    name text not null,
    email text,
    created_at timestamp with time zone default timezone('utc', now())
);

-- Таблица данных клиентов (kv_store)
create table if not exists client_kv_store (
    id uuid primary key default gen_random_uuid(),
    client_id uuid references clients(id) on delete cascade,
    k text not null,
    v jsonb,
    updated_at timestamp with time zone default timezone('utc', now()),
    unique (client_id, k)
);

-- Индекс для быстрого поиска по client_id
create index if not exists idx_client_kv_store_client_id on client_kv_store(client_id);

-- Индекс для быстрого поиска по curator_id
create index if not exists idx_clients_curator_id on clients(curator_id);
