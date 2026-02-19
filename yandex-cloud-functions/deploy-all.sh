#!/bin/bash
# 🚀 Centralized Deployment Script for Yandex Cloud Functions
# Reads secrets from .env file and deploys all functions with consistent configuration
# Usage: ./deploy-all.sh [function-name] or ./deploy-all.sh (deploys all)

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ENV_FILE="$SCRIPT_DIR/.env"
VALIDATE_SCRIPT="$SCRIPT_DIR/validate-env.sh"

# Check if .env exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}❌ ERROR: .env file not found!${NC}"
    echo -e "${YELLOW}📝 Copy .env.example to .env and fill with actual values:${NC}"
    echo "   cp .env.example .env"
    exit 1
fi

# Run validation script if available
if [ -f "$VALIDATE_SCRIPT" ]; then
    echo -e "${BLUE}🔍 Running .env validation...${NC}"
    if ! "$VALIDATE_SCRIPT"; then
        echo -e "${RED}❌ .env validation failed! Fix errors before deploying.${NC}"
        exit 1
    fi
    echo ""
fi

# Load environment variables from .env
echo -e "${BLUE}📥 Loading secrets from .env...${NC}"
source "$ENV_FILE"

# Validate required variables (fallback if validate-env.sh not found)
required_vars=("PG_HOST" "PG_PORT" "PG_DATABASE" "PG_USER" "PG_PASSWORD")
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo -e "${RED}❌ ERROR: $var is not set in .env${NC}"
        exit 1
    fi
done

echo -e "${GREEN}✅ All required variables loaded${NC}"
echo -e "${BLUE}🔐 PG_PASSWORD: ${PG_PASSWORD:0:4}...${PG_PASSWORD: -4}${NC}"

# Validate per-function secrets
validate_function_env() {
    local func_name=$1

    if [[ "$func_name" =~ (rpc|auth) ]]; then
        if [ -z "$JWT_SECRET" ]; then
            echo -e "${RED}❌ ERROR: JWT_SECRET is not set in .env (required for $func_name)${NC}"
            exit 1
        fi
    fi

    if [[ "$func_name" == "heys-api-auth" ]]; then
        if [ -z "$SESSION_SECRET" ]; then
            echo -e "${RED}❌ ERROR: SESSION_SECRET is not set in .env (required for $func_name)${NC}"
            exit 1
        fi
    fi
}

# Get function configuration
get_function_config() {
    local func_name=$1
    case "$func_name" in
        "heys-api-rpc")
            echo "nodejs18 index.handler 512m 30s" ;;
        "heys-api-rest")
            echo "nodejs18 index.handler 512m 30s" ;;
        "heys-api-auth")
            echo "nodejs18 index.handler 256m 30s" ;;
        "heys-api-leads")
            echo "nodejs18 index.handler 256m 30s" ;;
        "heys-api-sms")
            echo "nodejs18 index.handler 128m 10s" ;;
        "heys-api-health")
            echo "nodejs18 index.handler 128m 5s" ;;
        *)
            echo "" ;;
    esac
}

# Build common environment flags
build_env_flags() {
    local func_name=$1
    local env_flags=""
    
    # Common PostgreSQL settings (for all functions except health and sms)
    if [[ ! "$func_name" =~ (health|sms) ]]; then
        env_flags+=" --environment PG_HOST=$PG_HOST"
        env_flags+=" --environment PG_PORT=$PG_PORT"
        env_flags+=" --environment PG_DATABASE=$PG_DATABASE"
        env_flags+=" --environment PG_USER=$PG_USER"
        env_flags+=" --environment PG_PASSWORD=$PG_PASSWORD"
        env_flags+=" --environment PG_SSL=$PG_SSL"
    fi
    
    # Telegram settings (for leads, auth)
    if [[ "$func_name" =~ (leads|auth) ]]; then
        if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
            env_flags+=" --environment TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN"
        fi
        if [ -n "$TELEGRAM_CHAT_ID" ]; then
            env_flags+=" --environment TELEGRAM_CHAT_ID=$TELEGRAM_CHAT_ID"
        fi
    fi
    
    # SMS API key (for sms function)
    if [[ "$func_name" == "heys-api-sms" ]]; then
        if [ -n "$SMS_API_KEY" ]; then
            env_flags+=" --environment SMS_API_KEY=$SMS_API_KEY"
        fi
    fi

    # JWT/Session secrets (for rpc/auth)
    if [[ "$func_name" =~ (rpc|auth) ]]; then
        env_flags+=" --environment JWT_SECRET=$JWT_SECRET"
    fi

    if [[ "$func_name" == "heys-api-auth" ]]; then
        env_flags+=" --environment SESSION_SECRET=$SESSION_SECRET"
    fi
    
    echo "$env_flags"
}

# Deploy a single function
deploy_function() {
    local func_name=$1
    local config=$(get_function_config "$func_name")
    
    if [ -z "$config" ]; then
        echo -e "${RED}❌ Unknown function: $func_name${NC}"
        return 1
    fi
    
    read -r runtime entrypoint memory timeout <<< "$config"
    
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}🚀 Deploying $func_name${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    cd "$SCRIPT_DIR/$func_name"
    
    # Ensure .ycignore exists to prevent uploading node_modules and secrets
    if [ ! -f .ycignore ]; then
        echo -e "${BLUE}ℹ️  Copying .ycignore to $func_name...${NC}"
        cp "$SCRIPT_DIR/.ycignore" .
    fi

    # Validate required secrets for this function
    validate_function_env "$func_name"
    
    # Build environment flags
    env_flags=$(build_env_flags "$func_name")
    
    # Deploy function
    eval yc serverless function version create \
        --function-name "$func_name" \
        --runtime "$runtime" \
        --entrypoint "$entrypoint" \
        --memory "$memory" \
        --execution-timeout "$timeout" \
        --source-path . \
        $env_flags
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ $func_name deployed successfully${NC}"
    else
        echo -e "${RED}❌ Failed to deploy $func_name${NC}"
        exit 1
    fi
    
    cd "$SCRIPT_DIR"
}

# Main execution
if [ -n "$1" ]; then
    # Deploy single function
    deploy_function "$1"
else
    # Deploy all functions
    echo -e "${YELLOW}🚀 Deploying all functions...${NC}"
    for func_name in heys-api-rpc heys-api-rest heys-api-auth heys-api-leads heys-api-sms heys-api-health; do
        deploy_function "$func_name"
    done
    
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✅ All functions deployed successfully!${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
fi
