-- ═══════════════════════════════════════════════════════════════════════════════
-- 🇷🇺 HEYS Yandex PostgreSQL Setup
-- Дата: 2025-12-21
-- Описание: Объединённая миграция для Yandex Cloud PostgreSQL
-- Примечание: БЕЗ Supabase-специфичных конструкций (auth.uid, TO anon, и т.д.)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- 📦 Расширения (включаются через консоль Yandex.Cloud!)
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ НЕ выполняй CREATE EXTENSION — это делается через консоль управления:
-- 1. Yandex.Cloud Console → Managed PostgreSQL → Кластер
-- 2. Базы данных → heys_production → Изменить
-- 3. Включить расширения: pgcrypto, pg_trgm
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- 🔄 Общая функция для updated_at триггеров
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 👤 Таблица clients (должна уже существовать, добавляем поля для PIN auth)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Добавляем поля для телефонной авторизации (если их нет)
DO $$ 
BEGIN
    -- phone
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'clients' AND column_name = 'phone') THEN
        ALTER TABLE public.clients ADD COLUMN phone TEXT;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_phone ON public.clients(phone) WHERE phone IS NOT NULL;
    END IF;
    
    -- pin_salt
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'clients' AND column_name = 'pin_salt') THEN
        ALTER TABLE public.clients ADD COLUMN pin_salt TEXT;
    END IF;
    
    -- pin_hash
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'clients' AND column_name = 'pin_hash') THEN
        ALTER TABLE public.clients ADD COLUMN pin_hash TEXT;
    END IF;
    
    -- pin_attempts (для lockout)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'clients' AND column_name = 'pin_attempts') THEN
        ALTER TABLE public.clients ADD COLUMN pin_attempts INTEGER DEFAULT 0;
    END IF;
    
    -- pin_locked_until (для lockout)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'clients' AND column_name = 'pin_locked_until') THEN
        ALTER TABLE public.clients ADD COLUMN pin_locked_until TIMESTAMPTZ;
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 🔐 RPC Функции для PIN авторизации
-- ═══════════════════════════════════════════════════════════════════════════════

-- Функция получения соли по телефону
CREATE OR REPLACE FUNCTION public.get_client_salt(p_phone TEXT)
RETURNS TABLE(salt TEXT, client_id UUID, locked_until TIMESTAMPTZ) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_phone_clean TEXT;
BEGIN
    -- Убираем + из начала телефона если есть
    v_phone_clean := LTRIM(p_phone, '+');
    
    RETURN QUERY
    SELECT 
        c.pin_salt,
        c.id,
        c.pin_locked_until
    FROM public.clients c
    WHERE c.phone = v_phone_clean OR c.phone = p_phone
    LIMIT 1;
END;
$$;

