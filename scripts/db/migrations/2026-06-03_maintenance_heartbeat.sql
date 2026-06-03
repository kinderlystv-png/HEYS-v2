-- 2026-06-03: maintenance_heartbeat — dead-man's switch для heys-maintenance
--
-- Context: весь мониторинг (synthetic defense, KV health, daily/weekly report)
-- держится на том, что cron-функция heys-maintenance ВООБЩЕ запускается. Если
-- умрёт timer-триггер, упадёт initSecrets (ротация Lockbox) или исчерпается
-- DB-pool — наступает тишина, и её никто не замечает днями. Ложное «всё ок»
-- опаснее ложного алерта.
--
-- Механизм: каждый таск штампует last_ok_at при УСПЕХЕ. Высокочастотный
-- trial_queue (раз в 5 мин) играет роль сторожа — проверяет staleness
-- остальных тасков (last_ok_at < now() - max_silence) и шлёт один алерт
-- (dedup через stale_alerted_at). При восстановлении таска stale_alerted_at
-- сбрасывается в NULL.
--
-- Rollback: inline ниже.

BEGIN;

-- ===== FORWARD =====

CREATE TABLE IF NOT EXISTS public.maintenance_heartbeat (
  task             text PRIMARY KEY,
  -- последний УСПЕШНЫЙ прогон таска
  last_ok_at       timestamptz NOT NULL DEFAULT now(),
  -- когда сторож последний раз отправил stale-алерт по этому таску (dedup)
  stale_alerted_at timestamptz,
  -- порог тишины: если last_ok_at старше этого интервала → таск считается
  -- мёртвым. Data-driven, чтобы добавлять таски без правки кода сторожа.
  max_silence      interval NOT NULL
);

COMMENT ON TABLE public.maintenance_heartbeat IS
  'Dead-man''s switch для heys-maintenance. trial_queue-сторож алертит при last_ok_at < now()-max_silence.';

-- Seed известных тасков. last_ok_at = now() при создании → grace-период от
-- деплоя (не алертит сразу). ON CONFLICT DO NOTHING — идемпотентно при повторном
-- применении миграции.
INSERT INTO public.maintenance_heartbeat (task, max_silence) VALUES
  ('trial_queue',   interval '30 minutes'),  -- сам сторож; для внешнего мониторинга
  ('daily_cleanup', interval '25 hours'),
  ('kv_health',     interval '25 hours'),
  ('daily_report',  interval '25 hours'),
  ('weekly_report', interval '8 days')
ON CONFLICT (task) DO NOTHING;

COMMIT;

-- ===== ROLLBACK =====
-- BEGIN;
-- DROP TABLE IF EXISTS public.maintenance_heartbeat;
-- COMMIT;
