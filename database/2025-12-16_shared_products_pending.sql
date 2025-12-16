-- ═══════════════════════════════════════════════════════════════════
-- 🆕 HEYS Shared Products Pending — Очередь заявок от PIN-клиентов
-- Created: 2025-12-16
-- Purpose: Заявки на добавление продуктов в общую базу от PIN-клиентов (требуют подтверждения куратора)
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- 📦 Таблица shared_products_pending
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.shared_products_pending (
  -- Идентификация
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Кто предложил
  client_id uuid NOT NULL,  -- клиент, который предложил продукт
  curator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- куратор клиента
  
  -- Данные продукта
  product_data jsonb NOT NULL,  -- полный объект продукта (для восстановления)
  name_norm text NOT NULL,  -- нормализованное имя (для поиска)
  fingerprint text NOT NULL,  -- fingerprint для дедупликации
  
  -- Статус модерации
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reject_reason text,  -- причина отклонения (опционально)
  
  -- Метки времени
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  moderated_at timestamptz,  -- когда была модерация
  moderated_by uuid REFERENCES auth.users(id)  -- кто модерировал
);

COMMENT ON TABLE public.shared_products_pending IS 'Очередь заявок на добавление продуктов от PIN-клиентов';

-- ═══════════════════════════════════════════════════════════════════
-- 🔍 Индексы
-- ═══════════════════════════════════════════════════════════════════

-- Индекс для фильтрации заявок куратора
CREATE INDEX IF NOT EXISTS idx_shared_products_pending_curator 
  ON public.shared_products_pending (curator_id, status);

-- Индекс для проверки дублей по fingerprint
CREATE INDEX IF NOT EXISTS idx_shared_products_pending_fingerprint 
  ON public.shared_products_pending (fingerprint);

-- Индекс для сортировки по дате
CREATE INDEX IF NOT EXISTS idx_shared_products_pending_created_at 
  ON public.shared_products_pending (created_at DESC);

-- ═══════════════════════════════════════════════════════════════════
-- 🔐 RLS Политики
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.shared_products_pending ENABLE ROW LEVEL SECURITY;

-- SELECT — куратор видит заявки своих клиентов
DROP POLICY IF EXISTS "pending_select_curator" ON public.shared_products_pending;
CREATE POLICY "pending_select_curator"
  ON public.shared_products_pending
  FOR SELECT
  TO authenticated
  USING (curator_id = auth.uid());

-- UPDATE — куратор управляет заявками своих клиентов
DROP POLICY IF EXISTS "pending_update_curator" ON public.shared_products_pending;
CREATE POLICY "pending_update_curator"
  ON public.shared_products_pending
  FOR UPDATE
  TO authenticated
  USING (curator_id = auth.uid())
  WITH CHECK (curator_id = auth.uid());

-- DELETE — куратор может удалять заявки своих клиентов
DROP POLICY IF EXISTS "pending_delete_curator" ON public.shared_products_pending;
CREATE POLICY "pending_delete_curator"
  ON public.shared_products_pending
  FOR DELETE
  TO authenticated
  USING (curator_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 RPC функция для создания заявки (PIN-клиенты)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_pending_product(
  p_client_id uuid,
  p_product_data jsonb,
  p_name_norm text,
  p_fingerprint text
) RETURNS jsonb AS $$
DECLARE
  v_curator_id uuid;
  v_pending_id uuid;
  v_existing_id uuid;
BEGIN
  -- Проверить: продукт с таким fingerprint уже есть в shared?
  SELECT id INTO v_existing_id 
  FROM public.shared_products 
  WHERE fingerprint = p_fingerprint;
  
  IF v_existing_id IS NOT NULL THEN
    -- Вернуть existing_id для soft merge на клиенте
    RETURN jsonb_build_object(
      'status', 'exists',
      'existing_id', v_existing_id,
      'message', 'Продукт уже существует в общей базе'
    );
  END IF;

  -- Получить куратора клиента
  SELECT curator_id INTO v_curator_id 
  FROM public.clients 
  WHERE id = p_client_id;
  
  IF v_curator_id IS NULL THEN
    RAISE EXCEPTION 'Client not found or has no curator';
  END IF;

  -- Создать заявку
  INSERT INTO public.shared_products_pending
    (client_id, curator_id, product_data, name_norm, fingerprint)
  VALUES
    (p_client_id, v_curator_id, p_product_data, p_name_norm, p_fingerprint)
  RETURNING id INTO v_pending_id;

  RETURN jsonb_build_object(
    'status', 'pending',
    'pending_id', v_pending_id,
    'message', 'Заявка отправлена куратору'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.create_pending_product IS 'Создать заявку на добавление продукта (для PIN-клиентов без session)';

-- ═══════════════════════════════════════════════════════════════════
-- 🔑 Права доступа
-- ═══════════════════════════════════════════════════════════════════

GRANT SELECT, UPDATE, DELETE ON TABLE public.shared_products_pending TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- ✅ Миграция завершена
-- ═══════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shared_products_pending') THEN
    RAISE NOTICE '✅ Таблица shared_products_pending успешно создана';
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_pending_product') THEN
    RAISE NOTICE '✅ Функция create_pending_product() успешно создана';
  END IF;
END $$;
