# HEYS v2 — Claude Code Context

> Ответы по-русски, код на английском.

**Основные инструкции находятся в `.github/copilot-instructions.md` (v6.0.0).**
Этот файл содержит минимальный контекст для Claude Code. При работе над любой
задачей используй `read_file` для чтения полных инструкций и документации.

## Quick Reference

### Critical Rules

1. **Respond in Russian**, write code in English
2. **NEVER rollback files** — other agents may work in parallel
3. **Tailwind first** — inline styles forbidden
4. **PRODUCTION-ONLY API** — always `api.heyslab.ru`, never localhost
5. **Supabase SDK REMOVED** — use only `HEYS.YandexAPI.rpc()` / `.rest()`

### Commands

```bash
pnpm dev                  # Dev server (HMR) → localhost:3001
pnpm test:run             # Vitest single pass
pnpm type-check           # TypeScript validation
pnpm build                # Production build (only before commit!)
```

### Key Forbidden Patterns

```javascript
// ❌ → ✅
cloud.client.rpc()           → HEYS.YandexAPI.rpc('fn', {})
localStorage.setItem()       → U.lsSet('key', value)
console.log('debug')         → console.info('[HEYS.module] ✅ ...')
dayTot.protein               → dayTot.prot
item.category                → getProductFromItem(item, pIndex).category
heys_day_{date}              → heys_dayv2_{date}
protein = 4 kcal/g           → protein = 3 kcal/g (TEF-adjusted)
passing client_id to RPC     → Use *_by_session pattern with session_token
```

### Documentation Index

For detailed context, read the relevant file before starting work:

| Topic                      | File                                       |
| -------------------------- | ------------------------------------------ |
| Full AI instructions       | `.github/copilot-instructions.md`          |
| Architecture & files       | `docs/ARCHITECTURE.md`                     |
| Key files & entry points   | `docs/AI_KEY_FILES.md`                     |
| API & RPC                  | `docs/API_DOCUMENTATION.md`                |
| **Data model (core)**      | `docs/DATA_MODEL_REFERENCE.md`             |
| **Data model (nutrition)** | `docs/DATA_MODEL_NUTRITION.md`             |
| **Data model (analytics)** | `docs/DATA_MODEL_ANALYTICS.md`             |
| **Scoring (full)**         | `docs/SCORING_REFERENCE.md`                |
| **App systems**            | `docs/APP_SYSTEMS_REFERENCE.md`            |
| **Data model changelog**   | `docs/CHANGELOG_DATA_MODEL.md`             |
| Insulin wave (full)        | `docs/INSULIN_WAVE_DOCUMENTATION.md`       |
| Trial Machine              | `docs/AI_TRIAL_MACHINE.md`                 |
| Insights & analytics       | `HEYS_Insights_v5_Deep_Analytics_c7.md`    |
| Security                   | `docs/SECURITY_RUNBOOK.md`                 |
| Meal planner               | `docs/MEAL_PLANNER_DOCUMENTATION.md`       |
| **Sync architecture**      | `docs/SYNC_REFERENCE.md`                   |
| **Sync performance**       | `docs/SYNC_PERFORMANCE_REPORT.md`          |
| **Sync sessions log**      | `docs/SYNC_PERFORMANCE_SESSIONS_LOG.md`    |
| **Storage patterns**       | `docs/dev/STORAGE_PATTERNS.md`             |
| **Data loss protection**   | `docs/DATA_LOSS_PROTECTION.md`             |
| **EWS cloud sync**         | `docs/EWS_WEEKLY_CLOUD_SYNC_DEPLOYMENT.md` |

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
2. `docs/SYNC_PERFORMANCE_REPORT.md` — 5 optimization phases, metrics, incidents
3. `docs/SYNC_PERFORMANCE_SESSIONS_LOG.md` — implementation details, session
   journals
4. `docs/dev/STORAGE_PATTERNS.md` — localStorage API, Store API, namespacing
   rules
5. `docs/DATA_LOSS_PROTECTION.md` — SQL guards, overwrite protection at all
   levels
6. `docs/EWS_WEEKLY_CLOUD_SYNC_DEPLOYMENT.md` — EWS weekly snapshots cloud sync
