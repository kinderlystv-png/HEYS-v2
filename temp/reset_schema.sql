-- Schema Reset Script for HEYS Application
-- Run this in Supabase SQL Editor to fix schema issues

-- First, drop existing policies and tables to ensure clean state
DROP POLICY IF EXISTS "client_kv delete own" ON public.client_kv_store;
DROP POLICY IF EXISTS "client_kv update own" ON public.client_kv_store;
DROP POLICY IF EXISTS "client_kv insert own" ON public.client_kv_store;
DROP POLICY IF EXISTS "client_kv select own" ON public.client_kv_store;
DROP TABLE IF EXISTS public.client_kv_store;

DROP POLICY IF EXISTS "kv delete own" ON public.kv_store;
DROP POLICY IF EXISTS "kv update own" ON public.kv_store;
DROP POLICY IF EXISTS "kv insert own" ON public.kv_store;
DROP POLICY IF EXISTS "kv select own" ON public.kv_store;
DROP TABLE IF EXISTS public.kv_store;

DROP POLICY IF EXISTS "clients delete own" ON public.clients;
DROP POLICY IF EXISTS "clients update own" ON public.clients;
DROP POLICY IF EXISTS "clients insert own" ON public.clients;
DROP POLICY IF EXISTS "clients select own" ON public.clients;
DROP TABLE IF EXISTS public.clients;

-- Recreate clients table
CREATE TABLE public.clients (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  updated_at timestamptz not null default now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients select own" ON public.clients
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "clients insert own" ON public.clients
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "clients update own" ON public.clients
FOR UPDATE USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "clients delete own" ON public.clients
FOR DELETE USING (auth.uid() = user_id);

-- Recreate kv_store table
CREATE TABLE public.kv_store (
  user_id uuid not null references auth.users(id) on delete cascade,
  k text not null,
  v jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, k)
);

ALTER TABLE public.kv_store ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kv select own" ON public.kv_store
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "kv insert own" ON public.kv_store
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "kv update own" ON public.kv_store
FOR UPDATE USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "kv delete own" ON public.kv_store
FOR DELETE USING (auth.uid() = user_id);

-- Recreate client_kv_store table
CREATE TABLE public.client_kv_store (
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  k text not null,
  v jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, client_id, k)
);

ALTER TABLE public.client_kv_store ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_kv select own" ON public.client_kv_store
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "client_kv insert own" ON public.client_kv_store
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "client_kv update own" ON public.client_kv_store
FOR UPDATE USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "client_kv delete own" ON public.client_kv_store
FOR DELETE USING (auth.uid() = user_id);

-- Verify tables exist
SELECT 'clients' as table_name, count(*) as exists FROM information_schema.tables WHERE table_name = 'clients' AND table_schema = 'public'
UNION ALL
SELECT 'kv_store' as table_name, count(*) as exists FROM information_schema.tables WHERE table_name = 'kv_store' AND table_schema = 'public'
UNION ALL
SELECT 'client_kv_store' as table_name, count(*) as exists FROM information_schema.tables WHERE table_name = 'client_kv_store' AND table_schema = 'public';
