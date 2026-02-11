# ⚡ Быстрые действия при проблемах с API

## 🚨 API падает (502/503 ошибки)

```bash
cd yandex-cloud-functions
./deploy-all.sh
```

⏱️ Время восстановления: **~2 минуты**

---

## ✅ Перед коммитом изменений в cloud functions

```bash
cd yandex-cloud-functions

# 1. Проверка текущего состояния
./health-check.sh

# 2. Деплой изменений
./deploy-all.sh heys-api-<name>  # или ./deploy-all.sh для всех

# 3. Ждём прогрева
sleep 15

# 4. Проверка после деплоя
./health-check.sh

# ❌ Если есть ошибки — НЕ КОММИТИТЬ, исправить и повторить
```

---

## 🔍 Проверка конкретного endpoint

```bash
# Health
curl https://api.heyslab.ru/health

# RPC
curl -X POST 'https://api.heyslab.ru/rpc?fn=get_shared_products' \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://app.heyslab.ru' \
  -d '{}'

# REST
curl 'https://api.heyslab.ru/rest/shared_products?limit=1' \
  -H 'Origin: https://app.heyslab.ru'

# Auth
curl -X POST 'https://api.heyslab.ru/auth/login' \
  -H 'Content-Type: application/json' \
  -d '{"email":"test","password":"test"}'
```

---

## 📊 Continuous monitoring (30s интервал)

```bash
cd yandex-cloud-functions
./health-check.sh --watch
```

---

## 🔄 Auto-healing включён

- ✅ Мониторинг каждые 15 мин (24/7)
- ✅ Автоматический re-deploy при 502
- ✅ Telegram алерты при проблемах
- ✅ CI/CD проверяет деплой автоматически

---

## 📝 Детальная документация

- [INCIDENT_PREVENTION.md](./INCIDENT_PREVENTION.md) — полный runbook
- [MONITORING_QUICK_REF.md](./MONITORING_QUICK_REF.md) — инструменты мониторинга
- [GitHub Actions](https://github.com/kinderlystv-png/HEYS-v2/actions) — статус
  CI/CD
