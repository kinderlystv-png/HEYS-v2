#!/bin/bash
# Deploy heys-api-rpc with Lockbox secret integration

set -e

echo "🚀 Deploying heys-api-rpc with heys_rpc user..."

# Secret ID from Lockbox
SECRET_ID="e6qcc920n15ja2tj2s2d"
VERSION_ID="e6q6igg5ca47kvo6tspr"

yc serverless function version create \
  --function-name heys-api-rpc \
  --runtime nodejs18 \
  --entrypoint index.handler \
  --memory 256m \
  --execution-timeout 30s \
  --source-path . \
  --environment "PG_HOST=rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net,PG_PORT=6432,PG_DATABASE=heys_production,PG_USER=heys_rpc" \
  --secret "environment-variable=PG_PASSWORD,id=${SECRET_ID},version-id=${VERSION_ID},key=postgresql_password"

echo "✅ Deployed!"
