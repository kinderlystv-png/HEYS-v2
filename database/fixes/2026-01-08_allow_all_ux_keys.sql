-- Fix: Allow synchronization of additional UX state keys
-- Date: 2026-01-08
-- Version: 1.2.0
-- Description: Allow syncing tour progress, widgets, and gamification counters without subscription

CREATE OR REPLACE FUNCTION public.is_always_writable_key(p_key TEXT)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  -- Эти ключи критичны для работы приложения и могут сохраняться без подписки
  SELECT 
    -- Точные совпадения
    p_key = ANY(ARRAY[
      'heys_profile',                 -- Профиль пользователя
      'heys_norms',                   -- Нормы питания
      'heys_consents',                -- Согласия
      'heys_onboarding_complete',     -- Завершение онбординга
      'heys_tour_completed',          -- Завершение основного тура
      'heys_advice_settings',         -- Настройки советов
      'heys_insights_tour_completed', -- Тур по вкладке аналитики
      'heys_tour_interrupted_step',   -- Место остановки в туре
      'heys_weekly_wrap_view_count',  -- Счетчик просмотров итогов недели
      
      -- Виджеты
      'heys_widget_layout_v1',        -- Расположение виджетов
      'heys_widget_layout_meta_v1'    -- Мета-данные виджетов
    ])
    OR
    p_key LIKE 'heys_dayv2_%';        -- Данные дня
$$;

COMMENT ON FUNCTION public.is_always_writable_key(text) IS 
  'v1.2.0: Whitelist ключей для сохранения без подписки (profile, consents, tours, widgets, settings)';
