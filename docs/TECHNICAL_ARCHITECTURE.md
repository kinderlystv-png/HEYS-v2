# 🏗️ Техническая Архитектура HEYS

> **Версия:** v16.0.0 **Дата обновления:** February 19, 2026 **Статус:** ✅
> Production Ready — полностью переведено на Yandex Cloud

---

## 📋 Обзор системы

HEYS — нутрициологическая PWA с моделью куратор→клиент. Монорепо (pnpm
workspaces + Turborepo). Два мира кода сосуществуют:

| Layer          | Расположение                   | Язык                      | Роль                    |
| -------------- | ------------------------------ | ------------------------- | ----------------------- |
| **Legacy v12** | `apps/web/` root (`heys_*.js`) | Vanilla JS + inline React | Production runtime      |
| **Modern**     | `packages/*`, `apps/web/src/`  | TypeScript + React        | Новые фичи, shared libs |

**152-ФЗ compliance**: все данные исключительно в Yandex Cloud (Россия,
ru-central1). Supabase SDK удалён 2025-12-24.

---

## 🏛️ Архитектурные слои

### 1. Presentation Layer (UI/Frontend)

```
apps/web/          - PWA (Vite + React 18), порт 3001
apps/landing/      - Маркетинговый лендинг (Next.js 14), порт 3003
apps/tg-mini/      - Telegram Mini App, порт 3002
apps/mobile/       - ⚠️ ОТКЛЮЧЕНО (не в активной разработке)
```

### 2. Application Layer (Business Logic)

```
packages/core/         - Express API (порт 4001 локально), бизнес-логика
packages/analytics/    - Аналитические модули
packages/search/       - Умный поиск (typo-correction, fuzzy matching)
packages/logger/       - Централизованное логирование
```

### 3. Domain Layer (Shared Models)

```
packages/shared/   - Общие типы, DB-слой, day-logic, security, performance
packages/ui/       - Переиспользуемые UI-компоненты
packages/storage/  - Data persistence layer
```

### 4. Infrastructure Layer (Serverless)

```
yandex-cloud-functions/
├── heys-api-rpc/      - RPC-вызовы PostgreSQL функций
├── heys-api-rest/     - REST API для таблиц (GET-only)
├── heys-api-auth/     - Аутентификация (куратор JWT + клиент PIN)
├── heys-api-sms/      - SMS через SMSC.ru
├── heys-api-leads/    - Обработка лидов с лендинга
├── heys-api-health/   - Health check endpoint
└── heys-api-payments/ - Платежи (ЮKassa)
```

---

## 🔧 Технологический стек

### Frontend Stack

- **Framework**: Vite 6.x + React 18.x
- **TypeScript**: strict mode (`noUnusedLocals`, `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`)
- **State Management**: Vanilla JS HEYS global object + React hooks (scoped
  store)
- **Styling**: Tailwind CSS (приоритет) + BEM в `styles/heys-components.css`
- **Testing**: Vitest (happy-dom env, 10s timeout, v8 coverage ≥ 80%)
- **E2E**: Playwright

### Backend Stack

- **Runtime**: Node.js 18+ (Express.js 4.x на порту 4001 локально)
- **Serverless**: Yandex Cloud Functions (Node.js 18 runtime, 9 функций: 7 API +
  backup + maintenance)
- **Database**: Yandex Cloud PostgreSQL 16
  (`rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net:6432`)
- **Auth**: `heys-api-auth` YCF → JWT (куратор) + phone+PIN → session_token
  (клиент)
- **ORM**: нет — прямые SQL запросы через `pg` (node-postgres)

### DevOps & Infrastructure

- **Package Manager**: pnpm 8.10+, Node >= 18
- **Build System**: Turbo + Vite
- **CI/CD**: GitHub Actions (lint, tests, API мониторинг каждые 15 мин)
- **Frontend хостинг**: Nginx VM → Yandex S3 (PWA), Yandex CDN (лендинг)
- **API хостинг**: Yandex Cloud Functions (9 функций, api.heyslab.ru)
- **Секреты**: `yandex-cloud-functions/.env` → деплой через `deploy-all.sh`

### Security & Monitoring

