# 🛡️ Система безопасности HEYS

## 📋 Обзор

HEYS использует многоуровневый подход к безопасности на базе **Yandex Cloud**
(152-ФЗ, все данные в России).

**Статус безопасности**: 🟢 Оптимальный  
**Последняя проверка**: 25 января 2026  
**Версия**: 3.0.0 (Yandex Cloud Architecture)

---

## 🏛️ Архитектура безопасности

```
1. 🌐 Perimeter Security    — Nginx reverse proxy, CORS whitelist, rate limiting
2. 🔐 Application Security  — Phone+PIN auth, JWT for curators, session_token pattern
3. 🗄️ Data Security         — AES-256 шифрование health data в БД и localStorage
4. 🛡️ Compliance            — 152-ФЗ, всё в Yandex Cloud ru-central1
5. 📊 Monitoring            — GitHub Actions + Telegram алерты 24/7
```

---

## 🔐 Аутентификация и авторизация

### Два типа пользователей

| Тип                       | Метод                                  | Результат                                 |
| ------------------------- | -------------------------------------- | ----------------------------------------- |
| **Клиент** (пациент)      | Телефон + PIN → `client_pin_auth` RPC  | `session_token` (хранится в localStorage) |
| **Куратор** (нутрициолог) | Email + Password → `heys-api-auth` YCF | JWT Bearer токен                          |

### PIN-авторизация клиента

```javascript
// POST https://api.heyslab.ru/rpc?fn=client_pin_auth
await HEYS.YandexAPI.rpc('client_pin_auth', {
  p_phone: '+7XXXXXXXXXX',
  p_pin: '1234',
});
// Returns: { session_token, client_id, name, curator_id }
// Ошибки ВСЕГДА: "invalid_credentials" — защита от phone enumeration
```

**Безопасность PIN:**

- Хеширование: `pgcrypto.crypt(pin, gen_salt('bf'))` (bcrypt)
- Rate limiting: таблица `pin_login_attempts` — 5 попыток → блокировка 15 мин
- Phone enumeration blocked: единый ответ `invalid_credentials` для всех ошибок

### JWT-авторизация куратора

```javascript
// POST https://api.heyslab.ru/auth/curator
fetch('https://api.heyslab.ru/auth/curator', {
  method: 'POST',
  body: JSON.stringify({ email: 'curator@example.com', password: '...' }),
});
// Returns: { token: 'JWT...', curator_id }
// Дальнейшие запросы: Authorization: Bearer <token>
```

### IDOR-защита (session_token pattern)

**Правило:** Никогда не доверять browser-supplied `client_id` как authority.
Сервер должен резолвить canonical client через `session_token`, curator
ownership check или server-issued `context_id`. Для client-session RPC
использовать `*_by_session` функции с `session_token`:

```javascript
// ❌ НЕБЕЗОПАСНО — прямой UUID, IDOR уязвимость
await HEYS.YandexAPI.rpc('get_client_data', { p_client_id: clientId });

// ✅ БЕЗОПАСНО — сервер резолвит client_id из session_token
await HEYS.YandexAPI.rpc('get_client_data_by_session', {
  p_session_token: sessionToken,
  p_client_id: clientId,
});
```

**Заблокированные legacy-функции (IDOR):**

```
verify_client_pin, verify_client_pin_v2,
get_client_data, upsert_client_kv, batch_upsert_client_kv,
save_client_kv, get_client_kv, delete_client_kv,
create_pending_product, create_client_with_pin,
check_subscription_status
```

---

## 🗄️ Схема БД (ключевые таблицы безопасности)

| Таблица              | Ключ / Важные поля  | Примечание                                           |
| -------------------- | ------------------- | ---------------------------------------------------- |
| `pin_login_attempts` | `(phone, ip INET)`  | Rate limiting — 5 попыток → lockout 15 мин           |
| `clients`            | `id UUID`           | `phone_normalized`, `pin_hash` (bcrypt), `name`      |
| `client_sessions`    | `id UUID`           | `token_hash BYTEA` — сам токен НЕ хранится           |
| `client_kv_store`    | `(client_id, k)`    | `v JSONB` (plaintext) + `v_encrypted BYTEA` (health) |
| `consents`           | `(client_id, type)` | Согласия на обработку ПДн                            |

