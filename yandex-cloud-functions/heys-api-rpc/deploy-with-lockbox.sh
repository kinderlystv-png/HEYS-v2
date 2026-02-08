#!/bin/bash
# Deploy heys-api-rpc with Lockbox secret integration

set -e

echo "🚀 Deploying heys-api-rpc with heys_rpc user..."

# === Pre-deploy checks ===
if [[ ! -f "index.js" ]]; then
  echo "❌ index.js not found. Run this script from yandex-cloud-functions/heys-api-rpc/"
  exit 1
fi

if [[ ! -f "shared/db-pool.js" ]]; then
  echo "❌ shared/db-pool.js not found! Deploy will fail with 'Cannot find module' error."
  echo "   Make sure yandex-cloud-functions/heys-api-rpc/shared/ directory exists and contains db-pool.js"
  exit 1
fi

if [[ ! -f "package.json" ]]; then
  echo "❌ package.json not found."
  exit 1
fi

if [[ -z "${HEYS_ENCRYPTION_KEY:-}" ]]; then
  echo "❌ HEYS_ENCRYPTION_KEY is not set. Aborting deploy."
  exit 1
fi

if [[ -z "${JWT_SECRET:-}" ]]; then
  echo "❌ JWT_SECRET is not set. Aborting deploy."
  exit 1
fi

SERVICE_ACCOUNT_NAME="heys-function-invoker"
SA_ID=$(yc iam service-account get "$SERVICE_ACCOUNT_NAME" --format json 2>/dev/null | jq -r '.id')
if [[ -z "$SA_ID" || "$SA_ID" == "null" ]]; then
  echo "❌ Service account not found: $SERVICE_ACCOUNT_NAME"
  exit 1
fi

# Secret ID from Lockbox
SECRET_ID="e6qcc920n15ja2tj2s2d"
# VERSION_ID removed to always use latest

yc serverless function version create \
  --function-name heys-api-rpc \
  --runtime nodejs18 \
  --entrypoint index.handler \
  --memory 256m \
  --execution-timeout 30s \
  --source-path . \
  --service-account-id "$SA_ID" \
  --environment "PG_HOST=rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net,PG_PORT=6432,PG_DATABASE=heys_production,PG_USER=heys_rpc,HEYS_ENCRYPTION_KEY=${HEYS_ENCRYPTION_KEY},JWT_SECRET=${JWT_SECRET}" \
  --secret "environment-variable=PG_PASSWORD,id=${SECRET_ID},key=postgresql_password"

echo "✅ Deployed! Running post-deploy health check..."

# Post-deploy health check (wait for cold start + npm install)
sleep 5
for i in 1 2 3; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    'https://api.heyslab.ru/rpc?fn=get_shared_products' \
    -H 'Content-Type: application/json' \
    -H 'Origin: https://app.heyslab.ru' \
    -d '{}' --max-time 30)
  
  if [[ "$HTTP_CODE" == "200" ]]; then
    echo "✅ Health check passed! (HTTP $HTTP_CODE)"
    exit 0
  fi
  echo "⏳ Attempt $i: HTTP $HTTP_CODE (waiting for cold start...)"
  sleep 10
done

echo "❌ Health check FAILED after 3 attempts! Function may be broken."
echo "   Check logs: yc logging read --group-name=default --limit=20"
exit 1