-- Функция верификации PIN (с lockout)
CREATE OR REPLACE FUNCTION public.verify_client_pin(p_phone TEXT, p_pin_hash TEXT)
RETURNS TABLE(
    success BOOLEAN, 
    client_id UUID, 
    name TEXT, 
    error TEXT,
    remaining_attempts INTEGER
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_client RECORD;
    v_max_attempts INTEGER := 5;
    v_lockout_minutes INTEGER := 15;
    v_phone_clean TEXT;
BEGIN
    -- Убираем + из начала телефона если есть
    v_phone_clean := LTRIM(p_phone, '+');
    
    -- Получаем клиента
    SELECT * INTO v_client
    FROM public.clients c
    WHERE c.phone = v_phone_clean OR c.phone = p_phone
    LIMIT 1;
    
    -- Клиент не найден
    IF v_client IS NULL THEN
        RETURN QUERY SELECT 
            FALSE::BOOLEAN, 
            NULL::UUID, 
            NULL::TEXT, 
            'Пользователь не найден'::TEXT,
            0::INTEGER;
        RETURN;
    END IF;
    
    -- Проверка lockout
    IF v_client.pin_locked_until IS NOT NULL AND v_client.pin_locked_until > NOW() THEN
        RETURN QUERY SELECT 
            FALSE::BOOLEAN, 
            NULL::UUID, 
            NULL::TEXT, 
            'Превышено количество попыток. Подождите 15 минут.'::TEXT,
            0::INTEGER;
        RETURN;
    END IF;
    
    -- Проверка PIN
    IF v_client.pin_hash = p_pin_hash THEN
        -- Успех — сбрасываем счётчик
        UPDATE public.clients 
        SET pin_attempts = 0, pin_locked_until = NULL
        WHERE id = v_client.id;
        
        RETURN QUERY SELECT 
            TRUE::BOOLEAN, 
            v_client.id, 
            v_client.name, 
            NULL::TEXT,
            v_max_attempts::INTEGER;
    ELSE
        -- Неверный PIN — увеличиваем счётчик
        UPDATE public.clients 
        SET 
            pin_attempts = COALESCE(pin_attempts, 0) + 1,
            pin_locked_until = CASE 
                WHEN COALESCE(pin_attempts, 0) + 1 >= v_max_attempts 
                THEN NOW() + (v_lockout_minutes || ' minutes')::INTERVAL
                ELSE NULL
            END
        WHERE id = v_client.id;
        
        RETURN QUERY SELECT 
            FALSE::BOOLEAN, 
            NULL::UUID, 
            NULL::TEXT, 
            'Неверный PIN'::TEXT,
            GREATEST(0, v_max_attempts - COALESCE(v_client.pin_attempts, 0) - 1)::INTEGER;
    END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 📦 Таблица shared_products
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.shared_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Авторство
  created_by_user_id UUID NULL,
  created_by_client_id UUID NULL,
  
  -- Базовые данные
  name TEXT NOT NULL,
  name_norm TEXT NOT NULL,
  fingerprint TEXT NOT NULL UNIQUE,
  
  -- Нутриенты (на 100г)
  simple100 NUMERIC NOT NULL DEFAULT 0,
  complex100 NUMERIC NOT NULL DEFAULT 0,
  protein100 NUMERIC NOT NULL DEFAULT 0,
  badFat100 NUMERIC NOT NULL DEFAULT 0,
  goodFat100 NUMERIC NOT NULL DEFAULT 0,
  trans100 NUMERIC NOT NULL DEFAULT 0,
  fiber100 NUMERIC NOT NULL DEFAULT 0,
  
  -- Метаданные
  gi NUMERIC,
  harm NUMERIC,
  category TEXT,
  portions JSONB,
  description TEXT,
  
  -- Метки времени
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_shared_products_name_trgm 
  ON public.shared_products USING GIN (name_norm gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_shared_products_created_by_user 
  ON public.shared_products (created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_shared_products_created_at 
  ON public.shared_products (created_at DESC);

-- Триггер updated_at
DROP TRIGGER IF EXISTS trigger_shared_products_updated_at ON public.shared_products;
CREATE TRIGGER trigger_shared_products_updated_at
  BEFORE UPDATE ON public.shared_products
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- RPC функция для получения продуктов
CREATE OR REPLACE FUNCTION public.get_shared_products(
  p_search TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT NULL,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  name TEXT,
  name_norm TEXT,
  simple100 NUMERIC,
  complex100 NUMERIC,
  protein100 NUMERIC,
  badFat100 NUMERIC,
  goodFat100 NUMERIC,
  trans100 NUMERIC,
  fiber100 NUMERIC,
  gi NUMERIC,
  harm NUMERIC,
  category TEXT,
  portions JSONB,
  description TEXT,
  fingerprint TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_search IS NOT NULL AND p_search != '' THEN
    RETURN QUERY
    SELECT 
      sp.id, sp.name, sp.name_norm,
      sp.simple100, sp.complex100, sp.protein100,
      sp.badFat100, sp.goodFat100, sp.trans100, sp.fiber100,
      sp.gi, sp.harm, sp.category, sp.portions, sp.description,
      sp.fingerprint, sp.created_at
    FROM public.shared_products sp
    WHERE sp.name_norm ILIKE '%' || lower(trim(p_search)) || '%'
    ORDER BY sp.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
  ELSE
    RETURN QUERY
    SELECT 
      sp.id, sp.name, sp.name_norm,
      sp.simple100, sp.complex100, sp.protein100,
      sp.badFat100, sp.goodFat100, sp.trans100, sp.fiber100,
      sp.gi, sp.harm, sp.category, sp.portions, sp.description,
      sp.fingerprint, sp.created_at
    FROM public.shared_products sp
    ORDER BY sp.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 📋 Таблица leads (для лендинга)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Контактные данные
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    messenger TEXT NOT NULL CHECK (messenger IN ('telegram', 'whatsapp', 'max')),
    
    -- Статус лида
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'trial_started', 'converted', 'lost')),
    
    -- UTM-метки
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_term TEXT,
    utm_content TEXT,
    
    -- A/B тесты
    ab_variant TEXT,
    
    -- Технические данные
    user_agent TEXT,
    ip_address TEXT,
    referrer TEXT,
    landing_page TEXT,
    
    -- Куратор и обработка
    curator_id UUID, -- без foreign key на auth.users
    contacted_at TIMESTAMPTZ,
    notes TEXT,
    
    -- Временные метки
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_leads_phone ON public.leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_utm_source ON public.leads(utm_source);
CREATE INDEX IF NOT EXISTS idx_leads_ab_variant ON public.leads(ab_variant);

-- Триггер updated_at
DROP TRIGGER IF EXISTS trigger_leads_updated_at ON public.leads;
CREATE TRIGGER trigger_leads_updated_at
    BEFORE UPDATE ON public.leads
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 📋 Таблица consents (согласия ПДн)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Таблица может уже существовать — добавляем недостающие колонки
DO $$ 
BEGIN
    -- Проверяем существует ли таблица
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'consents') THEN
        -- Создаём таблицу если её нет
        CREATE TABLE public.consents (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
            consent_type TEXT NOT NULL,
            document_version TEXT NOT NULL DEFAULT '1.0',
            signature_method TEXT NOT NULL,
            ip_address TEXT,
            user_agent TEXT,
            sms_code_hash TEXT,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            revoked_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    ELSE
        -- Добавляем недостающие колонки в существующую таблицу
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'consents' AND column_name = 'is_active') THEN
            ALTER TABLE public.consents ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'consents' AND column_name = 'revoked_at') THEN
            ALTER TABLE public.consents ADD COLUMN revoked_at TIMESTAMPTZ;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'consents' AND column_name = 'document_version') THEN
            ALTER TABLE public.consents ADD COLUMN document_version TEXT NOT NULL DEFAULT '1.0';
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'consents' AND column_name = 'signature_method') THEN
            ALTER TABLE public.consents ADD COLUMN signature_method TEXT;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'consents' AND column_name = 'sms_code_hash') THEN
            ALTER TABLE public.consents ADD COLUMN sms_code_hash TEXT;
        END IF;
    END IF;
