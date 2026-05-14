-- =====================================================
-- HEYS: Push-уведомления (web push)
-- Версия: 1.0.0
-- Дата: 2026-05-14
-- Описание:
--   5 сценариев пушей:
--     1) Куратор обновил день клиента → клиенту (батч 1 мин)
--     2) 4ч без записи еды → клиенту (днём, вне quiet hours)
--     3) Клиент не логирует 2+ дня → куратору
--     4) Вечерний итог дня → клиенту (в 21:00 по умолчанию)
--     5) Стрик 7 дней → клиенту (похвала)
--
--   Таблицы:
--     - push_subscriptions (web push подписки клиентов)
--     - curator_push_subscriptions (подписки кураторов)
--     - client_data_changelog (event-log для батчинга курятор-апдейтов)
--     - push_idempotency (защита от дубликатов раз-в-день/раз-в-час)
--
--   Также модифицирует batch_upsert_client_kv_by_curator: добавляет
--   INSERT в client_data_changelog, чтобы cron-функция знала кому
--   и за какие ключи отправлять пуш.
-- =====================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1. push_subscriptions — web push подписки клиентов
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(client_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subs_client
  ON public.push_subscriptions(client_id);

COMMENT ON TABLE public.push_subscriptions IS
  'Web push подписки клиентов. endpoint+p256dh+auth — то что выдаёт '
  'pushManager.subscribe() в браузере. На отправку: web-push library.';

-- ─────────────────────────────────────────────────────────────────
-- 2. curator_push_subscriptions — подписки кураторов
--    Курятор — это auth.users, не clients.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.curator_push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curator_id   UUID NOT NULL,
  endpoint     TEXT NOT NULL,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(curator_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_curator_push_subs
  ON public.curator_push_subscriptions(curator_id);

COMMENT ON TABLE public.curator_push_subscriptions IS
  'Web push подписки кураторов (для алертов о пропавших клиентах). '
  'curator_id — auth.users.id из JWT.';

-- ─────────────────────────────────────────────────────────────────
-- 3. client_data_changelog — event-log для батчинга курятор-апдейтов
--    Каждый раз когда куратор пишет в client_kv_store через RPC,
--    сюда добавляется строка. Cron-функция раз в 15 мин собирает
--    pending события старше 1 минуты, шлёт пуш, помечает notified_at.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_data_changelog (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  curator_id    UUID NOT NULL,
  keys_updated  TEXT[] NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified_at   TIMESTAMPTZ   -- NULL = pending, NOT NULL = пуш отправлен
);

CREATE INDEX IF NOT EXISTS idx_changelog_pending
  ON public.client_data_changelog(client_id, created_at)
  WHERE notified_at IS NULL;

COMMENT ON TABLE public.client_data_changelog IS
  'Лог изменений данных клиента куратором. Используется cron-функцией '
  'heys-cron-reminders для батчинга пушей (1 минута тишины перед '
  'отправкой).';

-- ─────────────────────────────────────────────────────────────────
-- 4. push_idempotency — защита от дубликатов
--    Ключи вида:
--      evening_summary:2026-05-14:<client_id>
--      meal_reminder:2026-05-14:13:<client_id>     (hour-bucket)
--      streak_7d:2026-05-14:<client_id>
--      inactive_client:2026-05-14:<curator>:<client>
--    Cron перед отправкой делает INSERT ... ON CONFLICT DO NOTHING:
--    если строка уже была — пуш не отправляется.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_idempotency (
  key       TEXT PRIMARY KEY,
  sent_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_idempotency_sent_at
  ON public.push_idempotency(sent_at);

COMMENT ON TABLE public.push_idempotency IS
  'Защита от дубликатов пушей. INSERT ... ON CONFLICT DO NOTHING.';

-- ─────────────────────────────────────────────────────────────────
-- 5. Модифицируем batch_upsert_client_kv_by_curator
--    Добавляем INSERT в client_data_changelog, чтобы cron знал.
--    Не логируем служебные ключи (heys_push_prefs и т.п.).
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
  v_keys_for_log TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- 1) Проверка ownership.
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

  -- 2) Upsert.
  FOR v_item IN SELECT jsonb_array_elements(p_items)
  LOOP
    v_key := v_item->>'k';
    v_value := v_item->'v';

    IF v_key IS NOT NULL THEN
      INSERT INTO client_kv_store (client_id, k, v, updated_at)
      VALUES (p_client_id, v_key, v_value, NOW())
      ON CONFLICT (client_id, k) DO UPDATE SET
        v = EXCLUDED.v,
        updated_at = NOW();

      v_saved := v_saved + 1;

      -- 3) Собираем "значимые" ключи для changelog.
      --    Не логируем служебные (push prefs, локальные настройки UI).
      IF v_key NOT LIKE 'heys_push_%'
         AND v_key NOT LIKE 'heys_ui_%'
         AND v_key NOT LIKE 'heys_log_%' THEN
        v_keys_for_log := array_append(v_keys_for_log, v_key);
      END IF;
    END IF;
  END LOOP;

  -- 4) Пишем changelog если были значимые ключи.
  --    Не блокируем основной upsert если changelog не записался.
  IF array_length(v_keys_for_log, 1) > 0 THEN
    BEGIN
      INSERT INTO client_data_changelog (client_id, curator_id, keys_updated)
      VALUES (p_client_id, p_curator_id, v_keys_for_log);
    EXCEPTION WHEN OTHERS THEN
      -- Не падаем если changelog по какой-то причине недоступен.
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'saved', v_saved
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'saved', v_saved,
      'error', SQLERRM
    );
END;
$$;

REVOKE ALL ON FUNCTION public.batch_upsert_client_kv_by_curator(UUID, UUID, JSONB) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_rpc') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.batch_upsert_client_kv_by_curator(UUID, UUID, JSONB) TO heys_rpc';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 6. GRANTы для heys_admin (cron и api функции бегут под ним).
-- ─────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO heys_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.curator_push_subscriptions TO heys_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_data_changelog TO heys_admin;
GRANT SELECT, INSERT, DELETE ON public.push_idempotency TO heys_admin;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_rpc') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO heys_rpc';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.curator_push_subscriptions TO heys_rpc';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_data_changelog TO heys_rpc';
    EXECUTE 'GRANT SELECT, INSERT, DELETE ON public.push_idempotency TO heys_rpc';
  END IF;
END $$;

COMMIT;
