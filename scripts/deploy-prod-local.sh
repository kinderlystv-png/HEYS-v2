#!/bin/bash
# Local equivalent of .github/workflows/deploy-yandex.yml
# Builds PWA + Landing, uploads to Yandex Object Storage, purges CDN.
#
# Use this when GitHub Actions are blocked (billing issue / manual rollout).
# Requires: aws CLI configured for Yandex Cloud, yc CLI authenticated.
#
# Usage: bash scripts/deploy-prod-local.sh [--skip-landing] [--skip-cdn]

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# === Config ===
YC_BUCKET_PWA="heys-app"
YC_BUCKET_DEMO="try-heyslab-ru"
YC_BUCKET_LANDING="heys-static"
YC_ENDPOINT="https://storage.yandexcloud.net"
CDN_PWA_ID="bc8rvrvenqslkmti5yts"
CDN_LANDING_ID="bc8rk3pnqppsfime3nth"

SKIP_LANDING=0
SKIP_CDN=0
for arg in "$@"; do
  case "$arg" in
    --skip-landing) SKIP_LANDING=1 ;;
    --skip-cdn)     SKIP_CDN=1 ;;
  esac
done

echo "🚀 Local production deploy to Yandex Cloud"
echo "   PWA bucket:     $YC_BUCKET_PWA"
echo "   Demo bucket:    $YC_BUCKET_DEMO"
echo "   Landing bucket: $YC_BUCKET_LANDING"
echo "   Skip landing:   $SKIP_LANDING"
echo "   Skip CDN purge: $SKIP_CDN"
echo ""

read -p "⚠️  This deploys to PRODUCTION (app.heyslab.ru / heyslab.ru). Continue? [y/N] " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Cancelled."
  exit 0
fi

# === Validate prerequisites ===
command -v aws >/dev/null || { echo "❌ aws CLI not found"; exit 1; }
command -v jq >/dev/null  || { echo "❌ jq not found"; exit 1; }
if [ "$SKIP_CDN" = "0" ]; then
  command -v yc >/dev/null || { echo "❌ yc CLI not found (use --skip-cdn to bypass)"; exit 1; }
fi

# === Validate What's New ===
echo "📝 Validating What's New..."
node scripts/prepare-release.mjs --check

# === Build ===
echo ""
echo "🔨 Building PWA + Landing..."
pnpm install --frozen-lockfile

VITE_API_URL=https://api.heyslab.ru pnpm --filter @heys/web run build &
PID_PWA=$!
if [ "$SKIP_LANDING" = "0" ]; then
  pnpm --filter @heys/landing run build &
  PID_LANDING=$!
fi

FAIL=0
wait $PID_PWA || { echo "❌ PWA build FAILED"; FAIL=1; }
if [ "$SKIP_LANDING" = "0" ]; then
  wait $PID_LANDING || { echo "❌ Landing build FAILED"; FAIL=1; }
fi
[ $FAIL -eq 1 ] && exit 1

# === Validate PWA build output ===
echo ""
echo "🔍 Validating PWA dist..."
[ -d apps/web/dist ] || { echo "❌ apps/web/dist missing"; exit 1; }
JS_COUNT=$(ls -1 apps/web/dist/heys_*.js 2>/dev/null | wc -l | tr -d ' ')
[ "$JS_COUNT" -lt 50 ] && { echo "❌ Expected 50+ heys_*.js files, found $JS_COUNT"; exit 1; }
echo "   ✅ $JS_COUNT heys_*.js files present"

CRITICAL_FILES=(
  apps/web/dist/heys_app_v12.js
  apps/web/dist/heys_core_v12.js
  apps/web/dist/heys_day_v12.js
  apps/web/dist/heys_add_product_step_v1.js
  apps/web/dist/index.html
  apps/web/dist/version.json
)
for f in "${CRITICAL_FILES[@]}"; do
  [ -f "$f" ] || { echo "❌ Missing: $f"; exit 1; }
done
echo "   ✅ All critical files present"

# === Ensure SW from public ===
if [ -f apps/web/public/sw.js ]; then
  cp apps/web/public/sw.js apps/web/dist/sw.js
  echo "   ✅ Copied public/sw.js → dist/sw.js"
fi

DOCS_VERSION=$(node -e "const fs=require('fs'); const s=fs.readFileSync('apps/web/heys_consents_v1.js','utf8'); const m=s.match(/user_agreement:\s*'([^']+)'/); process.stdout.write(m?m[1]:'');")
BUILD_VERSION=$(jq -r '.version' apps/web/dist/version.json 2>/dev/null || echo "unknown")
echo "   📌 Build version: $BUILD_VERSION"
echo "   📜 Legal docs version: ${DOCS_VERSION:-unknown}"

