# HEYS-v2 — Agent instructions

Compact agent reference. Detailed architecture in
[apps/web/ARCHITECTURE.md](apps/web/ARCHITECTURE.md), debugging procedures in
[apps/web/DEBUGGING.md](apps/web/DEBUGGING.md), past bug post-mortems in
[apps/web/BUGS_HISTORY.md](apps/web/BUGS_HISTORY.md). Project status / TODO in
[todo.md](todo.md).

Tone, communication length, adjacent observations — см. user-level CLAUDE.md.

---

## Project-specific communication

- В ответ на «что предлагаешь» — одно предложение «предлагаю X, потому что Y» +
  вопрос «делать?». Не вываливать варианты с заголовками и таблицей сравнения.

## Execution autonomy

- Делай шаги сам в текущей сессии: SQL миграции через
  `bash scripts/db/psql.sh -f ...`, cloud functions через
  `cd yandex-cloud-functions && ./deploy-all.sh <name>`, коммиты через
  `git commit`. Сетевые таймауты, IAM, checksum-warnings — твои проблемы, не
  задачи пользователю.
- **`git push` — только по явной команде** («пуш», «push», «запушь»,
  «выкатывай»). Approval задачи ≠ approval push. После commit: «закоммитил,
  пушить?». HARD invariant — push виден другим клиентам.
- Просить пользователя — только: 2FA / hardware key, чужой доступ, destructive
  вне согласованного плана, push на remote.

## Local dev

- **`pnpm dev:local`** — full stack (API:4001 + web:3001). Default for any
  full-stack work.
- `pnpm dev:web` / `pnpm dev:api` — isolated, only if API is already up
  separately. Web-only will fail sync with `ERR_CONNECTION_REFUSED:4001`.

---

## Landing & user-facing copy

Продукт серьёзного уровня. Копирайт лендинга и любой клиент-видимый текст
требует особого режима: нет места разговорному сленгу, стартап-жаргону, калькам
с английского, overpromise и техническим деталям внутреннего процесса.

**Перед написанием или правкой любого user-facing текста — обязательно прочитай
[`apps/landing/COPY_VOICE.md`](apps/landing/COPY_VOICE.md):**

- Чёрный список запрещённых слов и конструкций
- Принципы (клиентоориентированный flow, конкретика вместо абстракции)
- **История замечаний** — пополняй её новой записью когда получаешь feedback по
  копирайту.

---

## Architecture invariants (read first when touching products/sync)

1. **Products canonical = `HEYS.OverlayStore` merged view**, not legacy
   `heys_products` LS. Wrapped via `installOverlayWrapper` in
   [heys_core_v12.js](apps/web/heys_core_v12.js).
2. **Cloud is the single source of truth.** Single product entry point:
   `HEYS.OverlayStore.applyCloudSnapshot()`. Local mutations auto-sync via
   `writeRaw` (debounced 2s).
3. **PIN and curator sessions load products identically.** Curator-only diff:
   sees shared+moderation subtabs in RationTab; orphan-recovery skipped to avoid
   cross-client stamp pollution.
4. **Auth keys never touched by storage tooling**: `heys_supabase_auth_token`,
   `heys_pin_auth_client`, `^sb-*` — hard allowlist in storage registry.
5. **All `localStorage.setItem` is intercepted** by
   [heys_storage_supabase_v1.js](apps/web/heys_storage_supabase_v1.js). The
   interceptor routes cloud sync, dual-writes legacy products mirror, and gates
   against stale cloud overlay. Direct `originalSetItem.bind(...)` bypasses the
   interceptor — when tracing, patch `Storage.prototype.setItem` instead.
6. **DB schema**: `client_kv_store` has FK
   `client_id → clients(id) ON DELETE CASCADE` (added 2026-05-11). Deleting a
   client cascades to all per-client storage.
7. **Никогда не пиши cleanup/garbage-collection через shape inference.** Функции
   которые решают «valid vs invalid» по наличию полей вроде `.name` / `.id`
   ломаются при эволюции данных (overlay v2 → TypeA rows без `.name`; tombstone
   arrays держат IDs, не объекты). Использовать explicit tombstones /
   versioning. См. `BUGS_HISTORY.md` cloud cleanup destruction 2026-05-11.
8. **UPSERT на таблицах с auth-триггерами по `NEW.user_id`** (`client_kv_store`
   и подобные) — всегда `SET user_id = EXCLUDED.user_id` в `ON CONFLICT`. Иначе
   stale `user_id` прошлого writer'а проходит trigger-condition и блокирует
   легитимные writes (incident 2026-05-28, PIN-flow 500; hotfix
   `database/2026-05-28_fix_pin_path_user_id.sql`).
