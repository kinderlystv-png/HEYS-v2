# P1 Security Hardening — Deploy Checklist

> **Дата**: 2025-12-25  
> **Статус**: 🟡 Готово к деплою

---

## 📋 Порядок деплоя

### 1️⃣ Миграция: `p1_security_rate_limit.sql`

```bash
psql "host=rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net port=6432 dbname=heys_production user=heys_admin sslmode=verify-full"

\i database/2025-12-25_p1_security_rate_limit.sql
```

**Проверка после:**
```sql
-- Таблицы созданы?
SELECT to_regclass('public.security_events'),
       to_regclass('public.pin_login_attempts');

-- Функции созданы?
SELECT proname, pg_get_function_identity_arguments(oid)
FROM pg_proc
WHERE proname IN ('verify_client_pin_v3','cleanup_security_logs','log_security_event')
ORDER BY 1;
```

✅ Ожидаемо:
- `security_events` — регистр найден
- `pin_login_attempts` — регистр найден
- 3 функции с правильными сигнатурами

---

### 2️⃣ Миграция: `p1_session_functions.sql`

```bash
\i database/2025-12-25_p1_session_functions.sql
```

**Проверка после:**
```sql
SELECT proname, pg_get_function_identity_arguments(oid)
FROM pg_proc
WHERE proname IN ('get_client_data_by_session','create_pending_product_by_session')
ORDER BY 1;
```

✅ Ожидаемо:
- `create_pending_product_by_session(text, text, jsonb)` — сигнатура TEXT
- `get_client_data_by_session(text)` — сигнатура TEXT

---

### 3️⃣ Миграция: `p1_runtime_user_heys_rpc.sql`

```bash
\i database/2025-12-25_p1_runtime_user_heys_rpc.sql
```

**Проверка после:**
```sql
-- Какие функции доступны heys_rpc?
SELECT p.proname, pg_get_function_identity_arguments(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
AND has_function_privilege('heys_rpc', p.oid, 'EXECUTE')
ORDER BY 1;
```

✅ Ожидаемо (только эти):
- `client_pin_auth`
- `create_client_with_pin`
- `create_pending_product_by_session` ← session-версия!
- `get_client_data_by_session` ← session-версия!
- `get_client_salt`
- `get_subscription_status_by_session`
- `revoke_session`
- `start_trial_by_session`
- `upsert_client_kv_by_session`
- `verify_client_pin_v2`
- `verify_client_pin_v3`

❌ НЕ должно быть:
- `log_security_event` — внутренняя
- `require_client_id` — внутренняя
- `check_subscription_status` — UUID без проверки владельца
- `get_client_data` — UUID без проверки владельца
- `create_pending_product` — UUID без проверки владельца

---

### 4️⃣ Установить пароль `heys_rpc`

**В Yandex Cloud Console:**
1. Yandex Cloud → Managed PostgreSQL → `heys_production`
2. Users → `heys_rpc` → Change password
3. Сгенерировать сложный пароль (32+ символа)
4. Сохранить в секретное хранилище

---

### 5️⃣ Обновить Cloud Function

**Обновить env vars в `heys-api-rpc`:**
```
PG_USER=heys_rpc
PG_PASSWORD=<новый_пароль>
```

**Деплой CF:**
```bash
cd yandex-cloud-functions/heys-api-rpc
yc serverless function version create \
  --function-name heys-api-rpc \
  --runtime nodejs18 \
  --entrypoint index.handler \
  --memory 128m \
  --execution-timeout 10s \
  --source-path . \
  --environment PG_HOST=rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net \
  --environment PG_PORT=6432 \
  --environment PG_DATABASE=heys_production \
  --environment PG_USER=heys_rpc \
  --environment PG_PASSWORD=<СЕКРЕТ>
```

⚠️ **ВАЖНО:** Не использовать `--environment PG_PASSWORD=...` в истории команд!
Лучше через Yandex Cloud Console или secrets manager.

---

## 🧪 Smoke Tests

### A) Rate-limit работает

