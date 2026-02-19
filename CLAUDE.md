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

**Serverless**: 9 Yandex Cloud Functions at `api.heyslab.ru` —
`yandex-cloud-functions/` (rpc, rest, auth, sms, leads, health, payments +
backup, maintenance)

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

| Wrong                                     | Correct                                                                                   | Why                                                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `dayTot.protein`                          | `dayTot.prot`                                                                             | Short form everywhere                                                                                    |
| `item.category`                           | `getProductFromItem(item, pIndex).category`                                               | MealItem has NO category                                                                                 |
| `heys_day_{date}`                         | `heys_dayv2_{date}`                                                                       | v2 prefix required                                                                                       |
| `product.harmScore`                       | `product.harm`                                                                            | `harm` is canonical                                                                                      |
| protein = 4 kcal/g                        | protein = **3** kcal/g                                                                    | TEF-adjusted formula                                                                                     |
| `pi_stats.js` header v3.0.0               | Runtime logs **v3.5.0** (27 functions)                                                    | Header not updated, but code has Bayesian+CI+outliers                                                    |
| EWS phenotype = profile phenotype         | **разные системы**                                                                        | EWS: 4 типа (insulin_resistant/evening_type/low_satiety/stress_eater); Profile: sprinter/marathoner/etc. |
| `heys_ews_weekly`                         | `heys_ews_weekly_v1`                                                                      | Версионированный ключ                                                                                    |
| `computeDynamicPriority(sectionId, data)` | `computeDynamicPriority(sectionId, data, {patterns, crashRiskScore, urgentActionsCount})` | v4.3.0 extended signature                                                                                |
| `heys_advice_v1.js` = analytics           | **DEPRECATED shim** (42 LOC)                                                              | Real logic in `advice/` module system                                                                    |
| `pi_early_warning.js` header v3.2         | Runtime dispatches **v4.2.0** event                                                       | Header not updated, but has 25 warnings + Global Score + Phenotype                                       |

## Security

- **Session-based auth**: always `*_by_session` RPC — never pass `client_id`
  directly
- **PIN hashing**: `pgcrypto.crypt()` + `gen_salt('bf')`
- **CORS**: `app.heyslab.ru`, `heyslab.ru` only
- **Cloud function secrets**: managed in `.env` → deployed via `deploy-all.sh`
- **152-ФЗ**: all data in Yandex Cloud (Russian data sovereignty)

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
| API server    | `packages/core/src/server.js` (Express, port 4001)                                                            |
| Shared types  | `packages/shared/src/types/`                                                                                  |

## Reference Docs

- `docs/ARCHITECTURE.md` — файловая структура
- `docs/API_DOCUMENTATION.md` — API и RPC
- `docs/DATA_MODEL_REFERENCE.md` — модель данных
- `docs/HEYS_BRIEF.md` — бизнес-контекст
- `HEYS_Insights_v5_Deep_Analytics_c7.md` — insights система (паттерны +
  статистика)
- `docs/MEAL_PLANNER_DOCUMENTATION.md` — планировщик питания (6 модулей,
  алгоритмы, скоринг)
- `docs/SECURITY_RUNBOOK.md` — безопасность при деплое
