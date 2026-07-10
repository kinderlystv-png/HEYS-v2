#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "$script_dir/.." && pwd)"
stage_root="$(mktemp -d "${TMPDIR:-/tmp}/heys-mobile-rustore.XXXXXX")"
stage_project="$stage_root/project"

cleanup() {
  rm -rf "$stage_root"
}
trap cleanup EXIT

if ! command -v rsync >/dev/null 2>&1; then
  echo 'rsync is required to create an isolated EAS project archive.' >&2
  exit 2
fi

if command -v eas >/dev/null 2>&1; then
  eas_command=(eas)
else
  eas_command=(npx --yes eas-cli)
fi

mkdir -p "$stage_project"
rsync -a \
  --exclude '.DS_Store' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude '.expo' \
  --exclude 'android' \
  --exclude 'ios' \
  --exclude 'node_modules' \
  --exclude 'release' \
  "$project_root/" "$stage_project/"

if [[ " $* " == *' --local '* && -z "${ANDROID_HOME:-}" ]]; then
  for sdk_root in "$HOME/Library/Android/sdk" /usr/local/share/android-commandlinetools; do
    if [[ -d "$sdk_root/platforms" && -d "$sdk_root/build-tools" ]]; then
      export ANDROID_HOME="$sdk_root"
      export ANDROID_SDK_ROOT="$sdk_root"
      break
    fi
  done
fi

echo "Building isolated mobile project from: $stage_project"
(
  cd "$stage_project"
  EAS_NO_VCS=1 "${eas_command[@]}" build --profile rustore --platform android "$@"
)
