-- ═══════════════════════════════════════════════════════════════════════════════
-- 🔧 HEYS Missing Tables Migration
-- Дата: 2025-12-22
-- Описание: Добавление недостающих таблиц для Yandex Cloud PostgreSQL
-- Исправляет: 500 ошибку на shared_products_pending
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- 📦 Таблица shared_products_pending (заявки на модерацию от PIN-клиентов)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.shared_products_pending (
  -- Идентификация
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Кто предложил
  client_id UUID NOT NULL,  -- клиент, который предложил продукт
  curator_id UUID NOT NULL, -- куратор клиента (без FK на auth.users в Yandex)
  
  -- Данные продукта
  product_data JSONB NOT NULL,  -- полный объект продукта (для восстановления)
  name_norm TEXT NOT NULL,  -- нормализованное имя (для поиска)
  fingerprint TEXT NOT NULL,  -- fingerprint для дедупликации
  
  -- Статус модерации
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reject_reason TEXT,  -- причина отклонения (опционально)
  
  -- Метки времени
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  moderated_at TIMESTAMPTZ,  -- когда была модерация
  moderated_by UUID  -- кто модерировал
);

COMMENT ON TABLE public.shared_products_pending IS 'Очередь заявок на добавление продуктов от PIN-клиентов';

-- Индексы
CREATE INDEX IF NOT EXISTS idx_shared_products_pending_curator 
  ON public.shared_products_pending (curator_id, status);

CREATE INDEX IF NOT EXISTS idx_shared_products_pending_fingerprint 
  ON public.shared_products_pending (fingerprint);

CREATE INDEX IF NOT EXISTS idx_shared_products_pending_created_at 
  ON public.shared_products_pending (created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 🚫 Таблица shared_products_blocklist (локальная модерация куратора)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.shared_products_blocklist (
  curator_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES public.shared_products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  
  PRIMARY KEY (curator_id, product_id)
);

COMMENT ON TABLE public.shared_products_blocklist IS 'Локальная модерация: куратор скрывает продукты для себя и своих клиентов';

-- Индексы
CREATE INDEX IF NOT EXISTS idx_shared_products_blocklist_curator 
  ON public.shared_products_blocklist (curator_id);

CREATE INDEX IF NOT EXISTS idx_shared_products_blocklist_product 
  ON public.shared_products_blocklist (product_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 👁️ VIEW shared_products_public (публичный доступ к продуктам)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.shared_products_public AS
SELECT 
  id,
  name,
  name_norm,
  fingerprint,
  simple100,
  complex100,
  protein100,
  badFat100,
  goodFat100,
  trans100,
  fiber100,
  gi,
  harm,
  category,
  portions,
  description,
  created_at
FROM public.shared_products;

COMMENT ON VIEW public.shared_products_public IS 'Публичный view для доступа к продуктам без авторизации';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 🔧 RPC функция create_pending_product (для PIN-клиентов)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_pending_product(
  p_client_id UUID,
  p_product_data JSONB,
  p_name_norm TEXT,
  p_fingerprint TEXT
) RETURNS JSONB AS $$
DECLARE
  v_curator_id UUID;
  v_pending_id UUID;
  v_existing_id UUID;
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

-- ═══════════════════════════════════════════════════════════════════════════════
-- 🔧 RPC функция get_client_blocklist (для PIN-клиентов)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_client_blocklist(p_client_id UUID)
RETURNS UUID[] AS $$
  SELECT COALESCE(
    array_agg(b.product_id),
    ARRAY[]::UUID[]
  )
  FROM public.shared_products_blocklist b
  JOIN public.clients c ON c.curator_id = b.curator_id
  WHERE c.id = p_client_id;
$$ LANGUAGE sql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_client_blocklist IS 'Получить blocklist для PIN-клиента (через куратора)';

-- ═══════════════════════════════════════════════════════════════════════════════
-- ✅ Проверка миграции
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_tables TEXT[] := ARRAY['shared_products_pending', 'shared_products_blocklist'];
    v_views TEXT[] := ARRAY['shared_products_public'];
    v_functions TEXT[] := ARRAY['create_pending_product', 'get_client_blocklist'];
    t TEXT;
BEGIN
    -- Проверяем таблицы
    FOREACH t IN ARRAY v_tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN
            RAISE NOTICE '✅ Таблица % существует', t;
        ELSE
            RAISE NOTICE '❌ Таблица % НЕ найдена', t;
        END IF;
    END LOOP;
    
    -- Проверяем views
    FOREACH t IN ARRAY v_views LOOP
        IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = t) THEN
            RAISE NOTICE '✅ VIEW % существует', t;
        ELSE
            RAISE NOTICE '❌ VIEW % НЕ найден', t;
        END IF;
    END LOOP;
    
    -- Проверяем функции
    FOREACH t IN ARRAY v_functions LOOP
        IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = t) THEN
            RAISE NOTICE '✅ Функция %() существует', t;
        ELSE
            RAISE NOTICE '❌ Функция %() НЕ найдена', t;
        END IF;
    END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 🎉 Миграция завершена!
-- ═══════════════════════════════════════════════════════════════════════════════