END $$;

-- Индексы (создаём только если колонки существуют)
CREATE INDEX IF NOT EXISTS idx_consents_client_id ON public.consents(client_id);
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'consents' AND column_name = 'consent_type') THEN
        CREATE INDEX IF NOT EXISTS idx_consents_type ON public.consents(consent_type);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'consents' AND column_name = 'is_active') THEN
        CREATE INDEX IF NOT EXISTS idx_consents_active ON public.consents(is_active);
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 💳 Таблица subscriptions (подписки) — опционально
-- ═══════════════════════════════════════════════════════════════════════════════

-- Поля подписки добавляются в clients
DO $$ 
BEGIN
    -- subscription_status
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'clients' AND column_name = 'subscription_status') THEN
        ALTER TABLE public.clients ADD COLUMN subscription_status TEXT DEFAULT 'none' 
            CHECK (subscription_status IN ('none', 'trial', 'active', 'read_only', 'canceled'));
    END IF;
    
    -- subscription_plan
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'clients' AND column_name = 'subscription_plan') THEN
        ALTER TABLE public.clients ADD COLUMN subscription_plan TEXT 
            CHECK (subscription_plan IN ('base', 'pro', 'pro_plus'));
    END IF;
    
    -- trial_starts_at
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'clients' AND column_name = 'trial_starts_at') THEN
        ALTER TABLE public.clients ADD COLUMN trial_starts_at TIMESTAMPTZ;
    END IF;
    
    -- trial_ends_at
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'clients' AND column_name = 'trial_ends_at') THEN
        ALTER TABLE public.clients ADD COLUMN trial_ends_at TIMESTAMPTZ;
    END IF;
    
    -- subscription_starts_at
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'clients' AND column_name = 'subscription_starts_at') THEN
        ALTER TABLE public.clients ADD COLUMN subscription_starts_at TIMESTAMPTZ;
    END IF;
    
    -- subscription_ends_at
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'clients' AND column_name = 'subscription_ends_at') THEN
        ALTER TABLE public.clients ADD COLUMN subscription_ends_at TIMESTAMPTZ;
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ✅ Проверка успешности миграции
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_tables TEXT[] := ARRAY['clients', 'shared_products', 'leads', 'consents', 'client_kv_store'];
    v_functions TEXT[] := ARRAY['get_client_salt', 'verify_client_pin', 'get_shared_products'];
    t TEXT;
    f TEXT;
BEGIN
    -- Проверяем таблицы
    FOREACH t IN ARRAY v_tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN
            RAISE NOTICE '✅ Таблица % существует', t;
        ELSE
            RAISE NOTICE '❌ Таблица % НЕ найдена', t;
        END IF;
    END LOOP;
    
    -- Проверяем функции
    FOREACH f IN ARRAY v_functions LOOP
        IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = f) THEN
            RAISE NOTICE '✅ Функция %() существует', f;
        ELSE
            RAISE NOTICE '❌ Функция %() НЕ найдена', f;
        END IF;
    END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 🎉 Миграция завершена!
-- ═══════════════════════════════════════════════════════════════════════════════
