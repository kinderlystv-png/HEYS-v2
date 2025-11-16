#!/bin/bash
# 🚀 Запуск Telegram Mini App с ngrok для Telegram (двойной туннель)

set -e

# Загружаем переменные окружения из .env.development.local
if [ -f ".env.development.local" ]; then
  echo "📋 Загружаем .env.development.local..."
  export $(grep -v '^#' .env.development.local | xargs)
else
  echo "⚠️  Файл .env.development.local не найден!"
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🍏 HEYS Telegram Mini App - Telegram Mode"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Проверяем API сервер
echo "📡 Проверяем API сервер (port 4001)..."
if lsof -i :4001 > /dev/null 2>&1; then
  echo "✅ API сервер уже запущен"
else
  echo "⚠️  API сервер НЕ запущен"
  echo ""
  echo "Запускаем API сервер в фоне..."
  PORT=4001 API_PORT=4001 NODE_ENV=development DATABASE_NAME=projectB \
  TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}" \
  TELEGRAM_ALLOWED_USER_IDS="1393964759" \
  API_ALLOWED_ORIGINS="https://tressy-cotyledonoid-vergie.ngrok-free.dev" \
  node packages/core/src/server.js > logs/api-server.log 2>&1 &
  API_PID=$!
  echo "📝 PID процесса: $API_PID"
  echo ""
  echo "Ждем 5 секунд для инициализации..."
  sleep 5
  
  # Проверяем health endpoint
  if curl -s http://localhost:4001/health > /dev/null 2>&1; then
    echo "✅ API сервер запущен и отвечает"
  else
    echo "❌ API сервер не отвечает. Проверьте logs/api-server.log"
    exit 1
  fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Запускаем mini-app (port 3002)..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Проверяем наличие ngrok
if ! command -v ngrok &> /dev/null; then
  echo "❌ ngrok не найден. Установите через: brew install ngrok"
  exit 1
fi

echo "🌐 Запускаем ngrok для mini-app (port 3002)..."

# Определяем тип терминала для mini-app ngrok
if [[ "$TERM_PROGRAM" == "iTerm.app" ]]; then
  osascript <<EOF
    tell application "iTerm"
      tell current window
        create tab with default profile
        tell current session
          write text "cd $(pwd) && echo '🌍 Mini-app ngrok' && ngrok http 3002 --domain=tressy-cotyledonoid-vergie.ngrok-free.dev"
        end tell
      end tell
    end tell
EOF
else
  osascript <<EOF
    tell application "Terminal"
      do script "cd $(pwd) && echo '🌍 Mini-app ngrok' && ngrok http 3002 --domain=tressy-cotyledonoid-vergie.ngrok-free.dev"
    end tell
EOF
fi

echo "✅ Ngrok (mini-app) запущен в отдельной вкладке"
sleep 2

echo ""
echo "🌐 Запускаем ngrok для API (port 4001)..."

# Запускаем второй ngrok для API
if [[ "$TERM_PROGRAM" == "iTerm.app" ]]; then
  osascript <<EOF
    tell application "iTerm"
      tell current window
        create tab with default profile
        tell current session
          write text "cd $(pwd) && echo '🔧 API ngrok' && ngrok http 4001"
        end tell
      end tell
    end tell
EOF
else
  osascript <<EOF
    tell application "Terminal"
      do script "cd $(pwd) && echo '🔧 API ngrok' && ngrok http 4001"
    end tell
EOF
fi

echo "✅ Ngrok (API) запущен в отдельной вкладке"
echo ""
sleep 3

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚠️  ВАЖНО: Настройте API URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Скопируй URL из вкладки 'API ngrok' (например: https://abc123.ngrok-free.dev)"
echo "2. Открой новый терминал и выполни:"
echo ""
echo "   export VITE_API_URL=https://YOUR_NGROK_URL"
echo "   pnpm run dev:tg-mini"
echo ""
echo "3. Или измени apps/tg-mini/.env.telegram:"
echo "   VITE_API_URL=https://YOUR_NGROK_URL"
echo ""
echo "Нажми Enter когда настроишь..."
read

echo ""
echo "🌍 URLs:"
echo "   Mini-app: https://tressy-cotyledonoid-vergie.ngrok-free.dev"
echo "   API: (см. вкладку 'API ngrok')"
echo ""
echo "📱 Откройте Telegram → @heys_curator_bot"
echo "🐛 Используйте Debug Console (иконка 🐛 внизу справа)"
echo ""

pnpm run dev:tg-mini
