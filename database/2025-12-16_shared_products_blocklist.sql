-- ═══════════════════════════════════════════════════════════════════
-- 🚫 HEYS Shared Products Blocklist — Локальная модерация куратора
-- Created: 2025-12-16
-- Purpose: Скрытие продуктов «для себя и своих клиентов» без удаления из глобальной базы
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- 📦 Таблица shared_products_blocklist
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.shared_products_blocklist (
  curator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.shared_products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  
  PRIMARY KEY (curator_id, product_id)
);

COMMENT ON TABLE public.shared_products_blocklist IS 'Локальная модерация: куратор скрывает продукты для себя и своих клиентов';

-- ═══════════════════════════════════════════════════════════════════
-- 🔍 Индексы
-- ═══════════════════════════════════════════════════════════════════

-- Индекс для быстрой фильтрации blocklist куратора
CREATE INDEX IF NOT EXISTS idx_shared_products_blocklist_curator 
  ON public.shared_products_blocklist (curator_id);

-- Индекс для проверки: скрыт ли продукт
CREATE INDEX IF NOT EXISTS idx_shared_products_blocklist_product 
  ON public.shared_products_blocklist (product_id);

-- ═══════════════════════════════════════════════════════════════════
-- 🔐 RLS Политики
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.shared_products_blocklist ENABLE ROW LEVEL SECURITY;

-- Куратор управляет только своим blocklist
DROP POLICY IF EXISTS "blocklist_manage_own" ON public.shared_products_blocklist;
CREATE POLICY "blocklist_manage_own"
  ON public.shared_products_blocklist
  FOR ALL
  TO authenticated
  USING (curator_id = auth.uid())
  WITH CHECK (curator_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 RPC функция для PIN-клиентов (получение blocklist)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_client_blocklist(p_client_id uuid)
RETURNS uuid[] AS $$
  SELECT COALESCE(
    array_agg(b.product_id),
    ARRAY[]::uuid[]
  )
  FROM public.shared_products_blocklist b
  JOIN public.clients c ON c.curator_id = b.curator_id
  WHERE c.id = p_client_id;
$$ LANGUAGE sql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_client_blocklist IS 'Получить blocklist для PIN-клиента (через куратора)';

-- ═══════════════════════════════════════════════════════════════════
-- 🔑 Права доступа
-- ═══════════════════════════════════════════════════════════════════

GRANT SELECT, INSERT, DELETE ON TABLE public.shared_products_blocklist TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- ✅ Миграция завершена
-- ═══════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shared_products_blocklist') THEN
    RAISE NOTICE '✅ Таблица shared_products_blocklist успешно создана';
  END IF;
END $$;
