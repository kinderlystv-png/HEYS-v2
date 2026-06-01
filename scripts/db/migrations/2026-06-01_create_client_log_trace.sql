-- 2026-06-01: client_log_trace — клиентский console/телеметрический буфер
--
-- Context: на мобильных нет DevTools — когда визарды чекина или sync
-- падают тихо, диагностировать нечем. Этот стол складывает batches
-- console.* записей (info/warn/error) которые клиент шлёт через
-- navigator.sendBeacon (работает при закрытии вкладки/sleep телефона).
--
-- Rollback: inline ниже.
--
-- Retention: 14 дней (cleanup в heys-maintenance daily).

BEGIN;

-- ===== FORWARD =====

CREATE TABLE IF NOT EXISTS public.client_log_trace (
  id          bigserial PRIMARY KEY,
  client_id   uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  -- captured_at = когда строка попала на сервер (ingest time)
  captured_at timestamptz NOT NULL DEFAULT now(),
  -- client_ts = когда событие случилось в браузере (может опаздывать на flush window)
  client_ts   timestamptz NOT NULL,
  level       text NOT NULL CHECK (level IN ('log','info','warn','error','debug')),
  message     text NOT NULL,
  args        jsonb,
  session_id  text,
  user_agent  text,
  page_url    text
);

-- Основной запрос — выборка по client_id+времени
CREATE INDEX IF NOT EXISTS idx_client_log_trace_client_ts
  ON public.client_log_trace (client_id, client_ts DESC);

-- Для cleanup (DELETE WHERE captured_at < cutoff)
CREATE INDEX IF NOT EXISTS idx_client_log_trace_captured_at
  ON public.client_log_trace (captured_at);

-- Для grep по уровню при триаже инцидента
CREATE INDEX IF NOT EXISTS idx_client_log_trace_level_ts
  ON public.client_log_trace (level, client_ts DESC)
  WHERE level IN ('warn','error');

COMMENT ON TABLE  public.client_log_trace IS
  'Клиентский console/телеметрический буфер с мобильных. TTL 14 дней (heys-maintenance daily_cleanup).';
COMMENT ON COLUMN public.client_log_trace.captured_at IS 'Время приёма на сервере (ingest).';
COMMENT ON COLUMN public.client_log_trace.client_ts   IS 'Время события в браузере (может опаздывать на flush-window).';

COMMIT;

-- ===== ROLLBACK =====
-- BEGIN;
-- DROP TABLE IF EXISTS public.client_log_trace;
-- COMMIT;
