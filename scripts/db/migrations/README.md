# DB migrations — rollback convention (2026-05-31)

## Canonical runner (post-cutover)

All new production schema changes must be added to `manifest.json` and applied
through `node scripts/db/migrate.mjs`. Existing SQL files are an explicit legacy
baseline: the runner inventories them but never replays them.

```bash
node scripts/db/migrate.mjs --check
node scripts/db/migrate.mjs --status
node scripts/db/migrate.mjs --apply --confirm-production
```

The runner rejects unknown SQL files, checksum drift, gaps in migration order,
embedded transaction control and any migration not explicitly marked
`"destructive": false`. Destructive data cleanup is intentionally outside this
runner and requires a separately approved procedure.

## Rules для новых migrations

1. **Каждая migration** должна включать одну из:
   - **`-- ROLLBACK:` секцию** в самом файле (commented SQL для reverse)
   - **Companion file** `<migration>_rollback.sql`
   - **Явно documented `-- NO ROLLBACK: <reason>`** (например, drop column with
     irrecoverable data)

2. **Test rollback** перед коммитом:
   `bash scripts/db/psql.sh -v ON_ERROR_STOP=1 <<'EOF' ... EOF` в transaction
   wrapper, verify revert state.

3. **Naming**: `YYYY-MM-DD_<short_desc>.sql` для migration,
   `YYYY-MM-DD_<short_desc>_rollback.sql` для companion если нужен.

## Шаблон

```sql
-- YYYY-MM-DD: <one-line summary>
--
-- Context: <why это нужно>
-- Rollback: см. _rollback_<short_desc>.sql ИЛИ inline ниже.

BEGIN;

-- ===== FORWARD =====
ALTER TABLE foo ADD COLUMN bar text;

COMMIT;

-- ===== ROLLBACK =====
-- BEGIN;
-- ALTER TABLE foo DROP COLUMN bar;
-- COMMIT;
```

## Существующие migrations (2026-05-30/31)

| Migration                                                | Rollback                                                            | Status                          |
| -------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------- |
| `2026-05-30_unmask_health_keys_in_audit_log.sql`         | `_rollback_trigger_audit_log_pre_unmask.sql`                        | ✅ has rollback                 |
| `2026-05-30_audit_capture_user_id.sql`                   | inline доступен через restore prev func                             | ✅ idempotent CREATE OR REPLACE |
| `2026-05-30_fix_audit_logs_created_at_tz.sql`            | inline doc'd (`SET DEFAULT timezone('utc', now())`)                 | ✅ trivial revert               |
| `2026-05-30_approve_pending_products_bulk.sql`           | TBD                                                                 | ⚠ to audit                     |
| `2026-05-30_compute_product_fingerprint.sql`             | TBD                                                                 | ⚠ to audit                     |
| `2026-05-30_pending_fingerprint_trigger.sql`             | TBD                                                                 | ⚠ to audit                     |
| `2026-05-30_publish_shared_product_auto_fingerprint.sql` | TBD                                                                 | ⚠ to audit                     |
| `2026-05-30_sweep_orphan_products_to_pending.sql`        | TBD                                                                 | ⚠ to audit                     |
| `2026-05-31_create_e2e_test_clients.sql`                 | inline: `DELETE FROM clients WHERE id IN (...)` (ON DELETE CASCADE) | ✅ doc'd                        |

## Future automation

`TESTS/db/migration-rollback.test.ts` (см. Phase 7 plan) — для каждой migration
в transaction: apply → verify state → apply rollback → verify reverted →
ROLLBACK overall (discards everything). Сейчас scaffolded, требует:

- Parse migration files для FORWARD + ROLLBACK секций
- Implement state-verify helpers (column exists, function source contains
  pattern, trigger attached)
- Decision per-migration: lossy (skip rollback test) vs reversible

Plan: `~/.claude/plans/cozy-hatching-minsky.md` → Phase 7.