# === STEP 1: Immutable assets ===
echo ""
echo "📦 [PWA] Uploading immutable assets (1y cache)..."
aws s3 sync apps/web/dist/ s3://${YC_BUCKET_PWA}/ \
  --endpoint-url=${YC_ENDPOINT} \
  --exclude "index.html" \
  --exclude "sw.js" \
  --exclude "version.json" \
  --exclude "build-meta.json" \
  --exclude "whats-new.json" \
  --exclude "manifest.json" \
  --exclude "manifest.webmanifest" \
  --exclude "heys_*.js" \
  --exclude "react-bundle.js" \
  --exclude "react-bundle.js.gz" \
  --exclude "*.bundle.*.js" \
  --exclude "*.bundle.*.js.gz" \
  --exclude "day/*" \
  --exclude "advice/*" \
  --cache-control "public, max-age=31536000, immutable"

# === STEP 1.5: Gzipped bundles with Content-Encoding ===
echo ""
echo "🗜️ [PWA] Uploading gzipped bundles (Content-Encoding: gzip)..."
GZ_COUNT=0
for gzfile in apps/web/dist/*.bundle.*.js.gz; do
  [ -f "$gzfile" ] || continue
  jsname=$(basename "${gzfile%.gz}")
  aws s3 cp "$gzfile" s3://${YC_BUCKET_PWA}/$jsname \
    --endpoint-url=${YC_ENDPOINT} \
    --cache-control "public, max-age=31536000, immutable" \
    --content-type "application/javascript" \
    --content-encoding "gzip" --quiet &
  GZ_COUNT=$((GZ_COUNT + 1))
done
wait
echo "   ✅ $GZ_COUNT gzipped bundles"

# === STEP 2: Mutable JS files (no cache) ===
echo ""
echo "📜 [PWA] Uploading mutable heys_*.js (no cache)..."
JS_UPLOAD=0
for jsfile in apps/web/dist/heys_*.js; do
  [ -f "$jsfile" ] || continue
  filename=$(basename "$jsfile")
  aws s3 cp "$jsfile" s3://${YC_BUCKET_PWA}/$filename \
    --endpoint-url=${YC_ENDPOINT} \
    --cache-control "public, max-age=0, must-revalidate" \
    --content-type "application/javascript" --quiet &
  JS_UPLOAD=$((JS_UPLOAD + 1))
done
wait
echo "   ✅ $JS_UPLOAD heys_*.js files"
[ "$JS_UPLOAD" -lt 50 ] && { echo "❌ Expected 50+ uploads, got $JS_UPLOAD"; exit 1; }

# === STEP 2.1: React bundle ===
if [ -f apps/web/dist/react-bundle.js.gz ]; then
  echo "⚛️ [PWA] Uploading react-bundle.js (gzipped)..."
  aws s3 cp apps/web/dist/react-bundle.js.gz s3://${YC_BUCKET_PWA}/react-bundle.js \
    --endpoint-url=${YC_ENDPOINT} \
    --cache-control "public, max-age=0, must-revalidate" \
    --content-type "application/javascript" \
    --content-encoding "gzip" --quiet
elif [ -f apps/web/dist/react-bundle.js ]; then
  aws s3 cp apps/web/dist/react-bundle.js s3://${YC_BUCKET_PWA}/react-bundle.js \
    --endpoint-url=${YC_ENDPOINT} \
    --cache-control "public, max-age=0, must-revalidate" \
    --content-type "application/javascript" --quiet
fi

# === STEP 2.5-2.8: Folders ===
for dir in widgets insights day advice; do
  if [ -d "apps/web/dist/$dir" ]; then
    echo "📁 [PWA] Uploading $dir/..."
    aws s3 sync apps/web/dist/$dir/ s3://${YC_BUCKET_PWA}/$dir/ \
      --endpoint-url=${YC_ENDPOINT} \
      --cache-control "public, max-age=0, must-revalidate" --quiet
  fi
done

# === STEP 3: Entry points (no cache) ===
echo ""
echo "📄 [PWA] Uploading entry points (no-cache)..."
upload_no_cache() {
  local src="$1" key="$2" ct="$3"
  [ -f "$src" ] && aws s3 cp "$src" s3://${YC_BUCKET_PWA}/$key \
    --endpoint-url=${YC_ENDPOINT} \
    --cache-control "no-cache, no-store, must-revalidate" \
    --content-type "$ct" --quiet
}
upload_no_cache apps/web/dist/index.html       index.html       "text/html; charset=utf-8" &
upload_no_cache apps/web/dist/sw.js            sw.js            "application/javascript" &
upload_no_cache apps/web/dist/version.json     version.json     "application/json" &
upload_no_cache apps/web/dist/manifest.json    manifest.json    "application/manifest+json" &
upload_no_cache apps/web/dist/manifest.json    manifest.webmanifest "application/manifest+json" &
upload_no_cache apps/web/dist/build-meta.json  build-meta.json  "application/json" &
upload_no_cache apps/web/dist/whats-new.json   whats-new.json   "application/json" &
wait
echo "   ✅ Entry points uploaded"

# === STEP 4: Legal docs ===
if [ -n "$DOCS_VERSION" ] && [ -d apps/web/dist/docs ]; then
  echo ""
  echo "📋 [PWA] Uploading legal docs (v${DOCS_VERSION})..."
  aws s3 cp apps/web/dist/docs/ s3://${YC_BUCKET_PWA}/docs/v${DOCS_VERSION}/ \
    --recursive --endpoint-url=${YC_ENDPOINT} \
    --cache-control "public, max-age=31536000, immutable" --quiet &
  aws s3 cp apps/web/dist/docs/ s3://${YC_BUCKET_PWA}/docs/ \
    --recursive --endpoint-url=${YC_ENDPOINT} \
    --cache-control "no-cache, no-store, must-revalidate" --quiet &
  wait
fi

echo ""
echo "✅ PWA deployment complete!"

# === Demo mirror ===
echo ""
echo "🪞 [Demo] Mirroring PWA bucket to demo bucket..."
aws s3 sync s3://${YC_BUCKET_PWA}/ s3://${YC_BUCKET_DEMO}/ \
  --endpoint-url=${YC_ENDPOINT} \
  --no-progress
echo "✅ Demo PWA mirror complete!"

# === Landing ===
if [ "$SKIP_LANDING" = "0" ] && [ -d apps/landing/out ]; then
  echo ""
  echo "🌐 [Landing] Uploading..."
  aws s3 sync apps/landing/out/ s3://${YC_BUCKET_LANDING}/ \
    --endpoint-url=${YC_ENDPOINT} \
    --cache-control "public, max-age=31536000, immutable" --quiet
  echo "   ✅ All files uploaded"

  echo "📄 [Landing] Updating HTML (no-cache)..."
  for htmlfile in apps/landing/out/*.html apps/landing/out/**/*.html; do
    [ -f "$htmlfile" ] || continue
    relpath="${htmlfile#apps/landing/out/}"
    aws s3 cp "$htmlfile" "s3://${YC_BUCKET_LANDING}/$relpath" \
      --endpoint-url=${YC_ENDPOINT} \
      --cache-control "no-cache, no-store, must-revalidate" \
      --content-type "text/html; charset=utf-8" --quiet &
  done
  wait
  echo "✅ Landing deployment complete!"
