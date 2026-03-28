-- =====================================================
-- Leaderboard: Tables & Indexes
-- Версия: 1.0.0
-- Дата: 2026-03-28
-- Описание: Глобальный opt-in лидерборд.
--   Каждый пользователь включает/выключает участие
--   через настройки; данные — ежедневные snapshot-ы
--   баланса дня (CEB score) + cascade %.
-- =====================================================

-- 1. Таблица настроек (один ряд на клиента)
CREATE TABLE IF NOT EXISTS public.leaderboard_preferences (
    client_id   UUID PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
    sharing_enabled BOOLEAN NOT NULL DEFAULT false,
    display_name    TEXT    NOT NULL DEFAULT '',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Таблица ежедневных snapshot-ов
CREATE TABLE IF NOT EXISTS public.leaderboard_snapshots (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id      UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    snapshot_date  DATE NOT NULL,
    day_balance    NUMERIC(4,1) NOT NULL DEFAULT 0,
    cascade_pct    NUMERIC(5,2) NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_leaderboard_client_date UNIQUE (client_id, snapshot_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lb_snapshots_date
    ON public.leaderboard_snapshots (snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_lb_snapshots_client
    ON public.leaderboard_snapshots (client_id, snapshot_date DESC);

-- updated_at trigger (snapshots)
CREATE OR REPLACE FUNCTION public.update_leaderboard_snapshot_ts()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lb_snapshot_ts ON public.leaderboard_snapshots;
CREATE TRIGGER trg_lb_snapshot_ts
    BEFORE UPDATE ON public.leaderboard_snapshots
    FOR EACH ROW EXECUTE FUNCTION public.update_leaderboard_snapshot_ts();

-- updated_at trigger (preferences)
DROP TRIGGER IF EXISTS trg_lb_pref_ts ON public.leaderboard_preferences;
CREATE TRIGGER trg_lb_pref_ts
    BEFORE UPDATE ON public.leaderboard_preferences
    FOR EACH ROW EXECUTE FUNCTION public.update_leaderboard_snapshot_ts();

-- =====================================================
-- RLS (defence-in-depth: all access via SECURITY DEFINER RPCs)
-- Owner (heys_admin) bypasses RLS by default.
-- No auth schema / Supabase roles on Yandex Managed PostgreSQL.
-- =====================================================
ALTER TABLE public.leaderboard_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_snapshots   ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN RAISE NOTICE '✅ leaderboard tables, indexes, RLS created'; END $$;
