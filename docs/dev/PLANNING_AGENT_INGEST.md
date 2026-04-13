# Planning agent ingest (`planning_context_agent_ingest`)

Серверный путь для применения контекста планирования из Cursor (или другого
агента) **без session token в теле запроса**: используется статический секрет и
явный `targetClientId`.

## Endpoint

- URL: `POST https://api.heyslab.ru/rpc?fn=planning_context_agent_ingest`
- Заголовки:
  - `Authorization: Bearer <PLANNING_AGENT_SECRET>`
  - `Content-Type: application/json`
  - `Origin: https://app.heyslab.ru` (как у остальных RPC)

## Тело запроса

| Поле             | Обязательно | Описание                                    |
| ---------------- | ----------- | ------------------------------------------- |
| `targetClientId` | да          | UUID клиента в `clients`                    |
| `idempotencyKey` | да          | строка ≥ 8 символов                         |
| `snapshotText`   | нет\*       | основной текст снапшота                     |
| `daysLast5Text`  | нет         | блок последних дней                         |
| `rawPromptText`  | нет         | сырой промпт                                |
| `applyNow`       | нет         | по умолчанию `true`                         |
| `dryRun`         | нет         | только анализ без записи KV                 |
| `source`         | нет         | по умолчанию `heys_cursor_agent`            |
| `policy`         | нет         | те же поля, что у `planning_context_ingest` |
| `parentIngestId` | нет         | опционально                                 |

\* Для осмысленного ingest нужен хотя бы один из текстовых блоков (как у
обычного ingest).

Альтернативные имена: `p_client_id` (после маппинга из `client_id`),
`p_target_client_id`.

## Переменные окружения (Cloud Function)

- `PLANNING_AGENT_SECRET` — длинная случайная строка; сравнение с Bearer через
  SHA-256 и `timingSafeEqual`.
- `PLANNING_AGENT_ALLOWED_CLIENT_IDS` — опционально: список UUID через запятую.
  Если задан, запросы разрешены только для этих клиентов.

Если `PLANNING_AGENT_SECRET` не задан, endpoint отвечает **503**
(`AGENT_INGEST_DISABLED`).

## SQL

Функции `batch_get_client_kv_by_client_id` и
`batch_upsert_client_kv_by_client_id` (миграция
`database/2026-04-13_planning_agent_kv_by_client_id.sql`) вызываются **только из
Node** после проверки секрета; в публичный allowlist отдельными `fn=` они не
добавляются.

## Риски

- Утечка `PLANNING_AGENT_SECRET` при отсутствии allowlist даёт запись KV для
  любого существующего `targetClientId`: используйте allowlist, длинный секрет,
  ротацию, хранение в Lockbox.
- Ротация: выставить новый секрет в env, обновить локальный
  `HEYS_PLANNING_AGENT_SECRET`, перезапустить вызовы.

## Локальный скрипт

Из корня монорепо:

```bash
export HEYS_PLANNING_AGENT_SECRET='...'
export HEYS_TARGET_CLIENT_ID='xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
node scripts/heys-apply-context.mjs ./context.txt
```

Флаги CLI (см. `node scripts/heys-apply-context.mjs` — комментарий в шапке
файла):

- `--dry-run` — только разбор, без записи KV
- `--idempotency-key <строка≥8>` — иначе по умолчанию стабильный ключ
  `cursor-` + sha256 от **текста** (тот же файл → повторный вызов = idempotent
  replay)
- `--parent-ingest-id <id>` — follow-up после ответов на `unresolved` (из
  прошлого `audit.ingestId`)
- `--target-client-id <uuid>` — переопределить env
- `--source <строка>` — поле `source` в теле
- `--random-idempotency` — новый случайный ключ на каждый запуск

Env: `HEYS_DAYS_LAST5_TEXT`, `HEYS_RAW_PROMPT_TEXT`, `HEYS_PARENT_INGEST_ID`,
`HEYS_MAX_NOW_TASKS`, `HEYS_INGEST_SOURCE`.

Не коммить секреты; файлы `.env.cursor` / `.env.cursor.local` в `.gitignore`.

## Деплой и миграция (оператор)

1. Применить в production PostgreSQL файл
   [`database/2026-04-13_planning_agent_kv_by_client_id.sql`](../../database/2026-04-13_planning_agent_kv_by_client_id.sql)
   (роль с правами на `CREATE OR REPLACE FUNCTION` и `GRANT … TO heys_rpc`,
   обычно `heys_admin`).

   Пример (из корня репо, с актуальным `PG_PASSWORD` в
   `yandex-cloud-functions/.env`):

   ```bash
   cd yandex-cloud-functions && set -a && source .env && set +a
   export PGSSLMODE="${PG_SSL:-prefer}"
   PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" \
     -v ON_ERROR_STOP=1 -f ../database/2026-04-13_planning_agent_kv_by_client_id.sql
   ```

2. Задать **`PLANNING_AGENT_SECRET`** (и при необходимости
   **`PLANNING_AGENT_ALLOWED_CLIENT_IDS`**) в окружении перед деплоем:
   [`deploy-with-lockbox.sh`](../../yandex-cloud-functions/heys-api-rpc/deploy-with-lockbox.sh)
   **не передаёт** эти ключи в Yandex CF, если они пустые (платформа не
   принимает пустые значения env). После первого выставления секрета — снова
   `bash deploy-with-lockbox.sh`.

3. Деплой:
   `cd yandex-cloud-functions/heys-api-rpc && bash deploy-with-lockbox.sh`
   (нужны `HEYS_ENCRYPTION_KEY`, `JWT_SECRET` в `.env`).
