# 🚀 Настройка деплоя на Yandex Cloud

> Этот документ описывает настройку автоматического деплоя на Yandex Cloud:
>
> - **PWA** (apps/web) → `heys-app` bucket → `app.heyslab.ru`
> - **Landing** (apps/landing) → `heys-static` bucket → `heyslab.ru`
> - **API** → Cloud Functions → `api.heyslab.ru`

## Архитектура

```
GitHub Actions (deploy-yandex.yml)
├── build-and-deploy (Job 1)
│   ├── Build PWA + Landing
│   ├── Deploy PWA → heys-app bucket
│   ├── Deploy Landing → heys-static bucket
│   └── CDN Cache Invalidation
│
└── deploy-functions (Job 2, параллельно)
    └── Deploy Cloud Functions (5 штук)

Yandex Cloud Infrastructure:
├── Object Storage
│   ├── heys-app (PWA) ← app.heyslab.ru
│   └── heys-static (Landing) ← heyslab.ru
├── CDN
│   ├── bc8rktbgbmpyezsxnzrn (app.heyslab.ru)
│   └── bc8rk3pnqppsfime3nth (heyslab.ru)
├── Certificate Manager
│   ├── fpq2cb4ir6jje51dnsbu (app.heyslab.ru)
│   └── fpqps3bjl3agvqj0k5uq (heyslab.ru)
└── Cloud Functions (5 functions)
    └── API Gateway: api.heyslab.ru
```

## Предварительные требования

1. Аккаунт Yandex Cloud с активным биллингом
2. Созданный folder для проекта
3. Сервисный аккаунт с ролями:
   - `storage.editor` — для Object Storage
   - `cdn.editor` — для CDN
   - `serverless.functions.admin` — для Cloud Functions
   - `certificate-manager.certificates.downloader` — для сертификатов

---

## Шаг 1: Создание Object Storage buckets

```bash
# Bucket для PWA (app.heyslab.ru)
yc storage bucket create \
  --name heys-app \
  --default-storage-class standard \
  --max-size 1073741824

# Bucket для Landing (heyslab.ru)
yc storage bucket create \
  --name heys-static \
  --default-storage-class standard \
  --max-size 1073741824
```

### Настройка публичного доступа

В консоли Yandex Cloud → Object Storage → `heys-static` → Настройки:

1. **Публичный доступ**: Включить "Публичный доступ к объектам"
2. **Веб-сайт**: Включить режим веб-сайта
   - Главная страница: `index.html`
   - Страница ошибки: `index.html` (для SPA-роутинга)

### CORS настройки

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration>
  <CORSRule>
    <AllowedOrigin>*</AllowedOrigin>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <MaxAgeSeconds>3600</MaxAgeSeconds>
    <AllowedHeader>*</AllowedHeader>
  </CORSRule>
</CORSConfiguration>
```

---

## Шаг 2: Создание сервисного аккаунта

```bash
# Создание сервисного аккаунта
yc iam service-account create --name heys-deploy

# Назначение ролей
yc resource-manager folder add-access-binding <FOLDER_ID> \
  --role storage.editor \
  --subject serviceAccount:<SERVICE_ACCOUNT_ID>

