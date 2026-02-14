# HEYS v2 — Claude Code Context

> Ответы по-русски, код на английском.

## Critical Rules

1. **Respond in Russian**, write code in English
2. **NEVER rollback files** (`git checkout/restore/reset`) without explicit
   consent — other agents may work in parallel
3. **HMR works** — do NOT restart dev server unless broken
4. **Tailwind first** — inline styles forbidden, custom CSS only in
   `styles/heys-components.css`
5. **`pnpm build`** only before commit — HMR is sufficient for dev
6. **Supabase SDK REMOVED** — use only `HEYS.YandexAPI.rpc()` /
   `HEYS.YandexAPI.rest()`

## Architecture

**Monorepo** (pnpm workspaces + Turborepo). Two code worlds coexist:

| Layer          | Location                       | Language                  | Role                      |
| -------------- | ------------------------------ | ------------------------- | ------------------------- |
| **Legacy v12** | `apps/web/` root (`heys_*.js`) | Vanilla JS + inline React | Production runtime        |
| **Modern**     | `packages/*`, `apps/web/src/`  | TypeScript + React        | New features, shared libs |

Do NOT convert legacy to TypeScript unless explicitly asked.

**Apps**: `apps/web` (PWA, port 3001), `apps/landing` (Next.js 14, port 3003),
`apps/tg-mini` (Telegram, port 3002)

**Key packages**: `packages/core` (Express API), `packages/shared` (types, DB,
security), `packages/ui`, `packages/analytics`, `packages/storage`,
`packages/search`

**Serverless**: 7 Yandex Cloud Functions at `api.heyslab.ru` —
`yandex-cloud-functions/` (rpc, rest, auth, sms, leads, health, payments)

## Commands

```bash
pnpm install              # Bootstrap all packages
pnpm dev                  # Dev server (Turbo HMR) → localhost:3001
pnpm build                # Production build (only before commit!)
pnpm type-check           # TypeScript validation
pnpm lint && pnpm lint:fix
pnpm test:run             # vitest run (single pass)
pnpm test:all             # vitest + coverage
pnpm test:e2e             # Playwright
```

- **Package manager**: pnpm 8.10+, Node >= 18
- **Test framework**: Vitest (happy-dom, 10s timeout, v8 coverage >= 80%)
- **Commit format**: `feat|fix|docs|refactor|perf|test|chore: message` (max 100
  chars)
- **Path aliases**: `@heys/core`, `@heys/shared`, `@heys/logger`,
  `@heys/search`, `@heys/storage`, `@heys/ui`

## Code Patterns

```javascript
// ✅ API
await HEYS.YandexAPI.rpc('get_shared_products', {});
// ❌ cloud.client.rpc() — BROKEN, Supabase removed

// ✅ Storage
U.lsSet('heys_products', products); // Namespaced by clientId
// ❌ localStorage.setItem() — breaks namespacing

// ✅ Verification Logging (MANDATORY for all features)
console.info('[HEYS.insights.EWS] ✅ Early Warning detected:', {
  warningCount: 6,
  highSeverity: 3,
});
console.info('[HEYS.thresholds] ✅ Adaptive thresholds computed:', {
  source: 'FULL',
  confidence: 0.92,
});
// ❌ console.log('debug:', data) — forbidden in commits
// 🔴 ALWAYS add console.info logs to prove features work in production
```

## Data Model Gotchas

| Wrong                   | Correct                                     | Why                               |
| ----------------------- | ------------------------------------------- | --------------------------------- |
| `dayTot.protein`        | `dayTot.prot`                               | Short form everywhere             |
| `item.category`         | `getProductFromItem(item, pIndex).category` | MealItem has NO category          |
| `heys_day_{date}`       | `heys_dayv2_{date}`                         | v2 prefix required                |
| `product.harmScore`     | `product.harm`                              | `harm` is canonical               |
| protein = 4 kcal/g      | protein = **3** kcal/g                      | TEF-adjusted formula              |
| `pi_stats.js` functions | **27** (v3.5.0)                             | Bayesian+CI+outliers (15.02.2026) |

## Security

- **Session-based auth**: always `*_by_session` RPC — never pass `client_id`
  directly
- **PIN hashing**: `pgcrypto.crypt()` + `gen_salt('bf')`
- **CORS**: `app.heyslab.ru`, `heyslab.ru` only
- **Cloud function env vars**: edit ONLY through YC Console
- **152-ФЗ**: all data in Yandex Cloud (Russian data sovereignty)

## Key Files

| Category     | Files                                                    |
| ------------ | -------------------------------------------------------- |
| Core runtime | `heys_app_v12.js`, `heys_core_v12.js`, `heys_day_v12.js` |
| Auth         | `heys_auth_v1.js`, `heys_storage_supabase_v1.js`         |
| Analytics    | `heys_advice_v1.js`, `heys_insulin_wave_v1.js`           |
| Insights     | `insights/pi_stats.js` (v3.5.0, 27 functions)            |
| API          | `heys_yandex_api_v1.js`                                  |
| Serverless   | `yandex-cloud-functions/heys-api-rpc/index.js`           |
| API server   | `packages/core/src/server.js` (Express, port 4001)       |
| Shared types | `packages/shared/src/types/`                             |

## Reference Docs

- `docs/ARCHITECTURE.md` — файловая структура
- `docs/API_DOCUMENTATION.md` — API и RPC
- `docs/DATA_MODEL_REFERENCE.md` — модель данных
- `docs/HEYS_BRIEF.md` — бизнес-контекст
- `HEYS_Insights_v5_Deep_Analytics_c7.md` — insights система (паттерны +
  статистика)
- `docs/SECURITY_RUNBOOK.md` — безопасность при деплое
