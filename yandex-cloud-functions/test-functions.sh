#!/usr/bin/env bash
# Pre-deploy compatibility and contract gate for Yandex Cloud Functions.
# Usage: ./test-functions.sh <function> [<function> ...] | --all

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INVENTORY_SCRIPT="$SCRIPT_DIR/function-inventory.cjs"

if [ ! -f "$INVENTORY_SCRIPT" ]; then
  echo "Function inventory not found: $INVENTORY_SCRIPT" >&2
  exit 1
fi

ALL_FUNCTIONS=()
while IFS= read -r function_name; do
  ALL_FUNCTIONS+=("$function_name")
done < <(node "$INVENTORY_SCRIPT" --list)

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <function> [<function> ...] | --all" >&2
  exit 2
fi

if [ "$1" = "--all" ]; then
  TARGETS=("${ALL_FUNCTIONS[@]}")
else
  TARGETS=("$@")
fi

export NODE_ENV=test
export PG_HOST="${PG_HOST:-127.0.0.1}"
export PG_PORT="${PG_PORT:-5432}"
export PG_DATABASE="${PG_DATABASE:-heys_contract_test}"
export PG_USER="${PG_USER:-heys_contract_test}"
export PG_PASSWORD="${PG_PASSWORD:-heys-contract-test-password}"
export JWT_SECRET="${JWT_SECRET:-heys-contract-test-jwt-secret-at-least-32-characters}"
export SESSION_SECRET="${SESSION_SECRET:-heys-contract-test-session-secret-at-least-32-characters}"
export VAPID_PUBLIC_KEY="${VAPID_PUBLIC_KEY:-contract-test-public-key}"
export VAPID_PRIVATE_KEY="${VAPID_PRIVATE_KEY:-contract-test-private-key}"
export VAPID_SUBJECT="${VAPID_SUBJECT:-mailto:contract-test@heyslab.ru}"

node --test "$SCRIPT_DIR/shared/__tests__/kv-payload-contracts.test.cjs"

for function_name in "${TARGETS[@]}"; do
  function_dir="$SCRIPT_DIR/$function_name"
  package_file="$function_dir/package.json"

  if [ ! -f "$package_file" ]; then
    echo "Unknown cloud function or missing package.json: $function_name" >&2
    exit 1
  fi

  if [[ "$function_name" == "heys-api-rpc" || "$function_name" == "heys-api-rest" ]]; then
    if ! cmp -s "$SCRIPT_DIR/shared/kv-payload-contracts.js" "$function_dir/shared/kv-payload-contracts.js"; then
      echo "KV payload contract mirror is stale for $function_name" >&2
      exit 1
    fi
  fi

  echo "==> Testing $function_name on Node $(node --version)"
  (
    cd "$function_dir"
    npm ci --ignore-scripts --no-audit --no-fund

    while IFS= read -r source_file; do
      node --check "$source_file"
    done < <(find . -maxdepth 3 -type f \( -name '*.js' -o -name '*.cjs' \) \
      -not -path './node_modules/*' -not -path './coverage/*' \
      -not -name 'apply_*.js' -not -name 'check_*.js' -not -name 'test_*.js' \
      -not -name 'deploy*.js' | sort)

    test_files=()
    while IFS= read -r test_file; do
      test_files+=("$test_file")
    done < <(find __tests__ tests -type f \( -name '*.test.js' -o -name '*.test.cjs' \) \
      2>/dev/null | sort || true)

    if [ "${#test_files[@]}" -gt 0 ]; then
      node --test "${test_files[@]}"
    fi

    node - "$function_dir" <<'NODE'
const path = require('node:path');

const functionDir = process.argv[2];
const pkg = require(path.join(functionDir, 'package.json'));
const entry = path.join(functionDir, pkg.main || 'index.js');
const runtimeModule = require(entry);

if (typeof runtimeModule.handler !== 'function') {
  throw new Error(`Cloud function entrypoint does not export handler: ${entry}`);
}

process.exit(0);
NODE
  )
done

echo "Cloud function pre-deploy gate passed: ${#TARGETS[@]} target(s)"
