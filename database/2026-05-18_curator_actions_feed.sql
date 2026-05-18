-- =====================================================
-- HEYS: Curator-Actions Feed (push + in-app banner)
-- Версия: 1.0.0
-- Дата: 2026-05-18
-- Описание:
--   Расширяет инфраструктуру push'ей из 2026-05-14_push_notifications.sql,
--   чтобы клиент видел КОНКРЕТИКУ что куратор изменил, а не просто
--   "куратор обновил твой день".
--
--   Изменения:
--     1) client_data_changelog: добавляем колонку `actions JSONB`
--        со списком семантических действий (meal_added, weight_set,
--        training_added, profile_changed и т.д.) и `acked_at TIMESTAMPTZ`
--        для in-app banner read-tracking (отдельно от push notified_at).
--     2) clients: добавляем `curator_actions_last_seen_at TIMESTAMPTZ`
--        — server-side источник правды last-seen (cross-device).
--
--   Обратная совместимость: старые changelog rows получат actions='[]'.
--   `notified_at` (push) и `acked_at` (in-app) — независимые флаги.
-- =====================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1. client_data_changelog: новые колонки
--    `actions` — семантический payload (см. computeCuratorActionPayload
--    в yandex-cloud-functions/heys-api-rpc/curator-action-diff.js).
--    `acked_at` — клиент отметил эти изменения как прочитанные.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.client_data_changelog
  ADD COLUMN IF NOT EXISTS actions  JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS acked_at TIMESTAMPTZ;

COMMENT ON COLUMN public.client_data_changelog.actions IS
  'JSON-массив семантических действий куратора: [{type:"meal_added",name:"Овсянка"},...]. '
  'Заполняется в RPC handler через computeCuratorActionPayload(old_v,new_v,key).';

COMMENT ON COLUMN public.client_data_changelog.acked_at IS
  'Клиент подтвердил просмотр (через ack_curator_changelog RPC). '
  'Отделено от notified_at: push доставлен ≠ клиент посмотрел в приложении.';

-- ─────────────────────────────────────────────────────────────────
-- 2. Индекс для in-app banner: SELECT WHERE acked_at IS NULL ORDER BY created_at.
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_changelog_client_unacked
  ON public.client_data_changelog(client_id, created_at DESC)
  WHERE acked_at IS NULL;

-- ─────────────────────────────────────────────────────────────────
-- 3. clients.curator_actions_last_seen_at — last-seen timestamp.
--    Server-side источник правды (не LS).
--    Обновляется через ack_curator_changelog RPC.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS curator_actions_last_seen_at TIMESTAMPTZ;

COMMENT ON COLUMN public.clients.curator_actions_last_seen_at IS
  'Когда клиент в последний раз нажал "Понял" в curator-actions banner. '
  'Используется get_my_curator_changelog_since как дефолтный since-параметр.';

-- ─────────────────────────────────────────────────────────────────
-- 4. CREATE OR REPLACE batch_upsert_client_kv_by_curator
--    Убираем INSERT в client_data_changelog из PL/pgSQL функции —
--    теперь changelog (со семантическим payload `actions`) пишется
--    JS-обработчиком в yandex-cloud-functions/heys-api-rpc/index.js,
--    который умеет вычислять diff old vs new value.
--    Сам UPSERT и ownership check остаются здесь без изменений.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.batch_upsert_client_kv_by_curator(
  p_curator_id UUID,
  p_client_id UUID,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owns BOOLEAN;
  v_item JSONB;
  v_key TEXT;
  v_value JSONB;
  v_saved INT := 0;
BEGIN
  -- 1) Ownership check.
  SELECT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = p_client_id AND curator_id = p_curator_id
  ) INTO v_owns;

  IF NOT v_owns THEN
    RETURN jsonb_build_object(
      'success', false,
      'saved', 0,
      'error', 'curator_does_not_own_client'
    );
  END IF;

  -- 2) Upsert каждого item'а. Changelog пишется RPC-обработчиком после
  --    вызова функции (он знает OLD values и diff'ует с actions payload).
  FOR v_item IN SELECT jsonb_array_elements(p_items)
  LOOP
    v_key := v_item->>'k';
    v_value := v_item->'v';

    IF v_key IS NOT NULL THEN
      INSERT INTO client_kv_store (client_id, k, v, updated_at, user_id)
      VALUES (p_client_id, v_key, v_value, NOW(), p_curator_id)
      ON CONFLICT (client_id, k) DO UPDATE SET
        v = EXCLUDED.v,
        updated_at = NOW(),
        user_id = EXCLUDED.user_id;

      v_saved := v_saved + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'saved', v_saved
  );
END;
$$;

COMMENT ON FUNCTION public.batch_upsert_client_kv_by_curator IS
  'Batch upsert client_kv_store от куратора. Changelog логируется RPC-handler''ом '
  '(curator-action-diff.js) с семантическим payload, не здесь.';

COMMIT;
