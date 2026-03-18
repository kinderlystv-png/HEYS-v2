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
   `pnpm --filter @heys/web run predev && pnpm bundle:legacy`. Минимум после
   rebuild: проверить обновлённые public assets, `apps/web/bundle-manifest.json`
   и ссылки/preload в `apps/web/index.html`. Browser verification делать только
   для runtime-sensitive изменений, cache-risk случаев, неоднозначного rebuild
   или по прямому запросу пользователя. После проверки агент обязан сообщать
   пользователю обновлённый `boot/postboot` hash и какой уровень валидации был
   выполнен; если была browser verification — также текущий реально загруженный
   asset.
7. Пользователь не обязан отдельно просить rebuild/browser verification: агент
   сам выбирает механику по типу изменённых файлов. Если правка low-risk —
   достаточно rebuild + файловой валидации; если правка runtime-sensitive,
   cache-risk или ambiguous — нужна browser verification.
8. Для low-risk задач вне legacy/runtime-sensitive сценариев браузерную проверку
   по умолчанию не делать: пользователь часто сам проверяет результат, поэтому
   без явной пользы не тратить на браузер время и токены.

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
2. Проверь файловую валидацию: public asset, новый hash в
   `apps/web/bundle-manifest.json`, ссылки/preload в `apps/web/index.html`.
3. Реши, нужна ли browser verification: обязательна для runtime-sensitive,
   boot/postboot, cache-risk и user-request случаев.
4. Если нужна — убедись, что `localhost` реально грузит новый `boot/postboot`
   asset; если браузер держит старый hash — перезагрузи/переоткрой страницу.
5. Напиши пользователю, какой hash обновился и какая валидация была выполнена;
   при browser verification — какой asset реально загружен.
6. Не жди дополнительных пометок от пользователя: решение между файловой и
   браузерной валидацией агент принимает сам по риску изменения.

Если задача узкая — читать только релевантные docs, а не весь набор подряд.
