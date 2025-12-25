#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# 🔐 P1 Security Migration Script
# Безопасное применение миграций (секреты из переменных окружения)
# ═══════════════════════════════════════════════════════════════════

set -e

echo "═══════════════════════════════════════════════════════════════"
echo "🔐 HEYS P1 Security Migration"
echo "═══════════════════════════════════════════════════════════════"

# Проверяем переменные окружения
if [ -z "$PG_PASSWORD" ]; then
  echo "❌ ERROR: PG_PASSWORD environment variable not set!"
  echo ""
  echo "Usage:"
  echo "  export PG_PASSWORD='your_password'"
  echo "  ./apply_p1_security.sh"
  echo ""
  exit 1
fi

# Конфигурация (без секретов!)
PG_HOST="${PG_HOST:-rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net}"
PG_PORT="${PG_PORT:-6432}"
PG_DATABASE="${PG_DATABASE:-heys_production}"
PG_USER="${PG_USER:-heys_admin}"
SSL_MODE="verify-full"
SSL_ROOT_CERT="$(dirname "$0")/../../yandex-cloud-functions/heys-api-rpc/certs/root.crt"

echo "📍 Host: $PG_HOST:$PG_PORT"
echo "📍 Database: $PG_DATABASE"
echo "📍 User: $PG_USER"
echo "📍 SSL: $SSL_MODE"
echo ""

# Функция для выполнения SQL файла
apply_migration() {
  local file="$1"
  local name=$(basename "$file")
  
  echo "📄 Applying: $name"
  
  PGPASSWORD="$PG_PASSWORD" psql \
    -h "$PG_HOST" \
    -p "$PG_PORT" \
    -d "$PG_DATABASE" \
    -U "$PG_USER" \
    "sslmode=$SSL_MODE" \
    "sslrootcert=$SSL_ROOT_CERT" \
    -f "$file" \
    -v ON_ERROR_STOP=1
  
  echo "✅ Done: $name"
  echo ""
}

# Применяем миграции в правильном порядке
SCRIPT_DIR="$(dirname "$0")"
MIGRATIONS_DIR="$SCRIPT_DIR"

echo "═══════════════════════════════════════════════════════════════"
echo "📋 Миграции к применению:"
echo "   1. 2025-12-25_p1_security_rate_limit.sql"
echo "   2. 2025-12-25_p1_runtime_user_heys_rpc.sql"
echo "═══════════════════════════════════════════════════════════════"
echo ""

read -p "Продолжить? (y/N) " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Отменено"
  exit 0
fi

echo ""

# 1. Rate-limit + security_events
if [ -f "$MIGRATIONS_DIR/2025-12-25_p1_security_rate_limit.sql" ]; then
  apply_migration "$MIGRATIONS_DIR/2025-12-25_p1_security_rate_limit.sql"
else
  echo "⚠️  Файл не найден: 2025-12-25_p1_security_rate_limit.sql"
fi

# 2. Runtime user heys_rpc
if [ -f "$MIGRATIONS_DIR/2025-12-25_p1_runtime_user_heys_rpc.sql" ]; then
  apply_migration "$MIGRATIONS_DIR/2025-12-25_p1_runtime_user_heys_rpc.sql"
else
  echo "⚠️  Файл не найден: 2025-12-25_p1_runtime_user_heys_rpc.sql"
fi

echo "═══════════════════════════════════════════════════════════════"
echo "✅ P1 Security миграции применены!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "⚠️ СЛЕДУЮЩИЕ ШАГИ:"
echo ""
echo "1. Сгенерируй пароль для heys_rpc:"
echo "   openssl rand -base64 32"
echo ""
echo "2. Установи пароль в БД:"
echo "   ALTER ROLE heys_rpc WITH PASSWORD '<новый_пароль>';"
echo ""
echo "3. Создай секрет в Yandex Lockbox:"
echo "   yc lockbox secret create --name heys-rpc-password ..."
echo ""
echo "4. Обнови Cloud Function (не через git!):"
echo "   - PG_USER=heys_rpc"
echo "   - PG_PASSWORD из Lockbox"
echo ""
