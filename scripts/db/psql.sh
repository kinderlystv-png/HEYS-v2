#!/usr/bin/env bash
# psql.sh — psql wrapper for HEYS prod Postgres.
# Auto-loads PGPASSWORD from Lockbox if not set. Passes all args to psql.
#
# Examples:
#   ./scripts/db/psql.sh -c "SELECT count(*) FROM clients;"
#   ./scripts/db/psql.sh -f scripts/db/audit-clients.sql
#   ./scripts/db/psql.sh < scripts/db/audit-orphans.sql

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [ -z "$PGPASSWORD" ]; then
    # shellcheck source=scripts/db/get-pg-password.sh
    source "$SCRIPT_DIR/get-pg-password.sh"
fi

export PGSSLMODE="${PGSSLMODE:-verify-full}"
if [ -z "${PGSSLROOTCERT:-}" ]; then
    export PGSSLROOTCERT="$REPO_ROOT/yandex-cloud-functions/certs/root.crt"
fi

PSQL_BIN="${HEYS_PSQL_BIN:-}"
if [ -z "$PSQL_BIN" ]; then
    BUNDLED="$REPO_ROOT/tools/pgsql/pgsql/bin/psql.exe"
    if [ -x "$BUNDLED" ] || [ -f "$BUNDLED" ]; then
        PSQL_BIN="$BUNDLED"
    else
        PSQL_BIN=psql
    fi
fi

PGPASSWORD="$PGPASSWORD" "$PSQL_BIN" \
    -h rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net \
    -p 6432 \
    -U heys_admin \
    -d heys_production \
    "$@"
