#!/bin/bash
# Deploy HEYS bundles to the demo subdomain bucket (try-heyslab-ru → try.heyslab.ru).
# Same build artifacts as production; DEMO_MODE is gated by hostname at runtime.
# Usage: ./scripts/deploy-demo.sh

set -e

ROOT="/Users/poplavskijanton/HEYS-v2"
DIST="$ROOT/apps/web/dist"
BUCKET="${DEMO_BUCKET:-try-heyslab-ru}"
PARALLEL="${UPLOAD_PARALLEL:-6}"

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
  # Up to 3 attempts — yc CLI occasionally drops sockets under parallel load.
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
# Patterns covered: boot-*, postboot-*, react-bundle.js[.gz], assets/*.css, index.html, bundle-manifest.json
FILELIST=$(mktemp)
find . -maxdepth 1 -type f \( \
    -name 'boot-*.js' -o -name 'boot-*.js.gz' \
    -o -name 'postboot-*.js' -o -name 'postboot-*.js.gz' \
    -o -name 'react-bundle.js' -o -name 'react-bundle.js.gz' \
    -o -name 'index.html' -o -name 'bundle-manifest.json' \
  \) | sed 's|^\./||' > "$FILELIST"
find ./assets -maxdepth 1 -type f -name '*.css' 2>/dev/null | sed 's|^\./||' >> "$FILELIST"

cat "$FILELIST" | xargs -P "$PARALLEL" -I {} bash -c 'upload_one "$1" "$2"' _ {} "$BUCKET"
rm -f "$FILELIST"

UPLOADED=$(ls boot-*.{js,js.gz} postboot-*.{js,js.gz} react-bundle.js* assets/*.css index.html bundle-manifest.json 2>/dev/null | wc -l | tr -d ' ')

echo ""
echo "✅ Done! Uploaded $UPLOADED files to $BUCKET."
echo "   Smoke test: open https://try.heyslab.ru/?gender=male in Incognito"
