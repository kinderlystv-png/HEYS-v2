# 🔧 Применение миграции 2025-12-22_missing_functions.sql

## ⚠️ ВАЖНО: Пароль базы данных изменён

Локальный `.env.yandex` содержит **устаревший пароль**. Актуальный пароль —
только в:

1. Консоли Yandex Cloud (Managed PostgreSQL → Users → heys_admin)
2. Environment variables задеплоенных Cloud Functions

## Проблема

После миграции с Supabase на Yandex Cloud PostgreSQL **6 функций отсутствуют** в
базе данных:

1. `client_pin_auth` — комбинированная авторизация
2. `create_client_with_pin` — создание клиента с PIN
3. `reset_client_pin` — сброс PIN клиента
4. `get_client_data` — получение данных клиента
5. `get_curator_clients` — список клиентов куратора
6. `create_pending_product` — заявка на модерацию продукта

## Решение

### Вариант 1: Через Yandex Cloud Console (рекомендуется)

1. Откройте https://console.cloud.yandex.ru/
2. Перейдите в **Managed Service for PostgreSQL** → кластер `heys-production`
3. Вкладка **SQL** → **Выполнить запрос**
4. Скопируйте содержимое файла `2025-12-22_missing_functions.sql` и выполните

### Вариант 2: Через psql с актуальным паролем

```bash
# Получите актуальный пароль в консоли Yandex Cloud:
# Managed PostgreSQL → кластер → Пользователи → heys_admin → показать пароль

export PGPASSWORD='<актуальный_пароль>'

psql "host=rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net \
      port=6432 \
      dbname=heys_production \
      user=heys_admin \
      sslmode=require" \
  -f /Users/poplavskijanton/HEYS-v2/yandex-cloud-functions/migrations/2025-12-22_missing_functions.sql
```

### Вариант 3: Через DBeaver/pgAdmin

1. Подключитесь к базе с SSL
2. Выполните скрипт `2025-12-22_missing_functions.sql`

## Проверка

После применения миграции выполните:

```sql
SELECT proname FROM pg_proc
WHERE proname IN (
  'client_pin_auth',
  'create_client_with_pin',
  'reset_client_pin',
  'get_client_data',
  'get_curator_clients',
  'create_pending_product'
);
```

Должно вернуть 6 строк.

## Тестирование через API

```bash
# Проверка client_pin_auth
curl -X POST "https://api.heyslab.ru/rpc?fn=client_pin_auth" \
  -H "Content-Type: application/json" \
  -d '{"p_phone": "79261234567", "p_pin": "1234"}'

# Проверка get_client_data
curl -X POST "https://api.heyslab.ru/rpc?fn=get_client_data" \
  -H "Content-Type: application/json" \
  -d '{"p_client_id": "4545ee50-4f5f-4fc0-b862-7ca45fa1bafc"}'
```

## Файлы

- Миграция: `yandex-cloud-functions/migrations/2025-12-22_missing_functions.sql`
- Документация: этот файл

## Заметки

- Актуальный пароль `heys007670` синхронизирован в `.env.yandex` и Cloud
  Functions
- Резервная копия пароля в Yandex Cloud Console (Managed PostgreSQL → Users)
