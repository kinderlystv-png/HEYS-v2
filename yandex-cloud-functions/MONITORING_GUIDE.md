# 🛡️ Система превентивного мониторинга HEYS API

> **Цель**: Автоматически выявлять проблемы с API до того, как их заметят
> пользователи

## 📊 Компоненты системы

### 1️⃣ GitHub Actions: API Health Monitor

**Файл**: `.github/workflows/api-health-monitor.yml`

**Что делает**:

- ⏰ Запускается каждые 15 минут (автоматически)
- 🔍 Проверяет 4 критических endpoint'а:
  - `/health` — общее состояние API
  - `/rpc` — RPC endpoint (get_shared_products)
  - `/rest` — REST endpoint (shared_products)
  - `/auth/login` — Auth endpoint (должен вернуть 401, не 502!)
- 📧 Отправляет уведомление в Telegram при падении
- ✅ Silent при успехе (не спамит каждые 15 минут)

**Триггеры**:

- Каждые 15 минут (cron schedule)
- При push в `yandex-cloud-functions/**`
- Ручной запуск через GitHub UI

**Статус**: ✅ Активен, проверяйте
https://github.com/kinderlystv-png/HEYS-v2/actions

---

### 2️⃣ GitHub Actions: Auto-deploy Cloud Functions

**Файл**: `.github/workflows/cloud-functions-deploy.yml`

**Что делает**:

- 🚀 Автоматически деплоит cloud functions при изменениях
- 🔐 Использует GitHub Secrets (нужна настройка)
- ✅ Проверяет deployment после деплоя
- 📧 Уведомляет в Telegram об успехе/провале

**Требует настройки GitHub Secrets**:

```
YC_TOKEN
YC_CLOUD_ID
YC_FOLDER_ID
PG_HOST
PG_PORT
PG_DATABASE
PG_USER
PG_PASSWORD
JWT_SECRET
SESSION_SECRET
SMS_API_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
```

**Статус**: ⚠️ Готов к настройке (пока manual запуск)

---

### 3️⃣ Локальный мониторинг: health-check.sh

**Файл**: `yandex-cloud-functions/health-check.sh`

**Использование**:

```bash
cd yandex-cloud-functions

# Одиночная проверка
./health-check.sh

# Watch mode — проверка каждые 30 секунд
./health-check.sh --watch
```

**Проверяет**:

- ✅ Health endpoint (GET /health)
- ✅ RPC endpoint (POST /rpc)
- ✅ REST endpoint (GET /rest/shared_products)
- ✅ Auth endpoint (POST /auth/login) — ожидает 401/403, не 502!
- ✅ SMS endpoint (POST /sms)
- ✅ Leads endpoint (POST /leads)