9. **Любой scan по localStorage обязан фильтровать foreign-scoped keys.**
   Pattern-based LS поиск (`key.includes('_dayv2_')`,
   `Object.keys(localStorage)`) возвращает данные **всех клиентов** что
   когда-либо логинились в этой сессии (особенно incognito multi-tab, где все
   tabs делят LS). Если код потом отдаёт эти данные React state как
   «meals/profile/etc for current client» или пишет их под `currentClientId` —
   это cross-client pollution. Pattern для фильтра:
   `/^heys_([0-9a-f-]{36})_/i.exec(key)?.[1] === currentScope` (current =
   `HEYS.currentClientId.toLowerCase()`). Unscoped legacy keys принимаются.
   Incident 2026-06-02 #13: `loadMealsRaw` cross-key fallback в
   [apps/web/heys_day_utils.js:600](apps/web/heys_day_utils.js#L600) — годами
   тёк меж клиентами кураторов.
10. **Server резолвит canonical client_id из `context_id`, игнорирует
    browser-supplied.** Phase A+B (2026-06-02): сервер выдаёт capability token
    `context_id` через `issue_write_context_by_curator/_by_session` RPC,
    привязанный к (curator_id, client_id) или (session_id, client_id) в момент
    issue. Каждый KV write несёт `p_context_id` — сервер валидирует через
    `validate_write_context()` и при mismatch переписывает
    `resolvedClientId ← context.client_id` (rerouting вместо pollution). REST
    POST `/rest/client_kv_store` тоже принимает `row.context_id` (первая
    capability-based auth для этого endpoint'a). `cloud._writeContextReady`
    awaitable promise закрывает boot race (saveClientViaRPC ждёт до 3 сек). См.
    `write_contexts` table + plan
    `/Users/poplavskijanton/.claude/plans/cosmic-tickling-lynx.md`.

See [apps/web/ARCHITECTURE.md](apps/web/ARCHITECTURE.md) for full details on
each.

---

## Pre-commit / pre-push hooks

Активные хуки: commitlint, `check-agent-staging` (source-only guard в
agent-mode), `legacy-sync` (rebundle+auto-stage в integration-mode, report-only
в agent-mode), `prepare-release:check` (whats-new, pre-push),
`lint-direct-localstorage-writes`, `lint-shared-cache-writes`.

## Default flow: `pnpm ship`

Для соло-работы (один агент, серийно) — **default-флоу одна команда**:

```bash
pnpm ship "feat(fingers): reorder layout cards"
pnpm ship "fix(sync): drop stale dayv2" --dry-run
pnpm ship "chore(scripts): refactor logging" --no-push
```

Что делает [scripts/ship.mjs](scripts/ship.mjs):

1. `git add -A` — стейджит всё что изменено (source).
2. `git commit -m "<msg>"` — pre-commit hook в `integration`-режиме сам
   пересобирает затронутые бандлы из staged source и стейджит их в тот же
   коммит. Источник списка бандлов —
   [scripts/legacy-bundle-config.mjs](scripts/legacy-bundle-config.mjs).
3. Если коммит user-facing (`feat`/`fix`/`perf`) — автогенерирует whats-new
   entry из subject коммита (`type`, `title`, `description = subject`) и делает
   второй `chore(release): whats-new for <subject>` коммит.
4. `git push origin <current-branch>`.
5. Если ты на `main` — ждёт зелёного `Deploy to Yandex Cloud` через
   `gh run watch`.

Под капотом ship ставит env-флаги: `HEYS_SHIP=1` (bypass agent-mode
generated/release-блока в
[check-agent-staging.mjs](scripts/check-agent-staging.mjs)),
`HEYS_INTEGRATION=1` (разрешает task-work коммит на `main`/`develop`),
`HEYS_STAGING_MODE=integration` (форсит auto-sync hook на rebuild+stage). Все
три снимают блоки которые иначе разводили flow на трёх шагах.

**Работаешь сразу в `main`.** Никаких worktree/feature-branch, никаких
`git switch -c <task>` перед правкой. Один тред — один ship.

### Когда нужны worktree (opt-in для реальной параллели)

Если правда 2+ агента одновременно правят разные куски кода (редкий случай) —
тогда:

```bash
pnpm agent:worktree <task>   # создаст .claude/worktrees/<task> на claude/<task>
# каждый агент работает в своём worktree, source-only коммиты
pnpm agents:integrate --branches=claude/a,claude/b --title="..." \
  --items='[{"type":"fix","title":"...","description":"..."}]'
```

В этом режиме pre-commit (без `HEYS_SHIP=1`) блокирует бандлы и whats-new в
agent-mode (см. [check-agent-staging.mjs](scripts/check-agent-staging.mjs)) —
каждый агент коммитит только source, а bundle rebuild + whats-new делает один
`agents:integrate` проход на main. Это спасает от hash-коллизий бандлов, если
два агента ребилдят одновременно.

### Прочие push-инструменты (legacy)

- `pnpm push:agent` — non-interactive push с генерацией whats-new из CLI
  аргументов (`--title`, `--item-title`, `--item-description`). Эквивалент ship
  для случая «коммиты уже есть, нужен только release-entry + push». ship
  предпочтительнее когда коммиты ещё не сделаны.
- `pnpm push:safe` — для чисто технических пушей (без whats-new).
- `pnpm push:ready` — интерактивный flow для ручной редактуры release-текста.

Текст user-facing release-entry — по
[apps/web/WHATS_NEW_COPY.md](apps/web/WHATS_NEW_COPY.md). ship использует
subject коммита как title и description — для серьёзных user-facing релизов
лучше потом поправить вручную через `push:ready` или прямой edit
`whats-new.json`.

**Dev-цикл «увидеть свою правку».** `pnpm dev:web` грузит закоммиченные
хеш-бандлы из `public/` как статику — vite их не HMR-ит. Чтобы увидеть правку
inside бандла без коммита — пересобери: `pnpm bundle:legacy:auto --files=<твои>`
(селективно) или `pnpm bundle:legacy` (полный) и reload. После ship'a этот
ручной rebuild не нужен.

**Когда хук срабатывает — следуй его stderr.** Никогда `--no-verify` без явного
разрешения пользователя.

---

## Diagnostics

Каталог + quick reference: [DEBUGGING.md](apps/web/DEBUGGING.md).
