---
description:
  'Database, SQL migrations, RLS policies, PostgreSQL functions for HEYS'
applyTo: '**/*.sql'
---

# 🗄️ HEYS Database Skill

> Миграции, PostgreSQL функции, RLS, транзакции

---

## 🔑 Когда активируется

- Работа с файлами `*.sql`
- Создание/редактирование миграций в `database/`
- Yandex Cloud Functions SQL
- RLS политики, GRANTS

---

## 🏗️ Структура БД

### Ключевые таблицы

| Таблица              | PK               | Назначение                   |
| -------------------- | ---------------- | ---------------------------- |
| `clients`            | `id` UUID        | Клиенты, телефон, PIN        |
| `client_kv_store`    | `(client_id, k)` | Key-Value хранилище данных   |
| `client_sessions`    | `id` UUID        | Сессии клиентов (token_hash) |
| `shared_products`    | `id` SERIAL      | Общая база продуктов         |
| `pending_products`   | `id` UUID        | Продукты на модерации        |
| `consents`           | `id` UUID        | Согласия ПДн (ПЭП)           |
| `leads`              | `id` UUID        | Лиды с лендинга              |
| `pin_login_attempts` | `(phone, ip)`    | Rate limiting авторизации    |

### Колонки clients

```sql
id UUID PRIMARY KEY,
phone_normalized TEXT UNIQUE NOT NULL,  -- +79001234567
pin_hash TEXT NOT NULL,                 -- bcrypt hash
name TEXT,                              -- имя (не first/last!)
curator_id UUID REFERENCES curators(id),
subscription_status TEXT DEFAULT 'none',
created_at TIMESTAMPTZ DEFAULT NOW()
```

---

## 🔐 Security Patterns

### Session-based RPC (обязательно!)

```sql
-- ❌ ЗАПРЕЩЕНО — UUID от клиента (IDOR!)
CREATE FUNCTION get_client_data(p_client_id UUID) ...

-- ✅ ПРАВИЛЬНО — client_id из сессии
CREATE FUNCTION get_client_data_by_session(p_session_token TEXT)
AS $$
DECLARE
  v_client_id UUID;
BEGIN
  v_client_id := public.require_client_id(p_session_token);
  -- теперь безопасно использовать v_client_id
END;
$$;
```

### Rate Limiting (PIN)

```sql
-- Таблица rate-limit
CREATE TABLE pin_login_attempts (
  phone TEXT NOT NULL,
  ip INET NOT NULL,  -- ⚠️ INET, не ip_address!
  attempts INT DEFAULT 1,
  locked_until TIMESTAMPTZ,
  PRIMARY KEY (phone, ip)
);

-- Функция инкремента
SELECT increment_pin_attempt('+79001234567', '1.2.3.4'::INET);
```

### GRANTS (минимальные права)

```sql
-- Runtime user (heys_rpc) — только EXECUTE
GRANT EXECUTE ON FUNCTION verify_client_pin_v3 TO heys_rpc;

-- ❌ НЕ давать SELECT/INSERT напрямую
REVOKE ALL ON TABLE clients FROM heys_rpc;
```

---

## 📁 Naming Convention (миграции)

```
database/
├── YYYY-MM-DD_feature_name.sql      # Основная миграция
├── YYYY-MM-DD_fix_something.sql     # Фикс
├── fixes/                           # Hotfix-скрипты
└── yandex_migration/                # YC-специфичное
```

**Пример:** `2025-01-10_curator_sessions.sql`

---

## ✅ Чеклист миграции

1. **BEGIN/COMMIT** — транзакция обязательна
2. **IF NOT EXISTS** — идемпотентность
3. **COMMENT ON** — документация функций
4. **SECURITY DEFINER** — для RPC функций
5. **SET search_path = public** — против injection
6. **REVOKE FROM PUBLIC** — закрыть доступ

---

## 🚫 Запрещено

| ❌ Нельзя              | ✅ Правильно                 |
| ---------------------- | ---------------------------- |
| UUID в параметрах RPC  | `*_by_session` функции       |
| `ip_address` колонка   | `ip INET`                    |
| GRANT SELECT TO PUBLIC | Явные GRANT конкретным ролям |
| Хардкод client_id      | Извлекать из сессии          |
