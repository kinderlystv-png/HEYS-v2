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

**Вариант 1: через VS Code task (рекомендуется)**

Запустите task `Start TG Mini (Port 3002)` через интерфейс VS Code (Terminal → Run Task…).

**Вариант 2: вручную из терминала**

```bash
cd /Users/poplavskijanton/HEYS-v2
pnpm run dev:tg-mini
```

Или напрямую:

```bash
cd /Users/poplavskijanton/HEYS-v2
pnpm --filter @heys/tg-mini run dev
```

После старта dev-сервер будет доступен по адресу `http://localhost:3002`.

### 4.3. Настройка ngrok для доступа из Telegram

Для Telegram WebApp нужен внешний HTTPS URL. Используйте ngrok:

```bash
# Установка (если не установлен)
brew install ngrok

# Авторизация (получите токен на https://dashboard.ngrok.com/get-started/your-authtoken)
ngrok config add-authtoken YOUR_NGROK_TOKEN

# Запуск туннеля
ngrok http 3002
```

Скопируйте публичный URL (например, `https://abc123.ngrok-free.dev`).

**Важно:** Добавьте ngrok-домен в `apps/tg-mini/vite.config.ts`:

```ts
server: {
  port: 3002,
  host: true,
  strictPort: false,
  allowedHosts: ['your-ngrok-domain.ngrok-free.dev'], // замените на ваш домен
},
```

Перезапустите mini-app после изменения конфига.

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

## 7. Настройка бота в BotFather

После запуска ngrok:

1. Откройте `@BotFather` в Telegram
2. Напишите `/mybots` → выберите вашего бота
3. **Bot Settings** → **Menu Button** → **Edit Menu Button URL**
4. Вставьте ngrok URL: `https://your-domain.ngrok-free.dev`
5. **Configure Menu Button** → введите название кнопки (например, "Панель куратора")

Теперь в чате с ботом появится кнопка меню, которая откроет mini-app.

## 8. Краткая памятка команд

```bash
# Установить зависимости
cd /Users/poplavskijanton/HEYS-v2
pnpm install

# Запустить backend (через VS Code task "Start API Server (Port 4001)")
# Либо вручную:
API_PORT=4001 DATABASE_NAME=projectB node packages/core/src/server.js

# Запустить Telegram mini-app (через VS Code task "Start TG Mini (Port 3002)")
# Либо вручную:
pnpm run dev:tg-mini

# Запустить ngrok
ngrok http 3002
```

## 9. Текущий статус (14 ноября 2025)

✅ **Работает:**
- Backend API на `localhost:4001`
- Mini-app frontend на `localhost:3002`
- Telegram WebApp интеграция (initData передаётся)
- Ngrok туннель для доступа из Telegram
- CORS настроен для локальной разработки

⚠️ **В разработке:**
- Backend авторизация через `initData` (проверка HMAC подписи)
- Реальные данные клиентов вместо моков
- Whitelist разрешённых кураторов через `TELEGRAM_ALLOWED_USER_IDS`

Этого минимального набора шагов достаточно, чтобы развернуть и протестировать Telegram mini-app локально, не храня секреты в репозитории и не полагаясь на память.
