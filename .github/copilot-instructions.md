---
description: HEYS v2 — essential domain rules for AI agents
applyTo: '**/*'
---

# HEYS v2 — AI Core

> Ответы по-русски, код на английском.

## Domain-specific patterns (agent will get these wrong without guidance)

- `dayTot.prot`, NOT `.protein`. `product.harm`, NOT `.harmScore`.
- Protein = **3 kcal/g** (TEF-adjusted), NOT 4.
- Storage keys: `heys_dayv2_*`, `heys_ews_weekly_v1`.
- `MealItem` has no `category`; use `getProductFromItem(item, pIndex).category`.
- API: only `HEYS.YandexAPI.rpc()` / `.rest()`; **no Supabase SDK**.
- localStorage: `U.lsSet()` / `U.lsGet()`; **no raw localStorage**.
- Protected RPC: `*_by_session` + `session_token`, never pass `client_id`.
- Production API: `https://api.heyslab.ru` (never localhost).
- Logs: `console.info('[HEYS.module] ...')`, no `console.log`.
- No personal data in logs. No inline styles (Tailwind first).

## Legacy bundle rebuild

When changing `apps/web/heys_*.js` that affects runtime:

1. `pnpm bundle:legacy:auto --files=<paths>` (selective rebuild).
2. If bundling config changed or asset not updated →
   `pnpm --filter @heys/web run predev && pnpm bundle:legacy`.
3. Validate: `bundle-manifest.json` hash matches `index.html` preloads.
4. Browser verification only for runtime-sensitive changes (boot/postboot,
   modals, init, stale cache risk) or by explicit request.
5. Report which hash updated and what validation was done.

## Push

`pnpm push:safe` — always use instead of `git push`. Never `HUSKY=0 git push`.
For user-facing releases: `pnpm push:ready`.

## Commands

- `pnpm dev:web` / `pnpm dev:landing`
- `pnpm bundle:legacy:auto --files=<paths>`
- `pnpm type-check` / `pnpm test:run`
- `pnpm push:safe`
- Cloud functions: `cd yandex-cloud-functions && ./health-check.sh`
