#!/bin/bash
# Validate .env file before deployment
# Usage: ./validate-env.sh [--skip-db] [--skip-api] [--ci] (automatically called by deploy-all.sh)
# v2.1 — adds CI mode, faster DB timeout, and optional API check skip

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ENV_FILE="$SCRIPT_DIR/.env"
CHECKSUM_FILE="$SCRIPT_DIR/.env.checksum"

SKIP_DB=false
SKIP_API=false
CI_MODE=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-db)
            SKIP_DB=true
            ;;
        --skip-api)
            SKIP_API=true
            ;;
        --ci)
            CI_MODE=true
            SKIP_DB=true
            SKIP_API=true
            ;;
        *)
            echo "❌ ERROR: Unknown flag: $1"
            exit 1
            ;;
    esac
    shift
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${YELLOW}🔍 Validating .env configuration (v2.1)...${NC}"
if [ "$CI_MODE" = true ]; then
    echo -e "${BLUE}🤖 CI mode enabled — skipping live DB/API checks${NC}"
fi

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

# ─── Step 1: Check required variables ───────────────────────────────
echo -e "${BLUE}📋 Step 1: Required variables${NC}"
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        echo -e "${RED}❌ ERROR: $var is not set${NC}"
        ERRORS=$((ERRORS+1))
    else
        echo -e "${GREEN}✅ $var is set${NC}"
    fi
done

# ─── Step 2: Check critical secrets ─────────────────────────────────
echo -e "${BLUE}📋 Step 2: Critical secrets${NC}"
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
if [[ "$PG_PASSWORD" == *"your_"* ]] || [[ "$JWT_SECRET" == *"your_"* ]] || [[ "$PG_PASSWORD" == *"REPLACE"* ]] || [[ "$JWT_SECRET" == *"REPLACE"* ]]; then
    echo -e "${RED}❌ ERROR: Found placeholder values in .env!${NC}"
    echo -e "${YELLOW}Replace placeholder with actual secrets${NC}"
    ERRORS=$((ERRORS+1))
fi

# ─── Step 3: .env fingerprint check ─────────────────────────────────
echo -e "${BLUE}📋 Step 3: .env fingerprint${NC}"
CURRENT_CHECKSUM=$(shasum -a 256 "$ENV_FILE" | cut -d' ' -f1)
if [ -f "$CHECKSUM_FILE" ]; then
    SAVED_CHECKSUM=$(cat "$CHECKSUM_FILE")
    if [ "$CURRENT_CHECKSUM" == "$SAVED_CHECKSUM" ]; then
        echo -e "${GREEN}✅ .env unchanged since last successful deploy${NC}"
    else
        echo -e "${YELLOW}⚠️  .env was MODIFIED since last successful deploy!${NC}"
        echo -e "${YELLOW}   Saved: ${SAVED_CHECKSUM:0:16}...${NC}"
        echo -e "${YELLOW}   Now:   ${CURRENT_CHECKSUM:0:16}...${NC}"
        echo -e "${YELLOW}   Review changes carefully before deploying.${NC}"
        WARNINGS=$((WARNINGS+1))
    fi
else
    echo -e "${YELLOW}⚠️  No .env checksum found (first deploy or checksum cleared)${NC}"
    WARNINGS=$((WARNINGS+1))
fi

# ─── Step 4: Live DB connectivity test ──────────────────────────────
echo -e "${BLUE}📋 Step 4: Database connectivity${NC}"
if [ "$SKIP_DB" = true ]; then
    echo -e "${YELLOW}⏭️  DB check skipped (--skip-db flag)${NC}"
elif ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}⚠️  psql not found — skipping DB connectivity test${NC}"
    echo -e "${YELLOW}   Install: brew install libpq (macOS) or apt install postgresql-client${NC}"
    WARNINGS=$((WARNINGS+1))
else
    # Test actual connection to the database
    echo -e "${BLUE}   Connecting to $PG_HOST:$PG_PORT/$PG_DATABASE...${NC}"
    DB_RESULT=$(PGPASSWORD="$PG_PASSWORD" PGCONNECT_TIMEOUT=5 PGSSLMODE="${PG_SSL:-prefer}" psql \
        -h "$PG_HOST" \
        -p "$PG_PORT" \
        -U "$PG_USER" \
        -d "$PG_DATABASE" \
        -c "SELECT 'HEYS_DB_OK' AS status;" \
        --no-psqlrc \
        -t -A \
        2>&1) || true

    if echo "$DB_RESULT" | grep -q "HEYS_DB_OK"; then
        echo -e "${GREEN}✅ Database connection OK${NC}"
    else
        echo -e "${RED}❌ ERROR: Cannot connect to database!${NC}"
        echo -e "${RED}   Response: ${DB_RESULT:0:200}${NC}"
        echo -e "${YELLOW}   Check PG_HOST, PG_PORT, PG_USER, PG_PASSWORD in .env${NC}"
        ERRORS=$((ERRORS+1))
    fi
fi

# ─── Step 5: Live API smoke test (JWT_SECRET match) ─────────────────
echo -e "${BLUE}📋 Step 5: Production API smoke test${NC}"
if [ "$SKIP_API" = true ]; then
    echo -e "${YELLOW}⏭️  API check skipped${NC}"
elif command -v curl &> /dev/null; then
    # Test that /health is reachable
    HEALTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://api.heyslab.ru/health" --connect-timeout 5 2>/dev/null || echo "000")
    if [ "$HEALTH_CODE" == "200" ]; then
        echo -e "${GREEN}✅ api.heyslab.ru reachable (HTTP $HEALTH_CODE)${NC}"
    elif [ "$HEALTH_CODE" == "000" ]; then
        echo -e "${YELLOW}⚠️  api.heyslab.ru unreachable (network issue?)${NC}"
        WARNINGS=$((WARNINGS+1))
    else
        echo -e "${YELLOW}⚠️  api.heyslab.ru returned HTTP $HEALTH_CODE${NC}"
        WARNINGS=$((WARNINGS+1))
    fi

    # Test RPC with a known-safe function
    RPC_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "https://api.heyslab.ru/rpc?fn=get_shared_products" \
        -H "Content-Type: application/json" \
        -H "Origin: https://app.heyslab.ru" \
        -d '{}' --connect-timeout 5 2>/dev/null || echo "000")
    if [ "$RPC_CODE" == "200" ]; then
        echo -e "${GREEN}✅ RPC endpoint working (HTTP $RPC_CODE)${NC}"
    else
        echo -e "${YELLOW}⚠️  RPC returned HTTP $RPC_CODE (may need redeployment)${NC}"
        WARNINGS=$((WARNINGS+1))
    fi
else
    echo -e "${YELLOW}⚠️  curl not found — skipping API smoke test${NC}"
    WARNINGS=$((WARNINGS+1))
fi

# ─── Summary ────────────────────────────────────────────────────────
echo ""
if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}❌ Validation FAILED: $ERRORS error(s), $WARNINGS warning(s)${NC}"
    echo -e "${RED}   Deploy BLOCKED — fix errors above before deploying.${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 1
elif [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Validation PASSED with $WARNINGS warning(s)${NC}"
    exit 0
else
    echo -e "${GREEN}✅ Validation PASSED: All checks OK${NC}"
    exit 0
fi
