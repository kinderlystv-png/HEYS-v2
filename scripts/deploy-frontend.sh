#!/bin/bash
# Fast deploy script: rebuilds bundles + uploads only changed JS bundles + index.html
# Usage: ./scripts/deploy-frontend.sh

set -e

ROOT="/Users/poplavskijanton/HEYS-v2"
DIST="$ROOT/apps/web/dist"
BUCKET="heys-app"

echo "🔨 Step 1: Rebuilding legacy bundles..."
cd "$ROOT"
node scripts/bundle-legacy.mjs 2>&1 | tail -3

echo "🔨 Step 2: Vite build..."
pnpm --filter @heys/web run build 2>&1 | tail -2

echo "⬆️  Step 3: Uploading all bundles + index.html..."
cd "$DIST"

UPLOADED=0
for f in boot-app.bundle.*.js boot-app.bundle.*.js.gz \
          boot-core.bundle.*.js boot-core.bundle.*.js.gz \
          boot-calc.bundle.*.js boot-calc.bundle.*.js.gz \
          boot-day.bundle.*.js boot-day.bundle.*.js.gz \
          boot-init.bundle.*.js boot-init.bundle.*.js.gz \
          postboot-1-game.bundle.*.js postboot-1-game.bundle.*.js.gz \
          postboot-2-insights.bundle.*.js postboot-2-insights.bundle.*.js.gz \
          postboot-3-ui.bundle.*.js postboot-3-ui.bundle.*.js.gz \
          react-bundle.js react-bundle.js.gz \
          index.html bundle-manifest.json; do
  [[ -f "$f" ]] || continue
  case "$f" in
    *.html) ct="text/html; charset=utf-8";;
    *.json) ct="application/json";;
    *)      ct="application/javascript";;
  esac
  echo -n "  ⬆️  $f... "
  yc storage s3api put-object --bucket "$BUCKET" --key "$f" --body "$f" --content-type "$ct" 2>&1 | grep -o 'etag: "[^"]*"' | head -1
  UPLOADED=$((UPLOADED + 1))
done

echo ""
echo "✅ Done! Uploaded $UPLOADED files."
