# 🌐 HEYS API Reference

> API Gateway: `https://api.heyslab.ru`
> Database: Yandex.Cloud PostgreSQL (152-ФЗ compliant)

---

## Архитектура

| Компонент    | URL                    | Назначение          |
| ------------ | ---------------------- | ------------------- |
| **PWA**      | `https://app.heyslab.ru`  | Основное приложение |
| **Landing**  | `https://heyslab.ru`   | Лендинг             |
| **API**      | `https://api.heyslab.ru`  | API Gateway         |
| **Database** | `rc1b-*.yandexcloud.net` | PostgreSQL 16       |

---

## API Endpoints

| Endpoint            | Метод    | Функция           | Статус |
| ------------------- | -------- | ----------------- | ------ |
| `/rpc`              | POST     | heys-api-rpc      | ✅     |
| `/rest/*`           | GET/POST | heys-api-rest     | ✅     |
| `/sms`              | POST     | heys-api-sms      | ✅     |
| `/leads`            | POST     | heys-api-leads    | ✅     |
| `/health`           | GET      | heys-api-health   | ✅     |
| `/auth/*`           | POST     | heys-api-auth     | ✅     |
| `/payments/*`       | *        | heys-api-payments | ⏳     |

---

## RPC Functions (allowlist)

```
# Auth
get_client_salt, client_pin_auth, verify_client_pin_v3, revoke_session

# KV Storage (session-safe)
get_client_data_by_session, get_client_kv_by_session,
upsert_client_kv_by_session, batch_upsert_client_kv_by_session

# Products
get_shared_products, create_pending_product_by_session,
publish_shared_product_by_session

# Subscriptions
get_subscription_status_by_session, start_trial_by_session
```

---

## Использование YandexAPI

```javascript
// ✅ ПРАВИЛЬНО — использовать YandexAPI
const result = await HEYS.YandexAPI.rpc('get_shared_products', {});
const data = await HEYS.YandexAPI.rest('clients', { method: 'GET' });

// ❌ ЗАПРЕЩЕНО — Supabase SDK удалён!
// cloud.client.from('table')  — НЕ работает
// cloud.client.rpc('fn')      — НЕ работает
```

---

## Security Patterns

| Паттерн               | Реализация                                |
| --------------------- | ----------------------------------------- |
| **Session-based RPC** | `*_by_session` функции вместо UUID params |
| **Phone enumeration** | Unified `invalid_credentials` response    |
| **PIN hashing**       | `pgcrypto.crypt()` с `gen_salt('bf')`     |
| **Rate limiting**     | `pin_login_attempts` таблица              |
| **CORS**              | Whitelist: `app.heyslab.ru`, `heyslab.ru` |

⚠️ **КРИТИЧНО**: Никогда не передавай `client_id` напрямую в RPC — используй `session_token` + `*_by_session` функции!

---

## Cloud Functions (7 шт)

| Функция             | Назначение                      |
| ------------------- | ------------------------------- |
| `heys-api-rpc`      | PostgreSQL RPC (18 операций)    |
| `heys-api-rest`     | REST CRUD (GET only для public) |
| `heys-api-sms`      | SMS.ru интеграция               |
| `heys-api-leads`    | Лиды + Telegram                 |
| `heys-api-health`   | Healthcheck                     |
| `heys-api-auth`     | JWT аутентификация              |
| `heys-api-payments` | ЮKassa (⏳ ждёт credentials)    |

---

## Env Variables (Cloud Functions)

```bash
# PostgreSQL — используй PG_* !
PG_HOST=rc1b-*.yandexcloud.net
PG_PORT=6432
PG_DATABASE=heys_production
PG_USER=heys_admin
PG_PASSWORD=<secret>
PG_SSL=verify-full
JWT_SECRET=<secret>
```
