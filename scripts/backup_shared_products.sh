#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   PGHOST=... PGPORT=6432 PGDATABASE=heys_production PGUSER=heys_admin PGPASSWORD=... \
#   ./scripts/backup_shared_products.sh [output_dir]

OUT_DIR=${1:-./backups}
TS=$(date +"%Y%m%d-%H%M%S")
FILE="$OUT_DIR/shared_products_${TS}.dump"

mkdir -p "$OUT_DIR"

: "${PGHOST:?PGHOST is required}"
: "${PGPORT:?PGPORT is required}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${PGUSER:?PGUSER is required}"

export PGCONNECT_TIMEOUT=${PGCONNECT_TIMEOUT:-10}

pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --table=shared_products \
  --file "$FILE"

echo "✅ Backup saved: $FILE"