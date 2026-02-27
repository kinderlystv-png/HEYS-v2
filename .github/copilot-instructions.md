---
description: HEYS v2 — AI Development Guide v6.0.0
applyTo: '**/*'
---

# HEYS v2 — AI Agent Guide v6.0.0

> Ответы по-русски, код на английском.

<!-- ═══════════════════════════════════════════════════════════════════════
     SECTION 1: CRITICAL RULES — Never violate these.
     ═══════════════════════════════════════════════════════════════════════ -->

## Critical Rules

1. **Respond in Russian**, write code in English
2. **NEVER rollback files** (`git checkout/restore/reset`) without explicit
   consent — other agents may work in parallel
3. **HMR works** — do NOT restart dev server unless broken
4. **Tailwind first** — inline styles forbidden, custom CSS only in
   `styles/heys-components.css`
5. **`pnpm build`** only before commit — HMR is sufficient for dev
6. **PRODUCTION-ONLY API** — NEVER suggest switching to localhost:4001 or local
   API. Always fix/redeploy production `api.heyslab.ru` cloud functions
7. **ALWAYS validate deployment** — run `./health-check.sh` after ANY changes to
   cloud functions. If 502 errors occur, redeploy with `./deploy-all.sh`

<!-- ═══════════════════════════════════════════════════════════════════════
     SECTION 2: FORBIDDEN PATTERNS — What NOT to write.
     ═══════════════════════════════════════════════════════════════════════ -->

## Forbidden Patterns

| ❌ Wrong (NEVER write this)                | ✅ Correct (ALWAYS use this)                                                       | Why                         |
| ------------------------------------------ | ---------------------------------------------------------------------------------- | --------------------------- |
| `cloud.client.rpc('fn')`                   | `HEYS.YandexAPI.rpc('fn', {})`                                                     | Supabase SDK removed        |
| `cloud.client.from('table')`               | `HEYS.YandexAPI.rest('table', { method: 'GET' })`                                  | Supabase SDK removed        |
| `localStorage.setItem('heys_products', …)` | `U.lsSet('heys_products', products)`                                               | Breaks clientId namespacing |
| `console.log('debug:', data)`              | `console.info('[HEYS.module] ✅ Result:', data)`                                   | No console.log in commits   |
| `dayTot.protein`                           | `dayTot.prot`                                                                      | Short form everywhere       |
| `item.category`                            | `getProductFromItem(item, pIndex).category`                                        | MealItem has NO category    |
| `heys_day_{date}`                          | `heys_dayv2_{date}`                                                                | v2 prefix required          |
| `product.harmScore`                        | `product.harm`                                                                     | `harm` is canonical         |
| `protein = 4 kcal/g`                       | `protein = 3 kcal/g`                                                               | TEF-adjusted formula        |
| `heys_ews_weekly`                          | `heys_ews_weekly_v1`                                                               | Versioned key               |
| `computeDynamicPriority(id, data)`         | `computeDynamicPriority(id, data, {patterns, crashRiskScore, urgentActionsCount})` | v4.3.0 extended signature   |
| passing `client_id` to RPC                 | Use `*_by_session` RPC pattern with `session_token`                                | IDOR protection             |

**Additional gotchas:**

- `heys_advice_v1.js` is a **deprecated shim** — real logic is in `advice/`
  module system
- `pi_early_warning.js` file header may say v3.2, but runtime dispatches
  **v4.2.0** events
- EWS phenotype ≠ profile phenotype (different systems: EWS has 4 types, Profile
  has sprinter/marathoner/etc.)

<!-- ═══════════════════════════════════════════════════════════════════════
     SECTION 3: ARCHITECTURE — Keep it brief, link to docs for details.
     ═══════════════════════════════════════════════════════════════════════ -->

## Architecture

**Monorepo** (pnpm workspaces + Turborepo). Two code worlds coexist:

