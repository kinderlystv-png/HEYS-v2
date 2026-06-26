#!/bin/bash
# Deploy heys-api-rpc with Lockbox secret integration

set -e

echo "🚀 Deploying heys-api-rpc with Lockbox PG_PASSWORD..."

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

if [[ -z "${LOCKBOX_PG_SECRET_ID:-}" ]]; then
  echo "❌ LOCKBOX_PG_SECRET_ID is not set. Aborting deploy."
  exit 1
fi

SERVICE_ACCOUNT_NAME="heys-function-invoker"
SA_ID=$(yc iam service-account get "$SERVICE_ACCOUNT_NAME" --format json 2>/dev/null | jq -r '.id')
if [[ -z "$SA_ID" || "$SA_ID" == "null" ]]; then
  echo "❌ Service account not found: $SERVICE_ACCOUNT_NAME"
  exit 1
fi

# Secret ID from Lockbox
SECRET_ID="${LOCKBOX_PG_SECRET_ID}"
# VERSION_ID removed to always use latest

# DB user MUST match whichever password is stored in Lockbox under postgresql_password.
# CI / deploy-all.sh use GitHub secrets PG_USER (typically heys_admin). Using heys_rpc here with an
# admin-only Lockbox password breaks every RPC with "Database connection failed" (auth error).
RPC_PG_USER="${PG_USER:-heys_admin}"
echo "   PG_USER=${RPC_PG_USER} (set PG_USER=heys_rpc only if Lockbox postgresql_password is that role’s password)"

# Yandex CF rejects empty env values — omit optional agent vars until set.
ENVIRONMENT_VARS="PG_HOST=rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net,PG_PORT=6432,PG_DATABASE=heys_production,PG_USER=${RPC_PG_USER},HEYS_ENCRYPTION_KEY=${HEYS_ENCRYPTION_KEY},JWT_SECRET=${JWT_SECRET}"
if [[ -n "${PLANNING_AGENT_SECRET:-}" ]]; then
  ENVIRONMENT_VARS="${ENVIRONMENT_VARS},PLANNING_AGENT_SECRET=${PLANNING_AGENT_SECRET}"
fi
if [[ -n "${PLANNING_AGENT_ALLOWED_CLIENT_IDS:-}" ]]; then
  ENVIRONMENT_VARS="${ENVIRONMENT_VARS},PLANNING_AGENT_ALLOWED_CLIENT_IDS=${PLANNING_AGENT_ALLOWED_CLIENT_IDS}"
fi

yc serverless function version create \
  --function-name heys-api-rpc \
  --runtime nodejs18 \
  --entrypoint index.handler \
  --memory 512m \
  --execution-timeout 30s \
  --source-path . \
  --service-account-id "$SA_ID" \
  --environment "$ENVIRONMENT_VARS" \
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
