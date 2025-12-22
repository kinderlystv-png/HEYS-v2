# 💳 Деплой heys-api-payments (ЮKassa)

## Шаг 1: Подготовка

```bash
cd /Users/poplavskijanton/HEYS-v2/yandex-cloud-functions/heys-api-payments

# Установить зависимости
npm install

# Создать ZIP архив
zip -r ../heys-api-payments.zip .
```

## Шаг 2: Создание функции через yc CLI

```bash
# Убедитесь что yc настроен
yc config list

# Создать функцию
yc serverless function create --name=heys-api-payments

# Создать версию с кодом
yc serverless function version create \
  --function-name=heys-api-payments \
  --runtime=nodejs18 \
  --entrypoint=index.handler \
  --memory=128m \
  --execution-timeout=10s \
  --source-path=../heys-api-payments.zip \
  --environment "PG_HOST=rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net,PG_PORT=6432,PG_DATABASE=heys_production,PG_USER=heys_admin,PG_PASSWORD=<ПАРОЛЬ>,YUKASSA_SHOP_ID=<SHOP_ID>,YUKASSA_SECRET_KEY=<SECRET_KEY>"
```

## Шаг 3: Получить function_id

```bash
yc serverless function get --name=heys-api-payments --format=json | jq -r '.id'
```

Результат: `d4eXXXXXXXXXXXXXXXX` — это и есть function_id

## Шаг 4: Обновить API Gateway спецификацию

В файле `api-gateway-spec-v2.yaml` заменить все `${PAYMENTS_FUNCTION_ID}` на полученный ID:

```bash
# Например, если ID = d4e123456789abcdef
sed -i '' 's/\${PAYMENTS_FUNCTION_ID}/d4e123456789abcdef/g' ../api-gateway-spec-v2.yaml
```

## Шаг 5: Применить спецификацию к API Gateway

```bash
yc serverless api-gateway update \
  --id=d5d7939njvjp27ofsok0 \
  --spec=../api-gateway-spec-v2.yaml
```

## Шаг 6: Настроить webhook в ЮKassa

1. Зайти в https://yookassa.ru/my/merchant/integration
2. HTTP-уведомления → Добавить URL:
   ```
   https://api.heyslab.ru/payments/webhook
   ```
3. Выбрать события:
   - `payment.succeeded`
   - `payment.canceled`
   - `refund.succeeded`

## Шаг 7: Тестирование

```bash
# Health check
curl https://api.heyslab.ru/payments

# Создание платежа (тестовый)
curl -X POST "https://api.heyslab.ru/payments/create" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "test-123",
    "plan": "base",
    "returnUrl": "https://heyslab.ru/payment-success"
  }'
```

## Переменные окружения

| Переменная | Описание | Пример |
|------------|----------|--------|
| `PG_HOST` | Хост PostgreSQL | `rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net` |
| `PG_PORT` | Порт PostgreSQL | `6432` |
| `PG_DATABASE` | Имя базы данных | `heys_production` |
| `PG_USER` | Пользователь | `heys_admin` |
| `PG_PASSWORD` | Пароль | `***` |
| `YUKASSA_SHOP_ID` | ID магазина ЮKassa | `12345` |
| `YUKASSA_SECRET_KEY` | Секретный ключ ЮKassa | `test_***` или `live_***` |

## Тестовые данные карты (sandbox)

- Номер: `5555555555554444`
- Срок: любой в будущем
- CVV: любые 3 цифры
- 3D-Secure: `1234` (если запросит)

## Чеклист

- [ ] npm install + zip
- [ ] Создать функцию в Yandex Cloud
- [ ] Задать env variables
- [ ] Получить function_id
- [ ] Обновить api-gateway-spec-v2.yaml
- [ ] Применить спецификацию
- [ ] Настроить webhook в ЮKassa
- [ ] Протестировать создание платежа
- [ ] Протестировать webhook
- [ ] Переключиться на production ключи
