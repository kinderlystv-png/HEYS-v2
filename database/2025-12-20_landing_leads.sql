-- =====================================================
-- HEYS Landing Leads Table
-- Версия: 1.0.0
-- Дата: 2025-12-20
-- Описание: Таблица для хранения лидов с лендинга
-- =====================================================

-- 1. Создание таблицы leads
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Контактные данные
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    messenger TEXT NOT NULL CHECK (messenger IN ('telegram', 'whatsapp', 'max')),
    
    -- Статус лида
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'trial_started', 'converted', 'lost')),
    
    -- UTM-метки для аналитики
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_term TEXT,
    utm_content TEXT,
    
    -- A/B тесты
    ab_variant TEXT, -- например: 'cta_v1', 'cta_v2', 'hero_orange'
    
    -- Технические данные
    user_agent TEXT,
    ip_address TEXT,
    referrer TEXT,
    landing_page TEXT,
    
    -- Куратор и обработка
    curator_id UUID REFERENCES auth.users(id),
    contacted_at TIMESTAMPTZ,
    notes TEXT,
    
    -- Временные метки
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_leads_phone ON public.leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_utm_source ON public.leads(utm_source);
CREATE INDEX IF NOT EXISTS idx_leads_ab_variant ON public.leads(ab_variant);

-- 3. Триггер для updated_at
CREATE OR REPLACE FUNCTION update_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_leads_updated_at ON public.leads;
CREATE TRIGGER trigger_leads_updated_at
    BEFORE UPDATE ON public.leads
    FOR EACH ROW
    EXECUTE FUNCTION update_leads_updated_at();

-- 4. RLS политики
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Анонимные пользователи могут создавать лиды (форма на лендинге)
CREATE POLICY "Anyone can create leads" ON public.leads
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- Только авторизованные (кураторы) могут читать и обновлять
CREATE POLICY "Curators can view all leads" ON public.leads
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Curators can update leads" ON public.leads
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 5. Комментарии
COMMENT ON TABLE public.leads IS 'Лиды с лендинга HEYS';
COMMENT ON COLUMN public.leads.messenger IS 'Предпочитаемый мессенджер: telegram, whatsapp, max';
COMMENT ON COLUMN public.leads.status IS 'Статус лида: new, contacted, trial_started, converted, lost';
COMMENT ON COLUMN public.leads.ab_variant IS 'Вариант A/B теста для аналитики';

-- 6. Представление для аналитики
CREATE OR REPLACE VIEW public.leads_analytics AS
SELECT 
    DATE(created_at) as date,
    utm_source,
    utm_medium,
    utm_campaign,
    ab_variant,
    messenger,
    status,
    COUNT(*) as count
FROM public.leads
GROUP BY 
    DATE(created_at),
    utm_source,
    utm_medium,
    utm_campaign,
    ab_variant,
    messenger,
    status
ORDER BY date DESC;

-- Грант на представление
GRANT SELECT ON public.leads_analytics TO authenticated;

-- =====================================================
-- Готово! Выполните этот SQL в Supabase SQL Editor
-- =====================================================
