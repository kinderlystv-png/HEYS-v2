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

| Topic                    | File                                    |
| ------------------------ | --------------------------------------- |
| Full AI instructions     | `.github/copilot-instructions.md`       |
| Architecture & files     | `docs/ARCHITECTURE.md`                  |
| Key files & entry points | `docs/AI_KEY_FILES.md`                  |
| API & RPC                | `docs/API_DOCUMENTATION.md`             |
| Data model               | `docs/DATA_MODEL_REFERENCE.md`          |
| Trial Machine            | `docs/AI_TRIAL_MACHINE.md`              |
| Insights & analytics     | `HEYS_Insights_v5_Deep_Analytics_c7.md` |
| Security                 | `docs/SECURITY_RUNBOOK.md`              |
| Meal planner             | `docs/MEAL_PLANNER_DOCUMENTATION.md`    |
