# HEYS-v2 — Agent instructions

Compact agent reference. Detailed architecture in
[apps/web/ARCHITECTURE.md](apps/web/ARCHITECTURE.md), debugging procedures in
[apps/web/DEBUGGING.md](apps/web/DEBUGGING.md), past bug post-mortems in
[apps/web/BUGS_HISTORY.md](apps/web/BUGS_HISTORY.md). Project status / TODO in
[todo.md](todo.md).

Tone, communication length, adjacent observations — см. user-level AGENTS.md.

---

## Project-specific communication

- В ответ на «что предлагаешь» — одно предложение «предлагаю X, потому что Y» +
  вопрос «делать?». Не вываливать варианты с заголовками и таблицей сравнения.

## Coder role

- Если пользователь даёт агенту роль кодера / исполнителя, агент работает как
  разработчик по согласованному плану реализации: вносит код, проверяет шаги и
  не пытается делать commit, staging под commit, bundle rebuild, build,
  legacy-sync, push, PR или публикацию без отдельной прямой команды
  пользователя.
- Для локального теста legacy UI кодер может пересобирать бандлы
  (`pnpm bundle:legacy` или точечный `bundle:legacy:auto --files=...`), потому
  что `index.html` грузит hash-bundles и без этого часть правок не видна в
  браузере. Это локальная черновая сборка для reload/QA, не результат кодера.
- Кодер не коммитит generated/release artifacts (`apps/web/public` bundles,
  `bundle-manifest.json`, `index.html` hash sync, `whats-new` release files) на
  agent-ветке. Если дана отдельная команда commit, коммит source-only; финальные
  generated artifacts собирает integration flow (`pnpm agents:integrate`) или
  отдельный явно разрешённый release/integration-проход.
- В начале такой работы агент создаёт «Протокол реализации» для ревьюера:
  короткий список крупных шагов, статусов и фактов проверки. После каждого
  крупного шага агент добавляет туда summary сделанного, риски/открытые вопросы
  и что именно ревьюеру смотреть.
- То же summary после каждого крупного шага агент дублирует в чат пользователю,
  чтобы ревьюер и пользователь видели один и тот же контекст.

## Execution autonomy

- Делай шаги сам в текущей сессии: SQL миграции через
  `bash scripts/db/psql.sh -f ...`, cloud functions через
  `cd yandex-cloud-functions && ./deploy-all.sh <name>`. Сетевые таймауты, IAM,
  checksum-warnings — твои проблемы, не задачи пользователю.
- **Запрещено без прямой команды пользователя:** `git commit`, staging под
  commit, пересборка/генерация legacy bundles (`bundle:*`, `bundle:legacy`,
  `pnpm build`, `legacy-sync` и похожие команды, которые меняют bundle-файлы),
  `git push`, `pnpm push:*`, создание PR и любые действия, которые публикуют
  изменения наружу.
- **Approval задачи ≠ approval commit/bundle/push.** Команда «сделай» означает
  внести правки и проверить их, но не коммитить, не собирать bundles и не
  пушить. Для commit нужна отдельная явная команда («закоммить», «commit»), для
  bundle rebuild — отдельная команда («собери бандлы», «build»), для push —
  отдельная команда («пуш», «push», «запушь», «выкатывай»).
- **Main как рабочая ветка:** если пользователь даёт прямую команду commit/push
  на `main`, агент может коммитить и пушить текущий staged/рабочий scope из
  `main` без ухода в отдельную ветку. Предполагается, что пользователь даёт
  такую команду только когда осознанно принимает всё, что может уехать вместе с
  веткой. Агент всё равно перед commit показывает/проверяет scope и не добавляет
  явно несвязанные файлы, если пользователь не сказал «всё».
- Просить пользователя — только: 2FA / hardware key, чужой доступ, destructive
  вне согласованного плана, push на remote.

## Local dev

- **`pnpm dev:local`** — full stack (API:4001 + web:3001). Default for any
  full-stack work.
- `pnpm dev:web` / `pnpm dev:api` — isolated, only if API is already up
  separately. Web-only will fail sync with `ERR_CONNECTION_REFUSED:4001`.

---

## Product UI invariants

- Если правило/подраздел методологии влияет на решение движка, оно должно быть
  как-то видно в UI: не обязательно отдельным экраном, но минимум tooltip,
  аннотация, trace/reason, badge/chip, help-popover или строка объяснения в
  самом уместном месте пользовательского flow.
- `UI —` допустимо только для чисто внутренних механизмов, которые не меняют
  пользовательское решение/рекомендацию, или для dev-only tooling. Если
  методология и движок говорят ✅, а UI пустой, это UI-бэклог, а не `n/a`.
- User-facing объяснение должно быть кратким и практичным: что система учла, как
  это повлияло на рекомендацию, и что пользователю с этим делать.

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

See [apps/web/ARCHITECTURE.md](apps/web/ARCHITECTURE.md) for full details on
each.

---

## Pre-commit / pre-push hooks

Активные хуки: commitlint, `prepare-release:check` (whats-new),
`lint-direct-localstorage-writes`, `lint-shared-cache-writes`, `legacy-sync`
(rebundle + auto-stage).

**Когда хук срабатывает — следуй его stderr.** Сообщение содержит точные
инструкции (что добавить, какой формат, какие файлы). Никогда `--no-verify` без
явного разрешения пользователя.

Quick hint: `feat|fix|perf` коммиты всегда требуют entry в
`apps/web/public/whats-new.json` (top of `releases[]`,
`buildHash = git log -1 --format=%h` +
`chore(release): bump whats-new build hash to <HASH>`).

Для агентского non-interactive push используй `pnpm push:agent` вместо обычного
`git push`, когда в push-range есть `feat|fix|perf` или пользовательские runtime
изменения. Сначала сформулируй короткий текст по
[apps/web/WHATS_NEW_COPY.md](apps/web/WHATS_NEW_COPY.md), затем:

```bash
pnpm push:agent -- --title="..." --item-title="..." --item-description="..."
```

Для проверки без commit/push добавь `--dry-run --no-push`. Если нужна готовая
команда-шаблон, запусти `pnpm push:agent -- --print-command`. `push:safe`
оставлен для технических изменений; не используй его для user-facing правок,
если текст релиза должен быть точным.

---

## Diagnostics

Каталог + quick reference: [DEBUGGING.md](apps/web/DEBUGGING.md).
