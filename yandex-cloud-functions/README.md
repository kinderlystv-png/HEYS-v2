# 🚀 HEYS Serverless API — Yandex Cloud Functions

> Production backend для HEYS v2 на базе Yandex Cloud Functions Все 7 функций
> работают на `api.heyslab.ru`

---

## 📦 Архитектура

| Function            | Endpoint    | Назначение                  | Memory | Timeout |
| ------------------- | ----------- | --------------------------- | ------ | ------- |
| `heys-api-health`   | `/health`   | Health checks + DB status   | 128 MB | 10s     |
| `heys-api-rpc`      | `/rpc`      | PostgreSQL RPC functions    | 256 MB | 30s     |
| `heys-api-rest`     | `/rest`     | REST API (CRUD)             | 256 MB | 30s     |
| `heys-api-auth`     | `/auth`     | JWT + PIN authentication    | 256 MB | 15s     |
| `heys-api-sms`      | `/sms`      | SMS verification via SMS.RU | 128 MB | 10s     |
| `heys-api-leads`    | `/leads`    | Landing page leads          | 128 MB | 10s     |
| `heys-api-payments` | `/payments` | YooKassa integration        | 256 MB | 30s     |

**Shared**: `shared/db-pool.js` — централизованный connection pool PostgreSQL

---

## 🔧 Быстрый старт

### 1. Деплой всех функций

```bash
cd yandex-cloud-functions
./deploy-all.sh  # Деплоит все 7 функций (~4 минуты)
```

### 2. Деплой одной функции

```bash
./deploy-all.sh heys-api-rest  # ~30 секунд
```

### 3. Проверка после деплоя

```bash
sleep 15                # Ждём warmup
./health-check.sh       # Проверка всех endpoints
```

---

## 🛡️ Система защиты от падений (v5.0.1)

### ✅ Автоматическая защита

1. **24/7 мониторинг** — GitHub Actions проверяет API каждые 15 минут
2. **Auto-healing** — автоматический re-deploy при обнаружении 502
3. **Telegram алерты** — мгновенное оповещение о проблемах
4. **CI/CD validation** — проверка Health + RPC + REST после каждого push

### 📊 Мониторинг в реальном времени

```bash
# Локальная проверка
./health-check.sh

# Continuous monitoring (30s интервал)
./health-check.sh --watch

# Проверка секретов перед деплоем
./validate-env.sh
```

### 🚨 Если API падает

```bash
cd yandex-cloud-functions
./deploy-all.sh              # Re-deploy всех функций
sleep 15                     # Warmup
./health-check.sh            # Проверка
```

⏱️ **MTTR** (Mean Time To Recovery): **~2 минуты**

---

## 📝 Документация

| Файл                                                 | Назначение                        |
| ---------------------------------------------------- | --------------------------------- |
| [QUICK_FIX.md](./QUICK_FIX.md)                       | ⚡ Быстрые действия при проблемах |
| [INCIDENT_PREVENTION.md](./INCIDENT_PREVENTION.md)   | 🛡️ Полный runbook инцидентов      |
| [MONITORING_QUICK_REF.md](./MONITORING_QUICK_REF.md) | 📊 Инструменты мониторинга        |

---

## 🔐 Environment Variables

Все секреты в `.env` файле (НЕ в git):

```bash
# Database
PG_HOST=rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net
PG_PORT=6432
PG_DATABASE=heys_production
PG_USER=heys_admin
PG_PASSWORD=<secret>
PG_SSL=verify-full

# Auth
JWT_SECRET=<32+ chars>
SESSION_SECRET=<32+ chars>

# Integrations
SMS_API_KEY=<SMS.RU key>
TELEGRAM_BOT_TOKEN=<bot token>
TELEGRAM_CHAT_ID=<chat id>

# Yandex Cloud
YC_FOLDER_ID=b1gnv1a4q8i6de6atl6n
```

**Валидация перед деплоем**:

```bash
./validate-env.sh
✅ All required variables loaded
✅ JWT_SECRET is strong (33 chars)
⚠️ WARNING: SESSION_SECRET is too short (24 < 32 chars)
```

---

## 🚀 Deployment Workflow

### CI/CD Pipeline (автоматический)

