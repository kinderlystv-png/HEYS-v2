-- =====================================================
-- HEYS EWS Weekly Snapshots Cloud Sync
-- Версия: 1.0.0
-- Дата: 2026-02-16
-- Описание: Таблица для синхронизации weekly progress tracking
--           между устройствами (Wave 3.1 облачная синхронизация)
-- =====================================================

-- 1. Создание таблицы ews_weekly_snapshots
CREATE TABLE IF NOT EXISTS public.ews_weekly_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Связь с клиентом (один snapshot = одна неделя одного клиента)
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    
    -- Временной период (понедельник-воскресенье)
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    week_number INTEGER NOT NULL CHECK (week_number BETWEEN 1 AND 53),
    year INTEGER NOT NULL CHECK (year >= 2025 AND year <= 2050),
    
    -- Основные метрики EWS
    warnings_count INTEGER NOT NULL DEFAULT 0 CHECK (warnings_count >= 0),
    global_score INTEGER NOT NULL DEFAULT 0 CHECK (global_score BETWEEN 0 AND 100),
    
    -- Детализация по severity
    severity_breakdown JSONB NOT NULL DEFAULT '{"high": 0, "medium": 0, "low": 0}'::jsonb,
    
    -- Топ-3 warnings для контекста (optional)
    top_warnings JSONB,
    
    -- Временные метки
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- UNIQUE constraint: один клиент может иметь только один snapshot на неделю
    UNIQUE(client_id, week_start)
);

-- 2. Индексы для быстрого доступа
CREATE INDEX IF NOT EXISTS idx_ews_weekly_client_id ON public.ews_weekly_snapshots(client_id);
CREATE INDEX IF NOT EXISTS idx_ews_weekly_week_start ON public.ews_weekly_snapshots(week_start DESC);
CREATE INDEX IF NOT EXISTS idx_ews_weekly_composite ON public.ews_weekly_snapshots(client_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_ews_weekly_year_week ON public.ews_weekly_snapshots(year, week_number);

-- 3. Триггер для updated_at
CREATE OR REPLACE FUNCTION update_ews_weekly_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_ews_weekly_updated_at
    BEFORE UPDATE ON public.ews_weekly_snapshots
    FOR EACH ROW
    EXECUTE FUNCTION update_ews_weekly_updated_at();

-- 4. RLS Policies (Row-Level Security)
ALTER TABLE public.ews_weekly_snapshots ENABLE ROW LEVEL SECURITY;

-- Policy 1: Curator может читать snapshots своих клиентов
CREATE POLICY "Curators can read their clients weekly snapshots"
    ON public.ews_weekly_snapshots
    FOR SELECT
    USING (
        client_id IN (
            SELECT id FROM public.clients
            WHERE curator_id = auth.uid()
        )
    );

-- Policy 2: Curator может писать snapshots своих клиентов
CREATE POLICY "Curators can upsert their clients weekly snapshots"
    ON public.ews_weekly_snapshots
    FOR ALL
    USING (
        client_id IN (
            SELECT id FROM public.clients
            WHERE curator_id = auth.uid()
        )
    );

-- Policy 3: heys_rpc runtime user (для session-based auth через RPC)
CREATE POLICY "heys_rpc can access all snapshots"
    ON public.ews_weekly_snapshots
    FOR ALL
    USING (current_user = 'heys_rpc');

-- Policy 4: heys_rest runtime user (для REST API)
CREATE POLICY "heys_rest can access all snapshots"
    ON public.ews_weekly_snapshots
    FOR ALL
    USING (current_user = 'heys_rest');

-- 5. Grants для runtime users
GRANT ALL ON public.ews_weekly_snapshots TO heys_rpc;
GRANT ALL ON public.ews_weekly_snapshots TO heys_rest;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO heys_rpc, heys_rest;

-- 6. Комментарии для документации
COMMENT ON TABLE public.ews_weekly_snapshots IS 'Weekly EWS progress snapshots for cross-device sync (Wave 3.1)';
COMMENT ON COLUMN public.ews_weekly_snapshots.week_start IS 'Понедельник 00:00 (начало недели)';
COMMENT ON COLUMN public.ews_weekly_snapshots.week_end IS 'Воскресенье 23:59 (конец недели)';
COMMENT ON COLUMN public.ews_weekly_snapshots.warnings_count IS 'Количество warnings за неделю';
COMMENT ON COLUMN public.ews_weekly_snapshots.global_score IS 'EWS global score 0-100';
COMMENT ON COLUMN public.ews_weekly_snapshots.severity_breakdown IS 'JSON: {"high": N, "medium": N, "low": N}';
COMMENT ON COLUMN public.ews_weekly_snapshots.top_warnings IS 'JSON: [{"type": "...", "severity": "..."}, ...] (top 3)';

-- 7. Функция для очистки старых данных (retention policy: 26 недель = ~6 месяцев)
CREATE OR REPLACE FUNCTION cleanup_old_ews_weekly_snapshots()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.ews_weekly_snapshots
    WHERE week_start < CURRENT_DATE - INTERVAL '26 weeks';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Scheduled cleanup (опционально, если используется pg_cron)
-- SELECT cron.schedule('cleanup-old-ews-snapshots', '0 3 * * 0', 'SELECT cleanup_old_ews_weekly_snapshots()');

-- =====================================================
-- DEPLOYMENT NOTES:
-- 1. Применить через: node yandex-cloud-functions/heys-api-rpc/apply_migrations.js
-- 2. Проверить: SELECT * FROM ews_weekly_snapshots LIMIT 1;
-- 3. Тестовый запрос: SELECT client_id, COUNT(*) FROM ews_weekly_snapshots GROUP BY client_id;
-- =====================================================
