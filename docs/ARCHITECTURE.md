# HEYS Platform Architecture

> **System Architecture Overview** **Version:** 18.1.0 (merged with
> TECHNICAL_ARCHITECTURE) **Last Updated:** February 26, 2026

## System Overview

HEYS is a nutritional PWA with a curator-to-client model. Monorepo (pnpm
workspaces + Turborepo). Two code worlds coexist:

| Layer          | Location                       | Language                  | Role                      |
| -------------- | ------------------------------ | ------------------------- | ------------------------- |
| **Legacy v12** | `apps/web/` root (`heys_*.js`) | Vanilla JS + inline React | Production runtime        |
| **Modern**     | `packages/*`, `apps/web/src/`  | TypeScript + React        | New features, shared libs |

**152-FZ compliance**: all data exclusively in Yandex Cloud (Russia,
ru-central1). Supabase SDK removed 2025-12-24.

---

## High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      CLIENT LAYER                               │
├─────────────────────────────────────────────────────────────────┤
│  PWA (app.heyslab.ru)          Telegram Mini App                │
│  (React 18 + Vite)             (apps/tg-mini)                   │
│  ├─ Service Worker             ├─ Vite app                      │
│  ├─ Offline First              ├─ Telegram API                  │
│  └─ LocalStorage cache         └─ Same API backend              │
└─────────────────────────────────────────────────────────────────┘
                                │
                        HTTPS (api.heyslab.ru)
                                │
┌─────────────────────────────────────────────────────────────────┐
│                     APPLICATION LAYER                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
│  │ Core Logic    │  │ Security      │  │ Integration   │       │
│  │               │  │               │  │               │       │
│  │ • User Mgmt   │  │ • Auth Layer  │  │ • Yandex Cloud│       │
│  │ • Nutrition   │  │ • Validation  │  │ • REST APIs   │       │
│  │ • Training    │  │ • XSS Guard   │  │ • RPC Calls   │       │
│  │ • Analytics   │  │ • Input San.  │  │ • SMS (SMSC)  │       │
│  │ • Reports     │  │ • Rate Limit  │  │ • Payments    │       │
│  └───────────────┘  └───────────────┘  └───────────────┘       │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ SMART FEATURES ENGINE                                     │  │
│  │ • Smart Search (typo correction, fuzzy matching)          │  │
│  │ • Gamification (achievements, progress tracking)          │  │
│  │ • Universal Anchors (auto-navigation system)              │  │
│  │ • Enhanced Analytics (real-time insights)                 │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
                        API Calls (RPC + REST)
                                │
┌─────────────────────────────────────────────────────────────────┐
│                      DATA LAYER                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐           ┌─────────────────┐              │
│  │ Legacy Core     │◄─────────►│ Modern Cloud    │              │
│  │ (localStorage)  │  Sync     │ (Yandex Cloud)  │              │
│  │                 │           │                  │              │
│  │ • Fast Access   │           │ • PostgreSQL 16  │              │
│  │ • Offline Mode  │           │ • Cloud Functions│              │
│  │ • Client Cache  │           │ • Auth System    │              │
│  │ • Day Records   │           │ • Row Security   │              │
│  │ • Settings      │           │ • Backups        │              │
│  └─────────────────┘           └─────────────────┘              │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ DATABASE SCHEMA                                              │ │
│  │                                                              │ │
│  │ clients (id UUID, name, phone_normalized, pin_hash,          │ │
│  │          curator_id, updated_at)                              │ │
│  │ kv_store (id, user_id, k, v, timestamps)                    │ │
│  │ client_kv_store (client_id, k, v JSONB, v_encrypted BYTEA,  │ │
│  │   key_version SMALLINT) — PRIMARY KEY (client_id, k)         │ │
│  │ client_sessions (id, client_id, token_hash BYTEA)           │ │
│  │ shared_products (id, name, nutrients, harm, ...)            │ │
│  │ consents (client_id, type, accepted_at)                     │ │
│  │ pin_login_attempts (phone, ip INET, locked_until)           │ │
│  │ leads (id UUID, name, phone, utm_source, status)            │ │
│  │ trial_queue + payment_orders + subscriptions                │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

### Frontend

- **Framework**: Vite 6.x + React 18.x
- **TypeScript**: strict mode (`noUnusedLocals`, `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`)
- **State Management**: Vanilla JS HEYS global object + React hooks (scoped
  store)
