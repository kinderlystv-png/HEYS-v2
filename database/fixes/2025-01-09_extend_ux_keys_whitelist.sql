-- ═══════════════════════════════════════════════════════════════════
-- 🔧 Fix: Расширить whitelist UX-ключей для новых клиентов
-- Дата: 2025-01-09
-- Проблема: Клиенты без подписки не могут сохранить:
--           - heys_widget_layout_v1 (виджеты)
--           - heys_widget_layout_meta_v1 (мета виджетов)
--           - heys_advice_settings (настройки советов)
--           - heys_insights_tour_completed (тур инсайтов)
--           - heys_tour_interrupted_step (прерванный шаг)
-- Решение: Добавить эти ключи в is_always_writable_key()
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- 🔧 1) Расширенный whitelist ключей без подписки
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_always_writable_key(p_key TEXT)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  -- Эти ключи критичны для UX и могут сохраняться без подписки
  SELECT p_key = ANY(ARRAY[
    -- Базовые (были раньше)
    'heys_profile',               -- Профиль пользователя
    'heys_norms',                 -- Нормы питания
    'heys_consents',              -- Согласия (юридически важно!)
    'heys_onboarding_complete',   -- Флаг завершения онбординга
    'heys_tour_completed',        -- Флаг завершения тура
    
    -- Виджеты (НОВОЕ!)
    'heys_widget_layout_v1',      -- Layout виджетов
    'heys_widget_layout_meta_v1', -- Мета виджетов (версия и т.д.)
    
    -- Настройки советов (НОВОЕ!)
    'heys_advice_settings',       -- Настройки показа советов
    
    -- Дополнительные туры (НОВОЕ!)
    'heys_insights_tour_completed', -- Тур вкладки Insights
    'heys_tour_interrupted_step'    -- Прерванный шаг тура (для продолжения)
  ])
  -- Также разрешаем все ключи дневника (heys_dayv2_*)
  OR p_key LIKE 'heys_dayv2_%';
$$;

COMMENT ON FUNCTION public.is_always_writable_key(text) IS 
  'Проверка: можно ли сохранять этот ключ без активной подписки. 
   Включает: profile, norms, consents, onboarding, tour, widgets, advice_settings, dayv2_*
   Версия: 2025-01-09';

-- ═══════════════════════════════════════════════════════════════════
-- 🔍 Проверка (выполнить вручную):
-- ═══════════════════════════════════════════════════════════════════
-- SELECT public.is_always_writable_key('heys_widget_layout_v1');    -- должно быть TRUE
-- SELECT public.is_always_writable_key('heys_dayv2_2025-01-09');    -- должно быть TRUE
-- SELECT public.is_always_writable_key('heys_random_key');          -- должно быть FALSE