# Создание статических ключей (для S3-совместимого API)
yc iam access-key create --service-account-name heys-deploy
```

**Сохраните вывод** — он понадобится для GitHub Secrets:

- `key_id` → `YC_ACCESS_KEY_ID`
- `secret` → `YC_SECRET_ACCESS_KEY`

---

## Шаг 3: Настройка GitHub Secrets

В репозитории GitHub → Settings → Secrets and variables → Actions:

### 🔑 Основные секреты (обязательные)

| Secret Name            | Описание                          | Как получить               |
| ---------------------- | --------------------------------- | -------------------------- |
| `YC_ACCESS_KEY_ID`     | Access Key ID сервисного аккаунта | `yc iam access-key create` |
| `YC_SECRET_ACCESS_KEY` | Secret Access Key                 | `yc iam access-key create` |
| `YC_OAUTH_TOKEN`       | OAuth токен для YC CLI            | `yc config get token`      |
| `YC_CLOUD_ID`          | ID облака                         | `yc config get cloud-id`   |
| `YC_FOLDER_ID`         | ID папки                          | `yc config get folder-id`  |

### 🌐 CDN секреты (опционально, для cache invalidation)

| Secret Name         | Описание        | Текущее значение       |
| ------------------- | --------------- | ---------------------- |
| `YC_CDN_PWA_ID`     | CDN для PWA     | `bc8rktbgbmpyezsxnzrn` |
| `YC_CDN_LANDING_ID` | CDN для Landing | `bc8rk3pnqppsfime3nth` |

### ⚡ Cloud Functions секреты (для деплоя функций)

| Secret Name          | Описание                            | Функции которые используют |
| -------------------- | ----------------------------------- | -------------------------- |
| `PG_HOST`            | PostgreSQL хост                     | rpc, rest, leads, auth     |
| `PG_USER`            | PostgreSQL пользователь             | rpc, rest, leads, auth     |
| `PG_PASSWORD`        | PostgreSQL пароль                   | rpc, rest, leads, auth     |
| `JWT_SECRET`         | Секрет для JWT токенов              | auth                       |
| `SMS_API_KEY`        | API ключ SMS.ru                     | sms                        |
| `TELEGRAM_BOT_TOKEN` | Токен Telegram бота                 | leads                      |
| `TELEGRAM_CHAT_ID`   | Chat ID для уведомлений             | leads                      |
| `YC_FOLDER_ID`       | ID папки                            | `b1g...`                   |
| `YC_CDN_RESOURCE_ID` | ID CDN ресурса (опционально)        | `bc8...`                   |
| `YC_IAM_TOKEN`       | IAM токен для CDN API (опционально) | Генерируется автоматически |

---

## Шаг 4: Настройка CDN (опционально, рекомендуется)

### Создание CDN ресурса

В консоли Yandex Cloud → CDN → Создать ресурс:

1. **Источник**: `heys-static.storage.yandexcloud.net`
2. **Домен**: `heys.app` или `cdn.heys.app`
3. **Протокол**: HTTPS
4. **Сертификат**: Let's Encrypt (автоматически) или свой

### Настройки кэширования

| Путь               | TTL           | Описание                    |
| ------------------ | ------------- | --------------------------- |
| `/*.html`          | 0             | Без кэша для PWA-обновлений |
| `/sw.js`           | 0             | Service Worker без кэша     |
| `/build-meta.json` | 0             | Версия приложения (source)  |
| `/version.json`    | 0             | Legacy fallback             |
| `/manifest.*`      | 0             | PWA манифест                |
| `/assets/*`        | 31536000 (1y) | Статика с хэшами            |
| `/*`               | 86400 (1d)    | Остальное                   |

---

## Шаг 5: Настройка DNS

### Вариант A: Прямой домен на Object Storage

```
heys.app.    A     <Object Storage IP>
```

### Вариант B: Через CDN (рекомендуется)

```
heys.app.    CNAME  <CDN_CNAME>.gcdn.co.
```

---

## Шаг 6: Проверка деплоя

После push в main, workflow выполнит:

1. ✅ Установка зависимостей
2. ✅ Запуск критических тестов
3. ✅ Сборка приложения
4. ✅ Генерация build-meta.json (и version.json fallback)
5. ✅ Загрузка в Object Storage
6. ✅ Инвалидация CDN кэша (если настроен)

### Мониторинг

- GitHub Actions → Workflow runs
- Yandex Cloud Console → Object Storage → Мониторинг
- Yandex Cloud Console → CDN → Статистика

---

## Rollback (откат)

При необходимости отката:

```bash
# Откатить на предыдущий коммит
git revert HEAD
# Только после явной команды на rollback push.
git push origin main

# Или вручную загрузить предыдущую версию
aws s3 sync ./backup-dist/ s3://heys-static/ \
  --endpoint-url=https://storage.yandexcloud.net
```

---

## Сравнение с Vercel

| Параметр        | Vercel       | Yandex Cloud           |
| --------------- | ------------ | ---------------------- |
| Деплой          | Автоматич.   | Автоматич. (Actions)   |
| Скорость        | ~2 мин       | ~3-4 мин               |
| Локация         | Германия/США | Россия (ru-central1)   |
| Соответствие ФЗ | ❌           | ✅ 152-ФЗ              |
| CDN             | Встроенный   | Отдельно настраивается |
| Стоимость       | Free tier    | ~500-1000 ₽/мес        |

---

## Troubleshooting

### Ошибка "Access Denied"

Проверьте:

1. Права сервисного аккаунта
2. Публичный доступ к bucket
3. Правильность ключей в GitHub Secrets

### PWA не обновляется

1. Проверьте `sw.js` имеет `Cache-Control: no-cache`
2. Проверьте `build-meta.json` обновился
3. Очистите кэш CDN: `yc cdn cache purge --resource-id <ID>`

### 404 на роутах SPA

Убедитесь, что страница ошибки настроена на `index.html`:

```bash
yc storage bucket update heys-static \
  --website-settings '{"index": "index.html", "error": "index.html"}'
```

---

## Полезные команды

```bash
# Проверить содержимое bucket
aws s3 ls s3://heys-static/ --endpoint-url=https://storage.yandexcloud.net

# Загрузить файл вручную
aws s3 cp ./file.txt s3://heys-static/ --endpoint-url=https://storage.yandexcloud.net

# Очистить CDN кэш
yc cdn cache purge --resource-id <RESOURCE_ID> --path "/*"

# Проверить версию деплоя
curl https://heys.app/build-meta.json
```

---

**Последнее обновление:** 2025-12-22
