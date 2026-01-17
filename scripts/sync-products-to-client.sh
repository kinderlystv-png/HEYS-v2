#!/bin/bash
# =============================================================================
# HEYS: Синхронизация shared_products клиенту
# =============================================================================
# Копирует все продукты из shared_products в client_kv_store пользователя
#
# Использование:
#   ./scripts/sync-products-to-client.sh <client_id>
#   ./scripts/sync-products-to-client.sh <client_id> --dry-run
#
# Примеры:
#   ./scripts/sync-products-to-client.sh ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a
#   ./scripts/sync-products-to-client.sh ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a --dry-run
# =============================================================================

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Database credentials (Yandex Cloud PostgreSQL)
DB_HOST="rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net"
DB_PORT="6432"
DB_NAME="heys_production"
DB_USER="heys_admin"
DB_PASSWORD="heys007670"

# Connection string
PSQL_CONN="host=$DB_HOST port=$DB_PORT dbname=$DB_NAME user=$DB_USER sslmode=verify-full"

# Функция для выполнения SQL
run_sql() {
    PGPASSWORD="$DB_PASSWORD" psql "$PSQL_CONN" -t -A -c "$1" 2>/dev/null
}

run_sql_verbose() {
    PGPASSWORD="$DB_PASSWORD" psql "$PSQL_CONN" -c "$1"
}

# Проверка аргументов
if [ -z "$1" ]; then
    echo -e "${RED}❌ Ошибка: Не указан client_id${NC}"
    echo ""
    echo "Использование: $0 <client_id> [--dry-run]"
    echo ""
    echo "Доступные клиенты:"
    run_sql "SELECT client_id, (SELECT name FROM clients WHERE id = client_id) as name FROM client_kv_store WHERE k = 'heys_products' GROUP BY client_id ORDER BY name;"
    exit 1
fi

CLIENT_ID="$1"
DRY_RUN=false

if [ "$2" == "--dry-run" ]; then
    DRY_RUN=true
    echo -e "${YELLOW}🔍 DRY RUN MODE - изменения НЕ будут применены${NC}"
    echo ""
fi

# Валидация UUID формата
if ! [[ "$CLIENT_ID" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
    echo -e "${RED}❌ Ошибка: Неверный формат client_id (ожидается UUID)${NC}"
    exit 1
fi

echo -e "${BLUE}📦 HEYS: Синхронизация продуктов${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Проверка существования клиента
CLIENT_NAME=$(run_sql "SELECT name FROM clients WHERE id = '$CLIENT_ID';")
if [ -z "$CLIENT_NAME" ]; then
    echo -e "${RED}❌ Клиент с ID $CLIENT_ID не найден${NC}"
    exit 1
fi

echo -e "👤 Клиент: ${GREEN}$CLIENT_NAME${NC}"
echo -e "🔑 ID: $CLIENT_ID"
echo ""

# Подсчёт текущих продуктов
CURRENT_COUNT=$(run_sql "SELECT COALESCE(jsonb_array_length(v), 0) FROM client_kv_store WHERE client_id = '$CLIENT_ID' AND k = 'heys_products';")
CURRENT_COUNT=${CURRENT_COUNT:-0}

# Подсчёт shared_products
SHARED_COUNT=$(run_sql "SELECT COUNT(*) FROM shared_products;")

echo -e "📊 Текущих продуктов у клиента: ${YELLOW}$CURRENT_COUNT${NC}"
echo -e "📊 Продуктов в shared_products: ${GREEN}$SHARED_COUNT${NC}"
echo ""

if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}🔍 DRY RUN: Будет скопировано $SHARED_COUNT продуктов${NC}"
    echo -e "${YELLOW}   Замена: $CURRENT_COUNT → $SHARED_COUNT${NC}"
    exit 0
fi

# Подтверждение
echo -e "${YELLOW}⚠️  Внимание: Текущие продукты клиента будут заменены!${NC}"
read -p "Продолжить? (y/N): " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "Отменено."
    exit 0
fi

echo ""
echo -e "${BLUE}🔄 Синхронизация...${NC}"

# Создаём временный SQL файл
TEMP_SQL=$(mktemp)
cat > "$TEMP_SQL" << 'SQLEOF'
WITH shared_as_jsonb AS (
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', LOWER(REPLACE(gen_random_uuid()::text, '-', '')),
      'name', name,
      'protein100', COALESCE(protein100, 0),
      'carbs100', COALESCE(simple100, 0) + COALESCE(complex100, 0),
      'fat100', COALESCE(badfat100, 0) + COALESCE(goodfat100, 0) + COALESCE(trans100, 0),
      'simple100', COALESCE(simple100, 0),
      'complex100', COALESCE(complex100, 0),
      'badFat100', COALESCE(badfat100, 0),
      'goodFat100', COALESCE(goodfat100, 0),
      'trans100', COALESCE(trans100, 0),
      'fiber100', COALESCE(fiber100, 0),
      'gi', COALESCE(gi, 50),
      'harm', COALESCE(harm, 0),
      'kcal100', ROUND(
        (COALESCE(protein100, 0) * 4 + 
         (COALESCE(simple100, 0) + COALESCE(complex100, 0)) * 4 + 
         (COALESCE(badfat100, 0) + COALESCE(goodfat100, 0) + COALESCE(trans100, 0)) * 9
        )::numeric, 1)
    )
  ) as products
  FROM shared_products
)
UPDATE client_kv_store 
SET v = shared_as_jsonb.products,
    updated_at = NOW()
FROM shared_as_jsonb
WHERE client_id = 'CLIENT_ID_PLACEHOLDER' 
  AND k = 'heys_products';
SQLEOF

# Заменяем placeholder на реальный client_id
sed -i.bak "s/CLIENT_ID_PLACEHOLDER/$CLIENT_ID/g" "$TEMP_SQL"

# Выполняем SQL
PGPASSWORD="$DB_PASSWORD" psql "$PSQL_CONN" -f "$TEMP_SQL" > /dev/null 2>&1

# Очистка
rm -f "$TEMP_SQL" "$TEMP_SQL.bak"

# Проверяем результат
NEW_COUNT=$(run_sql "SELECT jsonb_array_length(v) FROM client_kv_store WHERE client_id = '$CLIENT_ID' AND k = 'heys_products';")

echo ""
echo -e "${GREEN}✅ Готово!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "📊 Было продуктов: ${YELLOW}$CURRENT_COUNT${NC}"
echo -e "📊 Стало продуктов: ${GREEN}$NEW_COUNT${NC}"
echo ""
