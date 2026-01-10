---
applyTo: "**/*.{js,ts,sql,md}"
description: Архитектура HEYS — API, БД, структура проекта
---

# HEYS Architecture Skill

> Активируется при вопросах об архитектуре, структуре проекта, API, базе данных

## Триггеры (keywords)
- архитектура, структура, где находится
- API, endpoint, RPC, REST
- база данных, PostgreSQL, таблицы
- Yandex Cloud, Cloud Functions

## Контекст

### Структура проекта
```
apps/web/          # PWA (React + Vite) — app.heyslab.ru
apps/landing/      # Next.js 14 — heyslab.ru
yandex-cloud-functions/  # API (7 функций) — api.heyslab.ru
database/          # SQL миграции
docs/              # Документация
```

### API Gateway
- **URL**: `https://api.heyslab.ru`
- **Функции**: rpc, rest, sms, leads, health, auth, payments

### База данных
- **Хост**: `rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net:6432`
- **База**: `heys_production`
- **PostgreSQL 16**, SSL verify-full

### Ключевые таблицы
- `clients` — клиенты (phone, pin_hash, name)
- `client_kv_store` — KV хранилище (PK: client_id, k)
- `shared_products` — продукты питания
- `consents` — согласия ПДн

## Правила
1. Все данные в РФ (152-ФЗ)
2. Supabase SDK удалён — только YandexAPI
3. RPC через allowlist в `heys-api-rpc`
