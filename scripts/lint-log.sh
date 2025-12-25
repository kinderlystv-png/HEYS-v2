#!/usr/bin/env bash
set -euo pipefail

log_dir="logs"
log_file="${log_dir}/lint.log"

mkdir -p "${log_dir}"

pnpm lint 2>&1 | tee "${log_file}"
