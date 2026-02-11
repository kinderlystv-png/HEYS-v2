---
description: HEYS v2 — AI Development Guide v5.0.0
applyTo: '**/*'
---

# HEYS v2 — AI Agent Guide

> Ответы по-русски, код на английском. v5.0.0

## Critical Rules

1. **Respond in Russian**, write code in English
2. **NEVER rollback files** (`git checkout/restore/reset`) without explicit
   consent — other agents may work in parallel
3. **HMR works** — do NOT restart dev server unless broken
4. **Tailwind first** — inline styles forbidden, custom CSS only in
   `styles/heys-components.css`
5. **`pnpm build`** only before commit — HMR is sufficient for dev
6. **PRODUCTION-ONLY API** — NEVER suggest switching to localhost:4001 or local
   API. Always fix/redeploy production `api.heyslab.ru` cloud functions. This is
   a live production app, not a local development setup.
7. **ALWAYS validate deployment** — run `./health-check.sh` after ANY changes to
   cloud functions. If 502 errors occur, redeploy immediately with
   `./deploy-all.sh`

---

## Deployment & Monitoring (v5.0.1)

**Pre-commit checklist** when modifying `yandex-cloud-functions/`:

```bash
cd yandex-cloud-functions
./validate-env.sh            # Validate secrets
./health-check.sh            # Check current state
./deploy-all.sh <function>   # Deploy changed function
sleep 15                     # Wait for warmup
./health-check.sh            # Verify deployment
```

**If 502 Bad Gateway appears**:

```bash
cd yandex-cloud-functions
./deploy-all.sh              # Redeploy all functions
./health-check.sh --watch    # Monitor recovery
```

**Auto-protection**:

- 🔍 GitHub Actions monitors API every 15 min (24/7)
- 🔄 Auto-redeploy triggers on REST/RPC 502 errors
- 📢 Telegram alerts on API failures
- ✅ CI/CD verifies Health + RPC + REST after every push

**See**: `yandex-cloud-functions/INCIDENT_PREVENTION.md` for full runbook

---

## Architecture

**Monorepo** (pnpm workspaces + Turborepo). Two code worlds coexist:

| Layer          | Location                       | Language                  | Role                      |
| -------------- | ------------------------------ | ------------------------- | ------------------------- |
| **Legacy v12** | `apps/web/` root (`heys_*.js`) | Vanilla JS + inline React | Production runtime        |
| **Modern**     | `packages/*`, `apps/web/src/`  | TypeScript + React        | New features, shared libs |

Do NOT convert legacy to TypeScript unless explicitly asked.

**Apps**: `apps/web` (PWA, port 3001), `apps/landing` (Next.js 14, port 3003),
`apps/tg-mini` (Telegram, port 3002), `apps/mobile` (disabled)

**Key packages**: `packages/core` (Express API + business logic),
`packages/shared` (types, DB, day-logic, security, performance), `packages/ui`,
`packages/analytics`, `packages/storage`, `packages/search`

**Serverless**: 7 Yandex Cloud Functions at `api.heyslab.ru` — see
`yandex-cloud-functions/` (rpc, rest, auth, sms, leads, health, payments)

---

## Build and Test

```bash
pnpm install              # Bootstrap all packages
pnpm dev                  # Dev server → localhost:3001 (Turbo, HMR)
pnpm dev:web              # Just PWA
pnpm dev:landing          # Just landing (port 3003)
pnpm dev:api              # Just API (port 4001)
pnpm build                # Production build (only before commit!)
pnpm type-check           # TypeScript validation
pnpm lint && pnpm lint:fix
pnpm test:run             # vitest run (single pass)
pnpm test:all             # vitest + coverage
pnpm test:e2e             # Playwright
pnpm arch:check           # Architecture rule check
```

- **Package manager**: pnpm 8.10+, Node >= 18
- **Test framework**: Vitest (happy-dom env, 10s timeout, v8 coverage >= 80%)
- **E2E**: Playwright — `playwright.config.ts`
- **Commit format**: `feat|fix|docs|refactor|perf|test|chore: message` (max 100
  chars, commitlint enforced)
- **TS config**: strict mode, `noUnusedLocals`, `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`
- **Path aliases**: `@heys/core`, `@heys/shared`, `@heys/logger`,
  `@heys/search`, `@heys/storage`, `@heys/ui`

---

## Code Style

**CSS priority**: Tailwind classes → BEM in `styles/heys-components.css` → never
inline styles. BEM format: `.block__element--modifier`.

