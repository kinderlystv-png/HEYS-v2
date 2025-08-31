-- TEMPORARY: Disable RLS for testing (NOT for production!)
-- Use this only for debugging, then re-enable RLS with proper policies

ALTER TABLE public.clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.kv_store DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_kv_store DISABLE ROW LEVEL SECURITY;

-- To re-enable later (after fixing the app logic):
-- ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.kv_store ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.client_kv_store ENABLE ROW LEVEL SECURITY;
