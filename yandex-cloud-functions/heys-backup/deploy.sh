#!/bin/bash

# HEYS Backup Cloud Function Deployment Script
# 
# Usage:
#   ./deploy.sh [--dry-run]
#
# Environment variables required:
#   YC_FOLDER_ID - Yandex Cloud Folder ID
#   PG_PASSWORD - PostgreSQL password
#   S3_ACCESS_KEY_ID - S3 Access Key ID
#   S3_SECRET_ACCESS_KEY - S3 Secret Access Key
#   TELEGRAM_BOT_TOKEN - Telegram bot token (optional)
#   TELEGRAM_CHAT_ID - Telegram chat ID (optional)
#
# Security Note:
#   For production deployments, consider using Yandex Lockbox (secret management service)
#   instead of environment variables. See: https://cloud.yandex.com/docs/lockbox/

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
FUNCTION_NAME="heys-backup"
RUNTIME="nodejs18"
MEMORY="512m"
TIMEOUT="600s"
SERVICE_ACCOUNT_NAME="heys-backup-sa"
TRIGGER_NAME="heys-backup-daily"
CRON_EXPRESSION="0 3 * * ? *"

# Check if dry-run mode
DRY_RUN=false
if [[ "$1" == "--dry-run" ]]; then
  DRY_RUN=true
  echo -e "${YELLOW}[DRY RUN MODE]${NC}"
fi

echo -e "${GREEN}=== HEYS Backup Deployment ===${NC}"
echo ""

# Check required environment variables
check_env() {
  local var_name=$1
  local is_optional=$2
  
  if [ -z "${!var_name}" ]; then
    if [ "$is_optional" == "true" ]; then
      echo -e "${YELLOW}⚠️  $var_name not set (optional)${NC}"
    else
      echo -e "${RED}❌ $var_name not set${NC}"
      exit 1
    fi
  else
    if [[ "$var_name" == *"PASSWORD"* ]] || [[ "$var_name" == *"KEY"* ]] || [[ "$var_name" == *"TOKEN"* ]]; then
      echo -e "${GREEN}✅ $var_name set (***hidden***)${NC}"
    else
      echo -e "${GREEN}✅ $var_name set: ${!var_name}${NC}"
    fi
  fi
}

echo "Checking environment variables..."
check_env "YC_FOLDER_ID" false
check_env "PG_PASSWORD" false
check_env "S3_ACCESS_KEY_ID" false
check_env "S3_SECRET_ACCESS_KEY" false
check_env "TELEGRAM_BOT_TOKEN" true
check_env "TELEGRAM_CHAT_ID" true
echo ""

# Build package
echo "Building package..."
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Create ZIP archive
echo "Creating ZIP archive..."
rm -f heys-backup.zip
zip -r heys-backup.zip index.js package.json node_modules/ > /dev/null
ZIP_SIZE=$(du -h heys-backup.zip | cut -f1)
echo -e "${GREEN}✅ Archive created: heys-backup.zip ($ZIP_SIZE)${NC}"
echo ""

if [ "$DRY_RUN" == "true" ]; then
  echo -e "${YELLOW}[DRY RUN] Skipping deployment${NC}"
  exit 0
fi

# Create or update service account
echo "Checking service account..."
SA_ID=$(yc iam service-account get $SERVICE_ACCOUNT_NAME --folder-id=$YC_FOLDER_ID --format=json 2>/dev/null | jq -r '.id // empty')

if [ -z "$SA_ID" ]; then
  echo "Creating service account..."
  SA_ID=$(yc iam service-account create \
    --name=$SERVICE_ACCOUNT_NAME \
    --description="Service account for HEYS backup function" \
    --folder-id=$YC_FOLDER_ID \
    --format=json | jq -r '.id')
  echo -e "${GREEN}✅ Service account created: $SA_ID${NC}"
  
  # Grant storage.editor role
  yc resource-manager folder add-access-binding $YC_FOLDER_ID \
    --role=storage.editor \
    --service-account-id=$SA_ID
  echo -e "${GREEN}✅ Role storage.editor granted${NC}"
else
  echo -e "${GREEN}✅ Service account exists: $SA_ID${NC}"
fi
echo ""

