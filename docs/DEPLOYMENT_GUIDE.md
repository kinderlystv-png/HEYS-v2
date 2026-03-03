# 🚀 Руководство по развертыванию HEYS

## 📋 Обзор

HEYS развёрнут полностью в Yandex Cloud (152-ФЗ compliance). Платформа:

| Компонент             | Где                                    | URL                                              |
| --------------------- | -------------------------------------- | ------------------------------------------------ |
| PWA (фронтенд)        | Yandex Object Storage (8 бандлов GZIP) | `app.heyslab.ru`                                 |
| Landing               | Yandex CDN → S3                        | `heyslab.ru`                                     |
| Cloud Functions (7+2) | Yandex Cloud Functions                 | `api.heyslab.ru`                                 |
| База данных           | Yandex Cloud PostgreSQL 16             | `rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net:6432` |
| SMS                   | SMSC.ru API (через YCF)                | —                                                |
| Платежи               | ЮKassa (через YCF)                     | —                                                |

---

## 🏗️ Предварительные требования

### Локальная среда разработки

```bash
Node.js: 18+ LTS
pnpm: 8.10+
Git: 2.40+
yc CLI: установить через yc CLI setup (для работы с YCF)
```

### Аккаунты и сервисы

- ✅ **GitHub**: Repository access и Actions
- ✅ **Yandex Cloud**: Console + CLI access (для Cloud Functions и PostgreSQL)
- ✅ **SMSC.ru**: SMS API Key (для `heys-api-sms`)
- ✅ **ЮKassa**: Shop ID + Secret Key (для `heys-api-payments`)

---

## ⚙️ Настройка Environment Variables

### Cloud Functions (`yandex-cloud-functions/.env`)

```bash
# Database (Yandex Cloud PostgreSQL 16)
PG_HOST=rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net
PG_PORT=6432
PG_DATABASE=heys_production
PG_USER=heys_api
PG_PASSWORD=your_strong_password_here
PG_SSL=true

# Auth
JWT_SECRET=your_strong_jwt_secret_min_32_chars
HEYS_ENCRYPTION_KEY=your_32_byte_hex_key_here

# SMS (SMSC.ru)
SMS_API_KEY=your_smsc_api_key

# Payments (ЮКassa)
YUKASSA_SHOP_ID=your_shop_id
YUKASSA_SECRET_KEY=your_secret_key

# Telegram Monitoring Alerts
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# CORS
ALLOWED_ORIGINS=https://app.heyslab.ru,https://heyslab.ru
```

> **Важно**: Секреты для продакшена вводить **только через YC Console** (не
> CLI). YC CLI выводит все переменные в stdout — риск утечки PG_PASSWORD.

### Frontend (`apps/web`) — не требует `.env.production`

PWA работает полностью на статике. API URL захардкоден в
`heys_yandex_api_v1.js`:

```javascript
const CONFIG = { API_URL: 'https://api.heyslab.ru' };
```

### Local Development

```bash
# apps/web/.env.local (не коммитить)
VITE_PORT=3001
API_PORT=4001
```

---

## 🔧 Локальная подготовка

### 1. Клонирование и установка

```bash
git clone https://github.com/kinderlystv-png/HEYS-v2.git
cd HEYS-v2
pnpm install
```

### 2. Настройка Cloud Functions секретов

```bash
cp yandex-cloud-functions/.env.example yandex-cloud-functions/.env
# Заполнить значения в .env
notepad yandex-cloud-functions/.env
```

### 3. Проверка качества кода

```bash
# Линтинг и форматирование
pnpm run lint

# TypeScript проверка
pnpm run type-check

# Запуск тестов
pnpm run test:all
```

### 4. Локальная сборка и тестирование

```bash
# Сборка всех пакетов
pnpm run build

# Локальный запуск dev-сервера
pnpm dev   # port 3001 (PWA) + port 4001 (API local)

# Health check production API
curl https://api.heyslab.ru/health
```

### Миграции БД

```bash
node yandex-cloud-functions/heys-api-rpc/apply_migrations.js
```

———

---

## 🚀 CI/CD Pipeline

### GitHub Actions (фактическая конфигурация)

- `.github/workflows/deploy-yandex.yml` — основной прод-деплой фронтенда
  (`app.heyslab.ru` + `heyslab.ru`) при `push` в `main`
