#!/bin/bash
# Deploy heys-client-daily-backup to Yandex Cloud Functions
# Usage: ./deploy.sh
#
# Prerequisites:
#   - yc CLI authenticated
#   - ../certs/root.crt present
#   - npm install done
#   - .env with: PG_PASSWORD, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ENV_FILE="$SCRIPT_DIR/../.env"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Load .env
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}❌ .env not found at $ENV_FILE${NC}"
    exit 1
fi
source "$ENV_FILE"

# Validate required vars
for var in PG_PASSWORD S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY; do
    if [ -z "${!var}" ]; then
        echo -e "${RED}❌ $var is not set in .env${NC}"
        exit 1
    fi
done

# Ensure node_modules exist
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo -e "${BLUE}📦 Installing dependencies...${NC}"
    cd "$SCRIPT_DIR" && npm install
fi

# Copy .ycignore
cp "$SCRIPT_DIR/../.ycignore" "$SCRIPT_DIR/.ycignore" 2>/dev/null || true

echo -e "${YELLOW}🚀 Deploying heys-client-daily-backup...${NC}"
echo -e "${BLUE}   Runtime: nodejs22 | Memory: 256m | Timeout: 300s${NC}"

# Build env flags
ENV_FLAGS=""
ENV_FLAGS+=" --environment PG_HOST=${PG_HOST:-rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net}"
ENV_FLAGS+=" --environment PG_PORT=${PG_PORT:-6432}"
ENV_FLAGS+=" --environment PG_DATABASE=${PG_DATABASE:-heys_production}"
ENV_FLAGS+=" --environment PG_USER=${PG_USER:-heys_admin}"
ENV_FLAGS+=" --environment PG_PASSWORD=$PG_PASSWORD"
ENV_FLAGS+=" --environment S3_ACCESS_KEY_ID=$S3_ACCESS_KEY_ID"
ENV_FLAGS+=" --environment S3_SECRET_ACCESS_KEY=$S3_SECRET_ACCESS_KEY"

if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
    ENV_FLAGS+=" --environment TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN"
fi
if [ -n "$TELEGRAM_CHAT_ID" ]; then
    ENV_FLAGS+=" --environment TELEGRAM_CHAT_ID=$TELEGRAM_CHAT_ID"
fi

# Deploy
cd "$SCRIPT_DIR"
eval yc serverless function version create \
    --function-name heys-client-daily-backup \
    --runtime nodejs22 \
    --entrypoint index.handler \
    --memory 256m \
    --execution-timeout 300s \
    --source-path . \
    $ENV_FLAGS

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ heys-client-daily-backup deployed successfully${NC}"
    echo ""
    echo -e "${BLUE}📌 Next steps:${NC}"
    echo -e "   1. Create function (if first time): yc serverless function create --name heys-client-daily-backup"
    echo -e "   2. Create timer trigger:"
    echo -e "      yc serverless trigger create timer \\"
    echo -e "        --name heys-client-daily-backup-trigger \\"
    echo -e "        --cron-expression '0 1 * * ? *' \\"
    echo -e "        --invoke-function-name heys-client-daily-backup \\"
    echo -e "        --invoke-function-service-account-name heys-backup-sa"
    echo ""
    echo -e "   3. Manual test: yc serverless function invoke --name heys-client-daily-backup"
else
    echo -e "${RED}❌ Deploy failed${NC}"
    exit 1
fi
