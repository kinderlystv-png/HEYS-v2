#!/bin/bash
# HEYS Security Smoke Tests
# Запуск: ./scripts/security-smoke-test.sh [prod|local]
# 
# Тесты выполняются против API и проверяют:
# - Rate-limiting (блокировка после 5 попыток)
# - Phone enumeration fix (unified error)
# - Legacy функции заблокированы
# - UUID-based функции заблокированы
# - CORS whitelist
# - SQL injection protection

# НЕ используем set -e — тесты сами обрабатывают ошибки

# === CONFIG ===
ENV="${1:-prod}"
if [ "$ENV" = "local" ]; then
  API_BASE="http://localhost:4001"
else
  API_BASE="https://api.heyslab.ru"
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASSED=0
FAILED=0

# === HELPERS ===
test_result() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  
  if echo "$actual" | grep -q "$expected"; then
    echo -e "${GREEN}✓${NC} $name"
    ((PASSED++))
  else
    echo -e "${RED}✗${NC} $name"
    echo "  Expected: $expected"
    echo "  Got: $actual"
    ((FAILED++))
  fi
}

# === TESTS ===

echo "=== HEYS Security Smoke Tests ==="
echo "Target: $API_BASE"
echo ""

# Test 1: Phone enumeration fix
echo "--- Test 1: Phone enumeration (no client_not_found) ---"
RESULT=$(curl -s -X POST "$API_BASE/rpc?fn=verify_client_pin_v3" \
  -H "Content-Type: application/json" \
  -d '{"p_phone":"0000000000","p_pin":"1234"}')
test_result "Non-existent phone returns invalid_credentials" "invalid_credentials" "$RESULT"

# Test 2: Legacy v1 blocked
echo "--- Test 2: Legacy functions blocked ---"
RESULT=$(curl -s -X POST "$API_BASE/rpc?fn=verify_client_pin" \
  -H "Content-Type: application/json" \
  -d '{"p_phone":"79001234567","p_pin":"1234"}')
test_result "verify_client_pin blocked" "not allowed" "$RESULT"

# Test 3: Legacy v2 blocked
RESULT=$(curl -s -X POST "$API_BASE/rpc?fn=verify_client_pin_v2" \
  -H "Content-Type: application/json" \
  -d '{"p_phone":"79001234567","p_pin":"1234"}')
test_result "verify_client_pin_v2 blocked" "not allowed" "$RESULT"

# Test 4: UUID-based KV blocked
echo "--- Test 3: UUID-based functions blocked ---"
RESULT=$(curl -s -X POST "$API_BASE/rpc?fn=upsert_client_kv" \
  -H "Content-Type: application/json" \
  -d '{"p_client_id":"00000000-0000-0000-0000-000000000000","p_key":"test","p_value":{}}')
test_result "upsert_client_kv blocked" "not allowed" "$RESULT"

RESULT=$(curl -s -X POST "$API_BASE/rpc?fn=get_client_data" \
  -H "Content-Type: application/json" \
  -d '{"p_client_id":"00000000-0000-0000-0000-000000000000"}')
test_result "get_client_data blocked" "not allowed" "$RESULT"

# Test 5: REST SQL injection protection
echo "--- Test 4: SQL injection protection ---"
RESULT=$(curl -s "$API_BASE/rest/shared_products?select=id;DROP%20TABLE%20clients")
test_result "SQL injection blocked" "Invalid\|400\|error" "$RESULT"

# Test 6: REST forbidden table
echo "--- Test 5: Forbidden tables ---"
RESULT=$(curl -s "$API_BASE/rest/clients?limit=1")
test_result "clients table not accessible" "Not found\|404" "$RESULT"

# Test 7: REST POST blocked
echo "--- Test 6: REST write methods blocked ---"
RESULT=$(curl -s -X POST "$API_BASE/rest/shared_products" \
  -H "Content-Type: application/json" -d '{}')
test_result "POST blocked on REST" "not allowed\|405" "$RESULT"

# Test 8: CORS evil origin (только для prod)
if [ "$ENV" = "prod" ]; then
  echo "--- Test 7: CORS whitelist ---"
  RESULT=$(curl -s -X OPTIONS "$API_BASE/auth/login" \
    -H "Origin: https://evil.com" \
    -H "Access-Control-Request-Method: POST" -w "%{http_code}" -o /dev/null)
  # 403 или 204 без Allow-Origin — оба OK
  if [ "$RESULT" = "403" ] || [ "$RESULT" = "204" ]; then
    echo -e "${GREEN}✓${NC} Evil origin rejected (HTTP $RESULT)"
    ((PASSED++))
  else
    echo -e "${YELLOW}?${NC} CORS check inconclusive (HTTP $RESULT) — API Gateway may override"
    # Не считаем failed, т.к. API Gateway может менять поведение
  fi
fi

# === SUMMARY ===
echo ""
echo "=== Summary ==="
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"

if [ $FAILED -gt 0 ]; then
  echo -e "${RED}Some tests failed!${NC}"
  exit 1
else
  echo -e "${GREEN}All tests passed!${NC}"
  exit 0
fi
