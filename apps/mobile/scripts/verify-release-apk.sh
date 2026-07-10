#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "$script_dir/.." && pwd)"
apk_path="${1:-$project_root/android/app/build/outputs/apk/release/app-release.apk}"
bundle_path='assets/index.android.bundle'
production_api='https://api.heyslab.ru'
forbidden_api_pattern='http://(localhost|127\.0\.0\.1|10\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}|192\.168\.[0-9]{1,3}\.[0-9]{1,3}|172\.(1[6-9]|2[0-9]|3[01])\.[0-9]{1,3}\.[0-9]{1,3})(:[0-9]+)?'

read -r expected_version minimum_version_code expected_application_id < <(
  node -e "const app = require(process.argv[1]).expo; console.log(app.version, app.android.versionCode, app.android.package)" \
    "$project_root/app.json"
)

if [[ ! -f "$apk_path" ]]; then
  echo "APK not found: $apk_path" >&2
  exit 2
fi

if ! command -v apkanalyzer >/dev/null 2>&1; then
  echo 'apkanalyzer is required to verify release metadata.' >&2
  exit 2
fi

actual_application_id="$(apkanalyzer manifest application-id "$apk_path")"
actual_version="$(apkanalyzer manifest version-name "$apk_path")"
actual_version_code="$(apkanalyzer manifest version-code "$apk_path")"

if [[ "$actual_application_id" != "$expected_application_id" ]]; then
  echo "Release APK application ID mismatch: expected $expected_application_id, got $actual_application_id" >&2
  exit 1
fi

if [[ "$actual_version" != "$expected_version" || ! "$actual_version_code" =~ ^[0-9]+$ || "$actual_version_code" -lt "$minimum_version_code" ]]; then
  echo "Release APK version mismatch: expected $expected_version with versionCode >= $minimum_version_code, got $actual_version($actual_version_code)" >&2
  exit 1
fi

manifest_xml="$(apkanalyzer manifest print "$apk_path")"
if ! grep -q 'android:scheme="heys"' <<< "$manifest_xml"; then
  echo 'Release APK is missing the configured heys:// app scheme; native prebuild is stale.' >&2
  exit 1
fi

manifest_permissions="$(apkanalyzer manifest permissions "$apk_path")"
if grep -qx 'android.permission.SYSTEM_ALERT_WINDOW' <<< "$manifest_permissions"; then
  echo 'Release APK requests SYSTEM_ALERT_WINDOW even though HEYS does not use app overlays.' >&2
  exit 1
fi

bundle_tmp="$(mktemp)"
trap 'rm -f "$bundle_tmp"' EXIT

if ! unzip -p "$apk_path" "$bundle_path" > "$bundle_tmp"; then
  echo "Unable to read $bundle_path from $apk_path" >&2
  exit 2
fi

forbidden_urls="$(LC_ALL=C grep -aoE "$forbidden_api_pattern" "$bundle_tmp" | sort -u || true)"
forbidden_urls="$(printf '%s\n' "$forbidden_urls" | grep -Ev '^http://(localhost|127\.0\.0\.1|10\.0\.2\.2):8081$' || true)"

if [[ -n "$forbidden_urls" ]]; then
  echo 'Release APK contains a private cleartext API URL:' >&2
  printf '%s\n' "$forbidden_urls" >&2
  exit 1
fi

if ! LC_ALL=C grep -aFq "$production_api" "$bundle_tmp"; then
  echo "Release APK does not contain the production API URL: $production_api" >&2
  exit 1
fi

apksigner_cmd="$(command -v apksigner || true)"
if [[ -z "$apksigner_cmd" ]]; then
  for sdk_root in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "$HOME/Library/Android/sdk" /usr/local/share/android-commandlinetools; do
    [[ -n "$sdk_root" && -d "$sdk_root/build-tools" ]] || continue
    apksigner_cmd="$(find "$sdk_root/build-tools" -mindepth 2 -maxdepth 2 -type f -name apksigner | sort | tail -1)"
    [[ -n "$apksigner_cmd" ]] && break
  done
fi

if [[ -z "$apksigner_cmd" ]]; then
  echo 'apksigner is required to verify the store certificate.' >&2
  exit 2
fi

signer_info="$("$apksigner_cmd" verify --print-certs "$apk_path")"
if grep -qi 'CN=Android Debug' <<< "$signer_info"; then
  echo 'Release APK is signed with the Android Debug certificate.' >&2
  exit 1
fi

echo "Release APK verification passed: $apk_path"
