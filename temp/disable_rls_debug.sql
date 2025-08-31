-- ВРЕМЕННОЕ отключение RLS для отладки
-- После того как убедимся что приложение работает, включим обратно

ALTER TABLE public.clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.kv_store DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_kv_store DISABLE ROW LEVEL SECURITY;

-- Проверяем статус RLS
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('clients', 'kv_store', 'client_kv_store') 
AND schemaname = 'public';
