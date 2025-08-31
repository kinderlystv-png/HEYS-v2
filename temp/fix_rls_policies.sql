-- Fix RLS Policies for HEYS Application
-- Run this AFTER the schema reset to fix permission issues

-- Update clients table policies to be more permissive for client creation
DROP POLICY IF EXISTS "clients select own" ON public.clients;
DROP POLICY IF EXISTS "clients insert own" ON public.clients;
DROP POLICY IF EXISTS "clients update own" ON public.clients;
DROP POLICY IF EXISTS "clients delete own" ON public.clients;

-- More permissive clients policies
CREATE POLICY "clients select own" ON public.clients
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "clients insert own" ON public.clients
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "clients update own" ON public.clients
FOR UPDATE USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "clients delete own" ON public.clients
FOR DELETE USING (auth.uid() = user_id);

-- Update client_kv_store policies to handle user.id as client_id case
DROP POLICY IF EXISTS "client_kv select own" ON public.client_kv_store;
DROP POLICY IF EXISTS "client_kv insert own" ON public.client_kv_store;
DROP POLICY IF EXISTS "client_kv update own" ON public.client_kv_store;
DROP POLICY IF EXISTS "client_kv delete own" ON public.client_kv_store;

-- More flexible client_kv_store policies
CREATE POLICY "client_kv select own" ON public.client_kv_store
FOR SELECT USING (
  auth.uid() = user_id OR 
  auth.uid()::text = client_id::text
);

CREATE POLICY "client_kv insert own" ON public.client_kv_store
FOR INSERT WITH CHECK (
  auth.uid() = user_id OR 
  auth.uid()::text = client_id::text
);

CREATE POLICY "client_kv update own" ON public.client_kv_store
FOR UPDATE USING (
  auth.uid() = user_id OR 
  auth.uid()::text = client_id::text
)
WITH CHECK (
  auth.uid() = user_id OR 
  auth.uid()::text = client_id::text
);

CREATE POLICY "client_kv delete own" ON public.client_kv_store
FOR DELETE USING (
  auth.uid() = user_id OR 
  auth.uid()::text = client_id::text
);

-- Verify policies are applied
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('clients', 'kv_store', 'client_kv_store')
ORDER BY tablename, policyname;
