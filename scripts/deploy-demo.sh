#!/bin/bash
# Mirror the current production PWA bucket to the demo subdomain bucket.
# Demo mode is activated by hostname at runtime, so try.heyslab.ru must run
# the same artifact as app.heyslab.ru.
#
# Usage:
#   bash scripts/deploy-demo.sh
#
# Optional env:
#   PWA_BUCKET=heys-app DEMO_BUCKET=try-heyslab-ru YC_ENDPOINT=https://storage.yandexcloud.net

set -euo pipefail

PWA_BUCKET="${PWA_BUCKET:-heys-app}"
DEMO_BUCKET="${DEMO_BUCKET:-try-heyslab-ru}"
YC_ENDPOINT="${YC_ENDPOINT:-https://storage.yandexcloud.net}"
CDN_DEMO_ID="${CDN_DEMO_ID:-bc8r24iwog2zxvppd4i4}"

command -v aws >/dev/null || { echo "aws CLI not found"; exit 1; }

echo "Mirroring PWA demo artifact"
echo "  source: s3://${PWA_BUCKET}/"
echo "  target: s3://${DEMO_BUCKET}/"

aws s3 sync "s3://${PWA_BUCKET}/" "s3://${DEMO_BUCKET}/" \
  --endpoint-url="${YC_ENDPOINT}" \
  --no-progress

if command -v yc >/dev/null; then
  echo ""
  echo "Purging demo CDN cache: ${CDN_DEMO_ID}"
  yc cdn cache purge --resource-id "${CDN_DEMO_ID}" \
    --path "/" \
    --path "/index.html" \
    --path "/sw.js" \
    --path "/manifest.json" \
    --path "/manifest.webmanifest" \
    --path "/version.json" \
    --path "/build-meta.json" \
    --path "/whats-new.json" \
    --path "/react-bundle.js" || true
else
  echo ""
  echo "yc CLI not found; skipped demo CDN purge"
fi

echo ""
echo "Build metadata:"
echo "  app:  $(curl -fsS -m 15 "${YC_ENDPOINT}/${PWA_BUCKET}/build-meta.json?bust=$(date +%s)" | tr -d '\n' || echo unavailable)"
echo "  demo: $(curl -fsS -m 15 "${YC_ENDPOINT}/${DEMO_BUCKET}/build-meta.json?bust=$(date +%s)" | tr -d '\n' || echo unavailable)"
echo ""
echo "Done. Smoke test: https://try.heyslab.ru/?gender=male&defaultTab=widgets"
