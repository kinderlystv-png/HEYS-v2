-- =====================================================
-- Migration: rate-limit на POST /leads (P0.13)
-- Date: 2026-04-28
-- Purpose:
--   До этой миграции бот мог отправить 1000 заявок в минуту, забив Telegram-канал
--   куратора и БД. Эта таблица хранит факты submit с IP, чтобы /leads endpoint
--   мог посчитать частоту и вернуть 429 при превышении.
--
--   Паттерн повторяет pin_login_attempts (2025-12-25_p1_security_rate_limit.sql),
--   только для лендинговой формы.
-- =====================================================

CREATE TABLE IF NOT EXISTS lead_submission_attempts (
  id BIGSERIAL PRIMARY KEY,
  ip_address TEXT NOT NULL,
  honeypot_filled BOOLEAN DEFAULT false,
  attempted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lead_attempts_ip_idx
  ON lead_submission_attempts(ip_address, attempted_at DESC);

COMMENT ON TABLE lead_submission_attempts IS
  'Журнал submit-попыток на POST /leads для rate-limit (5 попыток / 15 мин на IP).';

-- Очистка старых записей (>24h) — выполняется по запросу или планировщиком.
CREATE OR REPLACE FUNCTION cleanup_lead_submission_attempts()
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM lead_submission_attempts
   WHERE attempted_at < NOW() - INTERVAL '24 hours';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_lead_submission_attempts IS
  'Удаляет записи lead_submission_attempts старше 24 часов. Запускать раз в сутки через cron.';
