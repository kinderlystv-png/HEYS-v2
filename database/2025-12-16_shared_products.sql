-- ═══════════════════════════════════════════════════════════════════
-- 🌐 HEYS Shared Products — Глобальная база продуктов всех пользователей
-- Created: 2025-12-16
-- Purpose: Общая база продуктов с облачной синхронизацией и модерацией
-- ═══════════════════════════════════════════════════════════════════

-- Требуемые расширения
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- для gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- для быстрого поиска по тексту

-- ═══════════════════════════════════════════════════════════════════
-- 📦 Таблица shared_products — глобальная база продуктов
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.shared_products (
  -- Идентификация
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Авторство (для редактирования и аналитики)
  created_by_user_id uuid NULL,  -- auth.uid() куратора, который добавил/подтвердил продукт
  created_by_client_id uuid NULL,  -- uuid клиента (PIN), чей продукт был подтверждён
  
  -- Базовые данные
  name text NOT NULL,
  name_norm text NOT NULL,  -- нормализованное имя (lower/trim/whitespace collapse)
  fingerprint text NOT NULL UNIQUE,  -- стабильный ключ дедупа (IMMUTABLE после создания)
  
  -- Нутриенты (на 100г) — совместимо с Product model
  simple100 numeric NOT NULL DEFAULT 0,
  complex100 numeric NOT NULL DEFAULT 0,
  protein100 numeric NOT NULL DEFAULT 0,
  badFat100 numeric NOT NULL DEFAULT 0,
  goodFat100 numeric NOT NULL DEFAULT 0,
  trans100 numeric NOT NULL DEFAULT 0,
  fiber100 numeric NOT NULL DEFAULT 0,
  
  -- Метаданные
  gi numeric,  -- гликемический индекс (опционально)
  harm numeric,  -- вредность (опционально)
  category text,  -- категория продукта (редактируемое поле)
  portions jsonb,  -- порции продукта (редактируемое поле)
  description text,  -- описание (редактируемое поле)
  
  -- Метки времени
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- Комментарии к таблице
COMMENT ON TABLE public.shared_products IS 'Глобальная база продуктов всех пользователей HEYS';
COMMENT ON COLUMN public.shared_products.fingerprint IS 'IMMUTABLE — нельзя редактировать после создания';
COMMENT ON COLUMN public.shared_products.category IS 'MUTABLE — можно редактировать автору';
COMMENT ON COLUMN public.shared_products.portions IS 'MUTABLE — можно редактировать автору';
COMMENT ON COLUMN public.shared_products.description IS 'MUTABLE — можно редактировать автору';

-- ═══════════════════════════════════════════════════════════════════
-- 🔍 Индексы для быстрого поиска
-- ═══════════════════════════════════════════════════════════════════

-- GIN индекс для триграмного поиска по name_norm (ILIKE queries)
CREATE INDEX IF NOT EXISTS idx_shared_products_name_trgm 
  ON public.shared_products USING GIN (name_norm gin_trgm_ops);

-- Индекс для фильтрации по автору
CREATE INDEX IF NOT EXISTS idx_shared_products_created_by_user 
  ON public.shared_products (created_by_user_id);

-- Индекс для сортировки по дате
CREATE INDEX IF NOT EXISTS idx_shared_products_created_at 
  ON public.shared_products (created_at DESC);

-- ═══════════════════════════════════════════════════════════════════
-- 🔄 Триггер для автоматического обновления updated_at
-- ═══════════════════════════════════════════════════════════════════

-- Создаём функцию если её ещё нет (идемпотентность)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Создаём триггер
DROP TRIGGER IF EXISTS trigger_shared_products_updated_at ON public.shared_products;
CREATE TRIGGER trigger_shared_products_updated_at
  BEFORE UPDATE ON public.shared_products
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════
-- 🔐 RLS Политики
-- ═══════════════════════════════════════════════════════════════════

-- Включаем RLS
ALTER TABLE public.shared_products ENABLE ROW LEVEL SECURITY;

-- SELECT — доступен всем (включая anon)
DROP POLICY IF EXISTS "shared_products_select_all" ON public.shared_products;
CREATE POLICY "shared_products_select_all" 
  ON public.shared_products
  FOR SELECT
  USING (true);

-- INSERT — только для authenticated пользователей
DROP POLICY IF EXISTS "shared_products_insert_auth" ON public.shared_products;
CREATE POLICY "shared_products_insert_auth"
  ON public.shared_products
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- UPDATE — только автор может редактировать
DROP POLICY IF EXISTS "shared_products_update_owner" ON public.shared_products;
CREATE POLICY "shared_products_update_owner"
  ON public.shared_products
  FOR UPDATE
  TO authenticated
  USING (created_by_user_id = auth.uid())
  WITH CHECK (created_by_user_id = auth.uid());

-- DELETE — запрещён для всех (продукты не удаляются из глобальной базы)
-- Вместо удаления используется локальный blocklist

-- ═══════════════════════════════════════════════════════════════════
-- 👁️ VIEW для безопасного SELECT (скрывает приватные поля)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.shared_products_public AS
SELECT 
  id,
  name,
  name_norm,
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
  fingerprint,
  created_at,
  -- Computed field: is_mine — для UI отображения "Вы" / "Пользователь HEYS"
  (created_by_user_id = auth.uid()) AS is_mine
FROM public.shared_products;

COMMENT ON VIEW public.shared_products_public IS 'Публичный VIEW без приватных полей (created_by_user_id скрыт)';

-- ═══════════════════════════════════════════════════════════════════
-- 🔑 Права доступа
-- ═══════════════════════════════════════════════════════════════════

-- Таблица shared_products
GRANT SELECT ON TABLE public.shared_products TO anon, authenticated;
GRANT INSERT, UPDATE ON TABLE public.shared_products TO authenticated;

-- VIEW shared_products_public
GRANT SELECT ON public.shared_products_public TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- ✅ Миграция завершена
-- ═══════════════════════════════════════════════════════════════════

-- Проверка создания таблицы
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shared_products') THEN
    RAISE NOTICE '✅ Таблица shared_products успешно создана';
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'shared_products_public') THEN
    RAISE NOTICE '✅ VIEW shared_products_public успешно создан';
  END IF;
END $$;
