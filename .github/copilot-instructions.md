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

**Serverless**: 9 Yandex Cloud Functions at `api.heyslab.ru` — see
`yandex-cloud-functions/` (rpc, rest, auth, sms, leads, health, payments +
backup, maintenance)

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

**MANDATORY: Verification Logging** (v5.0.1):

```javascript
// 🔴 CRITICAL RULE: ALWAYS add verification logs to prove functionality works
// Every new feature, integration, or major change MUST include console logs that:
// 1. Show the feature is active and working
// 2. Display key metrics/results
// 3. Validate data flow and calculations
// 4. Include severity emoji and module prefix

// ✅ GOOD Examples:
console.info('[HEYS.insights.EWS] ✅ Early Warning detected:', {
  warningCount: 6,
  highSeverity: 3,
  mediumSeverity: 3,
});
console.info(
  '[HEYS.insights.EWS] ⚠️ Detected warnings:',
  warnings.map((w) => `[${w.severity.toUpperCase()}] ${w.message}`),
);
console.info('[HEYS.thresholds] ✅ Adaptive thresholds computed:', {
  source: 'FULL',
  confidence: 0.92,
  ttlHours: 36,
});
console.info('[HEYS.phenotype] 🧬 Auto-detected:', {
  metabolic: 'insulin_resistant',
  circadian: 'evening_type',
  confidence: 0.85,
});

// ❌ BAD: No logging at all
function detectWarnings(data) {
  return analyze(data); // Silent execution — user can't verify it works!
}

// 📋 Logging Strategy:
// - Feature entry point: log key inputs
// - Feature exit point: log results/metrics
// - Error cases: log severity + actionable message
// - Complex calculations: log intermediate steps for debugging
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

| Wrong                             | Correct                                     | Why                                                                |
| --------------------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| `dayTot.protein`                  | `dayTot.prot`                               | Short form everywhere                                              |
| `item.category`                   | `getProductFromItem(item, pIndex).category` | MealItem has NO category                                           |
| `heys_day_{date}`                 | `heys_dayv2_{date}`                         | v2 prefix required                                                 |
| `product.harmScore`               | `product.harm`                              | `harm` is canonical                                                |
| protein = 4 kcal/g                | protein = **3** kcal/g                      | TEF-adjusted formula                                               |
| `pi_stats.js` = 24 functions      | `pi_stats.js` = **27** functions            | v3.5.0: added Bayesian, CI, outliers (15.02.2026)                  |
| `heys_advice_v1.js` = analytics   | **DEPRECATED shim** (42 LOC)                | Real logic in `advice/` module system                              |
| `pi_early_warning.js` header v3.2 | Runtime dispatches **v4.2.0** event         | Header not updated, but has 25 warnings + Global Score + Phenotype |

### Adaptive Thresholds — v2.0 ✅

**Production status (15.02.2026):**

- 7d requests correctly reuse 30d/59d cache via cascade fast-path
  (`cachedDaysUsed >= requestedDays`)
- 30d requests use dedicated 30d cache (separate from 59d)
- Adaptive TTL works in prod: example logs show
  `stability=0.19 → ttlHours=23.4`, formula correct
- Partial results never overwrite Full cache (quality guard)
- Missing `profile` is not fatal — graceful degradation

### Advanced Confidence Layer — v3.5.0 ✅

**Production status (15.02.2026):**

- **3 new functions** in `pi_stats.js` v3.5.0 (27 total, was 24):
  `bayesianCorrelation`, `confidenceIntervalForCorrelation`, `detectOutliers`
- 131 unit tests (30 new), 100% pass rate
- SLEEP_WEIGHT pattern updated as reference implementation
- Fallback functions added to all correlation patterns
- **Impact**: Reliable insights at any sample size (3d → 30d+)
- **Details**: See
  [HEYS_Insights_v5_Deep_Analytics_c7.md](../HEYS_Insights_v5_Deep_Analytics_c7.md)
  Section 8

```javascript
// Core module: apps/web/insights/pi_thresholds.js (~1080 LOC, v2.0.0)
getAdaptiveThresholds(days, profile, pIndex) {
  // 1. CACHE FIRST
  // 2. Adaptive TTL (12-72h) based on behavior stability
  // 3. Event-based invalidation (goal/weight/pattern change)
  // 4. 3-tier compute (FULL/PARTIAL/DEFAULT)
}
```

**Implemented v2.0 features:**

- CASCADE strategy (`isCurrentPeriodCovered`)
- Adaptive TTL (`calculateBehaviorStability`, `calculateAdaptiveTTL`)
- Event invalidation (`detectSignificantChange`)
- Bayesian priors (`POPULATION_PRIORS`, `bayesianBlend`)
- Per-threshold confidence (`thresholdsWithConfidence`)

**3-Tier system:**

- Tier 1 (FULL): 14+ days → computed thresholds, confidence up to 1.0
- Tier 2 (PARTIAL): 7-13 days → hybrid compute + defaults
- Tier 3 (DEFAULT): <7 days → prior-based defaults

**Important behavior rule:**

- Missing `profile` is **not fatal**: system computes available thresholds and
  avoids hard fallback to full defaults.

**Deferred to v2.1:**

- Incremental rolling-window updates (performance optimization only)

### Auth modes

- **Curator** (nutritionist): JWT via heys-api-auth, full sync,
  `_rpcOnlyMode=false`
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
./deploy-all.sh                    # Deploy all API functions
./deploy-all.sh heys-api-auth      # Deploy single function
./health-check.sh                  # Verify all endpoints after deploy
```