| Layer          | Location                       | Language                  | Role                      |
| -------------- | ------------------------------ | ------------------------- | ------------------------- |
| **Legacy v12** | `apps/web/` root (`heys_*.js`) | Vanilla JS + inline React | Production runtime        |
| **Modern**     | `packages/*`, `apps/web/src/`  | TypeScript + React        | New features, shared libs |

Do NOT convert legacy to TypeScript unless explicitly asked.

**Apps**: `apps/web` (PWA, port 3001), `apps/landing` (Next.js 14, port 3003),
`apps/tg-mini` (Telegram, port 3002)

**Packages**: `packages/core` (Express API), `packages/shared` (types, DB,
security), `packages/ui`, `packages/analytics`, `packages/storage`,
`packages/search`

**Serverless**: 9 Yandex Cloud Functions at `api.heyslab.ru` —
`yandex-cloud-functions/`

| Component   | URL                          |
| ----------- | ---------------------------- |
| API Gateway | `https://api.heyslab.ru`     |
| PWA         | `https://app.heyslab.ru`     |
| Landing     | `https://heyslab.ru`         |
| Database    | YC PostgreSQL 16 (port 6432) |

> For full file map, read `docs/ARCHITECTURE.md`. For key file locations, read
> `docs/AI_KEY_FILES.md`.

<!-- ═══════════════════════════════════════════════════════════════════════
     SECTION 4: WORKFLOWS — Step-by-step guides for common tasks.
     ═══════════════════════════════════════════════════════════════════════ -->

## Workflows

### Development

```bash
pnpm install              # Bootstrap all packages
pnpm dev                  # Dev server → localhost:3001 (Turbo, HMR)
pnpm dev:web              # Just PWA
pnpm dev:landing          # Just landing (port 3003)
pnpm type-check           # TypeScript validation
pnpm lint && pnpm lint:fix
```

### Testing

```bash
pnpm test:run             # vitest run (single pass)
pnpm test:all             # vitest + coverage
pnpm test:e2e             # Playwright
pnpm arch:check           # Architecture rule check
```

### Pre-commit checklist

1. `pnpm type-check` — must pass
2. `pnpm test:run` — must pass
3. `pnpm build` — production build
4. Commit format: `feat|fix|docs|refactor|perf|test|chore: message` (max 100
   chars)

### Deploying Cloud Functions

1. `cd yandex-cloud-functions`
2. `./validate-env.sh` — validate secrets
3. `./health-check.sh` — check current state
4. `./deploy-all.sh <function>` — deploy changed function
5. `sleep 15` — wait for warmup
6. `./health-check.sh` — verify deployment

**If 502 Bad Gateway**: `./deploy-all.sh && ./health-check.sh --watch`

Secrets: `yandex-cloud-functions/.env` (PG_PASSWORD, JWT_SECRET, etc.)

<!-- ═══════════════════════════════════════════════════════════════════════
     SECTION 5: CODE STYLE — Rules for writing code.
     ═══════════════════════════════════════════════════════════════════════ -->

## Code Style

- **Package manager**: pnpm 8.10+, Node >= 18
- **TS config**: strict mode, `noUnusedLocals`, `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`
- **Path aliases**: `@heys/core`, `@heys/shared`, `@heys/logger`,
  `@heys/search`, `@heys/storage`, `@heys/ui`
- **CSS**: Tailwind → BEM in `styles/heys-components.css` → never inline. BEM:
  `.block__element--modifier`
- **CSS no-touch zones**: `@keyframes`, `.confetti-*`, `.water-ring`,
  `.water-splash`, `safe-area`, `.mpc-*`
- **Module limits**: LOC ≤ 2000, functions ≤ 80

### Logging Rules

```javascript
// ✅ Allowed — module prefix + emoji
console.info('[HEYS.sync] ✅ Loaded 15 keys');
console.warn('[HEYS.api] ⚠️ Retry 2/3');
console.error('[HEYS.auth] ❌ Sync failed');

// ❌ Forbidden — remove before commit
console.log('debug:', data);

// ❌ NEVER log personal data (profile, meals, weight)
```

