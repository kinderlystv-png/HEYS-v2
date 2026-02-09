#!/bin/bash
# Просмотр логов Cloud Function heys-api-rpc

echo "🔍 Последние логи heys-api-rpc (за последние 5 минут)..."
echo ""

yc logging read \
  --folder-id=b1gnv1a4q8i6de6atl6n \
  --since="5m ago" \
  --format=json \
  | jq -r '.[] | select(.message != null) | "\(.timestamp) | \(.message)"' \
  | tail -30
