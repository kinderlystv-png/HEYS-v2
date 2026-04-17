# Shared Products — Ready SQL Queries for Supabase Dashboard

> Выполнить эти запросы в **Supabase Dashboard → SQL Editor**  
> Каждый блок можно выполнять отдельно или все сразу

---

## 📦 Query 1: Shared Products Table + VIEW

```sql
-- ═══════════════════════════════════════════════════════════════════
-- 🌐 HEYS Shared Products — Глобальная база продуктов всех пользователей
-- ═══════════════════════════════════════════════════════════════════

-- Требуемые расширения
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Таблица shared_products
CREATE TABLE IF NOT EXISTS public.shared_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_user_id uuid NULL,
  created_by_client_id uuid NULL,
  name text NOT NULL,
  name_norm text NOT NULL,
  fingerprint text NOT NULL UNIQUE,
  simple100 numeric NOT NULL DEFAULT 0,
  complex100 numeric NOT NULL DEFAULT 0,
  protein100 numeric NOT NULL DEFAULT 0,
  badFat100 numeric NOT NULL DEFAULT 0,
  goodFat100 numeric NOT NULL DEFAULT 0,
  trans100 numeric NOT NULL DEFAULT 0,
  fiber100 numeric NOT NULL DEFAULT 0,
  gi numeric,
  harm numeric,
  category text,
  portions jsonb,
  description text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_shared_products_name_trgm
  ON public.shared_products USING GIN (name_norm gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_shared_products_created_by_user
  ON public.shared_products (created_by_user_id);

CREATE INDEX IF NOT EXISTS idx_shared_products_created_at
  ON public.shared_products (created_at DESC);

-- Триггер updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_shared_products_updated_at ON public.shared_products;
CREATE TRIGGER trigger_shared_products_updated_at
  BEFORE UPDATE ON public.shared_products
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.shared_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shared_products_select_all" ON public.shared_products;
CREATE POLICY "shared_products_select_all"
  ON public.shared_products FOR SELECT USING (true);

DROP POLICY IF EXISTS "shared_products_insert_auth" ON public.shared_products;
CREATE POLICY "shared_products_insert_auth"
  ON public.shared_products FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "shared_products_update_owner" ON public.shared_products;
CREATE POLICY "shared_products_update_owner"
  ON public.shared_products FOR UPDATE TO authenticated
  USING (created_by_user_id = auth.uid())
  WITH CHECK (created_by_user_id = auth.uid());

-- VIEW (скрывает приватные поля)
CREATE OR REPLACE VIEW public.shared_products_public AS
SELECT
  id, name, name_norm, simple100, complex100, protein100,
  badFat100, goodFat100, trans100, fiber100, gi, harm,
  category, portions, description, fingerprint, created_at,
  (created_by_user_id = auth.uid()) AS is_mine
FROM public.shared_products;

-- Права
GRANT SELECT ON TABLE public.shared_products TO anon, authenticated;
GRANT INSERT, UPDATE ON TABLE public.shared_products TO authenticated;
GRANT SELECT ON public.shared_products_public TO anon, authenticated;
```

---

## 🚫 Query 2: Blocklist Table

```sql
-- ═══════════════════════════════════════════════════════════════════
-- 🚫 HEYS Shared Products Blocklist — Локальная модерация
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.shared_products_blocklist (
  curator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.shared_products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (curator_id, product_id)
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_shared_products_blocklist_curator
  ON public.shared_products_blocklist (curator_id);

CREATE INDEX IF NOT EXISTS idx_shared_products_blocklist_product
  ON public.shared_products_blocklist (product_id);

-- RLS
ALTER TABLE public.shared_products_blocklist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blocklist_manage_own" ON public.shared_products_blocklist;
CREATE POLICY "blocklist_manage_own"
  ON public.shared_products_blocklist FOR ALL TO authenticated
  USING (curator_id = auth.uid())
  WITH CHECK (curator_id = auth.uid());

-- RPC для PIN-клиентов
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

-- Права
GRANT SELECT, INSERT, DELETE ON TABLE public.shared_products_blocklist TO authenticated;
```

---

## 🆕 Query 3: Pending Table + RPC

```sql
-- ═══════════════════════════════════════════════════════════════════
-- 🆕 HEYS Shared Products Pending — Очередь заявок от PIN-клиентов
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.shared_products_pending (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  curator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_data jsonb NOT NULL,
  name_norm text NOT NULL,
  fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reject_reason text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  moderated_at timestamptz,
  moderated_by uuid REFERENCES auth.users(id)
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_shared_products_pending_curator
  ON public.shared_products_pending (curator_id, status);

CREATE INDEX IF NOT EXISTS idx_shared_products_pending_fingerprint
  ON public.shared_products_pending (fingerprint);

CREATE INDEX IF NOT EXISTS idx_shared_products_pending_created_at
  ON public.shared_products_pending (created_at DESC);

-- RLS
ALTER TABLE public.shared_products_pending ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pending_select_curator" ON public.shared_products_pending;
CREATE POLICY "pending_select_curator"
  ON public.shared_products_pending FOR SELECT TO authenticated
  USING (curator_id = auth.uid());

DROP POLICY IF EXISTS "pending_update_curator" ON public.shared_products_pending;
CREATE POLICY "pending_update_curator"
  ON public.shared_products_pending FOR UPDATE TO authenticated
  USING (curator_id = auth.uid())
  WITH CHECK (curator_id = auth.uid());

DROP POLICY IF EXISTS "pending_delete_curator" ON public.shared_products_pending;
CREATE POLICY "pending_delete_curator"
  ON public.shared_products_pending FOR DELETE TO authenticated
  USING (curator_id = auth.uid());

-- RPC для создания заявки
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
  -- Проверка: продукт уже есть в shared?
  SELECT id INTO v_existing_id
  FROM public.shared_products
  WHERE fingerprint = p_fingerprint;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'exists',
      'existing_id', v_existing_id,
      'message', 'Продукт уже существует в общей базе'
    );
  END IF;

  -- Получить куратора
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

-- Права
GRANT SELECT, UPDATE, DELETE ON TABLE public.shared_products_pending TO authenticated;
```

---

## ✅ Verification Queries

После выполнения проверьте:

```sql
-- Проверка таблиц
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'shared_products%';

-- Проверка VIEW
SELECT table_name FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name = 'shared_products_public';

-- Проверка функций
SELECT proname FROM pg_proc
WHERE proname IN ('create_pending_product', 'get_client_blocklist');

-- Проверка RLS политик
SELECT tablename, policyname FROM pg_policies
WHERE tablename LIKE 'shared_products%';
```

Expected output:

- 3 таблицы: `shared_products`, `shared_products_blocklist`,
  `shared_products_pending`
- 1 VIEW: `shared_products_public`
- 2 функции: `create_pending_product`, `get_client_blocklist`
- 6+ RLS политик

---

## 🧹 Cleanup (Optional)

Если нужно удалить всё и пересоздать:

```sql
-- ⚠️ ОСТОРОЖНО: удаляет все данные!

DROP VIEW IF EXISTS public.shared_products_public CASCADE;
DROP TABLE IF EXISTS public.shared_products_pending CASCADE;
DROP TABLE IF EXISTS public.shared_products_blocklist CASCADE;
DROP TABLE IF EXISTS public.shared_products CASCADE;
DROP FUNCTION IF EXISTS public.create_pending_product CASCADE;
DROP FUNCTION IF EXISTS public.get_client_blocklist CASCADE;
```