**CSS no-touch zones** (don't modify without explicit request): `@keyframes`,
`.confetti-*`, `.water-ring`, `.water-splash`, `safe-area`, `.mpc-*`

**Module limits**: LOC ≤ 2000, functions ≤ 80, `HEYS.*` references ≤ 50 per file

**Logging in committed code**:

```javascript
// ✅ Allowed — critical ops with module prefix + emoji
console.info('[HEYS.sync] ✅ Loaded 15 keys');
console.warn('[HEYS.api] ⚠️ Retry 2/3');
console.error('[HEYS.auth] ❌ Sync failed');
// ❌ Forbidden — remove before commit
console.log('debug:', data); // No console.log in commits
// ❌ Never log personal data (profile, meals, weight)
```

---

## Project Conventions

### API — Supabase SDK is REMOVED

```javascript
// ✅ Always use YandexAPI
await HEYS.YandexAPI.rpc('get_shared_products', {});
await HEYS.YandexAPI.rest('clients', { method: 'GET' });
// ❌ BROKEN — Supabase SDK no longer exists
cloud.client.from('table'); // DOES NOT WORK
cloud.client.rpc('fn'); // DOES NOT WORK
```

### Trial Machine v3.0 — Curator-Controlled Flow

**Флоу онбординга клиентов (v3.0 — февраль 2026):**

1. **Лендинг** → лид в `leads` таблицу (via `heys-api-leads` cloud function)
2. **Админка куратора** → видит лиды в секции «Лиды с сайта» (🌐)
3. **Конвертация лида** → `admin_convert_lead(lead_id, pin)` → создаёт клиента +
   добавляет в `trial_queue` (`status='queued'`)
4. **Активация триала** → куратор выбирает дату старта →
   `admin_activate_trial(client_id, start_date)`:
   - `start_date = сегодня` → `trial` немедленно (7 дней от NOW())
   - `start_date > сегодня` → `trial_pending` (ждём дату)
5. **Дата наступила** → `get_effective_subscription_status` переводит в `trial`
   (7 дней)
6. **Триал истёк** → `read_only` → paywall

**RPC-функции Trial Machine:**

```javascript
// Список лидов с лендинга
await HEYS.YandexAPI.rpc('admin_get_leads', { p_status: 'new' }); // new|converted|all

// Конвертация лида в клиента
await HEYS.YandexAPI.rpc('admin_convert_lead', {
  p_lead_id: 'uuid',
  p_pin: '1234',
  p_curator_id: curatorId, // optional
});

// Активация триала с выбором даты
await HEYS.YandexAPI.rpc('admin_activate_trial', {
  p_client_id: clientId,
  p_start_date: '2026-02-15', // DATE format, default = CURRENT_DATE
  p_trial_days: 7, // default = 7
  p_curator_session_token: token, // optional
});
// Returns: { success, status, trial_started_at, trial_ends_at, is_future }
```

**Subscription statuses:**

- `none` — нет подписки
- `trial_pending` — одобрен, но дата старта в будущем (v3.0)
- `trial` — активный триал (7 дней)
- `active` — оплаченная подписка
- `read_only` — триал/подписка истекла

**Типы данных:**

- `leads.id` = UUID (не INT!)
- `clients` не имеет `created_at` (only `updated_at`)
- `trial_queue.status` CHECK:
  `('queued','offer','assigned','canceled','canceled_by_purchase','expired')`
- `trial_queue_events.event_type` CHECK:
  `('queued','offer_sent','claimed','offer_expired','canceled','canceled_by_purchase','purchased')`

### Storage — never use raw localStorage

```javascript
U.lsSet('heys_products', products);        // ✅ Namespaced by clientId
HEYS.products.setAll(newProducts);         // ✅ State + localStorage + cloud
localStorage.setItem('heys_products', …);  // ❌ Breaks namespacing
```

### Data model gotchas

| Wrong               | Correct                                     | Why                      |
| ------------------- | ------------------------------------------- | ------------------------ |
| `dayTot.protein`    | `dayTot.prot`                               | Short form everywhere    |
| `item.category`     | `getProductFromItem(item, pIndex).category` | MealItem has NO category |
| `heys_day_{date}`   | `heys_dayv2_{date}`                         | v2 prefix required       |
| `product.harmScore` | `product.harm`                              | `harm` is canonical      |
| protein = 4 kcal/g  | protein = **3** kcal/g                      | TEF-adjusted formula     |

### Auth modes

- **Curator** (nutritionist): Supabase user, full sync, `_rpcOnlyMode=false`
- **PIN auth** (client): phone+PIN via session_token, `_rpcOnlyMode=true`
- Universal: `await HEYS.cloud.syncClient(clientId)` auto-selects strategy

### Metabolic calculations

- `optimum` uses `baseExpenditure` (excludes TEF) — intentional
- Caloric debt: 3-day window, max 1500 kcal, 75% recovery
- Refeed day: +35% calories, streak preserved if ratio 70-135%

---

## Integration Points

| Component   | URL                          |
| ----------- | ---------------------------- |
| API Gateway | `https://api.heyslab.ru`     |
| PWA         | `https://app.heyslab.ru`     |
| Landing     | `https://heyslab.ru`         |
| Database    | YC PostgreSQL 16 (port 6432) |

RPC always uses `*_by_session` pattern — never pass `client_id` directly.
Migrations: `yandex-cloud-functions/heys-api-rpc/apply_migrations.js`

### Cloud Functions Deployment

When API returns 502 or auth fails, redeploy production cloud functions:

```bash
cd yandex-cloud-functions
./deploy-all.sh                    # Deploy all 6 functions
./deploy-all.sh heys-api-auth      # Deploy single function
./health-check.sh                  # Verify all endpoints after deploy
```

Secrets managed in `yandex-cloud-functions/.env` (PG_PASSWORD, JWT_SECRET, etc).
Never edit env vars through YC Console — always use centralized `deploy-all.sh`
script for consistency.

**Health monitoring**: `./health-check.sh` checks all endpoints,
`./validate-env.sh` validates secrets before deploy. GitHub Actions monitors API
every 15 minutes. See
[MONITORING_QUICK_REF.md](../yandex-cloud-functions/MONITORING_QUICK_REF.md).

---

## Security

- **Session-based auth**: all data via `session_token` + `*_by_session` RPC
  (IDOR protection)
- **PIN hashing**: `pgcrypto.crypt()` + `gen_salt('bf')`; rate-limited via
  `pin_login_attempts`
- **Phone enumeration blocked**: unified `invalid_credentials` for all auth
  failures
- **Encrypted localStorage**: `heys_profile`, `heys_dayv2_*`, `heys_hr_zones`
  (AES-256); `heys_products`/`heys_norms` plaintext
- **CORS whitelist**: `app.heyslab.ru`, `heyslab.ru` only
- **152-ФЗ compliance**: all data in Yandex Cloud (Russian data sovereignty)

---

## Key Files

| Category     | Files                                                    |
| ------------ | -------------------------------------------------------- |
| Core runtime | `heys_app_v12.js`, `heys_core_v12.js`, `heys_day_v12.js` |
| Auth         | `heys_auth_v1.js`, `heys_storage_supabase_v1.js`         |
| Analytics    | `heys_advice_v1.js`, `heys_insulin_wave_v1.js`           |
| API          | `heys_yandex_api_v1.js`                                  |
| PWA          | `public/sw.js`, `heys_day_offline_sync_v1.js`            |
| API server   | `packages/core/src/server.js` (Express, port 4001)       |
| Shared types | `packages/shared/src/types/`                             |

---

## Reference Docs

| Тема                                  | Файл                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| Архитектура, файловая структура       | [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)                                 |
| Техническая архитектура (подробно)    | [docs/TECHNICAL_ARCHITECTURE.md](../docs/TECHNICAL_ARCHITECTURE.md)             |
| API документация (YandexAPI, RPC)     | [docs/API_DOCUMENTATION.md](../docs/API_DOCUMENTATION.md)                       |
| Модель данных (dayTot, normAbs и др.) | [docs/DATA_MODEL_REFERENCE.md](../docs/DATA_MODEL_REFERENCE.md)                 |
| Методология разработки                | [docs/HEYS_Development_Methodology.md](../docs/HEYS_Development_Methodology.md) |
| Бизнес + продукт + чеклисты           | [docs/HEYS_BRIEF.md](../docs/HEYS_BRIEF.md)                                     |
| Безопасность при деплое               | [docs/SECURITY_RUNBOOK.md](../docs/SECURITY_RUNBOOK.md)                         |
| Безопасность (документация)           | [docs/SECURITY_DOCUMENTATION.md](../docs/SECURITY_DOCUMENTATION.md)             |
| Деплой гайд                           | [docs/DEPLOYMENT_GUIDE.md](../docs/DEPLOYMENT_GUIDE.md)                         |