---

## 🔒 Шифрование данных

### Data at Rest — серверная БД

Строки `client_kv_store` с health-data шифруются автоматически:

```
Cloud Function (heys-api-rpc)
    │
    ├─ Читает HEYS_ENCRYPTION_KEY из env var
    ├─ SET heys.encryption_key = '...' (per-connection)
    │
    └─ PostgreSQL RPC
         ├─ encrypt_health_data() — при записи
         └─ decrypt_health_data() — при чтении
```

**Функции SQL:**

| Функция                      | Назначение                          |
| ---------------------------- | ----------------------------------- |
| `is_health_key(k)`           | Определяет, нужно ли шифровать ключ |
| `encrypt_health_data(jsonb)` | AES-256 шифрование                  |
| `decrypt_health_data(bytea)` | Расшифровка                         |
| `read_client_kv_value()`     | Авто-расшифровка при чтении         |
| `write_client_kv_value()`    | Авто-шифрование при записи          |

**Колонки `client_kv_store`:**

| Колонка       | Тип      | Описание                         |
| ------------- | -------- | -------------------------------- |
| `v`           | JSONB    | Plaintext (non-health ключи)     |
| `v_encrypted` | BYTEA    | AES-256 зашифрованные данные     |
| `key_version` | SMALLINT | NULL = plaintext, 1+ = encrypted |

### Data at Rest — localStorage клиента (AES-256)

| Ключ localStorage    | Описание                  | Шифрование   |
| -------------------- | ------------------------- | ------------ |
| `heys_{id}_profile`  | ПДн + health profile      | ✅ AES-256   |
| `heys_{id}_dayv2_*`  | Дневник питания, сон, вес | ✅ AES-256   |
| `heys_{id}_hr_zones` | Пульсовые зоны            | ✅ AES-256   |
| `heys_{id}_products` | База продуктов питания    | ❌ Plaintext |
| `heys_{id}_norms`    | Нормы питания             | ❌ Plaintext |

### Data in Transit

- **HTTPS/TLS 1.3** — все API-коммуникации
- **HSTS** — принудительный HTTPS
- **CORS whitelist** — только `app.heyslab.ru`, `heyslab.ru`

---

## 🌐 CORS и периметр

```javascript
// Разрешённые origins (heys-api-rpc/index.js)
const ALLOWED_ORIGINS = ['https://app.heyslab.ru', 'https://heyslab.ru'];

// Все остальные origins → 403 Forbidden
```

**REST API (heys-api-rest):**

- Поддерживает только GET запросы к public таблицам
- PUT/POST/DELETE → 405 Method Not Allowed

**Запрещённые таблицы через /rest:**

- `clients`, `client_sessions`, `pin_login_attempts` → 404 Not Found

---

## 📋 Публичный RPC-allowlist

Только эти функции доступны через `api.heyslab.ru/rpc`:

```
# Auth
get_client_salt, client_pin_auth, verify_client_pin_v3, revoke_session

# Data (session-safe)
get_client_data_by_session, get_client_kv_by_session,
upsert_client_kv_by_session, batch_upsert_client_kv_by_session,
delete_client_kv_by_session

# Products & Consents
get_shared_products, create_pending_product_by_session,
publish_shared_product_by_session, log_consents

# Subscription & Trial
get_subscription_status_by_session, start_trial_by_session,
get_public_trial_capacity, request_trial, get_trial_queue_status,
admin_get_leads, admin_convert_lead, admin_activate_trial
```

---

## 🔑 Secrets Management

**Правило:** Редактировать env vars **только через YC Console**. Никогда через
CLI (`yc serverless function version create ... --environment`), т.к. CLI
выводит их в stdout.

**Ключевые секреты (`.env` + YC Console):**