Secrets managed in `yandex-cloud-functions/.env` (PG_PASSWORD, JWT_SECRET, etc).
Always use centralized `deploy-all.sh` script for deployments — it reads `.env`
and passes secrets consistently to all functions.

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

| Category      | Files                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| Entry points  | `heys_app_v12.js` (62 LOC proxy → AppEntry), `heys_day_v12.js` (14 LOC proxy → DayTab)                        |
| Core runtime  | `heys_core_v12.js` (product search, localStorage, RationTab)                                                  |
| Auth & Cloud  | `heys_auth_v1.js`, `heys_storage_supabase_v1.js` (v61, cloud sync + offline race fix)                         |
| Bootstrap     | `heys_bootstrap_v1.js` (app init, dependency management)                                                      |
| Widgets       | `heys_widgets_core_v1.js` (Grid Engine, D&D, State Manager)                                                   |
| Paywall/Trial | `heys_paywall_v1.js`, `heys_trial_queue_v1.js`, `heys_subscriptions_v1.js`                                    |
| Cascade Card  | `heys_cascade_card_v1.js` (v1.2.1, decision chain visualization)                                              |
| Phenotype     | `heys_phenotype_v1.js` (metabolic phenotype + radar chart)                                                    |
| Consents      | `heys_consents_v1.js` (ПЭП, 152-ФЗ compliance)                                                                |
| Analytics     | `heys_insulin_wave_v1.js` (v4.2.2, orchestrator, 37 factors)                                                  |
| Insights Core | `insights/pi_stats.js` (v3.5.0, 27 functions), `insights/pi_thresholds.js` (v2.0.0)                           |
| Insights EWS  | `insights/pi_early_warning.js` (v4.2, 25 warnings, Global Score, Phenotype-Aware)                             |
| Insights EWS  | `insights/pi_causal_chains.js` (v1.0, 6 Cross-Pattern Causal Chains)                                          |
| Insights PI   | `insights/pi_constants.js` (Dynamic Priority Badge v4.3.0, SECTION_PRIORITY_RULES)                            |
| Insights Pat  | `insights/pi_patterns.js` (v4.0, 22 analyzers), `insights/pi_advanced.js` (v3.0)                              |
| Insights Rec  | `insights/pi_meal_recommender.js`, `insights/pi_product_picker.js`, `insights/pi_meal_rec_patterns.js`        |
| Insights Rec  | `insights/pi_meal_planner.js` (v1.4.0), `insights/pi_meal_rec_feedback.js` (v1.0)                             |
| Insights UI   | `insights/pi_ui_dashboard.js` (v3.0.1), `insights/pi_ui_cards.js` (v3.0.2), `insights/pi_ui_meal_rec_card.js` |
| Insights Misc | `insights/pi_whatif.js`, `insights/pi_feedback_loop.js`, `insights/pi_analytics_api.js`                       |
| Insights Misc | `insights/pi_phenotype.js`, `insights/pi_outcome_modal.js`, `insights/pi_ui_whatif_scenarios.js`              |
| API           | `heys_yandex_api_v1.js` (v58, 1493 LOC)                                                                       |
| Serverless    | `yandex-cloud-functions/heys-api-rpc/index.js` (v2.5.3)                                                       |
| PWA           | `public/sw.js`, `heys_day_offline_sync_v1.js`                                                                 |
| API server    | `packages/core/src/server.js` (Express, port 4001)                                                            |
| Shared types  | `packages/shared/src/types/`                                                                                  |

---

## Reference Docs

| Тема                                     | Файл                                                                              |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| Архитектура, файловая структура          | [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)                                   |
| Техническая архитектура (подробно)       | [docs/TECHNICAL_ARCHITECTURE.md](../docs/TECHNICAL_ARCHITECTURE.md)               |
| API документация (YandexAPI, RPC)        | [docs/API_DOCUMENTATION.md](../docs/API_DOCUMENTATION.md)                         |
| Модель данных (dayTot, normAbs и др.)    | [docs/DATA_MODEL_REFERENCE.md](../docs/DATA_MODEL_REFERENCE.md)                   |
| Методология разработки                   | [docs/HEYS_Development_Methodology.md](../docs/HEYS_Development_Methodology.md)   |
| Бизнес + продукт + чеклисты              | [docs/HEYS_BRIEF.md](../docs/HEYS_BRIEF.md)                                       |
| Insights система (паттерны + статистика) | [HEYS_Insights_v5_Deep_Analytics_c7.md](../HEYS_Insights_v5_Deep_Analytics_c7.md) |
| Безопасность при деплое                  | [docs/SECURITY_RUNBOOK.md](../docs/SECURITY_RUNBOOK.md)                           |
| Безопасность (документация)              | [docs/SECURITY_DOCUMENTATION.md](../docs/SECURITY_DOCUMENTATION.md)               |
| Деплой гайд                              | [docs/DEPLOYMENT_GUIDE.md](../docs/DEPLOYMENT_GUIDE.md)                           |
| Планировщик питания (алгоритмы)          | [docs/MEAL_PLANNER_DOCUMENTATION.md](../docs/MEAL_PLANNER_DOCUMENTATION.md)       |