### Mandatory Verification Logging

Every new feature MUST include `console.info` logs that prove it works:

```javascript
// ✅ Feature entry: log key inputs
console.info('[HEYS.module] ✅ Feature activated:', { metric1, metric2 });
// ✅ Feature exit: log results
console.info('[HEYS.module] ✅ Completed:', { resultCount, confidence });
// ✅ Error cases: log severity + actionable message
console.error('[HEYS.module] ❌ Failed:', { error, retryIn });
```

<!-- ═══════════════════════════════════════════════════════════════════════
     SECTION 6: SECURITY — Brief, essential rules.
     ═══════════════════════════════════════════════════════════════════════ -->

## Security

- **Session-based auth**: all data via `session_token` + `*_by_session` RPC
  (IDOR protection)
- **PIN hashing**: `pgcrypto.crypt()` + `gen_salt('bf')`; rate-limited via
  `pin_login_attempts`
- **Phone enumeration blocked**: unified `invalid_credentials` for all auth
  failures
- **Encrypted localStorage**: `heys_profile`, `heys_dayv2_*`, `heys_hr_zones`
  (AES-256)
- **CORS whitelist**: `app.heyslab.ru`, `heyslab.ru` only
- **152-ФЗ compliance**: all data in Yandex Cloud (Russian data sovereignty)

### Auth modes

- **Curator** (nutritionist): JWT via heys-api-auth, full sync,
  `_rpcOnlyMode=true` (routing differs by context, see docs below)
- **PIN auth** (client): phone+PIN via session_token, `_rpcOnlyMode=true`
- Universal: `await HEYS.cloud.syncClient(clientId)` auto-selects strategy

<!-- ═══════════════════════════════════════════════════════════════════════
     SECTION 7: DOMAIN KNOWLEDGE — Brief summaries, details in docs/.
     ═══════════════════════════════════════════════════════════════════════ -->

## Domain Knowledge (Brief)

### Metabolic calculations

- `optimum` uses `baseExpenditure` (excludes TEF) — intentional
- Caloric debt: 3-day window, max 1500 kcal, 75% recovery
- Refeed day: +35% calories, streak preserved if ratio 70-135%

### Subscription statuses

`none` → `trial_pending` → `trial` (7d) → `active` | `read_only`

> For Trial Machine details, read `docs/AI_TRIAL_MACHINE.md`.

### Insights system

- Adaptive Thresholds v2.0: 3-tier system (FULL/PARTIAL/DEFAULT), cascade
  caching
- Advanced Confidence: Bayesian correlation, CI, outlier detection
- Missing `profile` is **not fatal** — graceful degradation

> For Insights details, read `HEYS_Insights_v5_Deep_Analytics_c7.md`.

<!-- ═══════════════════════════════════════════════════════════════════════
     SECTION 8: DOCUMENTATION INDEX — Where to find details.
     ═══════════════════════════════════════════════════════════════════════ -->

## Documentation Index

**Read these docs when working on related areas** (use `read_file` tool):

