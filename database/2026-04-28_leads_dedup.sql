-- =====================================================
-- Migration: дедупликация активных лидов по телефону (P0.10)
-- Date: 2026-04-28
-- Purpose:
--   До этой миграции один и тот же телефон мог оставлять N заявок подряд →
--   N триалов на один номер. Partial UNIQUE индекс блокирует второй активный
--   лид с тем же телефоном (среди статусов 'new', 'contacted', 'trial_started').
--
--   Идемпотентность: если миграция уже применена и в таблице есть дубли —
--   сначала помечаем старые дубли как 'lost', потом строим индекс.
-- =====================================================

-- 1. Очищаем существующие дубли: оставляем самый свежий лид в каждой группе,
--    остальные помечаем как 'lost' (видны в истории, но не блокируют новые).
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY phone
           ORDER BY created_at DESC
         ) AS rn
  FROM public.leads
  WHERE status IN ('new', 'contacted', 'trial_started')
)
UPDATE public.leads
SET status = 'lost',
    notes = COALESCE(notes || E'\n', '')
            || 'Auto-marked lost by 2026-04-28_leads_dedup migration (phone duplicate)',
    updated_at = NOW()
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2. Partial UNIQUE-индекс на phone среди активных статусов
DROP INDEX IF EXISTS leads_active_phone_idx;
CREATE UNIQUE INDEX leads_active_phone_idx
  ON public.leads (phone)
  WHERE status IN ('new', 'contacted', 'trial_started');

COMMENT ON INDEX leads_active_phone_idx IS
  'Partial UNIQUE: один телефон может иметь только одну активную (новую/в обработке) заявку. После trial_started/converted/lost индекс не блокирует.';
