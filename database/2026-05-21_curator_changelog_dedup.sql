-- ═══════════════════════════════════════════════════════════════════════════════
-- HEYS: Дедупликация client_data_changelog + cleanup old unacked duplicates
-- Дата: 2026-05-21
-- ═══════════════════════════════════════════════════════════════════════════════
-- Контекст: cloud function имеет ДВА пути INSERT в client_data_changelog
-- (merge_save_client_kv_by_curator и batch_upsert_client_kv_by_curator).
-- Когда курaтор-UI делает merge+batch close-succession — оба handler'а пишут
-- changelog с теми же actions → дубликаты. ack_curator_changelog покрывает
-- по timestamp <= untilTs; дубликат созданный микросекундой позже остаётся
-- unacked → banner "всплывает" при следующем login.
--
-- Решение: BEFORE INSERT триггер блокирует запись если за последние 10
-- секунд уже есть строка с тем же client_id+curator_id+actions.
-- Plus cleanup: bulk-ack для всех существующих дубликатов прошлых
-- (auto-ack тех, у которых есть более старый брат с acked_at).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) Trigger function: skip INSERT если дубликат за последние 10 сек.
CREATE OR REPLACE FUNCTION public.client_data_changelog_dedup_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Если за последние 10 секунд уже есть запись с тем же client_id+
  -- curator_id+actions JSONB — пропускаем INSERT (return NULL отменяет вставку).
  -- 10 сек — потолок time-window для concurrent merge+batch одной пользовательской
  -- курaтор-операции. Если курaтор делает то же самое через 11 сек намеренно —
  -- запись пройдёт.
  IF EXISTS (
    SELECT 1 FROM client_data_changelog
     WHERE client_id   = NEW.client_id
       AND curator_id  = NEW.curator_id
       AND actions     = NEW.actions
       AND created_at  > NOW() - INTERVAL '10 seconds'
  ) THEN
    -- Тихий skip — не RAISE, чтобы upsert handler не пишет error в свой log
    -- ("[batch_upsert] changelog insert failed" — это не критично, и triггер не error).
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_changelog_dedup ON public.client_data_changelog;
CREATE TRIGGER trg_changelog_dedup
  BEFORE INSERT ON public.client_data_changelog
  FOR EACH ROW EXECUTE FUNCTION public.client_data_changelog_dedup_guard();

-- 2) Bulk cleanup: auto-ack существующие дубликаты прошлых.
-- Если для записи U (acked_at IS NULL) существует более ранняя запись E с
-- теми же client_id+curator_id+actions И E.acked_at IS NOT NULL — копируем
-- E.acked_at в U.acked_at (это "брат-близнец", уже подтверждённый).
-- Без обновлений acked_at, иначе RLS/триггеры на UPDATE могут сработать.
DO $$
DECLARE
  v_updated INT;
BEGIN
  UPDATE client_data_changelog u
     SET acked_at = e.acked_at
    FROM client_data_changelog e
   WHERE u.acked_at IS NULL
     AND e.acked_at IS NOT NULL
     AND e.client_id  = u.client_id
     AND e.curator_id IS NOT DISTINCT FROM u.curator_id
     AND e.actions    = u.actions
     AND e.created_at < u.created_at
     AND e.created_at > u.created_at - INTERVAL '10 seconds';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE '✅ Auto-acked % дубликатов прошлых записей', v_updated;
END $$;

COMMIT;

-- Проверка
SELECT 'unacked_after_cleanup' AS what, count(*)::int AS v
  FROM client_data_changelog WHERE acked_at IS NULL;
