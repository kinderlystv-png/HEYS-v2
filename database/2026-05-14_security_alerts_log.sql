-- =====================================================
-- HEYS: журнал отправленных security-алертов
-- Версия: 1.0.0
-- Дата: 2026-05-14
-- Описание:
--   Защита от спама в Telegram: каждое срабатывание правила
--   фиксируется в этой таблице. Cron-функция перед отправкой
--   проверяет наличие записи того же типа за окно
--   (cooldown_minutes) и пропускает повторную отправку.
--
--   Используется heys-cron-security-alerts (152-ФЗ ст. 22.3 —
--   обнаружение инцидентов с ПДн в течение 24/72 часов).
-- =====================================================

CREATE TABLE IF NOT EXISTS public.security_alerts_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key TEXT NOT NULL,             -- 'brute_force_ip', 'coordinated_locks', ...
  triggered_count INT NOT NULL,        -- Кол-во событий, вызвавших срабатывание
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  telegram_sent_at TIMESTAMPTZ,        -- NULL если отправка не удалась
  telegram_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_alerts_rule_created
  ON public.security_alerts_log(rule_key, created_at DESC);

COMMENT ON TABLE public.security_alerts_log IS
  'Журнал отправленных в Telegram security-алертов. Cooldown — '
  'проверка свежей записи по rule_key перед отправкой.';

GRANT SELECT, INSERT ON public.security_alerts_log TO heys_admin;
