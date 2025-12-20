# 🚀 Деплой HEYS API на Yandex Cloud Functions

## Шаг 1: Подготовка ZIP-архивов

Для каждой функции нужно создать ZIP с кодом и зависимостями.

### 1.1 Установка зависимостей и архивация

```bash
cd /Users/poplavskijanton/HEYS-v2/yandex-cloud-functions

# RPC функция
cd heys-api-rpc
npm install
zip -r ../heys-api-rpc.zip .
cd ..

# REST функция
cd heys-api-rest
npm install
zip -r ../heys-api-rest.zip .
cd ..

# SMS функция
cd heys-api-sms
npm install
zip -r ../heys-api-sms.zip .
cd ..

# Leads функция
cd heys-api-leads
npm install
zip -r ../heys-api-leads.zip .
cd ..

# Health функция
cd heys-api-health
npm install
zip -r ../heys-api-health.zip .
cd ..
```

---

## Шаг 2: Создание функций в Yandex Cloud Console

### 2.1 Перейти в консоль

https://console.cloud.yandex.ru/folders/<folder-id>/functions

### 2.2 Для каждой функции:

1. Нажать **"Создать функцию"**
2. Имя: `heys-api-rpc` (или rpc/rest/sms/leads/health)
3. Загрузить ZIP-архив
4. Runtime: **Node.js 18**
5. Точка входа: **index.handler**
6. Таймаут: **10 секунд** (для leads/rpc можно 30)
7. RAM: **128 МБ** (для leads/rpc можно 256)

### 2.3 Переменные окружения (Environment Variables)

Для **heys-api-rpc**, **heys-api-rest**, **heys-api-leads**:

```
PG_HOST=rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net
PG_PORT=6432
PG_DATABASE=heys_production
PG_USER=heys_admin
PG_PASSWORD=<пароль_от_базы>
```

Для **heys-api-sms**:

```
SMS_API_KEY=<api_key_от_sms.ru>
```

Для **heys-api-leads** дополнительно:

```
TELEGRAM_BOT_TOKEN=<токен_бота>
TELEGRAM_CHAT_ID=<chat_id_куратора>
```

---

## Шаг 3: Создание API Gateway

### 3.1 Перейти в API Gateway

https://console.cloud.yandex.ru/folders/<folder-id>/api-gateway

### 3.2 Создать новый API Gateway

Имя: `heys-api-gateway`

### 3.3 OpenAPI спецификация

```yaml
openapi: 3.0.0
info:
  title: HEYS API
  version: 1.0.0

paths:
  /rpc:
    post:
      x-yc-apigateway-integration:
        type: cloud_functions
        function_id: <ID_функции_heys-api-rpc>
        service_account_id: <ID_сервисного_аккаунта>
      parameters:
        - name: fn
          in: query
          required: true
          schema:
            type: string
    options:
      x-yc-apigateway-integration:
        type: cloud_functions
        function_id: <ID_функции_heys-api-rpc>
        service_account_id: <ID_сервисного_аккаунта>

  /rest:
    get:
      x-yc-apigateway-integration:
        type: cloud_functions
        function_id: <ID_функции_heys-api-rest>
        service_account_id: <ID_сервисного_аккаунта>
      parameters:
        - name: table
          in: query
          required: true
          schema:
            type: string
    post:
      x-yc-apigateway-integration:
        type: cloud_functions
        function_id: <ID_функции_heys-api-rest>
        service_account_id: <ID_сервисного_аккаунта>
    patch:
      x-yc-apigateway-integration:
        type: cloud_functions
        function_id: <ID_функции_heys-api-rest>
        service_account_id: <ID_сервисного_аккаунта>
    delete:
      x-yc-apigateway-integration:
        type: cloud_functions
        function_id: <ID_функции_heys-api-rest>
        service_account_id: <ID_сервисного_аккаунта>
    options:
      x-yc-apigateway-integration:
        type: cloud_functions
        function_id: <ID_функции_heys-api-rest>
        service_account_id: <ID_сервисного_аккaунта>

  /sms:
    post:
      x-yc-apigateway-integration:
        type: cloud_functions
        function_id: <ID_функции_heys-api-sms>
        service_account_id: <ID_сервисного_аккаунта>
    options:
      x-yc-apigateway-integration:
        type: cloud_functions
        function_id: <ID_функции_heys-api-sms>
        service_account_id: <ID_сервисного_аккаунта>

  /leads:
    post:
      x-yc-apigateway-integration:
        type: cloud_functions
        function_id: <ID_функции_heys-api-leads>
        service_account_id: <ID_сервисного_аккаунта>
    options:
      x-yc-apigateway-integration:
        type: cloud_functions
        function_id: <ID_функции_heys-api-leads>
        service_account_id: <ID_сервисного_аккаунта>

  /health:
    get:
      x-yc-apigateway-integration:
        type: cloud_functions
        function_id: <ID_функции_heys-api-health>
        service_account_id: <ID_сервисного_аккаунта>
```

### 3.4 Получить URL API Gateway

После создания будет URL типа:

```
https://d5dxxxxxxxxxx.apigw.yandexcloud.net
```

---

## Шаг 4: Настройка DNS (api.heyslab.ru)

### 4.1 В reg.ru добавить CNAME запись:

```
api.heyslab.ru → d5dxxxxxxxxxx.apigw.yandexcloud.net
```

Или использовать A-запись с IP API Gateway.

### 4.2 Настроить домен в API Gateway

В настройках API Gateway добавить домен `api.heyslab.ru` и настроить SSL
сертификат через Certificate Manager.

---

## Шаг 5: Обновление фронтенда

### 5.1 Обновить URL в apps/web

В `apps/web/heys_storage_supabase_v1.js` или конфиге:

```javascript
const API_URL = 'https://api.heyslab.ru';
```

### 5.2 Обновить URL в apps/landing

В `apps/landing` обновить API endpoint:

```javascript
const API_URL = 'https://api.heyslab.ru/leads';
```

---

## Шаг 6: Тестирование

### 6.1 Health check

```bash
curl https://api.heyslab.ru/health
```

### 6.2 RPC вызов

```bash
curl -X POST "https://api.heyslab.ru/rpc?fn=get_shared_products" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### 6.3 Lead создание

```bash
curl -X POST "https://api.heyslab.ru/leads" \
  -H "Content-Type: application/json" \
  -d '{"name":"Тест","phone":"79001234567","messenger":"telegram"}'
```

---

## Оценка стоимости

| Компонент                     | Стоимость/мес |
| ----------------------------- | ------------- |
| Cloud Functions (10k вызовов) | ~100 ₽        |
| API Gateway (10k запросов)    | ~50 ₽         |
| PostgreSQL (уже есть)         | ~2500 ₽       |
| **Итого**                     | **~2650 ₽**   |

---

## Чеклист

- [ ] Создать ZIP архивы для каждой функции
- [ ] Создать 5 функций в Yandex Cloud
- [ ] Задать переменные окружения
- [ ] Создать API Gateway со спецификацией
- [ ] Настроить DNS api.heyslab.ru
- [ ] Обновить URL в фронтенде
- [ ] Протестировать все endpoint'ы
- [ ] Отключить Vercel API routes