- `.github/workflows/cloud-functions-deploy.yml` — деплой cloud functions при
  изменениях в `yandex-cloud-functions/**`
- Деплой функций выполняется **только** через `cloud-functions-deploy.yml` (без
  дублирующего job в `deploy-yandex.yml`)
- После деплоя функций: `sleep 10` и обязательная проверка health/RPC/REST

### API Health Monitor (24/7 автомониторинг)

```yaml
# .github/workflows/api-health-monitor.yml
on:
  schedule:
    - cron: '*/15 * * * *' # Каждые 15 минут

steps:
  - name: Check Health
    run: curl -f https://api.heyslab.ru/health
  - name: Check RPC
    run:
      curl -f -X POST https://api.heyslab.ru/rpc?fn=get_shared_products -d '{}'
  - name: Check REST
    run: curl -f https://api.heyslab.ru/rest/shared_products?limit=1
  - name: Auto-redeploy on 502
    if: failure()
    run: cd yandex-cloud-functions && ./deploy-all.sh
  - name: Telegram Alert on failure
    if: failure()
    run: # Telegram bot notification
```

---

## 🌐 Production Deployment

### 1. Frontend (PWA — `app.heyslab.ru`)

PWA — статические файлы в Yandex Object Storage.

**Стандартный путь (CI/CD):**

```bash
git push origin main
```

**Локальный быстрый деплой (все бандлы + index.html):**

```bash
bash scripts/deploy-frontend.sh
```

**Пересборка legacy-бандлов без деплоя:**

```bash
node scripts/bundle-legacy.mjs
node scripts/bundle-legacy.mjs --bundle=boot-core
node scripts/bundle-legacy.mjs --dry-run
```

`bundle-legacy.mjs` автоматически делает `node --check` для каждого бандла. При
синтаксической ошибке сборка прерывается.

### 2. Landing (`heyslab.ru`)

```bash
cd apps/landing
pnpm build

# .next/out/ или out/ → загрузить в S3
# Yandex CDN раздаёт статику
```

### 3. API Functions (api.heyslab.ru) — MAIN DEPLOYMENT

```bash
cd yandex-cloud-functions

# Шаг 1: Валидация секретов
./validate-env.sh

# Шаг 2: Проверить текущее состояние
./health-check.sh

# Шаг 3: Деплой (одна или все функции)
./deploy-all.sh                     # Все API функции
./deploy-all.sh heys-api-rpc        # Только одну

# Шаг 4: Дождаться прогрева
sleep 10

# Шаг 5: Проверить результат
./health-check.sh
```

**9 Cloud Functions** (7 API + 2 утилитарных):

| Функция             | Runtime  | Назначение                    |
| ------------------- | -------- | ----------------------------- |
| `heys-api-rpc`      | nodejs18 | RPC-вызовы PostgreSQL функций |
| `heys-api-rest`     | nodejs18 | REST GET таблиц (read-only)   |
| `heys-api-auth`     | nodejs18 | JWT auth для кураторов        |
| `heys-api-sms`      | nodejs18 | SMS через SMSC.ru             |
| `heys-api-leads`    | nodejs18 | Лиды с лендинга               |
| `heys-api-health`   | nodejs18 | Health check                  |
| `heys-api-payments` | nodejs18 | Платежи ЮKassa                |
| `heys-backup`       | —        | Бэкапы и восстановление       |
| `heys-maintenance`  | —        | Служебные скрипты             |

### 4. Database (Yandex Cloud PostgreSQL 16)

Миграции применяются через скрипт:

```bash
node yandex-cloud-functions/heys-api-rpc/apply_migrations.js
```

Файлы миграций: `yandex-cloud-functions/migrations/`

---

## 🔒 Security Configuration

### CORS whitelist

Разрешены только production-домены:

```javascript
// yandex-cloud-functions/heys-api-rpc/index.js
const ALLOWED_ORIGINS = ['https://app.heyslab.ru', 'https://heyslab.ru'];
```

### Rate Limiting (PostgreSQL)

```sql
-- Таблица pin_login_attempts блокирует брутфорс
-- 5 неудачных PIN-attempts → блокировка на 15 минут
```

### Security Headers

Каждая Cloud Function устанавливает:

```
Content-Security-Policy: default-src 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Strict-Transport-Security: max-age=31536000
```

---

## 📊 Monitoring & Health Checks

### health-check.sh (основной инструмент)

