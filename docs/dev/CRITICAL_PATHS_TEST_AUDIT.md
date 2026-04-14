# Critical Paths Test Audit

> Текущий аудит покрытия по критичным пользовательским и sync-сценариям HEYS.
> Цель документа: не считать количество тестов, а понимать, какие реальные риски
> уже закрыты, а какие ещё нет.

## Coverage Map

| Сценарий                                                    | Риск                                                                                       | Текущее покрытие                                                                                                                                                                                                                                            | Статус      | Источники                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Клиентский PIN login и восстановление локальной сессии      | Пользователь не может войти или теряет сессию после reload                                 | e2e smoke + unit: `loginClient`, сессия/logout, `createClientWithPin` / `resetClientPin` (RPC + валидация)                                                                                                                                                  | **Partial** | `TESTS/e2e/pin-auth.spec.ts`, `apps/web/__tests__/heys-auth-login-client.test.js`, `apps/web/__tests__/heys-auth-session.test.js`, `apps/web/__tests__/heys-auth-create-reset-pin.test.js`                                                                       |
| Client auth/session state machine                           | Race condition в sign-in/sign-out, ложный logout, протухший токен                          | Есть unit-тесты на state-machine, protection window, token refresh, cleanup                                                                                                                                                                                 | **Partial** | `apps/web/__tests__/auth-session.test.js`                                                                                                                                                                                                                        |
| Protected API/RPC wrappers with `session_token`             | Защищённые RPC могут уйти без токена, с неверным токеном или в неправильный transport path | Есть focused tests на session-safe KV RPC, namespaced token migration и curator JWT fallback/error surfacing; остальные protected methods пока не закрыты                                                                                                   | **Partial** | `apps/web/heys_yandex_api_v1.js`, `apps/web/__tests__/yandex-api-session-guards.test.js`, `docs/API_DOCUMENTATION.md`                                                                                                                                            |
| Local storage namespace / client isolation                  | Данные одного клиента затирают другого, double-clientId bug, null parse errors             | Есть unit-тесты на `lsGet` / `lsSet`, namespacing, normalizeKey; есть отдельный `client-isolation` suite                                                                                                                                                    | **Covered** | `apps/web/__tests__/storage-layer.test.js`, `apps/web/__tests__/client-isolation.test.js`                                                                                                                                                                        |
| Merge local vs remote day data                              | Потеря meals / steps / weight при конфликтах sync                                          | Есть unit-тесты на `mergeDayData` и merge semantics                                                                                                                                                                                                         | **Covered** | `apps/web/__tests__/merge-day-data.test.js`                                                                                                                                                                                                                      |
| Race condition между локальным редактированием и cloud sync | Потеря локальных изменений при visibility/focus sync                                       | Есть unit-тесты на block window, skip overwrite, flush timing                                                                                                                                                                                               | **Partial** | `apps/web/__tests__/sync-race-condition.test.js`                                                                                                                                                                                                                 |
| Sync event flow / first sync skip / morning check-in gating | UI обновляется слишком рано или неправильно показывает check-in                            | Есть unit-тесты на `initialSyncDoneRef` pattern и date-key logic                                                                                                                                                                                            | **Partial** | `apps/web/__tests__/events-sync.test.js`                                                                                                                                                                                                                         |
| Queue persistence / retry / flush before logout             | Потеря offline edits, невыгруженная очередь, бесконечные retry                             | Pure dedup/compact + runtime seam (`enqueueClientSave`, `flushPendingQueueCore`, retry decision) покрыты unit-тестами; полный E2E путь `saveClientKey` + сетевой upload в `heys_storage_supabase_v1.js` всё ещё требует отдельного интеграционного покрытия | **Partial** | `apps/web/heys_pending_queue_pure_v1.js`, `apps/web/heys_sync_queue_runtime_pure_v1.js`, `apps/web/__tests__/pending-queue-pure.test.js`, `apps/web/__tests__/sync-queue-runtime-pure.test.js`, `apps/web/heys_storage_supabase_v1.js`, `docs/SYNC_REFERENCE.md` |
| PWA update / cache invalidation                             | Пользователь держит stale bundle или stale SW cache                                        | Добавлены checks на stale path: mismatch `manifest boot hash` vs loaded asset, `SW cache version` mismatch, а также `sourceFingerprint` mismatch (`legacy sources` vs `bundle-manifest`) с hard reload action и pinpoint fix hints в verify-скрипте         | **Covered** | `apps/web/__tests__/pwa-update-logic.test.js`, `scripts/bundle-legacy.mjs`, `scripts/verify-legacy-bundles.mjs`, `apps/web/index.html`, `apps/web/public/sw.js`, `apps/web/public/bundle-manifest.json`                                                          |
| Server router auth/data source mapping                      | Telegram/curator auth ломает доступ к клиентским данным                                    | Есть integration-style tests для router + Supabase-backed sessions                                                                                                                                                                                          | **Covered** | `packages/core/src/server/__tests__/router.supabase.test.ts`                                                                                                                                                                                                     |

## Notes

- `Covered` не означает "идеально": только то, что в репозитории уже есть
  осмысленные тесты на этот риск.
- `Partial` означает одно из двух:
  1. тесты есть, но они проверяют симулированную логику, а не production path;
  2. покрыт smoke/happy path, но не закрыты error branches и transport edges.
- `Gap` означает, что для критичного сценария не найдено прямого теста в
  репозитории на текущий production path.

## Immediate D2 Candidates

### P0

1. `heys_auth_v1.js`: покрытие публичных auth helpers на уровне unit — закрыто
   для `loginClient`, session/logout, `createClientWithPin`, `resetClientPin`.

### P1

2. `heys_storage_supabase_v1.js`: дальнейшие tests на offline queue
   (pure/runtime seam уже покрыт через `pending-queue-pure.test.js` и
   `sync-queue-runtime-pure.test.js`):
   - `saveClientKey()` персистит очередь сразу;
   - `flushPendingQueue()` выталкивает pending writes перед logout/sync;
   - auth error не запускает бессмысленный retry loop.

3. `pwa-update-logic`: baseline coverage на cache-stale path и
   source-fingerprint mismatch закрыта; дальше расширять только если появятся
   новые runtime ветки.

## Baseline (скорость / качество PR)

Чтобы через 1–2 месяца сравнить эффект от verify-бандлов и тестов, один раз
зафиксируй вручную (таблица / тикет):

- среднее время от открытия PR до зелёного CI для правок в `apps/web/heys_*.js`;
- число «fix bundle / manifest / index» коммитов за месяц;
- доля PR с падением `verify-legacy-bundles` (после включения job).

Команды для локальной быстрой проверки: `pnpm verify:legacy-bundles`,
`pnpm validate:ci`, `pnpm test:web:critical`.

## Review Date

- Аудит собран по текущему состоянию репозитория на `2026-04-12`.
- После выполнения первых `D2` задач документ стоит обновить, а не создавать
  новый.
