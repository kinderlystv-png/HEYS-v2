#!/bin/bash
# 🚀 Telegram Mini App — один ngrok, один домен через Vite proxy

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🍏 HEYS Telegram Mini App - Single Domain"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Загружаем environment variables из .env.development.local
if [ -f .env.development.local ]; then
  echo "📝 Загружаем .env.development.local"
  export $(cat .env.development.local | grep -v '^#' | xargs)
else
  echo "⚠️  .env.development.local не найден"
  echo "   Создайте файл с TELEGRAM_BOT_TOKEN и другими переменными"
  echo ""
fi

# Проверяем API сервер
echo "📡 Проверяем API сервер (port 4001)..."
if lsof -i :4001 > /dev/null 2>&1; then
  echo "✅ API сервер уже запущен"
else
  echo "⚠️  API сервер НЕ запущен"
  echo ""
  echo "Запускаем API сервер в фоне..."
  # CORS не нужен — все запросы идут с одного домена через Vite proxy
  node packages/core/src/server.js > logs/api-server.log 2>&1 &
  API_PID=$!
  echo "📝 PID процесса: $API_PID"
  echo ""
  echo "Ждем 5 секунд..."
  sleep 5
  
  if curl -s http://localhost:4001/health > /dev/null 2>&1; then
    echo "✅ API сервер запущен"
  else
    echo "❌ API сервер не отвечает. Проверьте logs/api-server.log"
    exit 1
  fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 Конфигурация:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ VITE_API_URL = '' (пустая строка)"
echo "✅ Vite proxy: /api → localhost:4001"
echo "✅ Один ngrok туннель на порт 3002"
echo "✅ CORS не требуется (один origin)"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Запускаем mini-app (port 3002)..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Запускаем ngrok
if command -v ngrok &> /dev/null; then
  echo "🌐 Запускаем ngrok..."
  
  if [[ "$TERM_PROGRAM" == "iTerm.app" ]]; then
    osascript <<EOF
      tell application "iTerm"
        tell current window
          create tab with default profile
          tell current session
            write text "cd $(pwd) && ngrok http 3002 --domain=tressy-cotyledonoid-vergie.ngrok-free.dev"
          end tell
        end tell
      end tell
EOF
  else
    osascript <<EOF
      tell application "Terminal"
        do script "cd $(pwd) && ngrok http 3002 --domain=tressy-cotyledonoid-vergie.ngrok-free.dev"
      end tell
EOF
  fi
  
  echo "✅ Ngrok запущен в отдельной вкладке"
  echo ""
  echo "🌍 URL: https://tressy-cotyledonoid-vergie.ngrok-free.dev"
  echo "   ↓ (Vite proxy)"
  echo "📡 API: localhost:4001"
  sleep 2
else
  echo "⚠️  ngrok не найден: brew install ngrok"
  echo ""
fi

echo ""
echo "📱 Telegram → @heys_curator_bot"
echo "🐛 Debug Console (иконка 🐛 внизу справа)"
echo ""
echo "Как это работает:"
echo "1. Telegram открывает https://tressy-...ngrok-free.dev"
echo "2. JS делает fetch('/api/...')"
echo "3. Запрос идёт на тот же домен → ngrok → Vite"
echo "4. Vite проксирует /api → localhost:4001"
echo ""
echo "Логи: logs/api-server.log | Ctrl+C для остановки"
echo ""

pnpm run dev:tg-mini
