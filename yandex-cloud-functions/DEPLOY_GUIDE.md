# 🚀 Деплой HEYS API на Yandex Cloud Functions

> **⚡ РЕКОМЕНДУЕТСЯ**: Используйте
> [централизованный deployment скрипт](#быстрый-деплой-с-env) для консистентного
> управления секретами

---

## 🎯 Быстрый деплой с .env (РЕКОМЕНДУЕТСЯ)

**Преимущества**: Все секреты в одном месте, исключены опечатки, гарантия
консистентности

### 1. Настройка (один раз)

```bash
cd yandex-cloud-functions

# Создать .env из шаблона
cp .env.example .env

# Заполнить актуальные значения
nano .env
```

### 2. Деплой

```bash
# 🚀 Деплой всех функций разом
./deploy-all.sh

# 🎯 Деплой одной функции
./deploy-all.sh heys-api-leads
```

**📖 Подробнее**: [SECRETS_MANAGEMENT_README.md](SECRETS_MANAGEMENT_README.md)

---

## 📦 Ручной деплой (legacy)

<details>
<summary>Развернуть инструкции для ручного деплоя через Yandex CLI</summary>

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

# Auth функция
cd heys-api-auth
npm install
zip -r ../heys-api-auth.zip .
cd ..

# 💳 Payments функция (ЮKassa)
cd heys-api-payments
npm install
zip -r ../heys-api-payments.zip .
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

Для **heys-api-auth**:

```
PG_HOST=rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net
PG_PORT=6432
PG_DATABASE=heys_production
PG_USER=heys_admin
PG_PASSWORD=<пароль_от_базы>
JWT_SECRET=<секретный_ключ_jwt>
```

Для **heys-api-payments** (💳 ЮKassa):

```
PG_HOST=rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net
PG_PORT=6432
PG_DATABASE=heys_production
PG_USER=heys_admin
PG_PASSWORD=<пароль_от_базы>
YUKASSA_SHOP_ID=<shop_id_из_юкассы>
YUKASSA_SECRET_KEY=<secret_key_из_юкассы>
```

> ⚠️ **Важно**: Для тестирования используйте тестовый Shop ID и Secret Key из
> личного кабинета ЮKassa (раздел "Интеграция" → "Ключи API").

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

### 6.4 Payments (ЮKassa)

```bash
# Проверка health
curl https://api.heyslab.ru/payments

# Создание тестового платежа
curl -X POST "https://api.heyslab.ru/payments/create" \
  -H "Content-Type: application/json" \
  -d '{"clientId":"test-client-id","plan":"base","returnUrl":"https://heyslab.ru/payment-success"}'
```

---

## Шаг 7: Настройка ЮKassa Webhook

### 7.1 Зайти в личный кабинет ЮKassa

https://yookassa.ru/my/merchant/integration

### 7.2 Настроить webhook

1. Перейти в раздел **"HTTP-уведомления"**
2. Добавить URL:
   ```
   https://api.heyslab.ru/payments/webhook
   ```
3. Выбрать события:
   - `payment.succeeded` — платёж успешен
   - `payment.canceled` — платёж отменён
   - `refund.succeeded` — возврат выполнен

### 7.3 Проверить IP адреса ЮKassa

ЮKassa отправляет уведомления с IP:

- 185.71.76.0/27
- 185.71.77.0/27
- 77.75.153.0/25
- 77.75.154.128/25
- 2a02:5180::/32

### 7.4 Тестирование в песочнице

1. В личном кабинете ЮKassa активировать **тестовый магазин**
2. Использовать тестовые данные карты:
   - Номер: `5555555555554444`
   - Срок: любой в будущем
   - CVV: любые 3 цифры
3. Для симуляции различных статусов использовать специальные суммы:
   - Любая сумма → успешный платёж
   - Сумма с копейками `.01` → отклонённый платёж

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

- [ ] Создать ZIP архивы для каждой функции (7 штук)
- [ ] Создать функции в Yandex Cloud:
  - [ ] heys-api-rpc
  - [ ] heys-api-rest
  - [ ] heys-api-sms
  - [ ] heys-api-leads
  - [ ] heys-api-health
  - [ ] heys-api-auth
  - [ ] heys-api-payments (💳 ЮKassa)
- [ ] Задать переменные окружения (или использовать `./deploy-all.sh`)
- [ ] Создать/обновить API Gateway со спецификацией
- [ ] Настроить DNS api.heyslab.ru
- [ ] Обновить URL в фронтенде
- [ ] Протестировать все endpoint'ы
- [ ] Настроить webhook ЮKassa
- [ ] Протестировать платежи в песочнице
- [ ] Отключить Vercel API routes

</details>

---

## ✅ Рекомендации

1. ✅ **Используйте `./deploy-all.sh`** для консистентного управления секретами
2. ✅ **Храните .env локально**, никогда не коммитьте в git
3. ✅ **Документируйте изменения** в переменных окружения
4. ✅ **Тестируйте health endpoint** после каждого деплоя:
   `curl https://api.heyslab.ru/health`