```
Push to main
    ↓
GitHub Actions: cloud-functions-deploy.yml
    ↓
1. Setup Yandex Cloud CLI
2. Create .env from GitHub Secrets
3. Deploy changed functions (или все)
4. Wait 15s warmup
5. Verify: Health + RPC + REST
6. Send Telegram notification
```

**Триггеры**:

- Push в `main` с изменениями в `yandex-cloud-functions/heys-api-*/**`
- Ручной запуск через GitHub Actions UI

### Ручной деплой

```bash
# Через скрипт (рекомендуется)
cd yandex-cloud-functions
./deploy-all.sh

# Через yc CLI (для одной функции)
cd heys-api-rest
yc serverless function version create \
  --function-name heys-api-rest \
  --runtime nodejs18 \
  --entrypoint index.handler \
  --memory 256m \
  --execution-timeout 30s \
  --source-path . \
  --environment PG_HOST=$PG_HOST,...
```

---

## 📈 Metrics & Monitoring

### Целевые показатели (SLA)

- 🎯 **Uptime**: 99.9% (43 мин downtime/месяц)
- 🔔 **MTTD** (Mean Time To Detection): < 15 мин
- ⚡ **MTTR** (Mean Time To Recovery): < 10 мин
- 📊 **Latency p50**: < 200ms
- 📊 **Latency p99**: < 1000ms

### Текущие метрики (февраль 2026)

- ✅ Uptime: 99.95%+
- ✅ MTTD: 15 мин (автомониторинг)
- ✅ MTTR: 2 мин (auto-healing)
- ✅ p50: ~150ms
- ✅ p99: ~800ms

### Мониторинг endpoints

```bash
# GitHub Actions (авто)
https://github.com/kinderlystv-png/HEYS-v2/actions/workflows/api-health-monitor.yml

# Yandex Cloud Console (логи, метрики)
https://console.yandex.cloud/folders/b1gnv1a4q8i6de6atl6n/serverless/functions

# Локальный watch
./health-check.sh --watch
```

---

## 🐛 Troubleshooting

### Q: REST endpoint возвращает 502

```bash
cd yandex-cloud-functions
./deploy-all.sh heys-api-rest
sleep 15
./health-check.sh
```

**Причины**:

- Timeout (execution_timeout exceeded)
- Memory limit (out of memory)
- Database unavailable
- Cold start timeout
- Broken environment variables

### Q: CI/CD workflow провален

1. Проверь логи: https://github.com/kinderlystv-png/HEYS-v2/actions
2. Локально запусти `./deploy-all.sh`
3. Проверь секреты в GitHub: Settings → Secrets and variables → Actions

### Q: База данных недоступна

```bash
# Проверка соединения
psql "host=$PG_HOST port=$PG_PORT dbname=$PG_DATABASE user=$PG_USER sslmode=verify-full"

# Проверка в Yandex Cloud Console
https://console.yandex.cloud/folders/b1gnv1a4q8i6de6atl6n/managed-postgresql
```

### Q: Auto-redeploy не сработал

1. Проверь, что GitHub Actions не отключён
2. Проверь секреты: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
3. Ручной деплой: `./deploy-all.sh`

---

## 🔗 Useful Links

- **API Base URL**: https://api.heyslab.ru
- **GitHub Actions**: https://github.com/kinderlystv-png/HEYS-v2/actions
- **Yandex Cloud Console**:
  https://console.yandex.cloud/folders/b1gnv1a4q8i6de6atl6n
- **Production Web App**: https://app.heyslab.ru
- **Landing**: https://heyslab.ru

---

## 📋 Checklist: Перед коммитом изменений

- [ ] `./validate-env.sh` — проверка секретов
- [ ] `./health-check.sh` — состояние до деплоя
- [ ] `./deploy-all.sh <function>` — деплой изменений
- [ ] `sleep 15` — ожидание warmup
- [ ] `./health-check.sh` — проверка после деплоя
- [ ] Push в `main` — CI/CD auto-deploy + verification
- [ ] Мониторинг GitHub Actions — проверка, что CI/CD прошёл

❌ **Если `health-check.sh` показывает ошибки после деплоя — НЕ КОММИТИТЬ!**

---

**Version**: 5.0.1 (11 февраля 2026)  
**Maintainer**: @kinderlystv-png  
**Status**: ✅ Production-ready with auto-healing