- **Клиент auth**: Телефон + PIN → `client_pin_auth` RPC → `session_token`
- **Куратор auth**: Email + пароль → `heys-api-auth` → JWT
- **Мониторинг**: GitHub Actions проверяет API каждые 15 минут (24/7)
- **Алерты**: Telegram уведомления при сбоях API
- **Health**: `./health-check.sh` проверяет все эндпоинты
- **152-ФЗ**: Все данные в Yandex Cloud (Россия, ru-central1)

---

## 📊 Архитектура данных

### Database Schema (реальные таблицы)

```sql
-- Основные таблицы
clients              -- (id UUID, name, phone_normalized, pin_hash, curator_id, updated_at)
kv_store             -- KV-хранилище кураторов (key, value, user_id)
client_kv_store      -- KV клиентов (client_id, k, v JSONB, v_encrypted BYTEA, key_version SMALLINT)
                     -- PRIMARY KEY (client_id, k)
consents             -- ПЭП-согласия согласно 152-ФЗ
shared_products      -- Общая база продуктов (~300+ позиций)

-- Auth
pin_login_attempts   -- Rate-limit PIN (phone, ip INET, attempts, locked_until)
client_sessions      -- Сессии (token_hash BYTEA — сам токен НЕ хранится)

-- Trial Machine v3.0
leads                -- Лиды с лендинга (id UUID, name, phone, utm_source, status)
trial_queue          -- status: queued|offer|assigned|canceled|canceled_by_purchase|expired
trial_queue_events   -- queued|offer_sent|claimed|offer_expired|canceled|purchased

-- Payments
payment_orders, subscriptions (active_until)
```

### LocalStorage Keys (namespace: clientId-scoped через U.lsSet/lsGet)

| Ключ паттерн         | Описание                  | Шифрование   |
| -------------------- | ------------------------- | ------------ |
| `heys_profile`       | ПДн + health данные       | ✅ AES-256   |
| `heys_dayv2_{date}`  | Дневник питания, сон, вес | ✅ AES-256   |
| `heys_hr_zones`      | Пульсовые зоны            | ✅ AES-256   |
| `heys_products`      | База продуктов            | ❌ Plaintext |
| `heys_norms`         | Нормы питания             | ❌ Plaintext |
| `heys_ews_weekly_v1` | EWS недельный прогресс    | ❌ Plaintext |

**⚠️ ПРАВИЛО**: всегда используй `U.lsSet/lsGet` или Store API
(`HEYS.products.getAll()`). Прямой `localStorage.setItem/getItem` нарушает
namespacing.

### Data Flow

```
Event Source → Event Bus → Event Handlers → Side Effects
1. Клиент → PIN auth → session_token → localStorage
2. App start → syncClient(clientId) → batch RPC → localStorage (scoped)
3. User action → Store API → localStorage (scoped) + cloud queue
4. Cloud queue → background sync → batch_upsert_client_kv_by_session → PostgreSQL
5. Insights → pi_thresholds → pi_early_warning → pi_constants → UI
```

---

## 🔐 Система безопасности

### Аутентификация и авторизация

```
Куратор (нутрициолог):
  email+password → heys-api-auth (YCF) → bcrypt verify → JWT токен
  Хранится: localStorage['heys_curator_session']
  Передаётся: Authorization: Bearer <JWT>

Клиент:
  phone → get_client_salt RPC → PIN + bcrypt crypt() → client_pin_auth RPC → session_token (UUID)
  Хранится: localStorage['heys_session_token']
  Передаётся: X-Session-Token: <token>
```

### IDOR Protection

- Все клиентские RPC используют паттерн `*_by_session` — `client_id` никогда не
  передаётся напрямую
- Заблокированные legacy функции: `verify_client_pin`, `get_client_data`,
  `upsert_client_kv` и др.

### Шифрование данных

- **Health data at rest**: Cloud Function → `SET heys.encryption_key` →
  PostgreSQL AES-256 (`v_encrypted` BYTEA)
- **Client-side**: `heys_profile`, `heys_dayv2_*`, `heys_hr_zones` → AES-256 в
  localStorage

### CORS

Только `app.heyslab.ru` и `heyslab.ru` — другие origins возвращают 403.

### PIN Rate Limiting

`pin_login_attempts` (phone, ip INET) — блокировка через `locked_until` после N
попыток.

---

## ⚡ Производительность

### Стратегия кэширования

