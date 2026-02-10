# 🛡️ Превентивный мониторинг HEYS API — Quick Reference

## 🚨 Если API упал

```bash
cd yandex-cloud-functions

# 1. Проверить что именно сломалось
./health-check.sh

# 2. Редеплой всех функций
./deploy-all.sh

# 3. Проверка через 30 секунд
./health-check.sh
```

---

## 📊 Доступные инструменты

### 1. Health Check (локальная проверка)

```bash
cd yandex-cloud-functions
./health-check.sh           # Одиночная проверка
./health-check.sh --watch   # Continuous monitoring (30s интервал)
```

**Проверяет**: Health, RPC, REST, Auth, SMS, Leads endpoints

### 2. .env Validation (перед деплоем)

```bash
cd yandex-cloud-functions
./validate-env.sh
```

**Проверяет**:

- Наличие обязательных переменных
- Длину секретов (JWT_SECRET >= 32)
- Силу пароля БД (>= 12)
- Placeholder значения

### 3. GitHub Actions (автомониторинг)

**API Health Monitor** — каждые 15 минут проверяет все endpoints

- URL: https://github.com/kinderlystv-png/HEYS-v2/actions
- На падении → Telegram алерт
- Silent при успехе

**Auto-deploy** — при изменениях в `yandex-cloud-functions/**`

- Требует настройки GitHub Secrets
- Деплоит автоматически
- Уведомляет в Telegram

---

## 🔧 Настройка (один раз)

### Telegram Alerts

```bash
# 1. Создать бота через @BotFather → получить TOKEN
# 2. Отправить /start боту
# 3. Получить CHAT_ID: https://api.telegram.org/bot<TOKEN>/getUpdates

# 4. Добавить в .env
cd yandex-cloud-functions
nano .env
# TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
# TELEGRAM_CHAT_ID=1393964759
```

### GitHub Actions (опционально)

**Settings → Secrets and variables → Actions** → добавить:

- `YC_TOKEN`, `YC_FOLDER_ID`, `PG_PASSWORD`, `JWT_SECRET`, и др.

См. полный список в [MONITORING_GUIDE.md](MONITORING_GUIDE.md)

---

## 📈 Что это предотвращает

| Проблема                    | До                  | После                                   |
| --------------------------- | ------------------- | --------------------------------------- |
| Забыли задеплоить           | Узнали от юзеров 😞 | GitHub Actions деплоит автоматически ✅ |
| API упал ночью              | Узнали утром 😴     | Telegram алерт сразу ⚡                 |
| Секреты не синхронизированы | 502 ошибка          | validate-env.sh блокирует деплой ⛔     |
| Неизвестно, что работает    | Гадаем 🤷           | health-check.sh показывает всё ✅       |

---

## 📝 Workflow при изменениях

```bash
# 1. Внесли изменения в yandex-cloud-functions/heys-api-*/
git add .
git commit -m "fix: auth endpoint validation"

# 2. Локальная проверка (опционально)
cd yandex-cloud-functions
./validate-env.sh   # Проверка .env
./deploy-all.sh     # Деплой

# 3. Push → GitHub Actions задеплоит автоматически (если настроен)
git push

# 4. Проверка через 2-3 минуты
./health-check.sh
```

---

## 🆘 Troubleshooting

### "incorrect password" в Health check

Health endpoint использует тестовое подключение к БД. Если основные endpoints
(REST, Auth) работают — всё ОК.

### "syntax error" в RPC

```bash
yc serverless function logs heys-api-rpc --since 30m
./deploy-all.sh heys-api-rpc
```

### GitHub Actions не запускаются

- Проверить наличие секретов: Settings → Secrets
- Проверить quota (2000 мин/месяц для free tier)

---

## 📚 Полная документация

- [MONITORING_GUIDE.md](MONITORING_GUIDE.md) — полное описание системы
- [DEPLOY_GUIDE.md](DEPLOY_GUIDE.md) — инструкции по деплою
- [DISASTER_RECOVERY_RUNBOOK.md](DISASTER_RECOVERY_RUNBOOK.md) — действия при
  сбоях
