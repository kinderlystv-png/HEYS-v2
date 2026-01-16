#!/usr/bin/env bash
set -euo pipefail

PORT=8000
PORT_RANGE_START=8000
PORT_RANGE_END=8010
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$ROOT_DIR"

is_port_free() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    ! lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
  elif command -v nc >/dev/null 2>&1; then
    ! nc -z 127.0.0.1 "$port" >/dev/null 2>&1
  else
    return 0
  fi
}

find_free_port() {
  local port
  for port in $(seq "$PORT_RANGE_START" "$PORT_RANGE_END"); do
    if is_port_free "$port"; then
      echo "$port"
      return 0
    fi
  done
  echo ""
  return 1
}

PORT="$(find_free_port)"
if [[ -z "$PORT" ]]; then
  echo "[HEYS] No свободного порта в диапазоне ${PORT_RANGE_START}-${PORT_RANGE_END}"
  exit 1
fi

echo "[HEYS] Starting HTTP server on http://localhost:${PORT}"
if command -v python3 >/dev/null 2>&1; then
  python3 -m http.server "$PORT" >/dev/null 2>&1 &
elif command -v python >/dev/null 2>&1; then
  python -m http.server "$PORT" >/dev/null 2>&1 &
else
  echo "[HEYS] Python not found. Install Python 3 to run the test server."
  exit 1
fi
SERVER_PID=$!

cleanup() {
  if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

URL="http://localhost:${PORT}/TESTS/index.html"

if command -v open >/dev/null 2>&1; then
  open "$URL"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL"
else
  echo "[HEYS] Open in browser: $URL"
fi

echo "[HEYS] Press Ctrl+C to stop server"
wait "$SERVER_PID"
