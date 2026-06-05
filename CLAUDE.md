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

## Параллельная работа агентов (bundle isolation)

**Шаг 0 любой задачи: уйди с trunk на свою ветку СРАЗУ, до правок.** Если ты на
`main`/`develop` — `git switch -c <task>` (соло: незакоммиченные правки переедут
на ветку в том же каталоге) либо работай в своём worktree
(`git worktree add ../heys-<task> -b <task>` — для реальной параллельной
работы). Не по схеме «правлю в main → на коммите убегаю»: pre-commit
([check-agent-staging.mjs](scripts/check-agent-staging.mjs)) **блокирует
task-work (source/test/docs) в staged на `main`/`develop`**. Причина — несколько
агентов на одном trunk сцепляются в одну ветку: `git push` (толкает всю ветку)
не отправит твой фикс без чужих коммитов, а чужой красный коммит заблокирует
твой деплой. Release-коммиты (whats-new от `push:agent`) и rebuild бандлов
проходят (в staged нет task-work). `agents:integrate` ставит
`HEYS_INTEGRATION=1`; осознанный ручной trunk-коммит —
`HEYS_ALLOW_MAIN_COMMIT=1`. Поймало на коммите — не страшно:
`git switch -c <task>` уносит правки на ветку, коммить там.

**Главное правило: агенты коммитят ТОЛЬКО source. Бандлы и whats-new не
трогают.** Приложение деплоится из закоммиченных бандлов с content-hash в именах
(`public/*.bundle.<hash>.js`, `bundle-manifest.json`, `index.html`, `sw.js`,
`react-bundle.js`). Если каждый из 2–5 агентов пересобирает их в своём коммите —
hash-коллизии и порча чужих несобранных артефактов. Поэтому generated-файлы
собирает **один integration-проход**, а не каждый агент.

**Режим определяется автоматически**
([check-agent-staging.mjs](scripts/check-agent-staging.mjs)): worktree под
`.claude/worktrees/`, ветки `codex/`·`claude/`·`copilot/`· `worktree-agent/`, и
**по умолчанию любая ветка кроме `main`/`develop`/`integration/*`/`release/*`**
→ **agent mode** (source-only). В этом режиме pre-commit hook `legacy-sync`
только репортит, какие бандлы нужно будет пересобрать, и **блокирует staging
generated/release-файлов** (если случайно сделал `git add -A`). Источник списка
generated-путей —
[scripts/legacy-bundle-config.mjs](scripts/legacy-bundle-config.mjs) (single
source of truth, не дублируй).

**Изоляция рабочего дерева:** если коммитишь agent-mode правки из общего
root-checkout, пока живы другие `.claude/worktrees/`, pre-commit падает — два
агента в одном дереве перемешали бы незакоммиченные правки. Работай в своём
worktree (`git worktree add`). Интеграторы на `main`/`integration` исключены;
override — `HEYS_ALLOW_SHARED_TREE=1` (если этот checkout точно только твой).

Workflow:

1. Агент в своём worktree/ветке коммитит source/test/docs своей задачи. Бандлы,
   `whats-new.json`, `buildHash` — **не его забота**. Push не делает.
2. Когда задачи закрыты — **integration-проход** (на `main`/`integration/*`)
   собирает всё за один раз:
   ```bash
   pnpm agents:integrate --branches=codex/a,codex/b --title="..." \
     --items='[{"type":"fix","title":"...","description":"..."}]'
   ```
   (или `--branches=auto --yes` — авто-сбор agent-веток из worktrees;
   `--dry-run` — показать план без мутаций). Он мержит ветки (откат при
   конфликте), делает full rebuild, стейджит generated, гоняет
   `verify:legacy-bundles`, создаёт один `chore(build)` + один `chore(release)`
   whats-new коммит. Push не делает.

**Не пересобирай бандлы вручную перед коммитом.** На integration-ветке
pre-commit `legacy-sync` сам пересоберёт затронутые бандлы из _закоммиченного_
source и застейджит их; на agent-ветке бандлы вообще не коммитятся. Ручной
`pnpm bundle:legacy` до коммита только делает baseline «грязным» — `legacy-sync`
тогда падает и заставляет откатывать generated к HEAD. Легитимная пересборка —
это `pnpm agents:integrate` (full rebuild в проходе) и локальный `predev`/dev-
сервер (не коммитится). Коммить только source — артефакты соберёт
хук/интеграция.

**Когда хук срабатывает — следуй его stderr.** Сообщение содержит точные
инструкции. Никогда `--no-verify` без явного разрешения пользователя.

### Релиз / push (integration-only)

Эти инструменты — для **integration-прохода и ручных technical-пушей**, не для
рядовых agent-коммитов. whats-new (`feat|fix|perf` → entry в
`apps/web/public/whats-new.json`, `coveredCommits` покрывают user-facing коммиты
push-range) генерится автоматически через `agents:integrate` или, для одиночного
technical/ручного пуша:

```bash
pnpm push:agent -- --title="..." --item-title="..." --item-description="..."
```

Текст релиза — по [apps/web/WHATS_NEW_COPY.md](apps/web/WHATS_NEW_COPY.md).
`--dry-run --no-push` для проверки, `--print-command` для шаблона. `push:safe` —
для чисто технических изменений (не для user-facing, где текст должен быть
точным). `prepare-release:check` гоняется на pre-push и в CI; bundle rebuild
(`legacy-sync`) — на pre-commit только в integration-режиме.

---

## Diagnostics

Каталог + quick reference: [DEBUGGING.md](apps/web/DEBUGGING.md).
