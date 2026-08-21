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
**Это неверно.** 21.08.2026 с 13:59:26 до 14:06:04 та же ошибка положила рабочие
endpoints: `/rest/client_kv_store` и два RPC — клиент ушёл в backpressure.

**Это не падение Яндекса.** Разбор того случая:

| Проверено  | Факт                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------- |
| Окно       | 13:59:26 → 14:06:04, дальше ноль. С 12:00 до 13:59 — 6308 соединений и ни одного отказа           |
| Кто падал  | только `heys_admin`; `monitor` в том же окне не падал ни разу                                     |
| Массовость | в те же минуты 2497 соединений `heys_admin` прошли нормально — то есть пароль верный              |
| Нагрузка   | 1–5 новых соединений в секунду при `conn_limit` 50 — исчерпанием не объясняется                   |
| Изменения  | версия функции от 20.08, операций на кластере нет со 02.08, пароль пользователя не менялся с июля |

**Что нашлось по дороге и важнее самого инцидента:** `PG_PASSWORD` в окружении
функции — плейсхолдер `__IN_LOCKBOX__…`, а `stripPlaceholders()` в `secrets.js`
его удаляет. Запасного пути через env больше нет: пароль существует только после
успешного ответа Lockbox. В окне инцидента было **5 холодных стартов**, и все
пять отчитались `[secrets] init complete {"db":1,…}` — то есть сам Lockbox
отработал. Но любое чтение пароля раньше overlay даёт пустое значение, а odyssey
отвечает на пустой пароль тем же «incorrect password», уводя диагностику в
сторону смены пароля.

Порядок разбора, если повторится:

```bash
# 1. Логи пула: кто именно и сколько раз
yc managed-postgresql cluster list-logs <cluster-id> --service-type POOLER   --since <T-10m> --until <T+10m> --limit 10000 --format json | grep "incorrect password"

# 2. Соотнести с холодными стартами функции
yc logging read --resource-ids <function-id> --since <T-10m> --until <T+10m>   --limit 2000 --format json | grep "secrets] init complete"
```

Если отказы липнут к холодным стартам, а не к нагрузке — ищи чтение пароля до
`await initSecrets()`, а не меняй пароль. Здоровье health-endpoint поводом для
спокойствия не считается.

**Причина закрыта 21.08.2026.** Дыра была в самом `initSecrets()`:
`stripPlaceholders()` стоял ПЕРЕД походом в сейф, а между ними лежит сетевой
вызов — всё это время пароля в окружении нет вовсе. Порядок развёрнут: сходить в
сейф → заменить → и только потом стереть то, что сейф не отдал. Плюс два
предохранителя: неполный результат больше не запоминается (раньше один неудачный
холодный старт ломал экземпляр до конца жизни), а `db-pool` отказывается строить
пул с пустым паролем или плейсхолдером и называет причину вслух вместо того,
чтобы получить от odyssey «incorrect password».

Закреплено смоук-тестом
[`secrets-lockbox-order.test.mjs`](__tests__/secrets-lockbox-order.test.mjs): он
заглядывает в окружение изнутри сетевого вызова и на прежнем порядке падает со
словами «пароль пропал из окружения на время похода в сейф».

⚠️ Правка живёт в коде и **не действует, пока функции не передеплоены**:
`cd yandex-cloud-functions && ./deploy-all.sh heys-api-rest` (и остальные пять,
где лежит `secrets.js`).

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
