# HEYS Telegram Mini App

Панель куратора для работы с клиентами HEYS внутри Telegram.

## Быстрый старт

```bash
# Из корня монорепо
pnpm install

# Запуск dev-сервера
cd apps/tg-mini
pnpm dev
```

Откроется на `http://localhost:3002`

## Структура

```
apps/tg-mini/
├── src/
│   ├── App.tsx          # Главный компонент
│   └── main.tsx         # Entry point
├── index.html           # HTML template
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Roadmap

См. `/mini_app_logic` в корне проекта.

## Telegram WebApp

Для работы в Telegram требуется:
1. Создать бота через @BotFather
2. Настроить Web App URL (ngrok/cloudflare tunnel для локальной разработки)
3. Добавить кнопку открытия mini-app в боте

Документация: https://core.telegram.org/bots/webapps

## Production

Чек-лист для боевого деплоя описан в `../../TELEGRAM_MINI_APP_PRODUCTION.md`.
