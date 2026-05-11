#!/usr/bin/env bash
# get-pg-password.sh — Fetch heys_admin password from Yandex Lockbox and export PGPASSWORD.
#
# Use via `source` to make PGPASSWORD available in current shell:
#   source scripts/db/get-pg-password.sh
#
# Or via `eval $(scripts/db/get-pg-password.sh --eval)` for the same effect.

set -e

LOCKBOX_SECRET_ID="${HEYS_PG_LOCKBOX_ID:-e6qr1rm1hm2n9a2pmsnl}"

# Probe yc connectivity first (it sometimes times out)
PWD_VALUE=$(yc lockbox payload get --id "$LOCKBOX_SECRET_ID" --format json 2>&1 \
  | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    for e in d.get('entries', []):
        if e.get('key') == 'postgresql_password':
            print(e['text_value'])
            sys.exit(0)
    print('ERROR: postgresql_password not in lockbox entries', file=sys.stderr)
    sys.exit(1)
except json.JSONDecodeError as ex:
    print(f'ERROR: yc returned non-JSON (probably IAM timeout); retry in 30s', file=sys.stderr)
    sys.exit(2)
")

if [ -z "$PWD_VALUE" ]; then
    echo "FAILED to obtain PG password from Lockbox" >&2
    return 1 2>/dev/null || exit 1
fi

export PGPASSWORD="$PWD_VALUE"

if [ "$1" = "--eval" ]; then
    echo "export PGPASSWORD='$PWD_VALUE'"
fi
