# 🚀 Настройка деплоя на Yandex Cloud

> Этот документ описывает настройку автоматического деплоя фронтенда на Yandex
> Cloud Object Storage + CDN.

## Предварительные требования

1. Аккаунт Yandex Cloud с активным биллингом
2. Созданный folder для проекта
3. Сервисный аккаунт с ролями:
   - `storage.editor` — для Object Storage
   - `cdn.editor` — для CDN (опционально)
   - `serverless.functions.invoker` — для Cloud Functions

---

## Шаг 1: Создание Object Storage bucket

```bash
# Через консоль Yandex Cloud или CLI:
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

| Secret Name            | Описание                            | Пример значения            |
| ---------------------- | ----------------------------------- | -------------------------- |
| `YC_ACCESS_KEY_ID`     | Access Key ID сервисного аккаунта   | `YCAJEwbN...`              |
| `YC_SECRET_ACCESS_KEY` | Secret Access Key                   | `YCNm...`                  |
| `YC_OAUTH_TOKEN`       | OAuth токен (для yc CLI)            | Из `yc config get token`   |
| `YC_CLOUD_ID`          | ID облака                           | `b1g...`                   |
| `YC_FOLDER_ID`         | ID папки                            | `b1g...`                   |
| `YC_CDN_RESOURCE_ID`   | ID CDN ресурса (опционально)        | `bc8...`                   |
| `YC_IAM_TOKEN`         | IAM токен для CDN API (опционально) | Генерируется автоматически |

---

## Шаг 4: Настройка CDN (опционально, рекомендуется)

### Создание CDN ресурса

В консоли Yandex Cloud → CDN → Создать ресурс:

1. **Источник**: `heys-static.storage.yandexcloud.net`
2. **Домен**: `heys.app` или `cdn.heys.app`
3. **Протокол**: HTTPS
4. **Сертификат**: Let's Encrypt (автоматически) или свой

### Настройки кэширования

| Путь            | TTL           | Описание                    |
| --------------- | ------------- | --------------------------- |
| `/*.html`       | 0             | Без кэша для PWA-обновлений |
| `/sw.js`        | 0             | Service Worker без кэша     |
| `/version.json` | 0             | Версия приложения           |
| `/manifest.*`   | 0             | PWA манифест                |
| `/assets/*`     | 31536000 (1y) | Статика с хэшами            |
| `/*`            | 86400 (1d)    | Остальное                   |

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
4. ✅ Генерация version.json
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
2. Проверьте `version.json` обновился
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
curl https://heys.app/version.json
```

---

**Последнее обновление:** 2025-12-22
