-- =============================================================================
-- SEC-022 — Photo cleanup log table.
--
-- Зачем: при `DELETE FROM clients` FK CASCADE удаляет ПДн из БД (18 таблиц), но
-- photos в S3 heys-photos/<cid>/... остаются (нет связи S3 ↔ БД). Это нарушение
-- 152-ФЗ §14 + storage bloat.
--
-- Решение: weekly cron `heys-cron-photo-cleanup` ходит по S3 prefix'ам, чекает
-- existence client_id в `clients`, удаляет orphans (с 7-дневным soft-grace
-- против race и hard cap 100/run против runaway delete'ов).
--
-- Эта таблица — audit-log каждого cleanup-run'а. Используется в:
--   1. SOFT-GRACE: orphan должен быть в predыдущем run'е тоже (7+ дней назад)
--   2. Compliance audit: доказательство 152-ФЗ §14 fulfilment
--
-- Apply:
--   bash scripts/db/psql.sh --single-transaction -f database/2026-06-14_photo_cleanup_log.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS photo_cleanup_log (
  id                      bigserial PRIMARY KEY,
  run_at                  timestamptz NOT NULL DEFAULT now(),
  status                  text NOT NULL CHECK (status IN ('ok', 'partial', 'failed')),
  scanned_prefixes        int NOT NULL DEFAULT 0,
  orphan_candidates_count int NOT NULL DEFAULT 0,
  deleted_count           int NOT NULL DEFAULT 0,
  dry_run                 boolean NOT NULL DEFAULT TRUE,
  details                 jsonb
);

CREATE INDEX IF NOT EXISTS idx_photo_cleanup_log_run_at
  ON photo_cleanup_log (run_at DESC);

-- heys_admin — пишет (cron function role)
GRANT INSERT, SELECT ON photo_cleanup_log TO heys_admin;
-- heys_rpc — читает для security-alerts watchdog
GRANT SELECT ON photo_cleanup_log TO heys_rpc;

COMMENT ON TABLE photo_cleanup_log IS
  'SEC-022 (152-ФЗ §14): audit-log heys-cron-photo-cleanup. '
  'Retention: 1 год (cleanup через heys-maintenance).';