- **LocalStorage** (scoped по clientId) — мгновенный доступ, offline-first
- **Adaptive Thresholds Cache** (`pi_thresholds.js`) — TTL 12-72ч на основе
  поведенческой стабильности
- **EWS Weekly Cache** (`heys_ews_weekly_v1`) — прогресс за неделю
- **Yandex CDN** — статические ресурсы лендинга
- **Service Worker** (PWA) — offline кэш + background sync

### Module Limits

- LOC ≤ 2000 строк на модуль
- Функции ≤ 80 строк
- `HEYS.*` ссылок ≤ 50 на файл

---

## 🧩 Insights-система (v5.x)

Все модули в `apps/web/insights/`:

| Модуль                   | Версия | Назначение                                        |
| ------------------------ | ------ | ------------------------------------------------- |
| `pi_stats.js`            | v3.5.0 | 27 функций (Bayesian, CI, outliers) — 131 тест    |
| `pi_thresholds.js`       | v2.0.0 | Адаптивные пороги (cascade, TTL 12-72h, Bayesian) |
| `pi_early_warning.js`    | v4.2   | 25 предупреждений, Global Score 0-100, Dual-Mode  |
| `pi_causal_chains.js`    | v1.0   | 6 причинно-следственных цепочек                   |
| `pi_constants.js`        | v4.3.0 | Dynamic Priority Badge, SECTION_PRIORITY_RULES    |
| `pi_phenotype.js`        | —      | Фенотипический профиль EWS (4 типа)               |
| `pi_patterns.js`         | —      | Паттерны питания и корреляций                     |
| `pi_meal_recommender.js` | —      | Рекомендатор приёмов пищи                         |
| `pi_product_picker.js`   | —      | Подборка продуктов                                |
| `pi_whatif.js`           | —      | What-if сценарии                                  |
| `pi_feedback_loop.js`    | —      | Обратная связь (паттерны → рекомендации)          |
| `pi_analytics_api.js`    | —      | Аналитический API                                 |

---

## 🧪 Тестирование

```bash
pnpm test:run     # vitest run (однократный прогон)
pnpm test:all     # vitest + coverage
pnpm test:e2e     # Playwright E2E
pnpm arch:check   # Архитектурные правила
```

- **Покрытие**: v8 coverage ≥ 80%
- **Ключевые тесты**: `apps/web/insights/pi_stats.test.js` — 131 тест, 100%

### CI/CD Pipeline (GitHub Actions)

```
1. Lint + TypeScript check
2. Unit tests (vitest)
3. Build check (pnpm build)
4. API Health Monitor (каждые 15 мин + после каждого push)
   → Health + RPC + REST endpoints
   → Auto-redeploy при 502 ошибках
   → Telegram алерты
```

---

## 🚀 Архитектура деплоя

### Production Infrastructure

```
┌────────────────────────────────────────────────────┐
│                   PRODUCTION                       │
├────────────────────────────────────────────────────┤
│  app.heyslab.ru  → Nginx VM → Yandex S3 (PWA)     │
│  heyslab.ru      → Yandex CDN → S3 (Landing)      │
│  api.heyslab.ru  → Yandex Cloud Functions          │
│  DB              → Yandex Cloud PostgreSQL 16      │
│                    rc1b-obkgs83tnrd6a2m3 :6432     │
└────────────────────────────────────────────────────┘
```

### Деплой Cloud Functions

```bash
cd yandex-cloud-functions
./validate-env.sh            # Проверить секреты перед деплоем
./health-check.sh            # Текущее состояние endpoints
./deploy-all.sh <function>   # Задеплоить одну или все функции
sleep 15                     # Дождаться warmup
./health-check.sh            # Убедиться, что деплой прошёл
```

### При 502 Bad Gateway

```bash
cd yandex-cloud-functions
./deploy-all.sh              # Передеплоить все функции
./health-check.sh --watch    # Мониторить восстановление
```

**Важно**: секреты только в `yandex-cloud-functions/.env` + YC Console.
**Никогда** не через YC CLI (утечка в stdout).

---

## 📈 Мониторинг

### Health Checks

- `./health-check.sh` — проверяет все YCF эндпоинты
- `./validate-env.sh` — валидирует секреты перед деплоем
- GitHub Actions API Monitor — каждые 15 мин, автоматический redeploy при 502
- Telegram алерты при сбоях

