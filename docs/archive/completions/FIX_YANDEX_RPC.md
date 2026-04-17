# 🔧 Исправление Yandex Cloud RPC функции

## Проблема

Функция `heys-api-rpc` возвращает 502 потому что **не установлены Environment
Variables**.

## Решение (5 минут)

### Шаг 1: Открой консоль Yandex Cloud

https://console.cloud.yandex.ru/folders/b1ge3bcn09nt57dgakpp/functions/d4e9e90es31bgjp87j8i

### Шаг 2: Перейди в "Редактор" → "Создать версию"

### Шаг 3: Установи Environment Variables

| Переменная    | Значение                                    |
| ------------- | ------------------------------------------- |
| `PG_HOST`     | `rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net` |
| `PG_PORT`     | `6432`                                      |
| `PG_DATABASE` | `heys_production`                           |
| `PG_USER`     | `heys_admin`                                |
| `PG_PASSWORD` | `HeysAdmin2015!`                            |

### Шаг 4: Загрузи ZIP (если код устарел)

Файл: `yandex-cloud-functions/heys-api-rpc.zip`

### Шаг 5: Проверь настройки

- **Runtime:** Node.js 18
- **Точка входа:** `index.handler`
- **Таймаут:** 30 сек
- **RAM:** 256 МБ

### Шаг 6: Нажми "Создать версию"

## Проверка

```bash
curl -X POST 'https://api.heyslab.ru/rpc' \
  -H 'Content-Type: application/json' \
  -d '{"function_name": "get_client_salt", "params": {"p_phone": "79624556111"}}'
```

Должен вернуть:

```json
{ "salt": "...", "client_id": "...", "locked_until": null }
```

## Если не работает

Проверь логи функции:

1. Консоль → Функция → Логи
2. Ищи ошибки подключения к PostgreSQL
