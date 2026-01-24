# HEYS Backup Configuration Guide

## Обзор

Данное руководство описывает настройку автоматических бэкапов PostgreSQL базы данных для проекта HEYS v2.

## Компоненты

### 1. Managed PostgreSQL Auto-Backup (Yandex Cloud Console)

**Цель**: Автоматические бэкапы на уровне Yandex Managed PostgreSQL

**Настройка через Yandex Cloud Console**:

1. Перейдите в [Yandex Cloud Console](https://console.cloud.yandex.ru/)
2. Выберите Managed Service for PostgreSQL
3. Выберите кластер `heys_production`
4. Перейдите в раздел **"Резервные копии"** (Backups)
5. Настройте параметры:
   - **Время начала резервного копирования**: `03:00 UTC`
   - **Срок хранения**: `7 дней`
   - **Автоматическое создание**: `Включено`

**Преимущества**:
- Встроенная функция Yandex Cloud
- Быстрое восстановление (Point-in-Time Recovery)
- Хранится в инфраструктуре Yandex Cloud
- Не требует дополнительного кода

**Недостатки**:
- Ограниченное время хранения (до 60 дней)
- Привязка к Yandex Cloud
- Нет контроля над форматом бэкапа

### 2. Custom Backup Cloud Function (heys-backup)

**Цель**: Дополнительные бэкапы в Yandex Object Storage (S3) для долгосрочного хранения

**Функциональность**:
- `pg_dump` полный дамп БД
- `gzip` сжатие для экономии места
- Загрузка в S3 bucket `heys-backups`
- **🔒 Server-side encryption (AES256)** для защиты данных at rest
- Автоматическая ротация (удаление старых бэкапов)
- Уведомления в Telegram при ошибках

## Шаг 1: Создание S3 Bucket

1. Перейдите в [Object Storage](https://console.cloud.yandex.ru/folders/<folder-id>/storage)
2. Нажмите **"Создать бакет"**
3. Параметры:
   - **Имя**: `heys-backups`
   - **Класс хранилища**: `Холодное` (COLD) — дешевле для бэкапов
   - **Публичный доступ**: `Запрещён`
   - **Шифрование**: `Включить` (опционально)
4. Нажмите **"Создать бакет"**

## Шаг 2: Создание Service Account для S3

1. Перейдите в [IAM Service Accounts](https://console.cloud.yandex.ru/folders/<folder-id>/service-accounts)
2. Нажмите **"Создать сервисный аккаунт"**
3. Параметры:
   - **Имя**: `heys-backup-sa`
   - **Роль**: `storage.editor` (для записи в bucket)
4. Создайте **Static Access Key**:
   - Перейдите в созданный сервисный аккаунт
   - Нажмите **"Создать новый ключ"** → **"Создать статический ключ доступа"**
   - **Сохраните** `Access Key ID` и `Secret Access Key` — они понадобятся для env переменных

## Шаг 3: Деплой Cloud Function

### 3.1 Подготовка архива

```bash
cd yandex-cloud-functions/heys-backup
npm install
zip -r heys-backup.zip index.js package.json node_modules/
```

### 3.2 Создание функции через CLI

```bash
yc serverless function create \
  --name=heys-backup \
  --description="HEYS PostgreSQL backup to Object Storage"

yc serverless function version create \
  --function-name=heys-backup \
  --runtime nodejs18 \
  --entrypoint index.handler \
  --memory 512m \
  --execution-timeout 600s \
  --source-path ./heys-backup.zip \
  --environment PG_HOST=<DB_HOST> \
  --environment PG_PORT=6432 \
  --environment PG_DATABASE=heys_production \
  --environment PG_USER=heys_admin \
  --environment PG_PASSWORD=<DB_PASSWORD> \
  --environment S3_ACCESS_KEY_ID=<S3_KEY_ID> \
  --environment S3_SECRET_ACCESS_KEY=<S3_SECRET> \
  --environment S3_BUCKET=heys-backups \
  --environment BACKUP_RETENTION_DAYS=7 \
  --environment TELEGRAM_BOT_TOKEN=<TELEGRAM_TOKEN> \
  --environment TELEGRAM_CHAT_ID=<TELEGRAM_CHAT_ID>
```

### 3.3 Создание через Yandex Cloud Console

1. Перейдите в [Cloud Functions](https://console.cloud.yandex.ru/folders/<folder-id>/serverless/functions)
2. Нажмите **"Создать функцию"**
3. Параметры:
   - **Имя**: `heys-backup`
   - **Среда выполнения**: `nodejs18`
   - **Точка входа**: `index.handler`
   - **Timeout**: `600 секунд` (10 минут)
   - **Память**: `512 MB`
4. Загрузите ZIP архив
5. Настройте переменные окружения (см. раздел Environment Variables)
6. Нажмите **"Создать версию"**

## Шаг 4: Настройка Trigger (Cron)

### 4.1 Через CLI

```bash
yc serverless trigger create timer \
  --name heys-backup-daily \
  --cron-expression "0 3 * * ? *" \
  --invoke-function-name heys-backup \
  --invoke-function-service-account-id <SERVICE_ACCOUNT_ID>
```

### 4.2 Через Console

1. Перейдите в [Triggers](https://console.cloud.yandex.ru/folders/<folder-id>/serverless/triggers)
2. Нажмите **"Создать триггер"**
3. Параметры:
   - **Тип**: `Timer`
   - **Имя**: `heys-backup-daily`
   - **Cron выражение**: `0 3 * * ? *` (каждый день в 03:00 UTC)
   - **Функция**: `heys-backup`
   - **Сервисный аккаунт**: `heys-backup-sa`
4. Нажмите **"Создать триггер"**

## Environment Variables

| Переменная | Обязательная | Описание | Пример |
|------------|--------------|----------|--------|
| `PG_HOST` | ✅ | Хост PostgreSQL | `rc1b-xxx.mdb.yandexcloud.net` |
| `PG_PORT` | ❌ | Порт PostgreSQL | `6432` (по умолчанию) |
| `PG_DATABASE` | ❌ | Имя БД | `heys_production` (по умолчанию) |
| `PG_USER` | ❌ | Пользователь БД | `heys_admin` (по умолчанию) |
| `PG_PASSWORD` | ✅ | Пароль БД | `***` |
| `S3_ACCESS_KEY_ID` | ✅ | Access Key ID для S3 | `YCAJEXXXxxx` |
| `S3_SECRET_ACCESS_KEY` | ✅ | Secret Access Key для S3 | `YCMxxxxx` |
| `S3_BUCKET` | ❌ | Имя bucket | `heys-backups` (по умолчанию) |
| `S3_ENDPOINT` | ❌ | Endpoint Object Storage | `https://storage.yandexcloud.net` |
| `BACKUP_RETENTION_DAYS` | ❌ | Срок хранения бэкапов | `7` (по умолчанию) |
| `TELEGRAM_BOT_TOKEN` | ❌ | Токен Telegram бота для уведомлений | `123456:ABC-DEF...` |
| `TELEGRAM_CHAT_ID` | ❌ | Chat ID для уведомлений | `-1001234567890` |

## Восстановление из бэкапа

### Из Managed PostgreSQL Backup

```bash
# Восстановление в новый кластер
yc managed-postgresql cluster restore \
  --backup-id <BACKUP_ID> \
  --name heys-production-restored \
  --environment production \
  --network-name default
```

### Из Custom Backup (S3)

```bash
# 1. Скачать бэкап из S3
aws s3 cp s3://heys-backups/heys-production-2026-01-23T03-00-00.dump.gz . \
  --endpoint-url https://storage.yandexcloud.net

# 2. Распаковать
gunzip heys-production-2026-01-23T03-00-00.dump.gz

# 3. Восстановить в БД
pg_restore \
  -h rc1b-xxx.mdb.yandexcloud.net \
  -p 6432 \
  -U heys_admin \
  -d heys_production \
  -v \
  --clean \
  heys-production-2026-01-23T03-00-00.dump
```

## Мониторинг

### Логи Cloud Function

```bash
yc serverless function logs heys-backup --follow
```

### Проверка бэкапов в S3

```bash
aws s3 ls s3://heys-backups/ --endpoint-url https://storage.yandexcloud.net
```

### Telegram уведомления

- ✅ Успешные бэкапы: раз в неделю (воскресенье)
- 🚨 Ошибки: каждый раз

## Стоимость

### Managed PostgreSQL Backup
- **Бесплатно**: первые 7 дней
- **Платно**: после 7 дней (~0.03₽/ГБ/день)

### Object Storage (S3)
- **Холодное хранилище**: ~0.45₽/ГБ/месяц
- **Операции**: ~0.005₽ за 1000 запросов

Пример: БД 5 ГБ × 7 дней бэкапов = ~35 ГБ × 0.45₽ = **~16₽/месяц**

## Безопасность

1. ✅ **Сертификаты SSL**: используются для подключения к PostgreSQL
2. ✅ **Приватный bucket**: публичный доступ запрещён
3. ✅ **Service Account**: минимальные права (`storage.editor`)
4. ✅ **Пароли в env**: не хранятся в коде
5. ⚠️ **Telegram**: не передаются ПДн (только статус бэкапа)

## Troubleshooting

### Ошибка: "pg_dump: command not found"

**Решение**: Установите PostgreSQL клиент в Docker образ Cloud Function:

```dockerfile
FROM node:18-alpine
RUN apk add --no-cache postgresql-client
```

### Ошибка: "Access Denied" при загрузке в S3

**Решение**: Проверьте права Service Account:

```bash
yc iam service-account get <SERVICE_ACCOUNT_ID>
```

### Бэкап не создаётся

**Проверка**:
1. Логи функции: `yc serverless function logs heys-backup`
2. Trigger срабатывает: `yc serverless trigger list`
3. Env переменные установлены: проверьте в Console

## Поддержка

При проблемах с бэкапами:
1. Проверьте логи Cloud Function
2. Проверьте уведомления в Telegram
3. Обратитесь к команде DevOps

---

**Последнее обновление**: 2026-01-23
**Версия**: 1.0.0
