-- Fix: Allow 'heys_advice_settings' to be saved without subscription
-- Date: 2026-01-08
-- Description: The settings toggle for advice auto-show/sound must be writable by everyone

CREATE OR REPLACE FUNCTION public.is_always_writable_key(p_key TEXT)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  -- Эти ключи критичны для работы приложения и могут сохраняться без подписки
  SELECT 
    -- Точные совпадения
    p_key = ANY(ARRAY[
      'heys_profile',             -- Профиль пользователя (персональные данные)
      'heys_norms',               -- Нормы питания  
      'heys_consents',            -- Согласия (юридически важно!)
      'heys_onboarding_complete', -- Флаг завершения онбординга
      'heys_tour_completed',      -- Флаг завершения тура
      'heys_advice_settings'      -- Настройки советов (автопоказ/звук) - FIX 2026-01-08
    ])
    OR
    -- Паттерны (ключи с датой)
    p_key LIKE 'heys_dayv2_%';    -- Данные дня (heys_dayv2_2025-01-08)
$$;

COMMENT ON FUNCTION public.is_always_writable_key(text) IS 
  'Проверка: можно ли сохранять этот ключ без активной подписки (profile, consents, day data, settings)';

-- Verify
SELECT is_always_writable_key('heys_advice_settings') as advice_settings_ok; -- should be true
