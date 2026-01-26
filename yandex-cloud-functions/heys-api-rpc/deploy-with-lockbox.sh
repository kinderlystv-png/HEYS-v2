#!/bin/bash
# Deploy heys-api-rpc with Lockbox secret integration

set -e

echo "🚀 Deploying heys-api-rpc with heys_rpc user..."

if [[ -z "${HEYS_ENCRYPTION_KEY:-}" ]]; then
  echo "❌ HEYS_ENCRYPTION_KEY is not set. Aborting deploy."
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
VERSION_ID="e6qniib4ondhjht85ff1"

yc serverless function version create \
  --function-name heys-api-rpc \
  --runtime nodejs18 \
  --entrypoint index.handler \
  --memory 256m \
  --execution-timeout 30s \
  --source-path . \
  --service-account-id "$SA_ID" \
  --environment "PG_HOST=rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net,PG_PORT=6432,PG_DATABASE=heys_production,PG_USER=heys_rpc,HEYS_ENCRYPTION_KEY=${HEYS_ENCRYPTION_KEY}" \
  --secret "environment-variable=PG_PASSWORD,id=${SECRET_ID},version-id=${VERSION_ID},key=postgresql_password"

echo "✅ Deployed!"
