#!/usr/bin/env bash
# Compatibility entrypoint. Scoped deploy logic lives in one canonical script.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec "$ROOT/scripts/deploy-web-scoped.sh" "$@"