```bash
# 6 неверных PIN подряд (один IP)
curl -X POST https://api.heyslab.ru/rpc \
  -H "Content-Type: application/json" \
  -d '{"fn":"verify_client_pin_v3","args":{"phone":"79001234567","pin":"0000"}}'
# Повторить 6 раз...
```

**Ожидаемо на 6-й попытке:**
```json
{"error": "pin_rate_limited"}
```

**Проверить в БД:**
```sql
SELECT * FROM public.pin_login_attempts ORDER BY last_attempt_at DESC LIMIT 5;

SELECT event_type, count(*) 
FROM public.security_events
WHERE created_at > now() - interval '10 minutes'
GROUP BY 1 ORDER BY 2 DESC;
```

### B) Session-функции работают

```bash
# Fake token → invalid_session
curl -X POST https://api.heyslab.ru/rpc \
  -H "Content-Type: application/json" \
  -d '{"fn":"create_pending_product_by_session","args":{"session_token":"fake","name":"Test","product_data":{}}}'
```

**Ожидаемо:**
```json
{"error": "invalid_session"}
```

### C) Старые функции недоступны

```bash
# UUID-версия → Function not allowed
curl -X POST https://api.heyslab.ru/rpc \
  -H "Content-Type: application/json" \
  -d '{"fn":"create_pending_product","args":{"client_id":"...","name":"Test","product_data":{}}}'
```

**Ожидаемо:**
```json
{"error": "Function not allowed: create_pending_product"}
```

### D) KV с подпиской

```bash
# Без подписки → subscription_required
curl -X POST https://api.heyslab.ru/rpc \
  -H "Content-Type: application/json" \
  -d '{"fn":"upsert_client_kv_by_session","args":{"session_token":"...","key":"test","value":"{}"}}'
```

**Ожидаемо для `none` или `read_only`:**
```json
{"error": "subscription_required"}
```

---

## 🔄 Cron для cleanup

`cleanup_security_logs()` не запускается автоматически!

**Варианты:**

1. **Yandex Cloud Functions cron** (рекомендуется):
   - Создать отдельную функцию `heys-api-cleanup`
   - Триггер: Timer, раз в сутки (например, 03:00 UTC)
   - Код: `SELECT public.cleanup_security_logs(30);`

2. **Внешний cron** (CI/CD или админ-скрипт):
   ```bash
   psql "..." -c "SELECT public.cleanup_security_logs(30);"
   ```

---

## ✅ Финальный чеклист

- [ ] Миграция 1: `p1_security_rate_limit.sql` применена
- [ ] Миграция 2: `p1_session_functions.sql` применена
- [ ] Миграция 3: `p1_runtime_user_heys_rpc.sql` применена
- [ ] Пароль `heys_rpc` установлен
- [ ] CF переведена на `PG_USER=heys_rpc`
- [ ] Smoke test A: rate-limit работает
- [ ] Smoke test B: session-функции работают
- [ ] Smoke test C: старые функции заблокированы
- [ ] Smoke test D: KV с подпиской
- [ ] Cron для cleanup настроен

---

## 🚨 Откат (если что-то пошло не так)

### Откат CF на heys_admin
```bash
# Быстрый откат — вернуть PG_USER=heys_admin в env vars
# Это временное решение, НЕ финальное!
```

### Откат миграций (если нужно)
```sql
-- Вернуть старые функции (НЕ рекомендуется, теряем security!)
-- Лучше фиксить проблему forward
```

---

## 📊 Метрики после деплоя

Через 24 часа проверить:

```sql
-- Статистика событий
SELECT event_type, count(*), max(created_at) as last
FROM public.security_events
WHERE created_at > now() - interval '24 hours'
GROUP BY 1 ORDER BY 2 DESC;

-- Rate-limit срабатывания
SELECT count(*) as blocked_attempts
FROM public.pin_login_attempts
WHERE attempt_count >= 5;

-- Размер таблицы
SELECT pg_size_pretty(pg_total_relation_size('public.security_events'));
```
