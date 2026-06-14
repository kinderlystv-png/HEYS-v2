-- =============================================================================
-- SEC-021 — Backup-chain watchdog: таблица success-markers.
--
-- Зачем: 2026-06-14 обнаружена 27-дневная дыра в backup-chain (2026-04-14 →
-- 2026-05-10). Root-cause: heys-client-daily-backup function потеряла deployed
-- version (вероятно accidental delete), trigger продолжал срабатывать без
-- кода → silent failure. Existing alerting (см. index.js:496+) работает ТОЛЬКО
-- когда функция запустилась и сработали partial-failures; если функция не
-- запускается совсем — silence.
--
-- Решение: внешний watchdog в heys-cron-security-alerts проверяет таблицу
-- `backup_run_log` (success-маркеры от backup function). Если за last 7 дней
-- < 5 успешных runs → Telegram alert. Каждый backup-run пишет INSERT по
-- завершении — пропуск run означает отсутствие INSERT.
--
-- Apply:
--   bash scripts/db/psql.sh --single-transaction -f database/2026-06-14_backup_run_log.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS backup_run_log (
  id              bigserial PRIMARY KEY,
  run_at          timestamptz NOT NULL DEFAULT now(),
  business_date   date,
  status          text NOT NULL CHECK (status IN ('ok', 'partial', 'failed')),
  total_clients   int,
  success_count   int,
  error_count     int,
  duration_sec    int,
  details         jsonb
);

CREATE INDEX IF NOT EXISTS idx_backup_run_log_run_at
  ON backup_run_log (run_at DESC);

-- heys_admin (backup-function роль) пишет.
GRANT INSERT, SELECT ON backup_run_log TO heys_admin;
-- heys_rpc (security-alerts cron) только читает.
GRANT SELECT ON backup_run_log TO heys_rpc;

-- Cleanup retention: 1 год (рекомендация L6 baseline §5.1 для security audit).
COMMENT ON TABLE backup_run_log IS
  'SEC-021 watchdog: success-markers от heys-client-daily-backup. '
  'External alert в heys-cron-security-alerts ищет gaps. '
  'Retention: 1 год (cleanup через heys-maintenance).';
