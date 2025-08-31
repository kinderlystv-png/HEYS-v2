-- Создание или исправление таблицы kv_store

-- Удалить таблицу если есть проблемы (осторожно!)
-- DROP TABLE IF EXISTS public.kv_store;

-- Создать таблицу kv_store
CREATE TABLE IF NOT EXISTS public.kv_store (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  k text NOT NULL,
  v jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, k)
);

-- Включить RLS
ALTER TABLE public.kv_store ENABLE ROW LEVEL SECURITY;

-- Удалить старые политики если есть
DROP POLICY IF EXISTS "kv select own" ON public.kv_store;
DROP POLICY IF EXISTS "kv insert own" ON public.kv_store;
DROP POLICY IF EXISTS "kv update own" ON public.kv_store;
DROP POLICY IF EXISTS "kv delete own" ON public.kv_store;

-- Создать политики
CREATE POLICY "kv select own" ON public.kv_store
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "kv insert own" ON public.kv_store
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "kv update own" ON public.kv_store
FOR UPDATE USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "kv delete own" ON public.kv_store
FOR DELETE USING (auth.uid() = user_id);

-- Временно отключить RLS для отладки
ALTER TABLE public.kv_store DISABLE ROW LEVEL SECURITY;
