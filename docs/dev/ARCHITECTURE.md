# 🏗️ HEYS Architecture

> Структура проекта и ключевые файлы

---

## Структура проекта

```
HEYS-v2/
├── apps/web/              # Legacy v12 app (standalone HTML + inline React)
│   ├── index.html         # Main entry point, React components inline
│   ├── heys_app_v12.js    # Main app orchestration
│   ├── heys_core_v12.js   # Product search, localStorage management
│   ├── heys_day_v12.js    # Day statistics, meal tracking (~6400 строк)
│   ├── heys_user_v12.js   # User profile management
│   ├── heys_reports_v12.js # Reports and analytics
│   ├── heys_models_v1.js  # Data models (Product, Meal, etc.)
│   ├── heys_storage_layer_v1.js # Storage layer (HEYS.store)
│   ├── heys_yandex_api_v1.js # API client for Yandex Cloud Functions
│   └── heys_simple_analytics.js # Minimal performance tracking
├── apps/landing/          # Next.js 14 landing page (https://heyslab.ru)
├── yandex-cloud-functions/ # Serverless API (7 функций)
│   ├── heys-api-rpc/     # PostgreSQL RPC operations
│   ├── heys-api-rest/    # REST CRUD endpoints
│   ├── heys-api-auth/    # JWT authentication
│   ├── heys-api-sms/     # SMS.ru integration
│   ├── heys-api-leads/   # Lead capture + Telegram
│   ├── heys-api-health/  # Healthcheck
│   └── heys-api-payments/ # ЮKassa (WIP)
├── packages/              # Modern TypeScript packages
│   ├── core/             # Core business logic
│   ├── shared/           # Shared utilities
│   └── ...               # analytics, search, ui, logger
├── database/             # SQL migrations (PostgreSQL)
```

**Key principle:** Legacy v12 код в `apps/web/` — это production runtime.
API через Yandex Cloud Functions (`api.heyslab.ru`).

**Арх‑контроль:** правила модульности и Quality Gate см. в
`docs/dev/MODULE_ARCHITECTURE.md`, `docs/dev/QUALITY_GATE.md`,
`docs/dev/AUTOLIMITS.md` и `docs/dev/CODE_STYLE.md`.

---

## 🌐 Yandex Cloud Architecture (152-ФЗ compliant)

| Компонент     | URL / Host                                       | Назначение          |
| ------------- | ------------------------------------------------ | ------------------- |
| **PWA**       | `https://app.heyslab.ru`                         | Основное приложение |
| **Landing**   | `https://heyslab.ru`                             | Лендинг             |
| **API**       | `https://api.heyslab.ru`                         | API Gateway         |
| **Database**  | `rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net:6432` | PostgreSQL 16       |

---

## Ключевые файлы по категориям

| Категория              | Файлы                                                              |
| ---------------------- | ------------------------------------------------------------------ |
| **Core**               | `heys_app_v12.js`, `heys_core_v12.js`, `heys_day_v12.js`           |
| **Auth**               | `heys_auth_v1.js`, `heys_storage_supabase_v1.js`                   |
| **Subscriptions**      | `heys_subscriptions_v1.js`, `heys_morning_checkin_v1.js`           |
| **Analytics**          | `heys_advice_v1.js`, `heys_insulin_wave_v1.js`, `heys_cycle_v1.js` |
| **Legal**              | `heys_consents_v1.js`, `heys_sms_v1.js`, `docs/legal/`             |
| **Landing**            | `apps/landing/` (Next.js 14, YandexAPI, Telegram)                  |
| **Models**             | `heys_models_v1.js`                                                |
| **Storage**            | `heys_storage_layer_v1.js`                                         |
| **UI**                 | `heys_user_v12.js`, `heys_reports_v12.js`                          |
| **Cloud Functions**    | `yandex-cloud-functions/heys-api-*` (7 функций)                    |
| **Infrastructure**     | `infra/README.md` (VM, CDN, S3, DNS)                               |

---

## Storage Pattern

```javascript
// Legacy API (в heys_core_v12.js) — с clientId namespace
U.lsSet('heys_products', products); // Автоматически добавляет clientId
U.lsGet('heys_products', []);

// Modern API (в heys_storage_layer_v1.js) — с кэшем и watchers
HEYS.store.set('key', value); // Сохранение + notify watchers
HEYS.store.get('key', defaultVal); // Получение из cache/localStorage

// Global storage (без namespace)
localStorage.setItem('heys_client_current', clientId);
```

---

## Quick Start

```bash
pnpm install           # Bootstrap (Node ≥18, pnpm ≥8)
pnpm dev              # Dev server → localhost:3001
pnpm build            # Production build (Turbo)
pnpm type-check       # TypeScript validation
pnpm lint             # ESLint check
```

---

## Debugging Patterns

```javascript
// В browser console:
heysStats(); // Shows session statistics
window.HEYS.cloud.getStatus(); // 'online' | 'offline'

// Inspect localStorage
Object.keys(localStorage).filter((k) => k.startsWith('heys_'));
```
