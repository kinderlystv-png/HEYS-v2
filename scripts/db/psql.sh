#!/usr/bin/env bash
# psql.sh — psql wrapper for HEYS prod Postgres.
# Auto-loads PGPASSWORD from Lockbox if not set. Passes all args to psql.
#
# Examples:
#   ./scripts/db/psql.sh -c "SELECT count(*) FROM clients;"
#   ./scripts/db/psql.sh -f scripts/db/audit-clients.sql
#   ./scripts/db/psql.sh < scripts/db/audit-orphans.sql

set -e

if [ -z "$PGPASSWORD" ]; then
    source "$(dirname "$0")/get-pg-password.sh"
fi

PGPASSWORD="$PGPASSWORD" psql \
    "host=rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net port=6432 dbname=heys_production user=heys_admin sslmode=verify-full connect_timeout=30" \
    "$@"