- **Styling**: Tailwind CSS (priority) + BEM in `styles/heys-components.css`
- **Testing**: Vitest (happy-dom env, 10s timeout, v8 coverage >= 80%)
- **E2E**: Playwright

### Backend

- **Runtime**: Node.js 18+ (Express.js 4.x on port 4001 locally)
- **Serverless**: Yandex Cloud Functions (Node.js 18 runtime, 9 functions: 7
  API + backup + maintenance)
- **Database**: Yandex Cloud PostgreSQL 16
  (`rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net:6432`)
- **Auth**: `heys-api-auth` YCF -> JWT (curator) + phone+PIN -> session_token
  (client)
- **ORM**: none — direct SQL queries via `pg` (node-postgres)

### DevOps & Infrastructure

- **Package Manager**: pnpm 8.10+, Node >= 18
- **Build System**: Turbo + Vite
- **CI/CD**: GitHub Actions (lint, tests, API monitoring every 15 min)
- **Frontend hosting**: Nginx VM -> Yandex S3 (PWA), Yandex CDN (landing)
- **API hosting**: Yandex Cloud Functions (9 functions, api.heyslab.ru)
- **Secrets**: `yandex-cloud-functions/.env` -> deploy via `deploy-all.sh`

---

## Architecture Layers

### 1. Presentation Layer (UI/Frontend)

```
apps/web/          - PWA (Vite + React 18), port 3001
apps/landing/      - Marketing landing (Next.js 14), port 3003
apps/tg-mini/      - Telegram Mini App, port 3002
apps/mobile/       - DISABLED (not in active development)
```

### 2. Application Layer (Business Logic)

```
packages/core/         - Express API (port 4001 locally), business logic
packages/analytics/    - Analytics modules
packages/search/       - Smart search (typo-correction, fuzzy matching)
packages/logger/       - Centralized logging
```

### 3. Domain Layer (Shared Models)

```
packages/shared/   - Shared types, DB layer, day-logic, security, performance
packages/ui/       - Reusable UI components
packages/storage/  - Data persistence layer
```

### 4. Infrastructure Layer (Serverless)

```
yandex-cloud-functions/
├── heys-api-rpc/      - RPC calls to PostgreSQL functions
├── heys-api-rest/     - REST API for tables (GET-only)
├── heys-api-auth/     - Authentication (curator JWT + client PIN)
├── heys-api-sms/      - SMS via SMSC.ru
├── heys-api-leads/    - Landing page leads processing
├── heys-api-health/   - Health check endpoint
└── heys-api-payments/ - Payments (YooKassa)
```

---

## Data Flow Architecture

```
Event Source -> Event Bus -> Event Handlers -> Side Effects
1. Client -> PIN auth -> session_token -> localStorage
2. App start -> syncClient(clientId) -> batch RPC -> localStorage (scoped)
3. User action -> Store API -> localStorage (scoped) + cloud queue
4. Cloud queue -> background sync -> batch_upsert_client_kv_by_session -> PostgreSQL
5. Insights -> pi_thresholds -> pi_early_warning -> pi_constants -> UI
```

---

## Security Architecture

### Authentication & Authorization

```
Curator (nutritionist):
  email+password -> heys-api-auth (YCF) -> bcrypt verify -> JWT token
  Stored: localStorage['heys_curator_session']
  Transmitted: Authorization: Bearer <JWT>

Client:
  phone -> get_client_salt RPC -> PIN + bcrypt crypt() -> client_pin_auth RPC -> session_token (UUID)
  Stored: localStorage['heys_session_token']
  Transmitted: X-Session-Token: <token>
```

### IDOR Protection

- All client RPCs use `*_by_session` pattern — `client_id` is never passed
  directly
- Blocked legacy functions: `verify_client_pin`, `get_client_data`,
  `upsert_client_kv`, etc.

### Data Encryption

- **Health data at rest**: Cloud Function -> `SET heys.encryption_key` ->
  PostgreSQL AES-256 (`v_encrypted` BYTEA)
- **Client-side**: `heys_profile`, `heys_dayv2_*`, `heys_hr_zones` -> AES-256 in
  localStorage

### CORS

Only `app.heyslab.ru` and `heyslab.ru` — other origins return 403.

### PIN Rate Limiting

`pin_login_attempts` (phone, ip INET) — lockout via `locked_until` after N
attempts.

---

## Performance Architecture

### JS Bundling & Load Performance (v9.7, February 2026)