```bash
cd yandex-cloud-functions
./health-check.sh          # Разовая проверка
./health-check.sh --watch  # Мониторинг в реальном времени
```

Проверяет 5 endpoints:

| Endpoint | URL                                 |
| -------- | ----------------------------------- |
| Health   | `https://api.heyslab.ru/health`     |
| RPC      | `POST /rpc?fn=get_shared_products`  |
| REST     | `GET /rest/shared_products?limit=1` |
| Auth     | `POST /auth/curator`                |
| SMS      | Service healthcheck                 |

### GitHub Actions автомониторинг

- Проверка каждые **15 минут** (24/7)
- При 502 → автоматический redeploy `./deploy-all.sh`
- Уведомление в Telegram при сбое

### Логи в Yandex Cloud Console

```
Yandex Cloud Console → Cloud Functions → heys-api-rpc → Logs
```

---

## 🔄 Post-Deployment Checklist

```bash
✅ https://api.heyslab.ru/health → {"status":"ok"}
✅ RPC get_shared_products возвращает данные
✅ REST /shared_products возвращает данные
✅ PIN-авторизация клиента работает
✅ JWT-авторизация куратора работает
✅ SMS отправка работает (тест через /sms)
✅ SSL сертификаты валидны
✅ CORS блокирует посторонние origin
✅ GitHub Actions health monitor активен
✅ Telegram-алерты настроены
```

---

## 🚨 Rollback Process

Отдельного staging-окружения нет. Откат = redeploy предыдущей версии:

```bash
cd yandex-cloud-functions

# Посмотреть историю версий функции
yc serverless function version list --function-name heys-api-rpc

# Переключиться на тег (старая версия)
yc serverless function set-scaling-policy \
  --function-name heys-api-rpc \
  --tag $REVISION_ID

# Или просто задеплоить последнюю рабочую версию из git
git checkout <commit>
./deploy-all.sh heys-api-rpc
./health-check.sh
```

---

## 📈 Scaling

Yandex Cloud Functions масштабируются **автоматически**:

- Максимальный параллелизм: 10 (настраивается в YC Console)
- Cold start: ~200-500ms (nodejs18)
- PostgreSQL: managed YC PostgreSQL 16 (автобэкап, failover)
- Статика (PWA/Landing): Yandex S3 + CDN (мгкновенное масштабирование)

---

## 🔧 Troubleshooting

### Frontend (`app.heyslab.ru`) недоступен

```bash
# Проверить Nginx VM + S3
curl -I https://app.heyslab.ru

# Проверить DNS
nslookup app.heyslab.ru
```

### API 502 Bad Gateway

```bash
cd yandex-cloud-functions

# 1. Диагностика
./health-check.sh

# 2. Посмотреть логи функции
yc serverless function logs heys-api-rpc --follow

# 3. Redeploy
./deploy-all.sh
sleep 10
./health-check.sh
```

### Проблемы с аутентификацией

```bash
# Тест PIN-авторизации (клиент)
curl -X POST https://api.heyslab.ru/rpc?fn=client_pin_auth \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://app.heyslab.ru' \
  -d '{"p_phone":"+7XXXXXXXXXX","p_pin":"XXXX"}'

# Тест JWT-авторизации (куратор)
curl -X POST https://api.heyslab.ru/auth/curator \
  -H 'Content-Type: application/json' \
  -d '{"email":"curator@example.com","password":"..."}'

# Проверить CORS
curl -H "Origin: https://app.heyslab.ru" \
     -X OPTIONS https://api.heyslab.ru/rpc
```

### Секреты/env vars

```bash
# Валидация перед деплоем
cd yandex-cloud-functions
./validate-env.sh

# Просмотр переменных функции
yc serverless function version get-by-tag \
  --function-name heys-api-rpc --tag '$latest'
```

---

## 📞 Контакты

**Мониторинг**: GitHub Actions + Telegram-бот (автоматически)  
**Логи**: Yandex Cloud Console → Cloud Functions → Logs  
**Runbook**: `yandex-cloud-functions/INCIDENT_PREVENTION.md`  
**Мониторинг быстрая ссылка**: `yandex-cloud-functions/MONITORING_QUICK_REF.md`

---

_Руководство по развертыванию обновлено: 26 февраля 2026_  
_Версия: 5.0.0 (Yandex Cloud Infrastructure + JS Bundling)_  
_Готовность к production: ✅ Проверено_
