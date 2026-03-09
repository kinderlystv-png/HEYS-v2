---
description: HEYS v2 — core workspace rules for AI agents
applyTo: '**/*'
---

# HEYS v2 — AI Core

> Ответы по-русски, код на английском.

## Always-on rules

1. Не делать `git checkout/restore/reset` без явного запроса.
2. Не предлагать localhost API: только production `https://api.heyslab.ru`.
3. Не перезапускать dev/HMR без явной необходимости.
4. `pnpm build` — только перед коммитом или по прямому запросу.
5. Tailwind first; inline styles запрещены; custom CSS только в
   `styles/heys-components.css`.
6. Legacy `apps/web/heys_*.js` не переводить на TypeScript без явной просьбы.
7. После изменений cloud functions обязательно: `./health-check.sh`; при `502` →
   `./deploy-all.sh` и повторная проверка.

## Canonical patterns

- RPC/REST: только `HEYS.YandexAPI.rpc()` и `HEYS.YandexAPI.rest()`; Supabase
  SDK не использовать.
- localStorage: использовать `U.lsSet()`/проектные storage helpers, не прямой
  `localStorage.setItem()`.
- Логи: `console.info/warn/error` с префиксом `[HEYS.module]`; `console.log` не
  оставлять.
- Не логировать персональные данные.
- Использовать `dayTot.prot`, не `dayTot.protein`.
- Использовать `product.harm`, не `product.harmScore`.
- Использовать ключи `heys_dayv2_*` и `heys_ews_weekly_v1`.
- У `MealItem` нет `category`; брать через
  `getProductFromItem(item, pIndex).category`.
- Для защищённых RPC использовать `*_by_session` + `session_token`, не
  `client_id`.
- Белок считать как `3 kcal/g` (TEF-adjusted), не `4 kcal/g`.

## Runtime context

- Монорепо: legacy runtime в `apps/web/`, modern code в `apps/web/src/` и
  `packages/*`.
- Apps: `apps/web`, `apps/landing`, `apps/tg-mini`; backend/api logic:
  `packages/core` и `yandex-cloud-functions/`.
- Новые фичи должны оставлять проверочные `console.info` логи на входе/выходе
  ключевой логики.

## Read more only when relevant

- Архитектура и точки входа: `docs/ARCHITECTURE.md`, `docs/AI_KEY_FILES.md`
- API/RPC и security: `docs/API_DOCUMENTATION.md`, `docs/SECURITY_RUNBOOK.md`
- Data model/scoring: `docs/DATA_MODEL_REFERENCE.md`,
  `docs/DATA_MODEL_NUTRITION.md`, `docs/DATA_MODEL_ANALYTICS.md`,
  `docs/SCORING_REFERENCE.md`, `docs/APP_SYSTEMS_REFERENCE.md`,
  `docs/CHANGELOG_DATA_MODEL.md`
- Sync/storage: `docs/SYNC_REFERENCE.md`, `docs/CURATOR_VS_CLIENT.md`,
  `docs/SYNC_PERFORMANCE_REPORT.md`, `docs/SYNC_PERFORMANCE_SESSIONS_LOG.md`,
  `docs/dev/STORAGE_PATTERNS.md`, `docs/DATA_LOSS_PROTECTION.md`,
  `docs/EWS_WEEKLY_CLOUD_SYNC_DEPLOYMENT.md`
- Insights/trial/meal planner: `HEYS_Insights_v5_Deep_Analytics_c7.md`,
  `docs/AI_TRIAL_MACHINE.md`, `docs/MEAL_PLANNER_DOCUMENTATION.md`

## Useful commands

- `pnpm dev`, `pnpm dev:web`, `pnpm dev:landing`
- `pnpm type-check`, `pnpm test:run`, `pnpm test:all`
- Frontend deploy: `bash scripts/deploy-frontend.sh`
- Cloud functions:
  `cd yandex-cloud-functions && ./validate-env.sh && ./health-check.sh`
