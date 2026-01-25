# 🔐 HEYS Security Reference

> **v2.0** | 2025-01-04 | Compact edition

Краткий справочник безопасности. Для smoke tests:
`./scripts/security-smoke-test.sh`

---

## 🗄️ DB Schema (ключевые поля)

| Таблица              | PK / Важные поля | Примечание                                             |
| -------------------- | ---------------- | ------------------------------------------------------ |
| `pin_login_attempts` | `(phone, ip)`    | Колонка `ip` типа INET, НЕ `ip_address`                |
| `clients`            | `id` UUID        | `phone_normalized`, `pin_hash`, `name` (не first/last) |
| `client_sessions`    | `id` UUID        | `token_hash` BYTEA — сам токен НЕ хранится             |
| `client_kv_store`    | `(client_id, k)` | ⚠️ `user_id` NULLABLE (fix 2025-01-04 для PIN auth)    |

---

## 🔑 API Functions Access

### ✅ Публичные (`heys_rpc` allowlist)

```
# Auth
get_client_salt, client_pin_auth, verify_client_pin_v3, revoke_session

# Subscription & Trial Queue
get_subscription_status_by_session, start_trial_by_session,
get_public_trial_capacity, request_trial, get_trial_queue_status,
claim_trial_offer, cancel_trial_queue, assign_trials_from_queue

# KV Storage (session-safe)
get_client_data_by_session, get_client_kv_by_session,
upsert_client_kv_by_session, batch_upsert_client_kv_by_session,
delete_client_kv_by_session

# Products & Consents
get_shared_products, create_pending_product_by_session,
publish_shared_product_by_session, publish_shared_product_by_curator,
log_consents
```

### ❌ Заблокированные (IDOR / Legacy)

```
verify_client_pin, verify_client_pin_v2,
get_client_data, upsert_client_kv, batch_upsert_client_kv,
save_client_kv, get_client_kv, delete_client_kv,
create_pending_product, create_client_with_pin,
check_subscription_status
```

---

## 🧪 Smoke Tests

**Автоматизированные тесты:**

```bash
./scripts/security-smoke-test.sh        # против prod
./scripts/security-smoke-test.sh local  # против localhost:4001
```

**Что проверяется:**

- Phone enumeration fix (unified `invalid_credentials`)
- Legacy/UUID functions blocked
- SQL injection protection
- REST write methods blocked (405)
- Forbidden tables (404)
- CORS whitelist

---

## 🔍 GRANT Check (SQL)

```sql
-- Проверить что PUBLIC не имеет EXECUTE
SELECT proname, has_function_privilege('PUBLIC', oid, 'EXECUTE') AS public_exec
FROM pg_proc WHERE pronamespace = 'public'::regnamespace
  AND proname ~ '^(verify_client_pin|get_client_data|upsert_client_kv|save_client_kv)'
ORDER BY 1;
-- ✅ Все должны быть FALSE
```

---

## 🚨 Red Flags

| Симптом                     | Проблема           | Решение                                  |
| --------------------------- | ------------------ | ---------------------------------------- |
| `client_not_found` в ответе | Phone enumeration  | Обновить `verify_client_pin_v3`          |
| `public_exec = true`        | REVOKE не применён | `REVOKE ALL ON FUNCTION ... FROM PUBLIC` |
| UUID-функция отвечает 200   | IDOR               | Убрать из CF allowlist                   |
| `locked_until` всегда NULL  | Rate-limit сломан  | Проверить `increment_pin_attempt`        |

---

## 🔐 Секреты Yandex Cloud

**Правило:** Редактировать env vars **только через YC Console** (не CLI).

YC CLI выводит все переменные в stdout — риск утечки PG_PASSWORD.

```bash
# ❌ ОПАСНО
yc serverless function version create ... --environment "PG_PASSWORD=xxx"

# ✅ БЕЗОПАСНО
# YC Console → Cloud Functions → Edit → Env vars
```

---

## 🔒 Encryption at Rest (health_data)

### Что шифруется

| Паттерн ключа   | Описание                  | Шифрование   |
| --------------- | ------------------------- | ------------ |
| `heys_profile`  | ПДн + health              | ✅ AES-256   |
| `heys_dayv2_*`  | Дневник питания, сон, вес | ✅ AES-256   |
| `heys_hr_zones` | Пульсовые зоны            | ✅ AES-256   |
| `heys_products` | База продуктов            | ❌ Plaintext |
| `heys_norms`    | Нормы питания             | ❌ Plaintext |

### Архитектура

```
Cloud Function (heys-api-rpc)
    │
    ├─ Читает HEYS_ENCRYPTION_KEY из env
    │
    ├─ SET heys.encryption_key = '...' (per-connection)
    │
    └─ PostgreSQL RPC
         ├─ encrypt_health_data() — при записи
         └─ decrypt_health_data() — при чтении
```

### Ключевые функции SQL

| Функция                      | Назначение                  |
| ---------------------------- | --------------------------- |
| `is_health_key(k)`           | Проверка: шифровать ли ключ |
| `encrypt_health_data(jsonb)` | AES-256 шифрование          |
| `decrypt_health_data(bytea)` | Расшифровка                 |
| `read_client_kv_value()`     | Авто-расшифровка            |
| `write_client_kv_value()`    | Авто-шифрование             |

### Колонки `client_kv_store`

| Колонка       | Тип      | Описание                         |
| ------------- | -------- | -------------------------------- |
| `v`           | JSONB    | Plaintext (для не-health ключей) |
| `v_encrypted` | BYTEA    | Зашифрованные данные             |
| `key_version` | SMALLINT | NULL=plaintext, 1+=encrypted     |

### Ротация ключей (план)

1. Добавить новый ключ с `key_version = 2`
2. Backfill: перешифровать данные с v1 → v2
3. Удалить старый ключ через 180 дней

### Troubleshooting

```sql
-- Проверить статус шифрования
SELECT
  count(*) FILTER (WHERE key_version IS NULL AND is_health_key(k)) AS plaintext_health,
  count(*) FILTER (WHERE key_version = 1) AS encrypted_v1
FROM client_kv_store;

-- Тест расшифровки (нужен SET heys.encryption_key)
SELECT decrypt_health_data(v_encrypted)::text
FROM client_kv_store
WHERE k = 'heys_profile' LIMIT 1;
```

### Если ключ не установлен

RPC функции вернут ошибку:

```
HEYS_ENCRYPTION_KEY not configured or too short
```

**Решение:** Проверить env var в Cloud Function.

---

## 📝 Changelog

| Дата       | Изменение                                                                            |
| ---------- | ------------------------------------------------------------------------------------ |
| 2026-01-25 | **v2.1**: Добавлена секция Encryption at Rest (health_data)                          |
| 2025-01-04 | **v2.0**: Рефакторинг — сокращено с 695 до ~100 строк, smoke tests вынесены в скрипт |
| 2025-01-02 | **v1.6**: Fix `client_kv_store` PK — `(client_id, k)`                                |
| 2025-12-26 | **v1.5**: P0-P3 security hardening complete                                          |

---

## 📚 Полная документация

- [HEYS_BRIEF.md](./HEYS_BRIEF.md) — архитектура и бизнес-логика
- `database/2025-12-25_*.sql` — миграции безопасности
- `yandex-cloud-functions/` — код Cloud Functions