> **Before:** 246 `<script defer>` files — 63s on Mid-tier mobile. **After:** 9
> GZIP bundles in Yandex Object Storage — FCP **~0ms** (Skeleton) / full UI
> **2.6s** on mobile.

| Bundle                | Contents                                | Size (GZIP) |
| --------------------- | --------------------------------------- | ----------- |
| `boot-core`           | platform, yandex_api, models, storage   | ~230 KB     |
| `boot-calc`           | ratio_zones, tef, tdee, harm            | ~180 KB     |
| `boot-day`            | all heys_day\_\*                        | ~180 KB     |
| `boot-app`            | auth, subscription, app_shell, app_tabs | ~204 KB     |
| `boot-init`           | app_root, initialize, entry             | ~68 KB      |
| `postboot-1-game`     | gamification, advice                    | ~270 KB     |
| `postboot-2-insights` | all pi\_\*.js                           | ~350 KB     |
| `postboot-3-ui`       | modals, reports, widgets                | ~256 KB     |
| `boot-app-tabs`       | app_tabs additional                     | ~35 KB      |

Rebuild: `node scripts/bundle-legacy.mjs` ->
`upload-to-yandex.ps1 -distDir apps/web/public`.

### Caching Strategy

- **LocalStorage** (scoped by clientId) — instant access, offline-first
- **Adaptive Thresholds Cache** (`pi_thresholds.js`) — TTL 12-72h based on
  behavioral stability
- **EWS Weekly Cache** (`heys_ews_weekly_v1`) — weekly progress
- **Yandex CDN** — static landing resources
- **Service Worker** (PWA) — offline cache + background sync

### Module Limits

- LOC <= 2000 lines per module
- Functions <= 80 lines
- `HEYS.*` references <= 50 per file

---

## LocalStorage Keys

Namespace: clientId-scoped via `U.lsSet/lsGet`.

| Key pattern          | Description                       | Encryption |
| -------------------- | --------------------------------- | ---------- |
| `heys_profile`       | PII + health data                 | AES-256    |
| `heys_dayv2_{date}`  | Day record (meals, sleep, weight) | AES-256    |
| `heys_hr_zones`      | Heart rate zones                  | AES-256    |
| `heys_products`      | Products database                 | Plaintext  |
| `heys_norms`         | Nutrition norms                   | Plaintext  |
| `heys_ews_weekly_v1` | EWS weekly progress               | Plaintext  |

**Rule**: always use `U.lsSet/lsGet` or Store API (`HEYS.products.getAll()`).
Direct `localStorage.setItem/getItem` breaks namespacing.

---

## Synchronization Architecture

> **Full sync reference:** [SYNC_REFERENCE.md](SYNC_REFERENCE.md)

### Dual-Layer Sync

```
┌─────────────────────────────────────────────────────────────────┐
│                 LOCAL STORAGE (Legacy Core)                      │
├─────────────────────────────────────────────────────────────────┤
│ • Instant Access          • Offline Capability                  │
│ • Client Caching          • Fast Read/Write                     │
│ • Day Records             • Settings Storage                    │
└─────────────────────────────────────────────────────────────────┘
                                │
                        Bidirectional Sync
                                │
┌─────────────────────────────────────────────────────────────────┐
│                  CLOUD STORAGE (Yandex Cloud)                   │
├─────────────────────────────────────────────────────────────────┤
│ • Multi-device Access     • Real-time Updates                   │
│ • Backup & Recovery       • Collaborative Features              │
│ • Analytics & Reporting   • Admin Dashboard                     │
└─────────────────────────────────────────────────────────────────┘
```

### Sync Performance Optimizations (v5, updated 26.02.2026)

> **Measured results (WiFi, curator mode):** Boot 7.2s -> **1.0-1.2s**. DayTab
> remounts: 1 -> **0**. **Measured results (Mid-tier mobile):** Boot 65s ->
> **~2.6s**.

**Boot timeline (WiFi, warm cache):**

```
+0.0s  HTML parsed -> Speculative Prefetch starts (REST delta fetch)
+0.3s  React hydrated -> auth-init setSyncVer
+0.5-0.9s  Delta data arrives (parallelized with JS parse)
+1.0-1.2s  DayStats first render (target was <2s)
+1.5-1.8s  DayTab animation render (invisible to user)
+3.0-5.0s  Post-animation state updates (invisible to user)
```

**Boot timeline (Mid-tier mobile, 4x CPU slowdown, Fast 3G):**