**Пример вывода**:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧪 HEYS API Health Check — 2026-02-10 22:00:00
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Health — HTTP 200
✅ RPC — HTTP 200
✅ REST — HTTP 200
✅ Auth Login — HTTP 401
✅ SMS — HTTP 429
✅ Leads — HTTP 200
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ All endpoints healthy!
```

---

### 4️⃣ Валидация .env: validate-env.sh

**Файл**: `yandex-cloud-functions/validate-env.sh`

**Что проверяет**:

- ✅ Наличие всех обязательных переменных
- ✅ Длину секретов (JWT_SECRET >= 32 chars)
- ✅ Силу пароля БД (>= 12 chars)
- ⚠️ Placeholder значения типа `your_password_here`

**Автоматически запускается** через `deploy-all.sh` перед деплоем.

**Ручной запуск**:

```bash
cd yandex-cloud-functions
./validate-env.sh
```

---

## 🚀 Быстрый старт

### Настройка Telegram-уведомлений (опционально)

1. Создать бота через [@BotFather](https://t.me/botfather)
2. Получить `TELEGRAM_BOT_TOKEN`
3. Получить `TELEGRAM_CHAT_ID` (отправь `/start` боту, затем
   https://api.telegram.org/bot<TOKEN>/getUpdates)
4. Добавить в `.env`:
   ```bash
   TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
   TELEGRAM_CHAT_ID=1393964759
   ```

### Настройка GitHub Actions (опционально)

1. Перейти в **Settings → Secrets and variables → Actions**
2. Добавить все секреты из списка выше
3. GitHub Actions будут автоматически деплоить при push

---

## 📈 Метрики и алерты

| Метрика                       | Порог         | Действие          |
| ----------------------------- | ------------- | ----------------- |
| API Health Check Failed       | 1 раз         | Telegram алерт    |
| HTTP 502 на critical endpoint | 1 раз         | Немедленный алерт |
| Deployment Failed             | 1 раз         | Алерт + логи      |
| RPC latency > 5s              | 3 раза подряд | Warning           |

---

## 🔧 Как это предотвращает проблемы

### До (проблема):

1. Код изменён в `yandex-cloud-functions/heys-api-auth/index.js`
2. Коммит → push → **забыли задеплоить** ❌
3. Production API работает на старой версии
4. Пользователи видят 502 ошибку
5. Узнаём о проблеме от пользователей 😞

### После (решение):

1. Код изменён в `yandex-cloud-functions/heys-api-auth/index.js`
2. Коммит → push → **auto-deploy через GitHub Actions** ✅
3. Health Monitor проверяет deployment через 15 минут ✅
4. Если 502 — **Telegram алерт мгновенно** ⚡
5. Фиксим проблему до того, как пользователи её заметят 🎯

---

## 📝 Чеклист при изменении cloud functions

- [ ] Изменения протестированы локально
- [ ] `.env` файл актуален (validate-env.sh)
- [ ] Коммит с понятным сообщением
- [ ] Push → проверить GitHub Actions (auto-deploy)
- [ ] Подождать 2-3 минуты после деплоя
- [ ] Запустить `./health-check.sh` для проверки
- [ ] Проверить логи:
      https://console.yandex.cloud/folders/b1gnv1a4q8i6de6atl6n/serverless/functions

---

## 🆘 Troubleshooting

### Health check падает на какой-то endpoint

```bash
# 1. Проверить конкретную функцию
cd yandex-cloud-functions
./health-check.sh

# 2. Проверить логи в Yandex Cloud Console
yc serverless function logs heys-api-auth --since 30m

# 3. Редеплой проблемной функции
./deploy-all.sh heys-api-auth

# 4. Повторная проверка
./health-check.sh
```

### GitHub Actions не работает

- Проверить наличие секретов в **Settings → Secrets**
- Проверить quota на GitHub Actions (2000 минут/месяц для free tier)
- Посмотреть логи: https://github.com/kinderlystv-png/HEYS-v2/actions

### Telegram уведомления не приходят

```bash
# Проверить токен и chat_id
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=test"
```

---

## 🎯 Roadmap

- [ ] **v1.0**: Базовый мониторинг (✅ Done)
- [ ] **v1.1**: Slack integration (альтернатива Telegram)
- [ ] **v1.2**: Metrics dashboard (Grafana + Yandex Monitoring)
- [ ] **v1.3**: Auto-rollback при критических ошибках
- [ ] **v2.0**: Predictive monitoring (ML-based anomaly detection)

---

## 📚 Дополнительные ресурсы

- [DEPLOY_GUIDE.md](DEPLOY_GUIDE.md) — полная инструкция по деплою
- [DISASTER_RECOVERY_RUNBOOK.md](DISASTER_RECOVERY_RUNBOOK.md) — действия при
  критических сбоях
- [SECRETS_MANAGEMENT_README.md](SECRETS_MANAGEMENT_README.md) — управление
  секретами
- [/.github/copilot-instructions.md](../.github/copilot-instructions.md) —
  правило #6: PRODUCTION-ONLY API
