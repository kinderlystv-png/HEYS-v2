# heys-client-daily-backup

Ежедневный per-client snapshot бэкап `client_kv_store` → Yandex Object Storage.

## Что делает

1. Читает список клиентов из таблицы `clients`.
2. Для каждого клиента снимает **полный KV-snapshot** (`client_kv_store`) в
   `REPEATABLE READ` транзакции.
3. Включает в snapshot: `v` (JSONB), `v_encrypted` (base64), `key_version`,
   `updated_at`.
4. Сериализует → SHA-256 checksum → gzip (level 9) → загружает в S3.
5. Ротация: удаляет объекты старше 365 дней.
6. Telegram-алерт при ошибках (без ПДн), еженедельный success-отчёт по
   воскресеньям.

## Object Storage layout

```
s3://heys-backups/client-daily/YYYY-MM-DD/<clientId>.json.gz
```

Пример:

```
s3://heys-backups/client-daily/2026-03-29/ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a.json.gz
s3://heys-backups/client-daily/2026-03-29/4545ee50-4f5f-4fc0-b862-7ca45fa1bafc.json.gz
```

## JSON schema (snapshot)

```json
{
  "schemaVersion": 1,
  "source": "server-daily-backup",
  "exportedAt": "2026-03-30T01:00:12.345Z",
  "businessDate": "2026-03-29",
  "timezone": "Europe/Moscow",
  "dayBoundaryHour": 3,
  "clientId": "ccfe6ea3-...",
  "keyCount": 69,
  "kvSnapshot": {
    "heys_profile": {
      "v": { "firstName": "...", "gender": "...", ... },
      "updated_at": "2026-03-28T18:00:00.000Z"
    },
    "heys_dayv2_2026-03-29": {
      "v": { "meals": [...], ... },
      "v_encrypted_b64": "base64...",
      "key_version": 1,
      "updated_at": "2026-03-29T20:30:00.000Z"
    }
  },
  "checksum": "sha256hex..."
}
```

## Environment variables

| Variable               | Required | Default                           | Description               |
| ---------------------- | -------- | --------------------------------- | ------------------------- |
| `PG_HOST`              | ✅       | `rc1b-...yandexcloud.net`         | PostgreSQL host           |
| `PG_PORT`              | ❌       | `6432`                            | PostgreSQL port           |
| `PG_DATABASE`          | ❌       | `heys_production`                 | Database name             |
| `PG_USER`              | ❌       | `heys_admin`                      | DB user                   |
| `PG_PASSWORD`          | ✅       | —                                 | DB password               |
| `S3_ACCESS_KEY_ID`     | ✅       | —                                 | Object Storage access key |
| `S3_SECRET_ACCESS_KEY` | ✅       | —                                 | Object Storage secret key |
| `S3_BUCKET`            | ❌       | `heys-backups`                    | Bucket name               |
| `S3_ENDPOINT`          | ❌       | `https://storage.yandexcloud.net` | S3 endpoint               |
| `S3_PREFIX`            | ❌       | `client-daily`                    | Object key prefix         |
| `RETENTION_DAYS`       | ❌       | `365`                             | Days to keep snapshots    |
| `TELEGRAM_BOT_TOKEN`   | ❌       | —                                 | Telegram bot for alerts   |
| `TELEGRAM_CHAT_ID`     | ❌       | —                                 | Telegram chat for alerts  |

## Deploy

### 1. Install dependencies

```bash
cd yandex-cloud-functions/heys-client-daily-backup
npm install
```

### 2. Ensure certs

SSL cert for Yandex Managed PostgreSQL should be at `../certs/root.crt` (shared
with other functions).

### 3. Create Cloud Function

```bash
yc serverless function create \
  --name heys-client-daily-backup \
  --description "Daily per-client KV snapshot to Object Storage"
```

### 4. Deploy version

```bash
cd yandex-cloud-functions

yc serverless function version create \
  --function-name heys-client-daily-backup \
  --runtime nodejs18 \
  --entrypoint index.handler \
  --memory 256m \
  --execution-timeout 300s \
  --source-path ./heys-client-daily-backup \
  --environment "PG_HOST=rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net,PG_PORT=6432,PG_DATABASE=heys_production,PG_USER=heys_admin,PG_PASSWORD=<PASSWORD>,S3_ACCESS_KEY_ID=<KEY>,S3_SECRET_ACCESS_KEY=<SECRET>,TELEGRAM_BOT_TOKEN=<TOKEN>,TELEGRAM_CHAT_ID=<CHAT_ID>"
```

### 5. Create timer trigger

```bash
yc serverless trigger create timer \
  --name heys-client-daily-backup-trigger \
  --cron-expression "0 1 * * ? *" \
  --invoke-function-name heys-client-daily-backup \
  --invoke-function-service-account-name heys-function-invoker
```

This fires at **01:00 UTC = 04:00 MSK** every day.

## Restore (admin-only)

### Скачать snapshot

```bash
# Список доступных дат
aws s3 ls s3://heys-backups/client-daily/ \
  --endpoint-url https://storage.yandexcloud.net

# Скачать конкретный snapshot
aws s3 cp \
  s3://heys-backups/client-daily/2026-03-29/<clientId>.json.gz \
  /tmp/restore.json.gz \
  --endpoint-url https://storage.yandexcloud.net

# Распаковать и просмотреть
gunzip -c /tmp/restore.json.gz | jq '.keyCount, (.kvSnapshot | keys)'
```

### Валидация checksum

```bash
# Извлечь checksum из snapshot
STORED=$(gunzip -c /tmp/restore.json.gz | jq -r '.checksum')

# Пересчитать (checksum считается по JSON без поля checksum)
COMPUTED=$(gunzip -c /tmp/restore.json.gz \
  | jq 'del(.checksum)' \
  | sha256sum | cut -d' ' -f1)

echo "Stored:   $STORED"
echo "Computed: $COMPUTED"
```

### Restore в production (осторожно!)

Восстановление делается через SQL-скрипт, который:

1. Скачивает snapshot по `clientId + businessDate`.
2. Показывает dry-run diff (ключи, которые будут перезаписаны).
3. Выполняет transactional upsert в `client_kv_store`.

> **Пока restore автоматизирован не полностью.** Скрипт будет добавлен в
> следующем этапе.

## Monitoring

- Логи: Yandex Cloud Functions Console → heys-client-daily-backup → Логи
- Telegram: ошибки приходят сразу, success — только по воскресеньям
- Ключевые метрики в response body: `total`, `success`, `failed`, `durationSec`,
  `cleaned`

## Отличия от YC Managed PG built-in backup

|             | YC Managed PG (built-in)  | heys-client-daily-backup        |
| ----------- | ------------------------- | ------------------------------- |
| Scope       | Вся БД                    | Per-client KV                   |
| Format      | Внутренний YC формат      | JSON.gz                         |
| Restore     | yc cluster restore (PITR) | Upsert KV конкретного клиента   |
| Retention   | 14 дней                   | 365 дней                        |
| Granularity | Снапшот всей БД           | Один файл на клиента на день    |
| Use case    | Disaster recovery         | Точечное восстановление клиента |

> Ранее сравнение было с самописной функцией `heys-backup` (pg_dump → S3).
> Удалена 2026-05-22 — заменена встроенным YC backup'ом (см. выше).
