#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FILES=""
DRY_RUN=0
CONFIRMED=0
SKIP_CDN=0
for arg in "$@"; do
  case "$arg" in
    --files=*) FILES="${arg#--files=}" ;;
    --scope=dirty) FILES="" ;;
    --dry-run) DRY_RUN=1 ;;
    --confirm-deploy) CONFIRMED=1 ;;
    --skip-cdn) SKIP_CDN=1 ;;
    --skip-landing) : ;;
    *) echo "Unknown argument: $arg"; exit 2 ;;
  esac
done

STATUS_BEFORE="$(git status --porcelain=v1 --untracked-files=all)"
SOURCE_SNAPSHOT_BEFORE="$(node scripts/web-deploy-scope.mjs snapshot)"
if [ -z "$STATUS_BEFORE" ] && [ -z "$FILES" ]; then
  echo "No dirty scope to deploy. Pass --files=<comma-separated paths> for a clean worktree."
  exit 2
fi

PLAN_ARGS=(plan)
[ -n "$FILES" ] && PLAN_ARGS+=("--files=$FILES")
PLAN_JSON="$(node scripts/web-deploy-scope.mjs "${PLAN_ARGS[@]}")"
echo "$PLAN_JSON"

if [ "$(node -e 'const p=JSON.parse(process.argv[1]);process.stdout.write(String(p.fullRebuild))' "$PLAN_JSON")" = "true" ]; then
  echo "Scope contains non-legacy web assets or full-rebuild triggers; use the canonical full CI deploy."
  exit 3
fi

if [ "$DRY_RUN" = "1" ]; then
  echo "Dry-run complete: no build and no upload."
  exit 0
fi
if [ "$CONFIRMED" != "1" ] && [ "${HEYS_CONFIRM_DEPLOY:-}" != "1" ]; then
  echo "Review the complete scope above, then rerun with --confirm-deploy."
  exit 2
fi
if [ "$SKIP_CDN" = "0" ] && ! command -v yc >/dev/null; then
  echo "yc CLI is required for Demo CDN invalidation (or pass --skip-cdn)."
  exit 2
fi

SCOPE_FILES="$(node -e 'const p=JSON.parse(process.argv[1]);process.stdout.write(p.files.join(","))' "$PLAN_JSON")"
pnpm bundle:legacy:auto "--files=$SCOPE_FILES"
pnpm --filter @heys/web run build:react
pnpm --filter @heys/web run build:dist
cp apps/web/public/sw.js apps/web/dist/sw.js
node scripts/web-deploy-scope.mjs verify "--files=$SCOPE_FILES" --dist=apps/web/dist

SOURCE_SNAPSHOT_AFTER="$(node scripts/web-deploy-scope.mjs snapshot)"
if [ "$SOURCE_SNAPSHOT_BEFORE" != "$SOURCE_SNAPSHOT_AFTER" ]; then
  echo "Source scope changed after confirmation; refusing upload. Review the new full scope."
  exit 4
fi

DIST="$ROOT/apps/web/dist"
ENDPOINT="${YC_ENDPOINT:-https://storage.yandexcloud.net}"
BUNDLES="$(node -e 'const p=JSON.parse(process.argv[1]);process.stdout.write(p.verifiedBundles.join(" "))' "$(node scripts/web-deploy-scope.mjs verify "--files=$SCOPE_FILES" --dist=apps/web/dist)")"
MUTABLE="$(node -e 'const p=JSON.parse(process.argv[1]);process.stdout.write(p.mutableFiles.map(f=>f.split("/").pop()).join(" "))' "$PLAN_JSON")"

for bucket in "${YC_BUCKET_PWA:-heys-app}" "${YC_BUCKET_DEMO:-try-heyslab-ru}"; do
  for bundle in $BUNDLES; do
    aws s3 cp "$DIST/$bundle.gz" "s3://$bucket/$bundle" --endpoint-url="$ENDPOINT" \
      --cache-control "public, max-age=31536000, immutable" --content-type application/javascript --content-encoding gzip --quiet
  done
  for file in $MUTABLE; do
    aws s3 cp "$DIST/$file" "s3://$bucket/$file" --endpoint-url="$ENDPOINT" \
      --cache-control "public, max-age=0, must-revalidate" --content-type application/javascript --quiet
  done
  for file in bundle-manifest.json lazy-manifest.json sw.js; do
    aws s3 cp "$DIST/$file" "s3://$bucket/$file" --endpoint-url="$ENDPOINT" --cache-control "no-cache, no-store, must-revalidate" --quiet
  done
  aws s3 cp "$DIST/index.html" "s3://$bucket/index.html" --endpoint-url="$ENDPOINT" \
    --cache-control "no-cache, no-store, must-revalidate" --content-type "text/html; charset=utf-8" --quiet
done

if [ "$SKIP_CDN" = "0" ]; then
  CDN_ARGS=(--path / --path /index.html --path /sw.js --path /bundle-manifest.json)
  for file in $MUTABLE; do CDN_ARGS+=(--path "/$file"); done
  yc cdn cache purge --resource-id "${CDN_DEMO_ID:-bc8r24iwog2zxvppd4i4}" "${CDN_ARGS[@]}"
fi

echo "Scoped deploy complete."
