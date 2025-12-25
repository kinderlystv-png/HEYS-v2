# 🔐 HEYS Security Runbook

> **Версия**: 1.0.0  
> **Дата**: 2025-12-25  
> **Статус**: ✅ P1 + P2 Hardening завершён

Этот документ — **единый источник истины** для проверки безопасности при каждом
деплое.

---

## 📋 Содержание

1. [DB Schema Invariants](#db-schema-invariants)
2. [Функции и сигнатуры](#функции-и-сигнатуры)
3. [GRANT/REVOKE проверки](#grantrevoke-проверки)
4. [Smoke Tests](#smoke-tests)
5. [Red Flags](#red-flags)
6. [Периодические проверки](#периодические-проверки)

---

## DB Schema Invariants

**⚠️ ВАЖНО:** Эти имена колонок зафиксированы в production. Не меняйте без
миграции всех зависимых функций!

### Таблица `pin_login_attempts`

```sql
CREATE TABLE public.pin_login_attempts (
  phone TEXT NOT NULL,
  ip INET NOT NULL,                    -- ⚠️ НЕ ip_address!
  attempts INT NOT NULL DEFAULT 1,
  first_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until TIMESTAMPTZ,
  PRIMARY KEY (phone, ip)
);
```

### Таблица `clients`

```sql
-- Ключевые поля (не полная схема)
id UUID PRIMARY KEY,
phone_normalized TEXT,                 -- Нормализованный телефон (только цифры)
pin_hash TEXT,                         -- bcrypt hash
name TEXT,                             -- ⚠️ НЕ first_name/last_name!
```

### Таблица `client_sessions`

```sql
CREATE TABLE public.client_sessions (
  session_token UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
```

---

## Функции и сигнатуры

### Публичные (доступны через API)

| Функция                              | Сигнатура                  | Доступ     |
| ------------------------------------ | -------------------------- | ---------- |
| `verify_client_pin_v3`               | `(text, text, text, text)` | `heys_rpc` |
| `get_client_data_by_session`         | `(text)`                   | `heys_rpc` |
| `create_pending_product_by_session`  | `(text, text, jsonb)`      | `heys_rpc` |
| `upsert_client_kv_by_session`        | `(text, text, jsonb)`      | `heys_rpc` |
| `batch_upsert_client_kv_by_session`  | `(text, jsonb)`            | `heys_rpc` |
| `get_subscription_status_by_session` | `(text)`                   | `heys_rpc` |
| `start_trial_by_session`             | `(text)`                   | `heys_rpc` |
| `revoke_session`                     | `(text)`                   | `heys_rpc` |

### Rate-limit (внутренние helper-функции)

**⚠️ Важно:** Эти функции НЕ в allowlist CF `heys-api-rpc` (нельзя вызвать
напрямую через API). Они вызываются **внутри** `verify_client_pin_v3`, поэтому
GRANT EXECUTE для `heys_rpc` нужен.

| Функция                 | Сигнатура      | Доступ                  |
| ----------------------- | -------------- | ----------------------- |
| `check_pin_rate_limit`  | `(text, inet)` | `heys_rpc` (внутренний) |
| `increment_pin_attempt` | `(text, inet)` | `heys_rpc` (внутренний) |
| `reset_pin_attempts`    | `(text, inet)` | `heys_rpc` (внутренний) |

### Maintenance (только heys_maintenance)

| Функция                 | Сигнатура   | Доступ             |
| ----------------------- | ----------- | ------------------ |
| `cleanup_security_logs` | `(integer)` | `heys_maintenance` |

### ❌ ЗАБЛОКИРОВАННЫЕ (недоступны публично)

| Функция                  | Причина блокировки                 |
| ------------------------ | ---------------------------------- |
| `verify_client_pin`      | Legacy v1, REVOKE FROM PUBLIC      |
| `verify_client_pin_v2`   | Legacy v2, REVOKE FROM PUBLIC      |
| `get_client_data`        | IDOR (UUID без проверки владельца) |
| `create_pending_product` | IDOR (UUID без проверки владельца) |
| `save_client_kv`         | IDOR (UUID без проверки владельца) |
| `upsert_client_kv`       | IDOR (UUID без проверки владельца) |
| `batch_upsert_client_kv` | IDOR (UUID без проверки владельца) |
| `create_client_with_pin` | Curator-only (не публичный)        |

---

## GRANT/REVOKE проверки

### Запрос: PUBLIC EXECUTE на чувствительные функции

```sql
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       has_function_privilege('PUBLIC', p.oid, 'EXECUTE') AS public_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'verify_client_pin',
    'verify_client_pin_v2',
    'verify_client_pin_v3',
    'save_client_kv',
    'batch_upsert_client_kv',
    'upsert_client_kv',
    'get_client_data',
    'create_pending_product',
    'create_client_with_pin',
    'increment_pin_attempt',
    'check_pin_rate_limit',
    'log_security_event'
  )
ORDER BY 1;
```

**✅ Ожидаемо:** `public_exec = false` для ВСЕХ функций выше.

### Запрос: Что доступно heys_rpc?

```sql
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND has_function_privilege('heys_rpc', p.oid, 'EXECUTE')
ORDER BY 1;
```

**✅ Должно быть (whitelist):**

- `batch_upsert_client_kv_by_session`
- `check_pin_rate_limit`
- `create_pending_product_by_session`
- `get_client_data_by_session`
- `get_subscription_status_by_session`
- `increment_pin_attempt`
- `reset_pin_attempts`
- `revoke_session`
- `start_trial_by_session`
- `upsert_client_kv_by_session`
- `verify_client_pin_v3`

**❌ НЕ должно быть:**

- `verify_client_pin`, `verify_client_pin_v2`
- `get_client_data`, `create_pending_product`
- `save_client_kv`, `upsert_client_kv`, `batch_upsert_client_kv`
- `create_client_with_pin`
- `log_security_event` (внутренняя)
- `cleanup_security_logs` (только maintenance)

### Запрос: Что доступно heys_maintenance?

```sql
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND has_function_privilege('heys_maintenance', p.oid, 'EXECUTE')
ORDER BY 1;
```

**✅ Должно быть (минимум):**

- `cleanup_security_logs`

---

## Smoke Tests

### Test A: Rate-limit (блокировка после 5 попыток)

```bash
# 6 неверных попыток подряд (канонический формат API: p_* префиксы)
for i in {1..6}; do
  curl -s -X POST "https://api.heyslab.ru/rpc?fn=verify_client_pin_v3" \
    -H "Content-Type: application/json" \
    -d '{"p_phone":"9999999999","p_pin":"0000"}' | jq -r '.error // .success'
  sleep 0.5
done
```

**✅ Ожидаемо:**

- Попытки 1-5: `invalid_credentials`
- Попытка 6: `rate_limited`

**Проверка в БД:**

```sql
SELECT phone, ip, attempts, locked_until
FROM pin_login_attempts
WHERE phone = '9999999999'
ORDER BY last_attempt_at DESC LIMIT 1;
```

### Test B: Phone enumeration fix

```bash
# Несуществующий телефон (канонический формат API: p_* префиксы)
curl -s -X POST "https://api.heyslab.ru/rpc?fn=verify_client_pin_v3" \
  -H "Content-Type: application/json" \
  -d '{"p_phone":"0000000000","p_pin":"1234"}'
```

**✅ Ожидаемо:** `{"success":false,"error":"invalid_credentials"}`  
**❌ НЕ должно быть:** `client_not_found`

### Test C: Legacy функции заблокированы

```bash
# Legacy v1 (должен вернуть "Function not allowed")
curl -s -X POST "https://api.heyslab.ru/rpc?fn=verify_client_pin" \
  -H "Content-Type: application/json" \
  -d '{"p_phone":"79001234567","p_pin":"1234"}'

# Legacy v2 (должен вернуть "Function not allowed")
curl -s -X POST "https://api.heyslab.ru/rpc?fn=verify_client_pin_v2" \
  -H "Content-Type: application/json" \
  -d '{"p_phone":"79001234567","p_pin":"1234"}'
```

**✅ Ожидаемо:** `{"error":"Function not allowed: verify_client_pin"}`

### Test D: UUID-based KV заблокированы

```bash
# UUID-функции должны быть в CF blocklist
curl -s -X POST "https://api.heyslab.ru/rpc?fn=upsert_client_kv" \
  -H "Content-Type: application/json" \
  -d '{"p_client_id":"00000000-0000-0000-0000-000000000000","p_key":"test","p_value":{}}'
```

**✅ Ожидаемо:** `{"error":"Function not allowed: upsert_client_kv"}`

### Test E: Subscription write-guard

```bash
# С session клиента без подписки (или read_only)
curl -s -X POST "https://api.heyslab.ru/rpc?fn=upsert_client_kv_by_session" \
  -H "Content-Type: application/json" \
  -d '{"p_session_token":"<READ_ONLY_SESSION>","p_key":"test","p_value":{}}'
```

**✅ Ожидаемо:** `{"error":"subscription_required"}`

---

## Red Flags

### 🚨 Критические (требуют немедленного исправления)

| Симптом                         | Причина                | Решение                                  |
| ------------------------------- | ---------------------- | ---------------------------------------- |
| `client_not_found` в ответе     | Phone enumeration      | Применить `p2_phone_enumeration_fix.sql` |
| `locked_until` всегда NULL      | Rate-limit не работает | Применить `p2_rate_limit_fix.sql`        |
| `public_exec = true` для legacy | REVOKE не применён     | `REVOKE ALL ... FROM PUBLIC`             |
| UUID-функции возвращают данные  | IDOR уязвимость        | Убрать из CF allowlist                   |

### ⚠️ Предупреждения

| Симптом                                           | Причина                         | Решение                                |
| ------------------------------------------------- | ------------------------------- | -------------------------------------- |
| Пароль в CLI history                              | `--environment PG_PASSWORD=...` | Использовать env-file или Lockbox      |
| `security_events` > 10 GB                         | Не работает cleanup             | Проверить cron `cleanup_security_logs` |
| `heys_rpc` имеет доступ к `cleanup_security_logs` | Лишние права                    | `REVOKE EXECUTE ... FROM heys_rpc`     |

### 🚫 Запрещённые действия (пароли и секреты)

**НИКОГДА не делать:**

- `yc serverless function version get ... | jq '.environment'` — выведет все
  секреты
- `--environment PG_PASSWORD=...` в явном виде в командах деплоя
- Хранить пароли в markdown/текстовых документах
- Копировать пароли в чат/тикеты

**ВСЕГДА:**

- Использовать Yandex Cloud Console для редактирования env vars
- В идеале: Yandex Lockbox для секретов
- Если CLI необходим: env-file (`.env`) + `--env-file` (НЕ в git!)

---

## Периодические проверки

### Ежедневно (автоматизировать в monitoring)

```sql
-- Rate-limit срабатывания за 24ч
SELECT COUNT(*) AS locked_ips
FROM pin_login_attempts
WHERE locked_until > NOW() - INTERVAL '24 hours';

-- Security events volume
SELECT event_type, COUNT(*)
FROM security_events
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY 1 ORDER BY 2 DESC;
```

### Еженедельно

```sql
-- Размер таблиц безопасности
SELECT
  'security_events' AS table_name,
  pg_size_pretty(pg_total_relation_size('public.security_events')) AS size,
  (SELECT COUNT(*) FROM security_events) AS rows
UNION ALL
SELECT
  'pin_login_attempts',
  pg_size_pretty(pg_total_relation_size('public.pin_login_attempts')),
  (SELECT COUNT(*) FROM pin_login_attempts);

-- Старые записи (должен чистить cron)
SELECT COUNT(*) AS old_events
FROM security_events
WHERE created_at < NOW() - INTERVAL '30 days';
```

### При каждом деплое CF

1. **Проверить allowlist в `index.js`:**

   ```bash
   grep -A50 "ALLOWED_FUNCTIONS" yandex-cloud-functions/heys-api-rpc/index.js
   ```

2. **Проверить что PG_USER=heys_rpc:**

   ⚠️ **Только через Yandex Cloud Console!**
   1. Открыть: Cloud Functions → `heys-api-rpc` → Переменные окружения
   2. Убедиться: `PG_USER` = `heys_rpc`

   ❗ **НЕ использовать:** `yc ... | jq '.environment'` — риск утечки секретов

3. **Прогнать smoke tests A-E**

---

## 📝 Changelog

| Дата       | Изменение                                                                |
| ---------- | ------------------------------------------------------------------------ |
| 2025-12-25 | Создан runbook после P1+P2 hardening                                     |
| 2025-12-25 | Добавлены schema invariants (ip vs ip_address)                           |
| 2025-12-25 | Rate-limit: детерминированный lock в increment_pin_attempt               |
| 2025-12-25 | Phone enumeration fix: unified "invalid_credentials"                     |
| 2025-12-25 | Final REVOKE: public_exec=false для ВСЕХ 14 чувствительных функций       |
| 2025-12-25 | Унификация формата curl: `?fn=...` + body с p\_ префиксами               |
| 2025-12-25 | Уточнена формулировка rate-limit функций (внутренние, не в CF allowlist) |
| 2025-12-25 | Добавлена секция "Запрещённые действия" (пароли и секреты)               |
| 2025-12-25 | Убрана опасная команда `jq .environment` — только через Cloud Console    |
| 2025-12-25 | Унификация body на `p_*` префиксы во всех smoke-тестах                   |

---

## 🔗 Связанные документы

- [P1_DEPLOY_CHECKLIST.md](./P1_DEPLOY_CHECKLIST.md) — шаги деплоя P1
- [HEYS_BRIEF.md](./HEYS_BRIEF.md) — операционный бриф
- `database/2025-12-25_*.sql` — миграции безопасности
