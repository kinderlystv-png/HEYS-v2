-- ═══════════════════════════════════════════════════════════════════
-- 🔧 Fix: Разрешить сохранение heys_dayv2_* ключей без подписки
-- Дата: 2025-01-08
-- Проблема: При регистрации сохраняется heys_dayv2_{date} с weightMorning,
--           но этот ключ блокируется subscription_required
-- Решение: Добавить паттерн heys_dayv2_% в is_always_writable_key()
-- ═══════════════════════════════════════════════════════════════════

-- 🔄 Обновляем функцию с поддержкой паттернов LIKE
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
      'heys_tour_completed'       -- Флаг завершения тура
    ])
    OR
    -- Паттерны (ключи с датой)
    p_key LIKE 'heys_dayv2_%';    -- Данные дня (heys_dayv2_2025-01-08)
$$;

COMMENT ON FUNCTION public.is_always_writable_key(text) IS 
  'Проверка: можно ли сохранять этот ключ без активной подписки (profile, consents, day data)';

-- ═══════════════════════════════════════════════════════════════════
-- 🧪 Тестируем обновлённую функцию
-- ═══════════════════════════════════════════════════════════════════

-- Должно вернуть true:
SELECT is_always_writable_key('heys_profile') AS profile_ok;        -- true
SELECT is_always_writable_key('heys_norms') AS norms_ok;           -- true
SELECT is_always_writable_key('heys_dayv2_2025-01-08') AS day_ok;  -- true 🆕
SELECT is_always_writable_key('heys_dayv2_2024-12-31') AS day2_ok; -- true 🆕
SELECT is_always_writable_key('heys_tour_completed') AS tour_ok;   -- true

-- Должно вернуть false (эти ключи требуют подписку):
SELECT is_always_writable_key('heys_products') AS products_blocked;  -- false
SELECT is_always_writable_key('heys_favorites') AS favorites_blocked;-- false
