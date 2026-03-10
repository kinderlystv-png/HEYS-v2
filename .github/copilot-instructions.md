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
5. После изменений в legacy runtime `apps/web/**`, влияющих на runtime bundle,
   агент обязан сам запускать rebuild затронутых legacy/public bundle-файлов,
   чтобы пользователь сразу видел правки на `localhost`. По умолчанию нужно
   запускать selective rebuild через
   `pnpm bundle:legacy:auto --files=<workspace-relative-paths>`, а при изменении
   bundling config (`scripts/bundle-legacy.mjs`,
   `scripts/legacy-bundle-config.mjs`) или если selective rebuild не обновил
   нужный asset — полный
   `pnpm --filter @heys/web run predev && pnpm bundle:legacy`. Недостаточно
   обновить исходник или промежуточный bundle: агент обязан проверить, что
   обновились реальные assets в `apps/web/public/boot-*.bundle.*.js` /
   `postboot-*.bundle.*.js`, что хэши синхронизированы через
   `apps/web/bundle-manifest.json` и ссылки в `apps/web/index.html`, и что
   `localhost` действительно грузит новый hashed asset. Если страница держит
   старый bundle — агент обязан перезагрузить/переоткрыть страницу и
   перепроверить фактически загруженные `script[src]`. Запрещено считать задачу
   завершённой по одному diff'у без проверки runtime-asset-а в браузере. После
   такой проверки агент обязан сообщить пользователю, какой именно `boot-*` /
   `postboot-*` hash был обновлён и какой asset сейчас реально загружен.
6. Tailwind first; inline styles запрещены; custom CSS только в
   `styles/heys-components.css`.
7. Legacy `apps/web/heys_*.js` не переводить на TypeScript без явной просьбы.
8. После изменений cloud functions обязательно: `./health-check.sh`; при `502` →
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
- `localhost` читает реальные legacy runtime assets из
  `apps/web/public/boot-*.bundle.*.js` и `postboot-*.bundle.*.js`, а не только
  исходники/промежуточные bundle-файлы.
- Источник истины по текущим legacy hash-именам —
  `apps/web/bundle-manifest.json`; после rebuild нужно сверять его с
  `apps/web/index.html` и фактически загруженными в браузере
  `boot-*.bundle.*.js` / `postboot-*.bundle.*.js`.
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
- Логи и debug groups: `docs/dev/LOGGING_DEBUG_GROUPS.md`
- Insights/trial/meal planner: `HEYS_Insights_v5_Deep_Analytics_c7.md`,
  `docs/AI_TRIAL_MACHINE.md`, `docs/MEAL_PLANNER_DOCUMENTATION.md`

## Useful commands

- `pnpm dev`, `pnpm dev:web`, `pnpm dev:landing`
- `pnpm bundle:legacy:auto --files=<workspace-relative-paths>`
- `pnpm --filter @heys/web run predev && pnpm bundle:legacy`
- `pnpm type-check`, `pnpm test:run`, `pnpm test:all`
- Frontend deploy: `bash scripts/deploy-frontend.sh`
- Cloud functions:
  `cd yandex-cloud-functions && ./validate-env.sh && ./health-check.sh`

## Legacy bundle mini-playbook

Когда меняешь runtime-код в `apps/web/**`, действуй так:

1. Определи, влияет ли файл на legacy runtime bundle.
2. Обязательно запусти selective rebuild:
   `pnpm bundle:legacy:auto --files=<workspace-relative-paths>`.
3. Если менялся bundling config или selective rebuild не обновил нужный asset —
   обязательно запусти:
   `pnpm --filter @heys/web run predev && pnpm bundle:legacy`.
4. Проверь `apps/web/bundle-manifest.json`: нужный `boot-*` / `postboot-*` hash
   должен обновиться.
5. Проверь `apps/web/index.html`: ссылки/preload должны смотреть на новый hash.
6. Проверь в браузере фактически загруженные `script[src]`: `localhost` должен
   грузить новый hashed asset, а не старый.
7. Если браузер держит старый asset — перезагрузи/переоткрой страницу и
   перепроверь `script[src]`.
8. Сообщи пользователю, какой именно `boot-*` / `postboot-*` hash обновился и
   какой asset сейчас загружен в `localhost`.
9. Не завершай задачу, пока пользовательский `localhost` не показывает именно
   новый bundle.
