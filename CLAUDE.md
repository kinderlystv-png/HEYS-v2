# HEYS v2 — Claude Code Context

> Ответы по-русски, код на английском.

Основные правила находятся в `.github/copilot-instructions.md`. Этот файл —
только быстрый redirect, чтобы не дублировать always-on контекст.

## Quick rules

1. Не делать rollback-команды (`git checkout/restore/reset`) без явного запроса.
2. Не предлагать localhost API; использовать только `https://api.heyslab.ru`.
3. Не перезапускать dev/HMR без необходимости.
4. Tailwind first; inline styles запрещены.
5. Supabase SDK не использовать; только `HEYS.YandexAPI.rpc()` / `.rest()`.
6. После изменений в legacy `apps/web/**`, влияющих на runtime, агент обязан сам
   запускать rebuild затронутых public bundle-файлов: сначала
   `pnpm bundle:legacy:auto --files=<workspace-relative-paths>`, а для bundling
   config или если selective rebuild не помог —
   `pnpm --filter @heys/web run predev && pnpm bundle:legacy`. Запрещено считать
   задачу завершённой, пока не обновились реальные
   `apps/web/public/boot-*.bundle.*.js` / `postboot-*.bundle.*.js`, новые хэши
   не видны в `apps/web/bundle-manifest.json` и `apps/web/index.html`, а
   `localhost` не фактически грузит новый hashed asset вместо старого. После
   проверки агент обязан сообщать пользователю обновлённый `boot/postboot` hash
   и текущий реально загруженный asset.

## Quick refs

- Архитектура: `docs/ARCHITECTURE.md`, `docs/AI_KEY_FILES.md`
- Логи/debug groups: `docs/dev/LOGGING_DEBUG_GROUPS.md`
- API/security: `docs/API_DOCUMENTATION.md`, `docs/SECURITY_RUNBOOK.md`
- Data model/scoring: `docs/DATA_MODEL_REFERENCE.md`,
  `docs/DATA_MODEL_NUTRITION.md`, `docs/DATA_MODEL_ANALYTICS.md`,
  `docs/SCORING_REFERENCE.md`
- Sync/storage: `docs/SYNC_REFERENCE.md`, `docs/CURATOR_VS_CLIENT.md`,
  `docs/dev/STORAGE_PATTERNS.md`

## Useful commands

- `pnpm dev`
- `pnpm bundle:legacy:auto --files=<workspace-relative-paths>`
- `pnpm --filter @heys/web run predev && pnpm bundle:legacy`
- `pnpm test:run`
- `pnpm type-check`
- `bash scripts/deploy-frontend.sh`
- `cd yandex-cloud-functions && ./validate-env.sh && ./health-check.sh`

## Legacy bundle checklist

Если менялся runtime в `apps/web/**`:

1. Сам запусти rebuild затронутого legacy/public bundle.
2. Сверь новый hash в `apps/web/bundle-manifest.json`.
3. Сверь ссылки в `apps/web/index.html`.
4. Убедись, что `localhost` реально грузит новый `boot/postboot` asset.
5. Если браузер держит старый hash — перезагрузи/переоткрой страницу и проверь
   снова.
6. Напиши пользователю, какой hash обновился и какой asset реально загружен.

Если задача узкая — читать только релевантные docs, а не весь набор подряд.
