# 🔐 HEYS Security Runbook

> **Версия**: 1.5.0  
> **Дата**: 2025-12-26  
> **Статус**: ✅ P0-P3 Complete: requireEnv + CORS + read-only REST + heys_rest
> user

Этот документ — **единый источник истины** для проверки безопасности при каждом
деплое.

---

## 📋 Содержание

1. [DB Schema Invariants](#db-schema-invariants)
2. [Функции и сигнатуры](#функции-и-сигнатуры)
3. [GRANT/REVOKE проверки](#grantrevoke-проверки)
4. [Smoke Tests](#smoke-tests)
5. [Red Flags](#red-flags)
6. [Безопасная работа с секретами YC](#-безопасная-работа-с-секретами-yandex-cloud)
7. [Периодические проверки](#периодические-проверки)

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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token_hash BYTEA NOT NULL UNIQUE,   -- digest(token,'sha256'), opaque token
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  user_agent TEXT,
  ip_address INET,
  revoked_at TIMESTAMPTZ               -- NULL = active
);
-- ⚠️ session_token НЕ хранится! Только hash. Для поиска: require_client_id(token)
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

### Test F: CORS whitelist (heys-api-auth)

```bash
# Запрос с неразрешённого Origin → 403
curl -s -X OPTIONS "https://api.heyslab.ru/auth/login" \
  -H "Origin: https://evil.com" \
  -H "Access-Control-Request-Method: POST"
```

**✅ Ожидаемо:** `403 Forbidden` или пустой `Access-Control-Allow-Origin`

```bash
# Запрос с разрешённого Origin → 200 + корректный CORS
curl -s -X OPTIONS "https://api.heyslab.ru/auth/login" \
  -H "Origin: https://app.heyslab.ru" \
  -H "Access-Control-Request-Method: POST" -I
```

**✅ Ожидаемо:**

- `Access-Control-Allow-Origin: https://app.heyslab.ru`
- `Vary: Origin`

### Test G: JWT_SECRET validation (heys-api-auth)

**Поведение v1.3.0**: JWT_SECRET читается **внутри handler** при каждом запросе
(защита от stale env).

```bash
# Мини-чеклист после деплоя:
# 1. OPTIONS с плохим Origin → 204 (или 403 если явно denied)
# 2. POST с плохим Origin → 403
# 3. POST без Origin (curl) → работает
# 4. POST без JWT_SECRET в env → 500 "JWT_SECRET is not configured"
```

**Проверка:** В Yandex Cloud Console → Functions → heys-api-auth → Logs

```
# Если JWT_SECRET отсутствует или < 32 символов после POST:
# "JWT_SECRET is missing or too short (< 32 chars)"
```

⚠️ **Важно:** JWT_SECRET теперь НЕ проверяется при module load (чтобы OPTIONS
работал). Ошибка появится только при попытке login/verify (когда реально нужен
секрет).

### Test H: Debug logs gated (heys-api-rpc)

```bash
# При LOG_LEVEL=info (default) или warn/error:
# НЕ должно быть в логах:
# - "PG_HOST:", "PG_PORT:", "PG_DATABASE:", "PG_USER:"
# - Полный clientIp (только маскированный "xxx.xxx.xxx.***")
```

**Проверка:** В Yandex Cloud Console → Functions → heys-api-rpc → Logs

### Test I: SELECT column validation (heys-api-rest)

```bash
# Попытка SQL injection через select параметр
curl -s "https://api.heyslab.ru/rest/clients?select=id%3BDROP%20TABLE%20clients"
```

**✅ Ожидаемо:** `400 Bad Request` с
`{"error":"Invalid select columns — contains forbidden characters or unknown columns"}`

> **P1.1 Early Validation:** Эта проверка выполняется **ДО** `client.connect()`,
> поэтому даже при проблемах с БД (неверный пароль) вы получите
> детерминированный 400.

```bash
# Валидный select (DB error ожидаем только после валидации)
curl -s "https://api.heyslab.ru/rest/clients?select=id,name"
```

**✅ Ожидаемо:** `200 OK` с данными (или DB error если проблемы с credentials)

### Test J: Trial Queue — capacity counts offers

**Цель:** `get_public_trial_capacity()` должен считать активный `offer` как
занятый слот.

**Preconditions:** Два тест-токена (opaque) для тест-клиентов A и B.

```sql
-- В psql (heys_admin):
BEGIN;

-- 1. Установить лимит = 1
UPDATE curator_trial_limits
SET max_active_trials = 1, is_accepting_trials = TRUE
WHERE curator_id = '00000000-0000-0000-0000-000000000000';

-- 2. Очистить тестовые данные (через require_client_id — токены хешированы)
DO $$
DECLARE
  a uuid := public.require_client_id('test_token_a');
  b uuid := public.require_client_id('test_token_b');
BEGIN
  DELETE FROM trial_queue WHERE client_id IN (a, b);
  UPDATE subscriptions
  SET trial_started_at = NULL, trial_ends_at = NULL, active_until = NULL
  WHERE client_id IN (a, b);
END $$;

-- 3. A получает offer
SELECT request_trial('test_token_a', 'smoke_test') AS step1_request_a;
-- ✅ Ожидаемо: {"status": "offer", ...}

-- 4. capacity должна стать 0 (offer резервирует слот)
SELECT get_public_trial_capacity() AS step2_capacity;
-- ✅ Ожидаемо: {"available_slots": 0, ...}

-- 5. B запрашивает — должен попасть в очередь
SELECT request_trial('test_token_b', 'smoke_test') AS step3_request_b;
-- ✅ Ожидаемо: {"status": "queued", "position": 1, ...}
-- ❌ НЕ должно быть: {"status": "offer", ...}

ROLLBACK;
```

**⚠️ Known issue:** Если `psql -f` падает на порту 6432 (pgbouncer) — запускать
через порт 5432, дробить на части, или использовать `\i` в интерактивном режиме.

**Через API (если есть тестовые сессии):**

```bash
# 1. Проверить текущую capacity
curl -s "https://api.heyslab.ru/rpc?fn=get_public_trial_capacity" -X POST \
  -H "Content-Type: application/json" -d '{}' | jq '.get_public_trial_capacity.available_slots'

# 2. После request_trial с offer — available_slots должен уменьшиться на 1
```

**Связанный фикс:** `database/2025-12-25_fix_capacity_offer_slots.sql`

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

## 🔑 Безопасная работа с секретами Yandex Cloud

### Проблема: YC CLI всегда выводит environment

**⚠️ КРИТИЧНО:** Команда `yc serverless function version create` **ВСЕГДА** выводит
все переменные окружения в ответе, включая `PG_PASSWORD`. Это происходит даже
если пароль передаётся через переменную shell:

```bash
# ❌ ОПАСНО — пароль всё равно появится в stdout!
read -s PG_PASS
yc serverless function version create ... --environment "PG_PASSWORD=$PG_PASS"
# Output: environment: { PG_PASSWORD: "ваш_пароль" }  ← УТЕЧКА!
```

### Безопасные способы работы с секретами

#### Способ 1: Yandex Cloud Console (рекомендуется)

1. Открыть [console.yandex.cloud](https://console.yandex.cloud)
2. Cloud Functions → выбрать функцию → **Редактировать**
3. Вкладка **Переменные окружения**
4. Изменить `PG_PASSWORD` → **Сохранить**

✅ Пароль не появляется в логах/терминале

#### Способ 2: Yandex Lockbox (идеально для production)

```bash
# 1. Создать секрет в Lockbox
yc lockbox secret create --name heys-db-passwords \
  --payload '[{"key":"heys_rest","text_value":"<пароль>"}]'

# 2. Привязать к функции (без вывода значения)
yc serverless function version create ... \
  --secret environment-variable=PG_PASSWORD,name=heys-db-passwords,key=heys_rest
```

✅ Пароль хранится в Lockbox, функция получает его в runtime

#### Способ 3: Обновление только пароля через Console

Если нужно ротировать пароль без передеплоя кода:

1. **PostgreSQL**: YC Console → Managed PostgreSQL → Users → Edit
2. **Cloud Function**: YC Console → Functions → Edit → Env vars

### Процедура ротации скомпрометированного пароля

```bash
# 1. Очистить артефакты
rm -f /tmp/*.sh /tmp/*.env* /tmp/*-env.txt 2>/dev/null
history -c && history -w  # bash
# или: fc -p && fc -W     # zsh

# 2. Обновить пароль в PostgreSQL (через Console!)
# YC Console → Managed PostgreSQL → heys-production → Users → heys_rest → Edit

# 3. Обновить пароль в Cloud Function (через Console!)
# YC Console → Cloud Functions → heys-api-rest → Edit → Env vars → PG_PASSWORD

# 4. Проверить работоспособность
curl -s "https://api.heyslab.ru/rest/shared_products?limit=1&select=id"
```

### Проверка: нет ли утечек в истории

```bash
# Поиск паролей в bash history
grep -i "password\|PG_PASS\|secret" ~/.bash_history 2>/dev/null | head -20

# Поиск во временных файлах
find /tmp -name "*.sh" -o -name "*.env*" -o -name "*-env.txt" 2>/dev/null
```

### API Gateway и CORS (известное поведение)

**Важно:** YC API Gateway может добавлять свои CORS-заголовки на OPTIONS:

```
Access-Control-Allow-Origin: *
```

Это **нормально** для preflight. Ваша логика CORS в функции влияет на POST/GET.
Зафиксировано как known behavior, не паника.

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

#### heys-api-rpc

1. **Проверить allowlist в `index.js`:**

   ```bash
   grep -A50 "ALLOWED_FUNCTIONS" yandex-cloud-functions/heys-api-rpc/index.js
   ```

2. **Проверить что PG_USER=heys_rpc:**

   ⚠️ **Только через Yandex Cloud Console!**
   1. Открыть: Cloud Functions → `heys-api-rpc` → Переменные окружения
   2. Убедиться: `PG_USER` = `heys_rpc`

   ❗ **НЕ использовать:** `yc ... | jq '.environment'` — риск утечки секретов

3. **Прогнать smoke tests A-J**

#### heys-api-rest (P3 hardening)

1. **Проверить ALLOWED_TABLES (только 2 таблицы):**

   ```bash
   grep -A5 "ALLOWED_TABLES" yandex-cloud-functions/heys-api-rest/index.js
   # ✅ Ожидаемо: ['shared_products', 'shared_products_blocklist']
   # ❌ НЕ должно быть: clients, consents, kv_store, shared_products_public
   # ⚠️  shared_products_public VIEW uses auth.uid() — doesn't work in YC!
   ```

2. **Проверить что PG_USER=heys_rest:**

   ⚠️ **Только через Yandex Cloud Console!**
   1. Открыть: Cloud Functions → `heys-api-rest` → Переменные окружения
   2. Убедиться: `PG_USER` = `heys_rest`

3. **Smoke tests для REST:**

   ```bash
   # GET на разрешённую таблицу → 200
   curl -s "https://api.heyslab.ru/rest/shared_products?limit=1&select=id,name"

   # GET на запрещённую таблицу → 404 (security through obscurity)
   curl -s "https://api.heyslab.ru/rest/clients?limit=1"
   # ✅ Ожидаемо: {"error":"Not found"}

   # GET на shared_products_public VIEW → 404 (убран: auth.uid() не работает в YC)
   curl -s "https://api.heyslab.ru/rest/shared_products_public?limit=1"
   # ✅ Ожидаемо: {"error":"Not found"}

   # POST на любую таблицу → 405
   curl -s -X POST "https://api.heyslab.ru/rest/shared_products" \
     -H "Content-Type: application/json" -d '{}'
   # ✅ Ожидаемо: {"error":"Method POST not allowed. REST is read-only."}
   ```

---

## 📝 Changelog

| Дата       | Изменение                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2025-12-26 | **v1.5.0**: Добавлена секция "Безопасная работа с секретами YC" — YC CLI всегда выводит env, процедура ротации, Lockbox                          |
| 2025-12-26 | **P3**: `requireEnv()` в heys-api-rest — удалён fallback `heys_admin`, fail fast если env не задан                                                |
| 2025-12-26 | **P3**: REST read-only — только GET/OPTIONS, POST/PATCH/DELETE → 405                                                                              |
| 2025-12-26 | **P3**: ALLOWED_TABLES сокращён: `shared_products`, `shared_products_blocklist` (убран VIEW shared_products_public — auth.uid() не работает в YC) |
| 2025-12-26 | **P3**: Legacy routing `?table=` убран — только path-based `/rest/{table}` для упрощения мониторинга                                              |
| 2025-12-26 | **P3**: `created_by_user_id`, `created_by_client_id` убраны из whitelist shared_products (не для public API)                                      |
| 2025-12-26 | **P3**: Миграция `database/2025-12-26_p3_grants_heys_rest.sql` — read-only user heys_rest                                                         |
| 2025-12-25 | **P1.1 Early Validation**: SELECT sanitize перенесён ДО client.connect() — детерминированный 400 даже при DB issues                               |
| 2025-12-26 | **P0.5 Final**: select=_ теперь раскрывается в whitelist колонки (не SQL _), 403 с CORS headers для диагностики                                   |
| 2025-12-26 | **P0.5 Edge Cases**: JWT check перенесён внутрь handler (после OPTIONS), REST CORS deny вместо fallback, empty select= → 400                      |
| 2025-12-25 | **Trial Queue**: Test J — capacity counts offers (fix `get_public_trial_capacity`)                                                                |
| 2025-12-26 | **P0-1**: JWT_SECRET fallback удалён — throw Error если отсутствует/<32                                                                           |
| 2025-12-26 | **P0-2**: CORS `*` заменён на whitelist + Vary: Origin + 403 на evil                                                                              |
| 2025-12-26 | **P0-3**: Debug logs в heys-api-rpc гейтятся через LOG_LEVEL env                                                                                  |
| 2025-12-26 | **P1**: SELECT column validation в heys-api-rest (whitelist + regex)                                                                              |
| 2025-12-26 | Добавлены smoke tests F-I для новых P0 фиксов                                                                                                     |
| 2025-12-25 | Создан runbook после P1+P2 hardening                                                                                                              |
| 2025-12-25 | Добавлены schema invariants (ip vs ip_address)                                                                                                    |
| 2025-12-25 | Rate-limit: детерминированный lock в increment_pin_attempt                                                                                        |
| 2025-12-25 | Phone enumeration fix: unified "invalid_credentials"                                                                                              |
| 2025-12-25 | Final REVOKE: public_exec=false для ВСЕХ 14 чувствительных функций                                                                                |
| 2025-12-25 | Унификация формата curl: `?fn=...` + body с p\_ префиксами                                                                                        |
| 2025-12-25 | Уточнена формулировка rate-limit функций (внутренние, не в CF allowlist)                                                                          |
| 2025-12-25 | Добавлена секция "Запрещённые действия" (пароли и секреты)                                                                                        |
| 2025-12-25 | Убрана опасная команда `jq .environment` — только через Cloud Console                                                                             |
| 2025-12-25 | Унификация body на `p_*` префиксы во всех smoke-тестах                                                                                            |

---

## 🔗 Связанные документы

- [P1_DEPLOY_CHECKLIST.md](./P1_DEPLOY_CHECKLIST.md) — шаги деплоя P1
- [HEYS_BRIEF.md](./HEYS_BRIEF.md) — операционный бриф
- `database/2025-12-25_*.sql` — миграции безопасности
