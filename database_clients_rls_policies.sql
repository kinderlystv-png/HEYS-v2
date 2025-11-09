-- ============================================
-- RLS ПОЛИТИКИ ДЛЯ ТАБЛИЦЫ CLIENTS
-- ============================================

-- 1. Включаем Row Level Security
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- 2. Политика SELECT: Пользователь видит только своих клиентов
CREATE POLICY "Users can view their own clients"
ON public.clients
FOR SELECT
USING (auth.uid() = curator_id);

-- 3. Политика INSERT: Пользователь может создавать клиентов только для себя
CREATE POLICY "Users can create their own clients"
ON public.clients
FOR INSERT
WITH CHECK (auth.uid() = curator_id);

-- 4. Политика UPDATE: Пользователь может обновлять только своих клиентов
CREATE POLICY "Users can update their own clients"
ON public.clients
FOR UPDATE
USING (auth.uid() = curator_id)
WITH CHECK (auth.uid() = curator_id);

-- 5. Политика DELETE: Пользователь может удалять только своих клиентов
CREATE POLICY "Users can delete their own clients"
ON public.clients
FOR DELETE
USING (auth.uid() = curator_id);

-- ============================================
-- ПРОВЕРКА ПОЛИТИК
-- ============================================

-- Просмотр всех политик для таблицы clients
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'clients';