### Data Quality Monitoring (v4.8.8)

```javascript
// Post-sync verifications
console.info(
  `[HEYS.sync] 🔍 After sync: loadedProducts.length=${x}, withIron=${y}`,
);
// Ожидаемое: withIron ≈ 290 (не 0 или 42)

// Quality checks (critical)
console.error(`[HEYS.storage] 🚨 SAVE BLOCKED: only ${x} products with iron`);
// Не должно появляться в prod после v4.8.8
```

**Мониторинг чеклист**:

- ✅ `withIron ≈ 290` после каждого sync
- ✅ `SAVE BLOCKED` не появляется
- ⚠️ Любой `withIron < 100` = ИНЦИДЕНТ → проверить namespacing

---

## 📚 Стандарты кода

- **Commit format**: `feat|fix|docs|refactor|perf|test|chore: message` (max 100
  chars, commitlint enforced)
- **Path aliases**: `@heys/core`, `@heys/shared`, `@heys/logger`,
  `@heys/search`, `@heys/storage`, `@heys/ui`
- **CSS**: Tailwind > BEM в `styles/heys-components.css` > inline styles ВСЕГДА
  ЗАПРЕЩЕНЫ
- **Logging**: `console.info('[HEYS.module] ✅ Action')` — никогда `console.log`
  в коммитах
- **GDPR/152-ФЗ**: никогда не логировать ПДн (профиль, питание, вес)

---

## �️ Критические архитектурные решения

### **React State Synchronization v4.8.8 (февраль 2026)**

**Проблема**: React state показывал 42 продукта с микронутриентами вместо 290,
несмотря на корректные данные в cloud/DB/localStorage. Это блокировало активацию
паттернов `micronutrient_radar`, `antioxidant_defense`, `heart_health`.

**Root Cause**: Namespacing conflict — React читал из **unscoped** localStorage
ключа (`heys_products`), а синхронизация писала в **scoped** ключ
(`heys_{clientId}_products`).

**Решение** (v4.8.8):

```javascript
// ❌ СТАРЫЙ подход — прямой доступ к localStorage
const products = window.HEYS.utils.lsGet('heys_products', []);

// ✅ НОВЫЙ подход v4.8.8 — единственный источник истины
const products = window.HEYS?.products?.getAll?.() || [];
```

**Архитектурный принцип**: **Store API как Single Source of Truth**

- React ВСЕГДА читает через `products.getAll()` (не напрямую из localStorage)
- Store API инкапсулирует scoped keys внутри
- Абстракция предотвращает утечку деталей реализации

**Защита данных** (многослойная):

1. **PRIMARY Quality Check** (v4.8.6): Блокирует сохранение если `<50` продуктов
   с железом
2. **Quality-based Comparison** (v4.8.7): Обновление React по iron count, а не
   по длине массива
3. **Pre-sync Block**: Флаг `waitingForSync` предотвращает race conditions

**Результат**:

- Products с Fe: 42 → **290** ✅
- micronutrient_radar: 0 → **100** ✅
- Health Score: 66 → **71** ✅
- Паттерны: 27/41 → активны все нутриентные

**Lessons Learned**:

1. **Никогда не обходите абстракции** — прямой доступ к localStorage нарушает
   scoping
2. **Debug logs критичны** — 3-уровневое логирование выявило namespacing
   conflict
3. **Quality checks работают** — PRIMARY check заблокировал 100% stale saves

**Файлы**:

- `apps/web/heys_app_sync_effects_v1.js` (React hooks, v4.8.8)
- `apps/web/heys_storage_supabase_v1.js` (sync + quality checks)
- `apps/web/heys_core_v12.js` (products API)
- `apps/web/heys_storage_layer_v1.js` (Store implementation)

---

## �🔮 Будущее развитие

---

## 🔮 Будущее развитие

- **Adaptive Thresholds v2.1**: Инкрементальные rolling-window обновления
  (отложено)
- **Trial Machine v3.1**: Дополнительные опции активации триала
- **Payments**: ЮKassa интеграция (`heys-api-payments`)
- **SMS verification**: Усиление ПЭП при масштабировании (>50 клиентов)

---

_Документ обновлен: February 19, 2026_ _Версия системы: v5.0.1 (production
stable)_
