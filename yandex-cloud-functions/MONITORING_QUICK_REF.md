# 🛡️ Превентивный мониторинг HEYS API — Quick Reference

## 🚨 Если API упал

```bash
cd yandex-cloud-functions

# 1. Проверить что именно сломалось
./health-check.sh

# 2. Редеплой всех функций
./deploy-all.sh

# 3. Проверка через 10 секунд (текущий warmup)
sleep 10 && ./health-check.sh
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

### 3. GitHub Actions (автомониторинг 24/7)

**API Health Monitor** — каждые 10 минут проверяет endpoints и serverless quota
errors:

- ⏱️ Интервал: **10 минут**
- 🕐 График: **24/7** (было: только 09:00-23:00 MSK)
- 🔄 Auto-healing: автоматический re-deploy при обнаружении 502
- 📢 Telegram alerts: endpoint failure или точный `429/503` в rpc/rest logs
- 🧪 No-retry operational canary: RPC + REST не маскируют краткий quota-инцидент

**Что улучшено (11 февраля 2026)**:

- ✅ Круглосуточный мониторинг вместо дневного
- ✅ Автоматический redeploy при REST/RPC 502
- ✅ Введён явный warmup timeout перед health-check
- ✅ Расширенные проверки в CI/CD (Health + RPC + REST)
- ✅ Улучшенные alerts с HTTP кодами

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

### "incorrect password" (odyssey)

Раньше здесь стояло, что это бывает только у health-check и потому безобидно.
**Это неверно.** 21.08.2026 в 14:00–14:01 та же ошибка положила рабочие
endpoints: `/rest/client_kv_store`, `/rpc?fn=merge_save_client_kv_by_session`,
`/rpc?fn=get_change_markers_by_session` — двенадцать 502 подряд, клиент ушёл в
backpressure. Через несколько минут всё восстановилось само.

Что проверять по порядку:

```bash
yc logging read --resource-ids <function-id> --since 20m --limit 300 --format json
```

Ищи `odyssey: <hex>: incorrect password` со стеком в `pg-pool/index.js` — это
отказ при открытии НОВОГО соединения, а не при обращении к уже открытому.
Поэтому прогретые инстансы продолжают отвечать, и симптом выглядит плавающим.

Что было исключено в тот раз: версия функции не менялась с 20.08, кластер
`heys-production` RUNNING/ALIVE без операций с 02.08, у `heys_rest` conn_limit
50 при двенадцати отказах. То есть ни деплой, ни падение базы, ни явное
исчерпание лимита соединений.

Осталось две версии, и они требуют проверки: пароль в окружении функции
разошёлся с паролем пользователя БД (тогда отказывают только новые соединения),
либо odyssey под нагрузкой отдаёт `incorrect password` вместо честного отказа по
соединениям. Если увидишь это снова — сними логи в момент всплеска, пока
инстансы живы, и посмотри, отваливается ли конкретный пользователь или все.

Здоровье health-endpoint само по себе поводом для спокойствия больше не
считается.

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

- [SERVERLESS_CAPACITY_RUNBOOK.md](SERVERLESS_CAPACITY_RUNBOOK.md) — квоты,
  Retry-After, operational canary и mixed sync load-test
- [MONITORING_GUIDE.md](MONITORING_GUIDE.md) — полное описание системы
- [DEPLOY_GUIDE.md](DEPLOY_GUIDE.md) — инструкции по деплою
- [DISASTER_RECOVERY_RUNBOOK.md](DISASTER_RECOVERY_RUNBOOK.md) — действия при
  сбоях