fi

# === CDN invalidate ===
if [ "$SKIP_CDN" = "0" ]; then
  echo ""
  echo "🔄 Purging CDN cache..."
  yc cdn cache purge --resource-id "$CDN_PWA_ID" \
    --path "/" --path "/index.html" --path "/sw.js" \
    --path "/manifest.json" --path "/manifest.webmanifest" \
    --path "/version.json" --path "/build-meta.json" \
    --path "/whats-new.json" || true

  JS_PATHS=""
  for jsfile in apps/web/dist/heys_*.js; do
    [ -f "$jsfile" ] || continue
    JS_PATHS="$JS_PATHS --path /$(basename "$jsfile")"
  done
  if [ -n "$JS_PATHS" ]; then
    yc cdn cache purge --resource-id "$CDN_PWA_ID" $JS_PATHS || true
  fi

  yc cdn cache purge --resource-id "$CDN_PWA_ID" --path "/react-bundle.js" || true

  if [ -n "$DOCS_VERSION" ]; then
    yc cdn cache purge --resource-id "$CDN_PWA_ID" \
      --path "/docs/user-agreement.md" \
      --path "/docs/privacy-policy.md" \
      --path "/docs/consent-forms.md" \
      --path "/docs/chat-rules.md" \
      --path "/docs/v${DOCS_VERSION}/user-agreement.md" \
      --path "/docs/v${DOCS_VERSION}/privacy-policy.md" \
      --path "/docs/v${DOCS_VERSION}/consent-forms.md" \
      --path "/docs/v${DOCS_VERSION}/chat-rules.md" || true
  fi

  if [ "$SKIP_LANDING" = "0" ]; then
    yc cdn cache purge --resource-id "$CDN_LANDING_ID" \
      --path "/" --path "/index.html" || true
  fi
  echo "   ✅ CDN purged"
fi

# === Health check ===
echo ""
echo "🏥 Health checks..."
PWA_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${YC_ENDPOINT}/${YC_BUCKET_PWA}/index.html")
DEMO_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${YC_ENDPOINT}/${YC_BUCKET_DEMO}/index.html")
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://api.heyslab.ru/health")
LANDING_STATUS="skipped"
if [ "$SKIP_LANDING" = "0" ]; then
  LANDING_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${YC_ENDPOINT}/${YC_BUCKET_LANDING}/index.html")
fi
echo "   PWA origin:     $PWA_STATUS"
echo "   Demo origin:    $DEMO_STATUS"
echo "   Landing origin: $LANDING_STATUS"
echo "   API:            $API_STATUS"

echo ""
echo "🎉 Deploy complete!"
echo "   Build version:  $BUILD_VERSION"
echo "   PWA:            https://app.heyslab.ru"
echo "   Demo PWA:       https://try.heyslab.ru"
echo "   Landing:        https://heyslab.ru"
echo "   API:            https://api.heyslab.ru"
echo ""
echo "ℹ️  CDN propagation can take a few minutes."
