#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# HEYS Encryption Verification Script
# Проверяет корректность шифрования health_data в client_kv_store
# ═══════════════════════════════════════════════════════════════════════════

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔐 HEYS Encryption Verification"
echo "================================"
echo ""

# Endpoint
API_URL="${API_URL:-https://api.heyslab.ru}"
ORIGIN="${ORIGIN:-https://app.heyslab.ru}"

# ═══════════════════════════════════════════════════════════════════════════
# 1. Проверка что API работает
# ═══════════════════════════════════════════════════════════════════════════
echo -e "📡 ${YELLOW}1. Проверка API доступности...${NC}"

health_response=$(curl -s "$API_URL/health")
if [[ "$health_response" == *"OK"* ]] || [[ "$health_response" == *"ok"* ]]; then
  echo -e "   ${GREEN}✓ API доступен${NC}"
else
  echo -e "   ${RED}✗ API недоступен: $health_response${NC}"
  exit 1
fi

# ═══════════════════════════════════════════════════════════════════════════
# 2. Тест: RPC функция должна работать с шифрованием
# ═══════════════════════════════════════════════════════════════════════════
echo ""
echo -e "🧪 ${YELLOW}2. Проверка RPC функций шифрования...${NC}"

# Тест функции get_shared_products (не требует сессии)
rpc_test=$(curl -s -X POST "$API_URL/rpc?fn=get_shared_products" \
  -H "Content-Type: application/json" \
  -H "Origin: $ORIGIN" \
  -d '{}')

if [[ "$rpc_test" == *"error"* ]] && [[ "$rpc_test" == *"ENCRYPTION_KEY"* ]]; then
  echo -e "   ${RED}✗ КРИТИЧНО: Ключ шифрования не настроен в Cloud Function!${NC}"
  echo "   Response: $rpc_test"
  echo ""
  echo -e "   ${YELLOW}Решение: Добавить HEYS_ENCRYPTION_KEY в переменные окружения функции heys-api-rpc${NC}"
  exit 1
elif [[ "$rpc_test" == *"error"* ]]; then
  echo -e "   ${YELLOW}⚠ RPC вернул ошибку (не связанную с шифрованием): ${rpc_test:0:100}...${NC}"
else
  echo -e "   ${GREEN}✓ RPC работает (шифрование не мешает)${NC}"
fi

# ═══════════════════════════════════════════════════════════════════════════
# 3. SQL-проверки через прямой запрос (если есть доступ к БД)
# ═══════════════════════════════════════════════════════════════════════════
echo ""
echo -e "📊 ${YELLOW}3. SQL-запросы для проверки состояния данных${NC}"
echo ""
echo "Выполните следующие запросы в PostgreSQL для проверки:"
echo ""
cat << 'SQLEOF'
-- ═══════════════════════════════════════════════════════════════════════════
-- ЗАПРОС 1: Статистика шифрования
-- ═══════════════════════════════════════════════════════════════════════════
SELECT 
  count(*) AS total_rows,
  count(*) FILTER (WHERE key_version IS NULL AND is_health_key(k)) AS "❌ plaintext_health (ДОЛЖНО БЫТЬ 0)",
  count(*) FILTER (WHERE key_version = 1) AS "✅ encrypted",
  count(*) FILTER (WHERE NOT is_health_key(k)) AS "📝 non_health (не шифруется)"
FROM client_kv_store;

-- ═══════════════════════════════════════════════════════════════════════════
-- ЗАПРОС 2: Проверка что v очищен для зашифрованных записей
-- (v должен быть {} или null для health_data)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT client_id, k, 
  CASE 
    WHEN v = '{}'::jsonb OR v IS NULL THEN '✅ OK'
    ELSE '❌ PLAINTEXT LEAK!'
  END AS status
FROM client_kv_store
WHERE key_version = 1 AND v != '{}'::jsonb AND v IS NOT NULL
LIMIT 10;

-- ═══════════════════════════════════════════════════════════════════════════
-- ЗАПРОС 3: Тест расшифровки (требует SET heys.encryption_key = 'your-key')
-- ═══════════════════════════════════════════════════════════════════════════
-- SET heys.encryption_key = 'your-32-char-hex-key-here';
SELECT client_id, k, 
  CASE 
    WHEN decrypt_health_data(v_encrypted) IS NOT NULL THEN '✅ Расшифровано'
    ELSE '❌ Ошибка расшифровки'
  END AS decrypt_test
FROM client_kv_store
WHERE key_version = 1
LIMIT 5;

-- ═══════════════════════════════════════════════════════════════════════════
-- ЗАПРОС 4: Список health-ключей в системе
-- ═══════════════════════════════════════════════════════════════════════════
SELECT DISTINCT 
  k,
  is_health_key(k) AS should_encrypt,
  count(*) AS count
FROM client_kv_store
GROUP BY k
ORDER BY is_health_key(k) DESC, count DESC;

SQLEOF

echo ""
echo -e "📋 ${YELLOW}4. Checklist верификации шифрования${NC}"
echo ""
echo "   [ ] 1. HEYS_ENCRYPTION_KEY установлен в Cloud Functions"
echo "   [ ] 2. Все health_data записи имеют key_version = 1"
echo "   [ ] 3. plaintext_health = 0 (нет незашифрованных health данных)"
echo "   [ ] 4. Поле v очищено (= {}) для зашифрованных записей"
echo "   [ ] 5. Расшифровка работает (тест через API или SQL)"
echo "   [ ] 6. Новые записи автоматически шифруются"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# 5. Тест через реальную сессию (если есть тестовый токен)
# ═══════════════════════════════════════════════════════════════════════════
echo -e "🔑 ${YELLOW}5. Тест с реальной сессией (опционально)${NC}"
echo ""
echo "   Для полного теста нужен валидный session_token."
echo "   Пример curl для проверки чтения зашифрованных данных:"
echo ""
cat << 'CURLEOF'
# Чтение профиля (должен расшифроваться автоматически)
curl -s -X POST "https://api.heyslab.ru/rpc?fn=get_client_kv_by_session" \
  -H "Content-Type: application/json" \
  -H "Origin: https://app.heyslab.ru" \
  -d '{"p_session_token": "YOUR_SESSION_TOKEN", "p_key": "heys_profile"}'

# Запись профиля (должен зашифроваться автоматически)
curl -s -X POST "https://api.heyslab.ru/rpc?fn=upsert_client_kv_by_session" \
  -H "Content-Type: application/json" \
  -H "Origin: https://app.heyslab.ru" \
  -d '{
    "p_session_token": "YOUR_SESSION_TOKEN",
    "p_key": "heys_profile",
    "p_value": {"test": "encryption_test_value"}
  }'

CURLEOF

echo ""
echo "═══════════════════════════════════════════════════════════════════════════"
echo -e "${GREEN}✅ Скрипт завершён${NC}"
echo ""
echo "Следующие шаги:"
echo "  1. Выполните SQL-запросы выше в PostgreSQL console"
echo "  2. Убедитесь что plaintext_health = 0"
echo "  3. Протестируйте чтение/запись через приложение"
echo "  4. Проверьте логи Cloud Functions на ошибки расшифровки"
echo ""