# Create or update function
echo "Checking Cloud Function..."
FUNCTION_ID=$(yc serverless function get $FUNCTION_NAME --folder-id=$YC_FOLDER_ID --format=json 2>/dev/null | jq -r '.id // empty')

if [ -z "$FUNCTION_ID" ]; then
  echo "Creating function..."
  FUNCTION_ID=$(yc serverless function create \
    --name=$FUNCTION_NAME \
    --description="HEYS PostgreSQL backup to Object Storage" \
    --folder-id=$YC_FOLDER_ID \
    --format=json | jq -r '.id')
  echo -e "${GREEN}✅ Function created: $FUNCTION_ID${NC}"
else
  echo -e "${GREEN}✅ Function exists: $FUNCTION_ID${NC}"
fi

# Create new version
echo "Deploying function version..."
VERSION_ID=$(yc serverless function version create \
  --function-id=$FUNCTION_ID \
  --runtime=$RUNTIME \
  --entrypoint=index.handler \
  --memory=$MEMORY \
  --execution-timeout=$TIMEOUT \
  --source-path=./heys-backup.zip \
  --service-account-id=$SA_ID \
  --environment PG_HOST=${PG_HOST:-rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net} \
  --environment PG_PORT=${PG_PORT:-6432} \
  --environment PG_DATABASE=${PG_DATABASE:-heys_production} \
  --environment PG_USER=${PG_USER:-heys_admin} \
  --environment PG_PASSWORD=$PG_PASSWORD \
  --environment S3_ACCESS_KEY_ID=$S3_ACCESS_KEY_ID \
  --environment S3_SECRET_ACCESS_KEY=$S3_SECRET_ACCESS_KEY \
  --environment S3_BUCKET=${S3_BUCKET:-heys-backups} \
  --environment S3_ENDPOINT=${S3_ENDPOINT:-https://storage.yandexcloud.net} \
  --environment BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-7} \
  $([ -n "$TELEGRAM_BOT_TOKEN" ] && echo "--environment TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN") \
  $([ -n "$TELEGRAM_CHAT_ID" ] && echo "--environment TELEGRAM_CHAT_ID=$TELEGRAM_CHAT_ID") \
  --folder-id=$YC_FOLDER_ID \
  --format=json | jq -r '.id')

echo -e "${GREEN}✅ Version deployed: $VERSION_ID${NC}"
echo ""

# Create or update trigger
echo "Checking Timer Trigger..."
TRIGGER_ID=$(yc serverless trigger get $TRIGGER_NAME --folder-id=$YC_FOLDER_ID --format=json 2>/dev/null | jq -r '.id // empty')

if [ -z "$TRIGGER_ID" ]; then
  echo "Creating trigger..."
  TRIGGER_ID=$(yc serverless trigger create timer \
    --name=$TRIGGER_NAME \
    --cron-expression="$CRON_EXPRESSION" \
    --invoke-function-id=$FUNCTION_ID \
    --invoke-function-service-account-id=$SA_ID \
    --folder-id=$YC_FOLDER_ID \
    --format=json | jq -r '.id')
  echo -e "${GREEN}✅ Trigger created: $TRIGGER_ID${NC}"
  echo -e "${GREEN}   Cron: $CRON_EXPRESSION (daily at 03:00 UTC)${NC}"
else
  echo -e "${GREEN}✅ Trigger exists: $TRIGGER_ID${NC}"
  echo -e "${YELLOW}   Note: To update cron, delete and recreate trigger${NC}"
fi
echo ""

# Test function (optional)
read -p "Do you want to test the function now? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "Invoking function..."
  yc serverless function invoke $FUNCTION_ID --folder-id=$YC_FOLDER_ID
  echo ""
fi

echo -e "${GREEN}=== Deployment Complete ===${NC}"
echo ""
echo "Next steps:"
echo "  1. Check logs: yc serverless function logs $FUNCTION_NAME --folder-id=$YC_FOLDER_ID --follow"
echo "  2. Monitor S3 bucket: aws s3 ls s3://heys-backups/ --endpoint-url https://storage.yandexcloud.net"
echo "  3. Check Telegram notifications (if configured)"
echo ""
echo "Backup schedule: Daily at 03:00 UTC"
echo "Retention: ${BACKUP_RETENTION_DAYS:-7} days"