| Переменная                       | Назначение                          |
| -------------------------------- | ----------------------------------- |
| `PG_PASSWORD`                    | Пароль PostgreSQL                   |
| `JWT_SECRET`                     | Секрет для curator JWT              |
| `HEYS_ENCRYPTION_KEY`            | Ключ AES-256 шифрования health data |
| `SMS_API_KEY`                    | SMSC.ru API ключ                    |
| `YOO_SHOP_ID` / `YOO_SECRET_KEY` | ЮKassa платежи                      |
| `TELEGRAM_BOT_TOKEN`             | Telegram алерты                     |

---

## 🚨 Мониторинг и реагирование

### Автоматический мониторинг (24/7)

- **GitHub Actions**: проверка API каждые 15 минут
- **Auto-redeploy**: при 502 Bad Gateway → `./deploy-all.sh`
- **Telegram алерты**: при сбое API → уведомление в канал

### Smoke Tests

```bash
./scripts/security-smoke-test.sh        # против production
./scripts/security-smoke-test.sh local  # против localhost:4001
```

Что проверяется:

- Phone enumeration fix (единый `invalid_credentials`)
- Legacy/UUID-функции заблокированы
- SQL injection защита
- REST write methods возвращают 405
- Forbidden tables возвращают 404
- CORS whitelist работает

### Red Flags

| Симптом                     | Проблема          | Решение                                |
| --------------------------- | ----------------- | -------------------------------------- |
| `client_not_found` в ответе | Phone enumeration | Обновить `verify_client_pin_v3`        |
| UUID-функция отвечает 200   | IDOR              | Убрать из CF allowlist                 |
| `locked_until` всегда NULL  | Rate-limit сломан | Проверить `increment_pin_attempt`      |
| 502 на всех endpoints       | CF упал           | `./deploy-all.sh && ./health-check.sh` |

---

## 🛡️ 152-ФЗ Compliance

**Все данные хранятся в России (Yandex Cloud, ru-central1):**

- PostgreSQL 16 — `rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net` (YC MDB)
- Object Storage — Yandex S3 (ru-central1)
- CDN — Yandex CDN
- Cloud Functions — Yandex Cloud (московский регион)
- Никаких данных в Vercel, Railway, Supabase, AWS или европейских DC

**Аналитика отключена:**

- GA4 — не используется
- Meta Pixel — не используется
- Sentry — не используется

---

## 📋 Security Checklist (перед деплоем)

```
✅ Authentication & Authorization
  ✅ PIN bcrypt хеши в БД
  ✅ session_token pattern — нет прямых UUID
  ✅ Legacy IDOR-функции заблокированы
  ✅ JWT-секрет установлен и ротируется

✅ Data Protection
  ✅ HEYS_ENCRYPTION_KEY установлен
  ✅ Health data ключи шифруются в БД
  ✅ localStorage health keys зашифрованы AES-256
  ✅ plaintext только для non-sensitive keys

✅ Perimeter
  ✅ CORS только app.heyslab.ru + heyslab.ru
  ✅ REST write methods → 405
  ✅ Rate limiting pin_login_attempts активен
  ✅ Forbidden tables → 404

✅ Compliance
  ✅ Все данные в Yandex Cloud ru-central1
  ✅ GA4/Meta Pixel отключены
  ✅ Логи не содержат ПДн (профили, вес, еда)

✅ Monitoring
  ✅ GitHub Actions health monitor активен
  ✅ Telegram алерты настроены
  ✅ Smoke tests пройдены
```

---

## 📚 Связанные документы

- [SECURITY_RUNBOOK.md](./SECURITY_RUNBOOK.md) — краткий справочник + smoke
  tests
- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) — деплой и мониторинг
- `yandex-cloud-functions/INCIDENT_PREVENTION.md` — runbook инцидентов
- `yandex-cloud-functions/.env` — секреты (не в git)

---

_Документация обновлена: 19 февраля 2026_  
_Версия: 3.0.0 (Yandex Cloud Infrastructure)_  
_Статус: Production Ready_
