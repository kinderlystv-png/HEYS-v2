#!/bin/bash
# Validate .env file before deployment
# Usage: ./validate-env.sh (automatically sourced by deploy-all.sh)

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ENV_FILE="$SCRIPT_DIR/.env"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}🔍 Validating .env configuration...${NC}"

# Check if .env exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}❌ ERROR: .env file not found!${NC}"
    echo -e "${YELLOW}Run: cp .env.example .env${NC}"
    exit 1
fi

# Source .env
source "$ENV_FILE"

# Required variables for all functions
REQUIRED_VARS=(
    "PG_HOST"
    "PG_PORT"
    "PG_DATABASE"
    "PG_USER"
    "PG_PASSWORD"
)

# Critical secrets (must be strong)
CRITICAL_SECRETS=(
    "JWT_SECRET"
    "SESSION_SECRET"
)

ERRORS=0
WARNINGS=0

# Check required variables
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        echo -e "${RED}❌ ERROR: $var is not set${NC}"
        ERRORS=$((ERRORS+1))
    else
        echo -e "${GREEN}✅ $var is set${NC}"
    fi
done

# Check critical secrets
for var in "${CRITICAL_SECRETS[@]}"; do
    val="${!var}"
    if [ -z "$val" ]; then
        echo -e "${RED}❌ ERROR: $var is not set${NC}"
        ERRORS=$((ERRORS+1))
    elif [ ${#val} -lt 32 ]; then
        echo -e "${YELLOW}⚠️  WARNING: $var is too short (${#val} < 32 chars)${NC}"
        WARNINGS=$((WARNINGS+1))
    else
        echo -e "${GREEN}✅ $var is strong (${#val} chars)${NC}"
    fi
done

# Validate PG_PASSWORD strength
if [ -n "$PG_PASSWORD" ]; then
    PG_PASS_LEN=${#PG_PASSWORD}
    if [ $PG_PASS_LEN -lt 12 ]; then
        echo -e "${YELLOW}⚠️  WARNING: PG_PASSWORD is weak ($PG_PASS_LEN < 12 chars)${NC}"
        WARNINGS=$((WARNINGS+1))
    fi
fi

# Check for placeholder values
if [[ "$PG_PASSWORD" == *"your_"* ]] || [[ "$JWT_SECRET" == *"your_"* ]]; then
    echo -e "${RED}❌ ERROR: Found placeholder values in .env!${NC}"
    echo -e "${YELLOW}Replace 'your_*' with actual secrets${NC}"
    ERRORS=$((ERRORS+1))
fi

# Summary
echo ""
if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}❌ Validation FAILED: $ERRORS error(s), $WARNINGS warning(s)${NC}"
    exit 1
elif [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Validation PASSED with $WARNINGS warning(s)${NC}"
    exit 0
else
    echo -e "${GREEN}✅ Validation PASSED: All checks OK${NC}"
    exit 0
fi
