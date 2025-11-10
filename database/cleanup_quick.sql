-- БЫСТРОЕ УДАЛЕНИЕ ЛЕГАСИ ТАБЛИЦ
-- Скопируйте и вставьте в Supabase SQL Editor

-- Удаление таблиц
DROP TABLE IF EXISTS public.heys_day_stats CASCADE;
DROP TABLE IF EXISTS public.heys_ration CASCADE;
DROP TABLE IF EXISTS public.heys_user_params CASCADE;

-- Проверка результата
SELECT '✅ Cleanup completed!' AS status,
       COUNT(*) AS remaining_legacy_tables
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('heys_day_stats', 'heys_ration', 'heys_user_params');
