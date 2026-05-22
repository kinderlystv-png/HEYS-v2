-- ═══════════════════════════════════════════════════════════════════════════════
-- HEYS: DSAR SLA-tracker (P1-L, 2026-05-22)
-- ═══════════════════════════════════════════════════════════════════════════════
-- 152-ФЗ ст.21 ч.4 — оператор обязан рассмотреть запрос субъекта ПДн в течение
-- 10 рабочих дней с момента получения. Без tracker'а можно пропустить срок:
-- клиент написал в Telegram-саппорт «удалите мои данные», админ забыл, прошло
-- 11 рабочих дней → жалоба в РКН → штраф ст.13.11 КоАП РФ (до 80 000 ₽ для ИП).
--
-- Структура:
--   - таблица data_subject_requests (источник истины)
--   - функция add_working_days() для расчёта sla_deadline
--   - RPC record_offline_dsar() — для админа, чтобы фиксировать offline-запросы
--     (Telegram-саппорт, email, телефон, бумажные письма)
--   - RPC complete_dsar() — пометить запрос как обработанный
--
-- Cron-алерты добавляются отдельно в heys-cron-security-alerts.
-- Идемпотентна. Безопасно выполнять повторно.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Working-day calculator ─────────────────────────────────────────────────
-- 10 рабочих дней = 10 будних дней (пн-пт), выходные (сб-вс) пропускаются.
-- НЕ учитывает праздники РФ — для compliance это допустимый upper bound
-- (мы рассмотрим РАНЬШЕ дедлайна, не позже).
CREATE OR REPLACE FUNCTION public.add_working_days(start_ts TIMESTAMPTZ, days INT)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  result TIMESTAMPTZ := start_ts;
  added INT := 0;
BEGIN
  IF days <= 0 THEN
    RETURN start_ts;
  END IF;
  WHILE added < days LOOP
    result := result + INTERVAL '1 day';
    -- ISODOW: 1=Mon, 2=Tue, ..., 6=Sat, 7=Sun → выходные пропускаем
    IF EXTRACT(ISODOW FROM result) < 6 THEN
      added := added + 1;
    END IF;
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.add_working_days IS
  'Прибавляет N рабочих дней (пн-пт) к timestamp. Используется для DSAR SLA.';

-- ── 2. Таблица data_subject_requests ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.data_subject_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID,  -- НЕ FK: записи переживают delete клиента (compliance)
  request_type    TEXT NOT NULL CHECK (request_type IN (
                    'export',     -- ст.14 152-ФЗ — выдать копию данных
                    'delete',     -- ст.21 152-ФЗ — удалить аккаунт
                    'rectify',    -- ст.14 152-ФЗ — исправить неточность
                    'restrict',   -- ограничить обработку (ст.21.6)
                    'access'      -- запрос на доступ (ст.14)
                  )),
  source          TEXT NOT NULL CHECK (source IN (
                    'api',        -- автоматический (через export_my_data_by_session)
                    'telegram',   -- клиент написал в Telegram-саппорт
                    'email',
                    'phone',
                    'mail',       -- бумажное письмо
                    'other'
                  )),
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at    TIMESTAMPTZ,
  sla_deadline    TIMESTAMPTZ NOT NULL,
  curator_id      UUID,           -- кто обработал (NULL для API auto)
  notes           TEXT,            -- что именно запросили (для offline)
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dsr_sla_pending
  ON public.data_subject_requests(sla_deadline)
  WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_dsr_client
  ON public.data_subject_requests(client_id, created_at DESC);

COMMENT ON TABLE public.data_subject_requests IS
  'Журнал запросов субъектов ПДн (152-ФЗ ст.14/21). SLA: 10 рабочих дней.';