```
+0.0s   HTML parsed -> Skeleton UI shown instantly (HTML/CSS, no JS)
+0.0s   Speculative Prefetch starts (REST delta fetch)
+~1.5s  9 GZIP bundles loaded (was 246 files taking 63s)
+1.8s   React boot -> Skeleton replaced
+2.4s   Sync complete (Phase A: profile, products, today)
+2.6s   DayStats first render
+5.0s+  Phase B background sync (history, other keys)
```

Key techniques:

1. **JS Bundling & GZIP**: 246 individual `<script defer>` files concatenated
   into 9 bundles, served with GZIP from Yandex Object Storage. Network time 63s
   -> 1.5s.
2. **Speculative Prefetch**: `index.html` initiates a real REST API delta fetch
   _before_ React loads, saving ~0.8-1.0s.
3. **Delta Fast-Path**: 0 changed keys since last sync -> terminates
   immediately.
4. **Delta Light Path**: <=10 keys -> written directly to localStorage, heavy
   cleanup deferred via `setTimeout`.
5. **Two-Phase Sync**: Critical keys first (profile, products, today's day),
   historical data in the background.
6. **Upload Debouncing & Grace Period**: Prevents re-uploading just-downloaded
   data.
7. **DayTab remount fix**: `syncVer` removed from React key, data updates via
   props and `heys:day-updated` events.
8. **Non-blocking UI Fallback**: 5000ms fallback timer prevents infinite
   skeletons.
9. **Animation Stability**: `useDayAnimations` discriminates real user actions
   from background sync via `prevKcalRef`/`prevDateTabRef`. Background
   sync/`forceReload` teleports progress bar to new position instantly instead
   of resetting to 0 (eliminates double-fill flicker on throttled networks).

**PERF diagnostic markers** (remain in code for ongoing monitoring):

- `heys_app_sync_effects_v1.js`: every `setSyncVer` call logs source + field
- `heys_day_tab_impl_v1.js`: render tracker (gap >200ms only, lists changed
  props)
- `heys_day_stats_v1.js`: first render + re-renders with gap >500ms
- `heys_app_auth_init_v1.js`: `setSyncVer` on auth-init
- `heys_app_tabs_v1.js`: `DayTabWithCloudSync` mount/unmount

### Conflict Resolution

```
Local Change    Cloud Change    Resolution Strategy
─────────────   ─────────────   ──────────────────
Timestamp A  ┌─ Timestamp B  -> Last Writer Wins
Value X      │  Value Y
             │
User Action  └─ Server Action -> User Priority

Offline Mode ┌─ Online Sync  -> Merge Strategy
Queue        │  Real-time
```

---

## Deployment Architecture

### Production Infrastructure

```
┌────────────────────────────────────────────────────┐
│                   PRODUCTION                       │
├────────────────────────────────────────────────────┤
│  app.heyslab.ru  -> Nginx VM -> Yandex S3 (PWA)   │
│  heyslab.ru      -> Yandex CDN -> S3 (Landing)    │
│  api.heyslab.ru  -> Yandex Cloud Functions         │
│  DB              -> Yandex Cloud PostgreSQL 16     │
│                    rc1b-obkgs83tnrd6a2m3 :6432     │
└────────────────────────────────────────────────────┘
```

### Cloud Functions Deployment

```bash
cd yandex-cloud-functions
./validate-env.sh            # Verify secrets before deploy
./health-check.sh            # Current endpoint status
./deploy-all.sh <function>   # Deploy one or all functions
sleep 15                     # Wait for warmup
./health-check.sh            # Verify deployment succeeded
```

### On 502 Bad Gateway

```bash
cd yandex-cloud-functions
./deploy-all.sh              # Redeploy all functions
./health-check.sh --watch    # Monitor recovery
```

**Important**: secrets only in `yandex-cloud-functions/.env` + YC Console.
**Never** via YC CLI (leaks to stdout).

---

## Monitoring & Health Checks

- `./health-check.sh` — checks all YCF endpoints
- `./validate-env.sh` — validates secrets before deploy
- GitHub Actions API Monitor — every 15 min, auto-redeploy on 502
- Telegram alerts on failures

### Data Quality Monitoring (v4.8.8)

```javascript
// Post-sync verifications
console.info(
  `[HEYS.sync] After sync: loadedProducts.length=${x}, withIron=${y}`,
);
// Expected: withIron ~ 290 (not 0 or 42)

// Quality checks (critical)
console.error(`[HEYS.storage] SAVE BLOCKED: only ${x} products with iron`);
// Should not appear in prod after v4.8.8
```

**Monitoring checklist**:

- `withIron ~ 290` after each sync
- `SAVE BLOCKED` does not appear
- Any `withIron < 100` = INCIDENT -> check namespacing

---

## Testing

```bash
pnpm test:run     # vitest run (single pass)
pnpm test:all     # vitest + coverage
pnpm test:e2e     # Playwright E2E
pnpm arch:check   # Architecture rules
```

- **Coverage**: v8 coverage >= 80%
- **Key tests**: `apps/web/insights/pi_stats.test.js` — 131 tests, 100%

### CI/CD Pipeline (GitHub Actions)

```
1. Lint + TypeScript check
2. Unit tests (vitest)
3. Build check (pnpm build)
4. API Health Monitor (every 15 min + after each push)
   -> Health + RPC + REST endpoints
   -> Auto-redeploy on 502 errors
   -> Telegram alerts
```

---

## Insights System (v5.x)

All modules in `apps/web/insights/`:

| Module                   | Version | Purpose                                             |
| ------------------------ | ------- | --------------------------------------------------- |
| `pi_stats.js`            | v3.5.0  | 27 functions (Bayesian, CI, outliers) — 131 tests   |
| `pi_thresholds.js`       | v2.0.0  | Adaptive thresholds (cascade, TTL 12-72h, Bayesian) |
| `pi_early_warning.js`    | v4.2    | 25 warnings, Global Score 0-100, Dual-Mode          |
| `pi_causal_chains.js`    | v1.0    | 6 causal chains                                     |
| `pi_constants.js`        | v4.3.0  | Dynamic Priority Badge, SECTION_PRIORITY_RULES      |
| `pi_phenotype.js`        | —       | Phenotypic EWS profile (4 types)                    |
| `pi_patterns.js`         | —       | Nutrition patterns and correlations                 |
| `pi_meal_recommender.js` | —       | Meal recommender                                    |
| `pi_product_picker.js`   | —       | Product picker                                      |
| `pi_whatif.js`           | —       | What-if scenarios                                   |
| `pi_feedback_loop.js`    | —       | Feedback loop (patterns -> recommendations)         |
| `pi_analytics_api.js`    | —       | Analytics API                                       |

---

## Code Standards

- **Commit format**: `feat|fix|docs|refactor|perf|test|chore: message` (max 100
  chars, commitlint enforced)
- **Path aliases**: `@heys/core`, `@heys/shared`, `@heys/logger`,
  `@heys/search`, `@heys/storage`, `@heys/ui`
- **CSS**: Tailwind > BEM in `styles/heys-components.css` > inline styles ALWAYS
  FORBIDDEN
- **Logging**: `console.info('[HEYS.module] Action')` — never `console.log` in
  commits
- **GDPR/152-FZ**: never log PII (profile, nutrition, weight)

---

## Critical Architecture Evolution

### **v4.8.8: React State Synchronization Fix** (February 2026)

**Problem Identified:**

React components displayed **42 products** with micronutrients instead of
**290** despite:

- Database: 292 products with Fe/VitC/Ca
- Yandex Cloud KV: 290 products with micronutrients + timestamps
- localStorage scoped key `heys_{clientId}_products`: 290 products
- React state via `products.getAll()`: **42 products**

**Root Cause:**

**Namespacing conflict** between:

1. **Storage Layer** (`heys_storage_layer_v1.js`): Writes to **scoped keys**
   `heys_{clientId}_products`
2. **React Components** (`heys_app_sync_effects_v1.js`): Read from **unscoped
   keys** via `utils.lsGet('heys_products')`

```javascript
// PROBLEM (v4.8.7 and earlier)
// React: reads unscoped key -> empty array -> fallback to stale state
const products = window.HEYS.utils.lsGet('heys_products', []);

// Storage Layer: writes scoped key -> data never seen by React
Store.set('heys_products', data); // -> heys_{clientId}_products
```

**Impact:**

- `micronutrient_radar` pattern stuck at **0** (expected **100**)
- `antioxidant_defense` at **21** (expected **79**)
- `heart_health` at **55** (expected **70**)
- Health Score: **66** (expected **71+**)
- **Critical patterns inactive** due to missing micronutrient data

**Solution Architecture v4.8.8:**

**Store API as Single Source of Truth** — React NEVER accesses localStorage
directly:

```javascript
// SOLUTION v4.8.8
// React: ALWAYS reads via Store API (handles scoping internally)
const products = window.HEYS?.products?.getAll?.() || [];

// Store API: automatically resolves scoped keys
HEYS.products.getAll() -> Store.get('heys_products') -> heys_{clientId}_products
```

**3 Critical Changes** (all in `heys_app_sync_effects_v1.js`):

1. **Post-sync load** (Line 46-48):

   ```javascript
   // OLD: const loadedProducts = window.HEYS.utils.lsGet('heys_products', []);
   const loadedProducts = window.HEYS?.products?.getAll?.() || [];
   ```

2. **Initial mount hydration** (Line 18-20):

   ```javascript
   // OLD: const stored = window.HEYS.utils.lsGet('heys_products', []);
   const stored = window.HEYS?.products?.getAll?.() || [];
   ```

3. **Event listener fallback** (Line 147-149):
   ```javascript
   // OLD: fallback = utils.lsGet('heys_products', [])
   const latest = window.HEYS?.products?.getAll?.() || [];
   ```

**Quality Protection System** (4 layers):

```javascript
// Layer 1: PRIMARY Quality Check (v4.8.6) — heys_storage_supabase_v1.js:5625
const savingWithIron = value.filter((p) => p && p.iron && +p.iron > 0).length;
if (savingWithIron < 50) {
  logCritical(`SAVE BLOCKED: ${savingWithIron} products (expected 250+)`);
  return; // Prevents stale saves immediately
}
// Result: 100% effectiveness, 0 stale saves post-v4.8.8

// Layer 2: Pre-sync Block
if (waitingForSync.current === true) return; // Race condition guard

// Layer 3: Quality-based React Update (v4.8.7)
const prevIron = prev.filter((p) => p.iron > 0).length;
const loadedIron = loaded.filter((p) => p.iron > 0).length;
if (prevIron === loadedIron && prev.length === loaded.length) {
  return prev; // Skip update, same quality
}

// Layer 4: Architectural — Store API prevents namespacing conflicts (v4.8.8)
```

**Verification Results:**

```javascript
// User console command:
HEYS.products.getAll().filter(x => x.iron > 0).length
// Result: 290 (was 42)

// Console output after sync:
[HEYS.sync] After sync: loadedProducts.length=293, withIron=290
// Patterns activated:
micronutrient_radar: 0 -> 100
antioxidant_defense: 21 -> 79
heart_health: 55 -> 70
electrolyte_homeostasis: 11 -> 89
nutrient_density: 30 -> 73
healthScore: 66 -> 71
```

**Architectural Lesson:**

> **NEVER bypass abstractions.** Direct localStorage access breaks scoping.
> **ALWAYS use Store API** as the single source of truth for data access.
> **Quality checks work** when architectural patterns are followed.

**Modified Files:**

- `apps/web/heys_app_sync_effects_v1.js` (v4.8.8 — 3 Store API changes + DEBUG
  logs)
- `apps/web/public/heys_storage_supabase_v1.js` (v4.8.6 — PRIMARY quality check)
- No changes needed: `heys_core_v12.js`, `heys_storage_layer_v1.js` (already
  correct)

---

## Future Architecture Considerations

- **Adaptive Thresholds v2.1**: Incremental rolling-window updates (deferred)
- **Trial Machine v3.1**: Additional trial activation options
- ~~**Payments**: YooKassa integration~~ — `heys-api-payments` deployed to
  production
- **SMS verification**: Enhanced PEP for scaling (>50 clients)
- **EWS**: move to `requestIdleCallback` (low priority)
- **Network Waterfall**: audit `Promise.all` on init

---

## Additional Documentation

- [**API Documentation**](./API_DOCUMENTATION.md) — Comprehensive API reference
- [**Sync Reference**](./SYNC_REFERENCE.md) — Full sync architecture reference
- [**Sync Performance Report**](./SYNC_PERFORMANCE_REPORT.md) — Optimization
  history
- [**Security Runbook**](./SECURITY_RUNBOOK.md) — Security implementation
  details
- [**Deployment Guide**](./DEPLOYMENT_GUIDE.md) — Production deployment
  instructions
- [**Storage Patterns**](./dev/STORAGE_PATTERNS.md) — localStorage & cloud sync
  patterns

---

_Document updated: February 26, 2026_ _System version: v9.6.0 (production stable
— JS bundling complete)_
