#!/bin/bash
# Production deploy: rebuilds bundles + uploads to heys-app bucket (app.heyslab.ru).
# Parallel uploads via xargs (~8-10x faster than serial) with retry×3 on transient failures.
# Usage: ./scripts/deploy-frontend.sh --confirm-deploy

set -e

ROOT="/Users/poplavskijanton/HEYS-v2"
DIST="$ROOT/apps/web/dist"
BUCKET="${PROD_BUCKET:-heys-app}"
PARALLEL="${UPLOAD_PARALLEL:-6}"
CONFIRM_DEPLOY=0

for arg in "$@"; do
  case "$arg" in
    --confirm-deploy) CONFIRM_DEPLOY=1 ;;
    *) echo "Unknown argument: $arg"; exit 2 ;;
  esac
done

if [ "$CONFIRM_DEPLOY" != "1" ] && [ "${HEYS_CONFIRM_DEPLOY:-}" != "1" ]; then
  echo "❌ deploy-frontend requires explicit --confirm-deploy."
  echo "   This rebuilds and uploads production PWA files to s3://$BUCKET."
  exit 2
fi

echo "🔨 Step 1: Rebuilding legacy bundles..."
cd "$ROOT"
node scripts/bundle-legacy.mjs 2>&1 | tail -3

echo "🔨 Step 2: Vite build..."
pnpm --filter @heys/web run build 2>&1 | tail -2

echo "⬆️  Step 3: Uploading to s3://$BUCKET (parallel=$PARALLEL)..."
cd "$DIST"

upload_one() {
  local f="$1"
  local bucket="$2"
  local ct
  case "$f" in
    *.html) ct="text/html; charset=utf-8";;
    *.json) ct="application/json";;
    *.css)  ct="text/css; charset=utf-8";;
    *.gz)   ct="application/javascript";;
    *)      ct="application/javascript";;
  esac
  # yc CLI occasionally drops sockets under parallel load — retry up to 3 times.
  for try in 1 2 3; do
    if yc storage s3api put-object --bucket "$bucket" --key "$f" --body "$f" --content-type "$ct" >/dev/null 2>&1; then
      echo "  ⬆ $f"
      return 0
    fi
    sleep 1
  done
  echo "  ✗ $f FAILED after 3 attempts"
  return 1
}
export -f upload_one

# Build the list of files to upload using find (avoids ls quirks with multiple globs).
# Patterns covered: boot-*, postboot-*-eager, postboot-*-lazy, react-bundle, assets/*.css,
#                   index.html, bundle-manifest.json, lazy-manifest.json, sw.js
FILELIST=$(mktemp)
find . -maxdepth 1 -type f \( \
    -name 'boot-*.js' -o -name 'boot-*.js.gz' \
    -o -name 'postboot-*.js' -o -name 'postboot-*.js.gz' \
    -o -name 'react-bundle.js' -o -name 'react-bundle.js.gz' \
    -o -name 'index.html' -o -name 'bundle-manifest.json' \
    -o -name 'lazy-manifest.json' -o -name 'sw.js' \
  \) | sed 's|^\./||' > "$FILELIST"
find ./assets -maxdepth 1 -type f -name '*.css' 2>/dev/null | sed 's|^\./||' >> "$FILELIST"

UPLOADED=$(wc -l < "$FILELIST" | tr -d ' ')

cat "$FILELIST" | xargs -P "$PARALLEL" -I {} bash -c 'upload_one "$1" "$2"' _ {} "$BUCKET"
rm -f "$FILELIST"

echo ""
echo "✅ Done! Uploaded $UPLOADED files to $BUCKET."
echo "🌐 https://app.heyslab.ru"
