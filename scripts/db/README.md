# DB inspection scripts

Helpers for working with production Yandex Postgres. See memory
`reference_db_migration.md` for connection details (Lockbox secret + psql
command pattern).

## Usage

All scripts expect `PGPASSWORD` env var. Use `get-pg-password.sh` to load it:

```bash
source scripts/db/get-pg-password.sh
psql "$(cat scripts/db/connect-string.txt)" -f scripts/db/audit-clients.sql
```

Or one-liner with the wrapper:

```bash
./scripts/db/psql.sh -f scripts/db/audit-clients.sql
./scripts/db/psql.sh -c "SELECT count(*) FROM clients;"
```

## Scripts

| File                 | Purpose                                                             |
| -------------------- | ------------------------------------------------------------------- |
| `get-pg-password.sh` | Fetch heys_admin password from Yandex Lockbox + export `PGPASSWORD` |
| `psql.sh`            | psql wrapper: auto-loads password, passes through args              |
| `audit-clients.sql`  | Per-client storage stats (keys, total size, last update)            |
| `inspect-client.sh`  | Show all keys for one client_id: `./inspect-client.sh <cid-prefix>` |
| `audit-orphans.sql`  | Check no orphan client_id rows exist in client_kv_store             |
| `audit-products.sql` | Compare overlay vs legacy product counts across all clients         |
