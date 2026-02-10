#!/bin/bash
# Health Check Script — проверка всех production endpoints
# Usage: ./health-check.sh [--watch]

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

API_URL="https://api.heyslab.ru"
WATCH_MODE=false

if [[ "$1" == "--watch" ]]; then
    WATCH_MODE=true
    echo -e "${BLUE}🔄 Watch mode enabled (checking every 30s, Ctrl+C to stop)${NC}"
fi

check_endpoint() {
    local name=$1
    local method=$2
    local endpoint=$3
    local payload=$4
    local expected_codes=$5  # Comma-separated list of acceptable HTTP codes
    
    if [ "$method" == "POST" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST "$endpoint" \
            -H "Content-Type: application/json" \
            -H "Origin: https://app.heyslab.ru" \
            -d "$payload" 2>&1 || echo -e "\n000")
    else
        response=$(curl -s -w "\n%{http_code}" "$endpoint" \
            -H "Origin: https://app.heyslab.ru" 2>&1 || echo -e "\n000")
    fi
    
    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')  # Remove last line (macOS-compatible)
    
    # Check if code is in expected list
    if [[ ",$expected_codes," == *",$http_code,"* ]]; then
        echo -e "${GREEN}✅ $name${NC} — HTTP $http_code"
        return 0
    else
        echo -e "${RED}❌ $name${NC} — HTTP $http_code (expected: $expected_codes)"
        echo -e "${YELLOW}Response: ${body:0:200}${NC}"
        return 1
    fi
}

run_checks() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}🧪 HEYS API Health Check — $(date '+%Y-%m-%d %H:%M:%S')${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    FAILED=0
    
    check_endpoint "Health" "GET" "$API_URL/health" "" "200" || FAILED=$((FAILED+1))
    check_endpoint "RPC" "POST" "$API_URL/rpc?fn=get_shared_products" '{}' "200" || FAILED=$((FAILED+1))
    check_endpoint "REST" "GET" "$API_URL/rest/shared_products?limit=1" "" "200" || FAILED=$((FAILED+1))
    check_endpoint "Auth Login" "POST" "$API_URL/auth/login" '{"email":"test@test.com","password":"test"}' "400,401,403" || FAILED=$((FAILED+1))
    check_endpoint "SMS" "POST" "$API_URL/sms" '{"phone":"79999999999","action":"send_pin"}' "200,400,429" || FAILED=$((FAILED+1))
    check_endpoint "Leads" "POST" "$API_URL/leads" '{"name":"Test","phone":"79999999999","source":"health_check"}' "200,400,409" || FAILED=$((FAILED+1))
    
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    if [ $FAILED -eq 0 ]; then
        echo -e "${GREEN}✅ All endpoints healthy!${NC}"
        return 0
    else
        echo -e "${RED}❌ $FAILED endpoint(s) failed!${NC}"
        echo -e "${YELLOW}💡 Run: ./deploy-all.sh to redeploy cloud functions${NC}"
        return 1
    fi
}

# Main execution
if [ "$WATCH_MODE" = true ]; then
    while true; do
        run_checks
        echo ""
        echo -e "${BLUE}⏳ Next check in 30s...${NC}"
        sleep 30
        clear
    done
else
    run_checks
fi