| When working on…                                | Read this file                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| File structure, architecture                    | `docs/ARCHITECTURE.md`                                               |
| Key files, entry points                         | `docs/AI_KEY_FILES.md`                                               |
| API, RPC functions                              | `docs/API_DOCUMENTATION.md`                                          |
| **Data model (core: dayTot, normAbs, schema)**  | `docs/DATA_MODEL_REFERENCE.md`                                       |
| **Data model (nutrition: debt, refeed, wave)**  | `docs/DATA_MODEL_NUTRITION.md`                                       |
| **Data model (analytics: insights, EWS, harm)** | `docs/DATA_MODEL_ANALYTICS.md`                                       |
| **Scoring (Status, Day, CRS algorithms)**       | `docs/SCORING_REFERENCE.md`                                          |
| **App systems (widgets, cascade, export)**      | `docs/APP_SYSTEMS_REFERENCE.md`                                      |
| **Data model changelog**                        | `docs/CHANGELOG_DATA_MODEL.md`                                       |
| Insulin wave (full technical)                   | `docs/INSULIN_WAVE_DOCUMENTATION.md`                                 |
| Trial Machine, onboarding                       | `docs/AI_TRIAL_MACHINE.md`                                           |
| Insights, patterns, statistics                  | `HEYS_Insights_v5_Deep_Analytics_c7.md`                              |
| Meal planner algorithms                         | `docs/MEAL_PLANNER_DOCUMENTATION.md`                                 |
| Security, deployment                            | `docs/SECURITY_RUNBOOK.md`                                           |
| Deployment guide                                | `docs/DEPLOYMENT_GUIDE.md`                                           |
| Business context                                | `docs/HEYS_BRIEF.md`                                                 |
| Technical architecture (detailed)               | `docs/ARCHITECTURE.md` (v18.0.0, merged from TECHNICAL_ARCHITECTURE) |
| **Sync architecture**                           | `docs/SYNC_REFERENCE.md`                                             |
| **Curator vs client differences**              | `docs/CURATOR_VS_CLIENT.md`                                          |
| **Sync performance**                            | `docs/SYNC_PERFORMANCE_REPORT.md`                                    |
| **Sync sessions log**                           | `docs/SYNC_PERFORMANCE_SESSIONS_LOG.md`                              |
| **Storage patterns**                            | `docs/dev/STORAGE_PATTERNS.md`                                       |
| **Data loss protection**                        | `docs/DATA_LOSS_PROTECTION.md`                                       |
| **EWS cloud sync**                              | `docs/EWS_WEEKLY_CLOUD_SYNC_DEPLOYMENT.md`                           |
| Monitoring                                      | `yandex-cloud-functions/MONITORING_QUICK_REF.md`                     |
| Incident prevention                             | `yandex-cloud-functions/INCIDENT_PREVENTION.md`                      |

### Data Model Documentation Complex

When working on **metrics, models, analytics, scoring, or nutrition
algorithms**, read ALL of these docs together — they form a unified complex with
cross-references:

1. `docs/DATA_MODEL_REFERENCE.md` — core schemas, DayRecord, Product,
   localStorage
2. `docs/DATA_MODEL_NUTRITION.md` — caloric debt/excess, MQS, insulin wave, TDEE
3. `docs/DATA_MODEL_ANALYTICS.md` — 41 patterns, EWS, gamification, phenotype
4. `docs/SCORING_REFERENCE.md` — Status Score, Day Score, CRS v7 (full
   algorithms)
5. `docs/APP_SYSTEMS_REFERENCE.md` — widgets, cascade, search, export, trial,
   merge
6. `docs/CHANGELOG_DATA_MODEL.md` — version history across all data model docs

### Sync & Storage Documentation Complex

When working on **sync, cloud storage, localStorage, data flow, or
performance**, read ALL of these docs together — they form a unified complex
with cross-references:

1. `docs/SYNC_REFERENCE.md` — core sync architecture, data flow, auth modes,
   events
2. `docs/CURATOR_VS_CLIENT.md` — curator vs PIN client flow and functional differences
3. `docs/SYNC_PERFORMANCE_REPORT.md` — 5 optimization phases, metrics, incidents
4. `docs/SYNC_PERFORMANCE_SESSIONS_LOG.md` — implementation details, session
   journals
5. `docs/dev/STORAGE_PATTERNS.md` — localStorage API, Store API, namespacing
   rules
6. `docs/DATA_LOSS_PROTECTION.md` — SQL guards, overwrite protection at all
   levels
7. `docs/EWS_WEEKLY_CLOUD_SYNC_DEPLOYMENT.md` — EWS weekly snapshots cloud sync
