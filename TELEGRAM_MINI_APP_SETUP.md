# Telegram Mini App Setup (HEYS v2)

> Этот файл описывает **локальный dev-запуск** mini-app и backend для Telegram WebApp **без хранения токенов в репозитории**.

## 1. Предварительные условия

- Node.js ≥ 18
- pnpm ≥ 8
- Установлены зависимости проекта:

```bash
cd /Users/poplavskijanton/HEYS-v2
pnpm install
```

- Создан Telegram-бот через `@BotFather` (см. официальную документацию Telegram Bots API).

## 2. Конфигурация окружения

### 2.1. Переменные окружения backend

Создайте локальный файл окружения (НЕ коммитьте его в git):

```bash
cd /Users/poplavskijanton/HEYS-v2
cp .env .env.local 2>/dev/null || touch .env.local
```

Откройте `.env.local` и задайте нужные значения:

```dotenv
# API server
API_PORT=4001
DATABASE_NAME=projectB
NODE_ENV=development

# Base URL для Vite-приложений
VITE_API_URL=http://localhost:4001

# Telegram Bot configuration
# Настоящий токен храните только локально, НЕ добавляйте его в коммиты
TELEGRAM_BOT_TOKEN=__REPLACE_WITH_LOCAL_TOKEN__

# Разрешённые Telegram user IDs (через запятую)
# Пример: TELEGRAM_ALLOWED_USER_IDS=123456789,987654321
TELEGRAM_ALLOWED_USER_IDS=
```

Убедитесь, что `.env.local` игнорируется git (в корне репозитория в `.gitignore` должна быть строка):

```gitignore
.env.local
```

> Рекомендация: для "примеров" можно держать `.env.example` **без токенов**, а реальные значения задавать только в `.env.local`.

### 2.2. Telegram WebApp параметры

В настройках вашего бота у `@BotFather` задайте:

- **WebApp URL** – URL вашей мини-апки (в dev-режиме обычно `https://<ngrok-адрес>` или другой публичный туннель, который пробрасывает локальный порт).
- **Allowed domains** – домен, по которому доступен frontend (домен прокси/туннеля).

Локальные адреса `http://localhost:3002` / `http://localhost:3003` нужно пробрасывать наружу через ngrok или аналоги, т.к. Telegram должен иметь возможность обратиться к вашему frontend.

## 3. Запуск backend

Backend HEYS API живёт в `packages/core` и поднимается на `API_PORT` (по умолчанию `4001`).

### Вариант 1: через VS Code task (рекомендуется)

В VS Code есть task:

- `Start API Server (Port 4001)`

Запустите его через интерфейс VS Code (Terminal → Run Task…). Backend стартует на `http://localhost:4001`.

### Вариант 2: вручную из терминала

```bash
cd /Users/poplavskijanton/HEYS-v2
API_PORT=4001 DATABASE_NAME=projectB node packages/core/src/server.js
```

Проверка здоровья сервера:

```bash
curl http://localhost:4001/health
```

Ожидаемый ответ – JSON со статусом `OK`.

## 4. Запуск Telegram mini-app (frontend)

Мини-приложение для Telegram находится в `apps/tg-mini`.

### 4.1. Подготовка `.env.local` для mini-app

```bash
cd /Users/poplavskijanton/HEYS-v2/apps/tg-mini
cp .env.telegram .env.local 2>/dev/null || touch .env.local
```

Убедитесь, что в `.env.local` указаны:

```dotenv
# URL backend API
VITE_API_URL=http://localhost:4001

# Использовать ли клиентские моки
VITE_USE_CLIENT_MOCKS=false
```

### 4.2. Запуск dev-сервера mini-app

```bash
cd /Users/poplavskijanton/HEYS-v2/apps/tg-mini
VITE_API_URL=http://localhost:4001 VITE_USE_CLIENT_MOCKS=false pnpm dev -- --port 3002
```

После старта dev-сервер будет доступен по адресу:

- `http://localhost:3002`

Для Telegram WebApp понадобится внешний URL (через ngrok или другой туннель), который будет проксировать этот порт.

## 5. Проверка интеграции

1. Убедиться, что backend отвечает:

   ```bash
   curl http://localhost:4001/health
   ```

2. Открыть mini-app в браузере по `http://localhost:3002` и в консоли разработчика проверить:
   - нет ли CORS ошибок при запросах к `http://localhost:4001`;
   - ответы API имеют статус HTTP 200.

3. Открыть бота в Telegram и запустить WebApp-кнопку (которую вы настроили через `@BotFather` или через кнопки в самом боте). Интерфейс mini-app должен загрузиться и обращаться к вашему backend.

## 6. Безопасность

- **Никогда** не коммитьте реальные значения `TELEGRAM_BOT_TOKEN` в репозиторий.
- Если токен когда-либо попал в:
  - git-историю,
  - терминал, записанный в логи,
  - переписку, скриншоты,

  — немедленно выполните `/revoke` у `@BotFather` и сгенерируйте новый токен.

- Для продакшн-среды используйте секреты CI/CD или переменные окружения на сервере.

## 7. Краткая памятка команд

```bash
# Установить зависимости
cd /Users/poplavskijanton/HEYS-v2
pnpm install

# Запустить backend (через task или вручную)
# Task: Start API Server (Port 4001)
# Либо вручную:
API_PORT=4001 DATABASE_NAME=projectB node packages/core/src/server.js

# Запустить Telegram mini-app (dev)
cd /Users/poplavskijanton/HEYS-v2/apps/tg-mini
VITE_API_URL=http://localhost:4001 VITE_USE_CLIENT_MOCKS=false pnpm dev -- --port 3002
```

Этого минимального набора шагов достаточно, чтобы развернуть и протестировать Telegram mini-app локально, не храня секреты в репозитории и не полагаясь на память.
