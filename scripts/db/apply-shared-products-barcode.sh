#!/usr/bin/env bash
# Apply and verify shared-products barcode support.
#
# Usage:
#   bash scripts/db/apply-shared-products-barcode.sh
#
# The script uses scripts/db/psql.sh, so PGPASSWORD may be pre-exported or loaded
# from Lockbox by the wrapper.

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

MIGRATION="$REPO_ROOT/scripts/db/migrations/2026-06-27_shared_products_barcode.sql"
CHECK="$REPO_ROOT/scripts/db/check-shared-products-barcode.sql"

echo "Applying shared-products barcode migration..."
"$SCRIPT_DIR/psql.sh" -v ON_ERROR_STOP=1 -f "$MIGRATION"

echo "Verifying shared-products barcode schema..."
"$SCRIPT_DIR/psql.sh" -v ON_ERROR_STOP=1 -f "$CHECK"

echo "Shared-products barcode migration applied and verified."
