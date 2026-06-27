---
description: HEYS v2 — essential domain rules for AI agents
applyTo: '**/*'
---

# HEYS v2 — AI Core

> **Этот файл — для GitHub Copilot.** Если ты Claude, canonical правила в
> `/CLAUDE.md` корня репо. При расхождении считай canonical CLAUDE.md.
>
> Ответы по-русски, код на английском.

## Production stack (что СЕЙЧАС работает в проде)

- **Backend**: Yandex Cloud Functions + API Gateway → `https://api.heyslab.ru`.
- **Database**: Yandex Managed PostgreSQL 16
  (`rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net`).
- **Frontend → backend**: только через `HEYS.YandexAPI.rpc()` / `.rest()`.
- **Supabase**: npm-пакеты `@supabase/*` не используются. Доступ к SQL-only
  сценариям — через PostgREST-совместимый HTTP (`fetch`) или YC API. В новом
  коде НЕ добавлять `@supabase/*` зависимости.
- **Telegram curator service**: удалён 2026-04-18 вместе с Supabase. Если
  понадобится в будущем — реализовать заново поверх YC PostgreSQL.

## Legacy naming (не трогать без миграции и согласования)

- localStorage `heys_supabase_auth_token`, cookie `supabase-auth-token` — только
  исторические имена; переименование = миграция сессий и регрессия.
- Файл `types/supabase.d.ts` — типы схемы БД; переименование файла — отдельный
  PR с обновлением `tsconfig`/импортов.
- Service worker / прод: если появится `postMessage` для drain очереди,
  использовать нейтральное имя типа `TRIGGER_HEYS_SYNC` (см.
  `docs/SYNC_REFERENCE.md`), не vendor-префиксы.

## Domain-specific patterns (agent will get these wrong without guidance)

- `dayTot.prot`, NOT `.protein`. `product.harm`, NOT `.harmScore`.
- Protein = **3 kcal/g** (TEF-adjusted), NOT 4.
- Storage keys: `heys_dayv2_*`, `heys_ews_weekly_v1`.
- `MealItem` has no `category`; use `getProductFromItem(item, pIndex).category`.
- API: only `HEYS.YandexAPI.rpc()` / `.rest()`; **no Supabase SDK in new code**.
- localStorage: client-scoped data through `U.lsSet()` / `U.lsGet()` or another
  contracted wrapper. Raw `localStorage.setItem` only for explicit allowlisted
  unscoped/debug/auth cases.
- Protected RPC: never trust browser-supplied `client_id`; resolve canonical
  client server-side via session token, curator ownership, or server-issued
  `context_id`.
- Production API: `https://api.heyslab.ru` (never localhost).
- Logs: `console.info('[HEYS.module] ...')`, no `console.log`.
- No personal data in logs. Tailwind-first; inline styles only for dynamic
  values that are awkward/impossible as stable classes.

## Legacy bundle rebuild

When changing `apps/web/heys_*.js` that affects runtime:

1. `pnpm bundle:legacy:auto --files=<paths>` (selective rebuild).
2. If bundling config changed or asset not updated →
   `pnpm --filter @heys/web run predev && pnpm bundle:legacy`.
3. Validate: `bundle-manifest.json` hash matches `index.html` preloads.
4. Browser verification only for runtime-sensitive changes (boot/postboot,
   modals, init, stale cache risk) or by explicit request.
5. Report which hash updated and what validation was done.

## Commit / Push

- Do not stage for commit, commit, push, run `pnpm ship`, run `pnpm push:*`, or
  run `pnpm agents:integrate` without a direct user command.
- For commit/shipping by explicit command: `git add <intended files>` →
  `pnpm ship`.
- If commits already exist without `pnpm ship` or pre-push recommends the
  non-interactive agent flow, use `pnpm push:agent -- --confirm-push ...`.
- `pnpm push:safe` is for technical manual/service scenarios, not the normal
  agent default for user-facing/runtime changes.
- Never `HUSKY=0 git push`.

## Commands

- `pnpm dev:web` / `pnpm dev:landing`
- `pnpm bundle:legacy:auto --files=<paths>`
- `pnpm type-check` / `pnpm test:run`
- `pnpm ship` / `pnpm push:agent -- --confirm-push ...` /
  `pnpm agents:integrate --confirm-integration` only after direct
  commit/shipping/integration/push command
- Cloud functions: `cd yandex-cloud-functions && ./health-check.sh`