-- ── 3. RPC: record_offline_dsar (admin-only) ───────────────────────────────────
-- Когда клиент пишет «удалите/верните мои данные» через Telegram/email/телефон —
-- админ фиксирует это здесь, чтобы SLA-tracker начал отсчитывать дедлайн.
CREATE OR REPLACE FUNCTION public.record_offline_dsar(
  p_curator_id   UUID,
  p_client_id    UUID,
  p_request_type TEXT,
  p_source       TEXT,
  p_notes        TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_requested TIMESTAMPTZ := now();
  v_deadline  TIMESTAMPTZ := public.add_working_days(now(), 10);
BEGIN
  -- ownership: curator может фиксировать DSAR только для своих клиентов.
  -- Если client_id не указан — это «безымянный» запрос (например письмо без
  -- идентификации); разрешаем но без client_id.
  IF p_client_id IS NOT NULL THEN
    PERFORM 1 FROM clients
     WHERE id = p_client_id AND user_id = p_curator_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'curator does not own this client' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO data_subject_requests
    (client_id, request_type, source, requested_at, sla_deadline, curator_id, notes)
  VALUES
    (p_client_id, p_request_type, p_source, v_requested, v_deadline, p_curator_id, p_notes)
  RETURNING id INTO v_id;

  -- Параллельно пишем в audit log
  PERFORM public.log_data_access(
    'curator', p_curator_id, p_client_id,
    'record_offline_dsar_' || p_request_type, NULL, false, NULL, NULL,
    jsonb_build_object('source', p_source, 'request_id', v_id)
  );

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.record_offline_dsar IS
  'Куратор фиксирует offline DSAR-запрос клиента (Telegram/email/phone/mail). '
  'SLA-deadline auto: 10 рабочих дней. Для API auto-DSAR используется log_api_dsar.';

GRANT EXECUTE ON FUNCTION public.record_offline_dsar(UUID, UUID, TEXT, TEXT, TEXT) TO heys_rpc;

-- ── 4. RPC: log_api_dsar (системный auto-call для API endpoints) ──────────────
-- Вызывается из cloud function ПОСЛЕ успешного export_my_data_by_session /
-- delete_my_account / etc. processed_at = requested_at (мгновенное исполнение).
CREATE OR REPLACE FUNCTION public.log_api_dsar(
  p_client_id    UUID,
  p_request_type TEXT,
  p_metadata     JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO data_subject_requests
    (client_id, request_type, source, requested_at, processed_at, sla_deadline, metadata)
  VALUES
    (p_client_id, p_request_type, 'api', now(), now(),
     public.add_working_days(now(), 10), p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.log_api_dsar IS
  'Системный логгер: фиксирует API-инициированный DSAR (export_my_data, '
  'delete_my_account). Сразу processed_at=requested_at (мгновенный fulfilment).';

GRANT EXECUTE ON FUNCTION public.log_api_dsar(UUID, TEXT, JSONB) TO heys_rpc;

-- ── 5. RPC: complete_dsar (mark as processed) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.complete_dsar(
  p_curator_id UUID,
  p_request_id UUID,
  p_notes      TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
BEGIN
  -- Проверяем ownership: curator может закрывать DSAR только своих клиентов
  -- или те, что он сам зарегистрировал (curator_id = p_curator_id)
  SELECT client_id INTO v_client_id
    FROM data_subject_requests
   WHERE id = p_request_id
     AND (
       curator_id = p_curator_id
       OR client_id IN (SELECT id FROM clients WHERE user_id = p_curator_id)
     )
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE data_subject_requests
     SET processed_at = now(),
         curator_id = COALESCE(curator_id, p_curator_id),
         notes = COALESCE(notes || E'\n---\n' || p_notes, p_notes, notes)
   WHERE id = p_request_id;

  PERFORM public.log_data_access(
    'curator', p_curator_id, v_client_id, 'complete_dsar',
    NULL, false, NULL, NULL,
    jsonb_build_object('request_id', p_request_id)
  );

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.complete_dsar IS
  'Куратор помечает DSAR-запрос как обработанный. Останавливает SLA-таймер.';

GRANT EXECUTE ON FUNCTION public.complete_dsar(UUID, UUID, TEXT) TO heys_rpc;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Verification
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1) Таблица + функции созданы
SELECT 'data_subject_requests' AS object,
       (SELECT COUNT(*) FROM information_schema.tables
         WHERE table_name = 'data_subject_requests' AND table_schema = 'public') AS exists;

SELECT proname, pg_get_function_arguments(oid) AS args
  FROM pg_proc
 WHERE proname IN ('add_working_days', 'record_offline_dsar', 'log_api_dsar', 'complete_dsar')
   AND pronamespace = 'public'::regnamespace
 ORDER BY proname;

-- 2) Smoke: 10 рабочих дней от 2026-05-22 (пт) — должно быть 2026-06-05 (пт)
--    Считаем: 22-пт(старт), 25-пн(+1), 26-вт(+2), 27-ср(+3), 28-чт(+4), 29-пт(+5),
--             1-пн(+6), 2-вт(+7), 3-ср(+8), 4-чт(+9), 5-пт(+10)
SELECT public.add_working_days('2026-05-22 12:00:00+03'::TIMESTAMPTZ, 10)
       AS expect_2026_06_05;
