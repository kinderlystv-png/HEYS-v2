# HEYS · Retention job runbook

Статус: dry-run-first operational runbook. Фактические retention runs и outputs
хранить вне репо, потому что они могут содержать counts, timestamps, identifiers
или incident/legal notes. Этот файл задаёт безопасный порядок запуска перед R2.

## Scope

Retention job нужен до paid-scale/R2 для таблиц и объектов, где данные не должны
жить бессрочно:

- `client_log_trace` / browser debug events: 30 days.
- `security_events`: 1 year.
- `data_loss_audit`: 1 year.
- `data_access_audit_log`: 3 years.
- `photo_cleanup_log`: controlled by `heys-cron-photo-cleanup` + `DRY_RUN=0`.
- `backup_run_log`: keep operational evidence for backup-chain review.

## Safety rules

1. Первый запуск только dry-run: считать candidates, ничего не удалять.
2. Batch delete включать только после legal/owner sign-off сроков из
   [heys-retention-policy-draft.md](heys-retention-policy-draft.md).
3. Удаление делать маленькими batch'ами с hard cap и transaction log.
4. Не удалять строки, связанные с открытым incident, DSAR, dispute или payment
   reconciliation.
5. Фактический output хранить outside git; в `heys-pdn-monthly-audit.md`
   допустим только агрегированный repo-safe summary.

## Dry-run SQL template

```sql
-- client/browser debug trace: 30 days
SELECT count(*) AS client_log_trace_candidates
FROM client_log_trace
WHERE captured_at < now() - interval '30 days';

-- security events: 1 year
SELECT count(*) AS security_events_candidates
FROM security_events
WHERE created_at < now() - interval '1 year';

-- data-loss audit: 1 year
SELECT count(*) AS data_loss_audit_candidates
FROM data_loss_audit
WHERE created_at < now() - interval '1 year';

-- data-access audit: 3 years
SELECT count(*) AS data_access_audit_candidates
FROM data_access_audit_log
WHERE created_at < now() - interval '3 years';

-- photo cleanup evidence
SELECT run_at, status, orphan_candidates_count, deleted_count, dry_run
FROM photo_cleanup_log
ORDER BY run_at DESC
LIMIT 10;

-- backup-chain evidence
SELECT run_at, status, clients_total, clients_success, failed_count
FROM backup_run_log
ORDER BY run_at DESC
LIMIT 10;
```

## Batch delete template

Использовать только после dry-run review и sign-off. Перед реальным запуском
заменить `ROLLBACK` на `COMMIT`.

```sql
BEGIN;

WITH doomed AS (
  SELECT id
  FROM client_log_trace
  WHERE captured_at < now() - interval '30 days'
  ORDER BY captured_at
  LIMIT 500
)
DELETE FROM client_log_trace
WHERE id IN (SELECT id FROM doomed);

ROLLBACK;
```

Для `security_events`, `data_loss_audit` и `data_access_audit_log` использовать
такой же pattern с их primary key и сроком из retention matrix.

## Repo-safe monthly summary

| Period  | Dry-run done | Real delete done | Candidate rows | Deleted rows | Gaps opened in `22` | Notes without PII |
| ------- | ------------ | ---------------- | -------------- | ------------ | ------------------- | ----------------- |
| YYYY-MM | no           | no               | 0              | 0            | 0                   |                   |
