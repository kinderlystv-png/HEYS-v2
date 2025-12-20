#!/bin/bash
# Скрипт для сборки ZIP архивов Cloud Functions

set -e

echo "📦 Сборка HEYS Cloud Functions..."

cd "$(dirname "$0")"

# Цвета
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

build_function() {
    local name=$1
    echo -e "${BLUE}📁 Сборка $name...${NC}"
    
    cd "$name"
    
    # Устанавливаем зависимости если есть
    if [ -f "package.json" ]; then
        if grep -q '"dependencies"' package.json && ! grep -q '"dependencies": {}' package.json; then
            npm install --production
        fi
    fi
    
    # Создаём ZIP
    rm -f "../$name.zip"
    zip -r "../$name.zip" . -x "*.DS_Store*"
    
    cd ..
    
    echo -e "${GREEN}✅ $name.zip создан${NC}"
}

# Собираем все функции
build_function "heys-api-rpc"
build_function "heys-api-rest"
build_function "heys-api-sms"
build_function "heys-api-leads"
build_function "heys-api-health"

echo ""
echo -e "${GREEN}🎉 Все архивы готовы!${NC}"
echo ""
echo "Созданные файлы:"
ls -la *.zip

echo ""
echo "Следующие шаги:"
echo "1. Откройте https://console.cloud.yandex.ru"
echo "2. Перейдите в Cloud Functions"
echo "3. Создайте функции и загрузите ZIP файлы"
echo "4. См. DEPLOY_GUIDE.md для полной инструкции"
