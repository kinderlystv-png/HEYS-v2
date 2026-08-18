# DB inspection scripts

Helpers for working with production Yandex Postgres. See memory
`reference_db_migration.md` for connection details (Lockbox secret + psql
command pattern).

## Usage

**Пароль — только из Lockbox.** `PG_PASSWORD` / `PGPASSWORD` в
`yandex-cloud-functions/.env` часто placeholder или устаревший checksum — оттуда
будет `incorrect password` (odyssey). Агентам и локальным скриптам: **не** брать
prod-пароль из `.env`.

| Платформа          | Команда                                              |
| ------------------ | ---------------------------------------------------- |
| Git Bash / WSL     | `./scripts/db/psql.sh -c "SELECT 1"`                 |
| Windows PowerShell | `powershell -File scripts/db/psql.ps1 -c "SELECT 1"` |

Lockbox вручную (bash):

```bash
source scripts/db/get-pg-password.sh
psql "$(cat scripts/db/connect-string.txt)" -f scripts/db/audit-clients.sql
```

Или one-liner с bash-обёрткой:

```bash
./scripts/db/psql.sh -f scripts/db/audit-clients.sql
./scripts/db/psql.sh -c "SELECT count(*) FROM clients;"
```

### psql на Windows (первый раз)

Бинарники лежат в `tools/pgsql/` (не в git). Один раз:

```powershell
pwsh scripts/db/setup-windows-tools.ps1
```

Скрипт скачает PostgreSQL client zip в `tools/pgsql/pgsql/bin/psql.exe` и, если
есть scoop, поставит `jq` (нужен `deploy-all.sh`). Ручной путь, если скрипт не
подходит:

1. Скачай
   [PostgreSQL Windows binaries](https://www.enterprisedb.com/download-postgresql-binaries)
   (zip, без installer).
2. Распакуй так, чтобы был путь `tools/pgsql/pgsql/bin/psql.exe`.

## Scripts

| File                 | Purpose                                                             |
| -------------------- | ------------------------------------------------------------------- |
| `get-pg-password.sh` | Fetch heys_admin password from Yandex Lockbox + export `PGPASSWORD` |
| `psql.sh`            | psql wrapper (bash): auto-loads password from Lockbox               |
| `psql.ps1`           | psql wrapper (Windows): Lockbox + `tools/pgsql`, не `.env`          |
| `audit-clients.sql`  | Per-client storage stats (keys, total size, last update)            |
| `inspect-client.sh`  | Show all keys for one client_id: `./inspect-client.sh <cid-prefix>` |
| `audit-orphans.sql`  | Check no orphan client_id rows exist in client_kv_store             |
| `audit-products.sql` | Compare overlay vs legacy product counts across all clients         |
