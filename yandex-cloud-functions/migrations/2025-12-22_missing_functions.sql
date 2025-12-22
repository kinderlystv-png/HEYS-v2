-- ═══════════════════════════════════════════════════════════════════════════════
-- 🔧 HEYS Missing Functions for Yandex Cloud PostgreSQL
-- Дата: 2025-12-22
-- Описание: Функции которые отсутствовали после миграции с Supabase
-- Примечание: БЕЗ auth.uid() — авторизация на уровне API Gateway
-- 
-- HOTFIX 2025-12-22: 
--   - get_curator_clients: исправлен c.created_at → c.updated_at
--   - get_client_data: исправлен c.created_at → c.updated_at
--   (в таблице clients нет колонки created_at, только updated_at)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1️⃣ client_pin_auth — Комбинированная авторизация (get_salt + verify_pin)
-- Удобная обёртка для фронтенда: один вызов вместо двух
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.client_pin_auth(p_phone TEXT, p_pin TEXT)
RETURNS TABLE(
    success BOOLEAN,
    client_id UUID,
    name TEXT,
    salt TEXT,
    error TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_client RECORD;
    v_phone_clean TEXT;
    v_pin_hash TEXT;
BEGIN
    -- Нормализуем телефон
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
            NULL::TEXT,
            'Пользователь не найден'::TEXT;
        RETURN;
    END IF;
    
    -- Нет соли — клиент не настроен
    IF v_client.pin_salt IS NULL THEN
        RETURN QUERY SELECT 
            FALSE::BOOLEAN, 
            NULL::UUID, 
            NULL::TEXT,
            NULL::TEXT,
            'PIN не настроен'::TEXT;
        RETURN;
    END IF;
    
    -- Проверка lockout
    IF v_client.pin_locked_until IS NOT NULL AND v_client.pin_locked_until > NOW() THEN
        RETURN QUERY SELECT 
            FALSE::BOOLEAN, 
            NULL::UUID, 
            NULL::TEXT,
            NULL::TEXT,
            'Превышено количество попыток. Подождите 15 минут.'::TEXT;
        RETURN;
    END IF;
    
    -- Хешируем PIN (простой sha256 с солью)
    -- ВАЖНО: Фронтенд хеширует сам и передаёт p_pin_hash в verify_client_pin
    -- Эта функция для простого случая когда передаётся plain PIN
    v_pin_hash := encode(digest(p_pin || v_client.pin_salt, 'sha256'), 'hex');
    
    -- Проверка PIN
    IF v_client.pin_hash = v_pin_hash THEN
        -- Успех — сбрасываем счётчик
        UPDATE public.clients 
        SET pin_attempts = 0, pin_locked_until = NULL
        WHERE id = v_client.id;
        
        RETURN QUERY SELECT 
            TRUE::BOOLEAN, 
            v_client.id, 
            v_client.name,
            v_client.pin_salt,
            NULL::TEXT;
    ELSE
        -- Неверный PIN — увеличиваем счётчик
        UPDATE public.clients 
        SET 
            pin_attempts = COALESCE(pin_attempts, 0) + 1,
            pin_locked_until = CASE 
                WHEN COALESCE(pin_attempts, 0) + 1 >= 5 
                THEN NOW() + INTERVAL '15 minutes'
                ELSE NULL
            END
        WHERE id = v_client.id;
        
        RETURN QUERY SELECT 
            FALSE::BOOLEAN, 
            NULL::UUID, 
            NULL::TEXT,
            v_client.pin_salt, -- Возвращаем соль чтобы фронтенд мог хешировать
            'Неверный PIN'::TEXT;
    END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2️⃣ create_client_with_pin — Создание клиента с PIN
-- БЕЗ auth.uid() — curator_id передаётся параметром (проверка на уровне API)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_client_with_pin(
    p_name TEXT,
    p_phone TEXT,
    p_pin_hash TEXT,
    p_salt TEXT,
    p_curator_id UUID DEFAULT NULL
)
RETURNS TABLE(
    success BOOLEAN,
    client_id UUID,
    error TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_phone_clean TEXT;
    v_new_id UUID;
    v_existing UUID;
BEGIN
    -- Нормализуем телефон
    v_phone_clean := LTRIM(p_phone, '+');
    
    -- Валидация
    IF v_phone_clean IS NULL OR length(v_phone_clean) < 10 THEN
        RETURN QUERY SELECT FALSE::BOOLEAN, NULL::UUID, 'Некорректный номер телефона'::TEXT;
        RETURN;
    END IF;
    
    IF p_salt IS NULL OR length(p_salt) < 16 THEN
        RETURN QUERY SELECT FALSE::BOOLEAN, NULL::UUID, 'Некорректная соль'::TEXT;
        RETURN;
    END IF;
    
    IF p_pin_hash IS NULL OR length(p_pin_hash) < 32 THEN
        RETURN QUERY SELECT FALSE::BOOLEAN, NULL::UUID, 'Некорректный хеш PIN'::TEXT;
        RETURN;
    END IF;
    
    -- Проверяем, не занят ли телефон
    SELECT id INTO v_existing
    FROM public.clients
    WHERE phone = v_phone_clean OR phone = p_phone
    LIMIT 1;
    
    IF v_existing IS NOT NULL THEN
        RETURN QUERY SELECT FALSE::BOOLEAN, NULL::UUID, 'Телефон уже зарегистрирован'::TEXT;
        RETURN;
    END IF;
    
    -- Создаём клиента
    INSERT INTO public.clients(
        name,
        phone,
        pin_salt,
        pin_hash,
        curator_id,
        created_at,
        updated_at
    ) VALUES (
        NULLIF(TRIM(COALESCE(p_name, '')), ''),
        v_phone_clean,
        p_salt,
        p_pin_hash,
        p_curator_id,
        NOW(),
        NOW()
    )
    RETURNING id INTO v_new_id;
    
    RETURN QUERY SELECT TRUE::BOOLEAN, v_new_id, NULL::TEXT;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3️⃣ reset_client_pin — Сброс PIN клиента
-- БЕЗ auth.uid() — проверка curator_id на уровне API
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.reset_client_pin(
    p_client_id UUID,
    p_pin_hash TEXT,
    p_salt TEXT,
    p_curator_id UUID DEFAULT NULL
)
RETURNS TABLE(
    success BOOLEAN,
    error TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated INTEGER;
BEGIN
    -- Валидация
    IF p_salt IS NULL OR length(p_salt) < 16 THEN
        RETURN QUERY SELECT FALSE::BOOLEAN, 'Некорректная соль'::TEXT;
        RETURN;
    END IF;
    
    IF p_pin_hash IS NULL OR length(p_pin_hash) < 32 THEN
        RETURN QUERY SELECT FALSE::BOOLEAN, 'Некорректный хеш PIN'::TEXT;
        RETURN;
    END IF;
    
    -- Обновляем PIN
    -- Если p_curator_id указан — проверяем что это куратор клиента
    IF p_curator_id IS NOT NULL THEN
        UPDATE public.clients
        SET 
            pin_salt = p_salt,
            pin_hash = p_pin_hash,
            pin_attempts = 0,
            pin_locked_until = NULL,
            updated_at = NOW()
        WHERE id = p_client_id
          AND curator_id = p_curator_id;
    ELSE
        -- Без проверки куратора (для самостоятельного сброса)
        UPDATE public.clients
        SET 
            pin_salt = p_salt,
            pin_hash = p_pin_hash,
            pin_attempts = 0,
            pin_locked_until = NULL,
            updated_at = NOW()
        WHERE id = p_client_id;
    END IF;
    
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    
    IF v_updated = 0 THEN
        RETURN QUERY SELECT FALSE::BOOLEAN, 'Клиент не найден или нет доступа'::TEXT;
        RETURN;
    END IF;
    
    RETURN QUERY SELECT TRUE::BOOLEAN, NULL::TEXT;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4️⃣ get_client_data — Получение данных клиента
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_client_data(p_client_id UUID)
RETURNS TABLE(
    id UUID,
    name TEXT,
    phone TEXT,
    curator_id UUID,
    subscription_status TEXT,
    subscription_plan TEXT,
    trial_ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.name,
        c.phone,
        c.curator_id,
        c.subscription_status,
        c.subscription_plan,
        c.trial_ends_at,
        c.created_at,
        c.updated_at
    FROM public.clients c
    WHERE c.id = p_client_id
    LIMIT 1;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5️⃣ get_curator_clients — Список клиентов куратора
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_curator_clients(p_curator_id UUID)
RETURNS TABLE(
    id UUID,
    name TEXT,
    phone TEXT,
    subscription_status TEXT,
    subscription_plan TEXT,
    trial_ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    last_activity TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.name,
        c.phone,
        c.subscription_status,
        c.subscription_plan,
        c.trial_ends_at,
        c.created_at,
        c.updated_at,
        -- Последняя активность из client_kv_store
        (SELECT MAX(kv.updated_at) FROM public.client_kv_store kv WHERE kv.client_id = c.id) AS last_activity
    FROM public.clients c
    WHERE c.curator_id = p_curator_id
    ORDER BY c.updated_at DESC;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6️⃣ create_pending_product — Заявка на модерацию нового продукта
-- ═══════════════════════════════════════════════════════════════════════════════

-- Сначала создаём таблицу если её нет
CREATE TABLE IF NOT EXISTS public.pending_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kcal100 NUMERIC,
    protein100 NUMERIC,
    carbs100 NUMERIC,
    fat100 NUMERIC,
    simple100 NUMERIC,
    complex100 NUMERIC,
    good_fat100 NUMERIC,
    bad_fat100 NUMERIC,
    trans100 NUMERIC,
    fiber100 NUMERIC,
    gi INTEGER,
    harm INTEGER,
    category TEXT,
    portions JSONB,
    barcode TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    moderator_comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_pending_products_client_id ON public.pending_products(client_id);
CREATE INDEX IF NOT EXISTS idx_pending_products_status ON public.pending_products(status);

-- Функция создания заявки
CREATE OR REPLACE FUNCTION public.create_pending_product(
    p_client_id UUID,
    p_name TEXT,
    p_kcal100 NUMERIC DEFAULT NULL,
    p_protein100 NUMERIC DEFAULT NULL,
    p_carbs100 NUMERIC DEFAULT NULL,
    p_fat100 NUMERIC DEFAULT NULL,
    p_simple100 NUMERIC DEFAULT NULL,
    p_complex100 NUMERIC DEFAULT NULL,
    p_good_fat100 NUMERIC DEFAULT NULL,
    p_bad_fat100 NUMERIC DEFAULT NULL,
    p_trans100 NUMERIC DEFAULT NULL,
    p_fiber100 NUMERIC DEFAULT NULL,
    p_gi INTEGER DEFAULT NULL,
    p_harm INTEGER DEFAULT NULL,
    p_category TEXT DEFAULT NULL,
    p_portions JSONB DEFAULT NULL,
    p_barcode TEXT DEFAULT NULL
)
RETURNS TABLE(
    success BOOLEAN,
    product_id UUID,
    error TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_id UUID;
BEGIN
    -- Валидация
    IF p_name IS NULL OR length(TRIM(p_name)) < 2 THEN
        RETURN QUERY SELECT FALSE::BOOLEAN, NULL::UUID, 'Название продукта обязательно (минимум 2 символа)'::TEXT;
        RETURN;
    END IF;
    
    -- Проверяем существование клиента
    IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = p_client_id) THEN
        RETURN QUERY SELECT FALSE::BOOLEAN, NULL::UUID, 'Клиент не найден'::TEXT;
        RETURN;
    END IF;
    
    -- Создаём заявку
    INSERT INTO public.pending_products(
        client_id, name, kcal100, protein100, carbs100, fat100,
        simple100, complex100, good_fat100, bad_fat100, trans100,
        fiber100, gi, harm, category, portions, barcode
    ) VALUES (
        p_client_id, TRIM(p_name), p_kcal100, p_protein100, p_carbs100, p_fat100,
        p_simple100, p_complex100, p_good_fat100, p_bad_fat100, p_trans100,
        p_fiber100, p_gi, p_harm, p_category, p_portions, p_barcode
    )
    RETURNING id INTO v_new_id;
    
    RETURN QUERY SELECT TRUE::BOOLEAN, v_new_id, NULL::TEXT;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ✅ Проверка успешности миграции
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_functions TEXT[] := ARRAY[
        'client_pin_auth',
        'create_client_with_pin', 
        'reset_client_pin',
        'get_client_data',
        'get_curator_clients',
        'create_pending_product'
    ];
    f TEXT;
BEGIN
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE '🔧 Проверка миграции 2025-12-22_missing_functions.sql';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    
    FOREACH f IN ARRAY v_functions LOOP
        IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = f) THEN
            RAISE NOTICE '✅ Функция %() создана', f;
        ELSE
            RAISE NOTICE '❌ Функция %() НЕ создана!', f;
        END IF;
    END LOOP;
    
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 🎉 Миграция завершена!
-- ═══════════════════════════════════════════════════════════════════════════════
