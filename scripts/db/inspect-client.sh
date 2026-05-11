#!/usr/bin/env bash
# inspect-client.sh — show all keys for one client_id.
#
# Args:
#   $1 — client_id prefix (at least 8 chars), or full UUID
#
# Example:
#   ./scripts/db/inspect-client.sh ccfe6ea3
#   ./scripts/db/inspect-client.sh ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <client_id_prefix_or_full>" >&2
    exit 1
fi

CID="$1"
SCRIPT_DIR="$(dirname "$0")"

"$SCRIPT_DIR/psql.sh" -c "
SELECT
  k,
  jsonb_typeof(v) AS type,
  CASE WHEN jsonb_typeof(v) = 'array' THEN jsonb_array_length(v) ELSE NULL END AS arr_len,
  pg_size_pretty(length(v::text)::bigint) AS size,
  to_char(updated_at, 'YYYY-MM-DD HH24:MI') AS updated
FROM client_kv_store
WHERE client_id::text LIKE '$CID%'
ORDER BY k;
"
