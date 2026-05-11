# HEYS-v2 — Agent instructions

Compact agent reference. Detailed architecture in
[apps/web/ARCHITECTURE.md](apps/web/ARCHITECTURE.md), debugging procedures in
[apps/web/DEBUGGING.md](apps/web/DEBUGGING.md), past bug post-mortems in
[apps/web/BUGS_HISTORY.md](apps/web/BUGS_HISTORY.md). Project status / TODO in
[todo.md](todo.md).

---

## Communication

- **Русский для объяснений**, английский для кода и идентификаторов.
- **Простыми словами, всегда.** Через аналогии и конкретные примеры. Без
  формального жаргона где можно его избежать. Это касается любых объяснений,
  резюме, отчётов о сделанной работе, ответов на вопросы. Технический термин
  можно использовать только если он короче и понятнее аналогии.
- **Сначала суть в одном предложении, потом детали.** Если задача тривиальная —
  вообще без деталей.
- **Порог длины по умолчанию: ≤5 предложений или короткая таблица.** Длинные
  ответы с заголовками, нумерованными секциями, абзацами объяснений — только
  если пользователь явно попросил («подробно», «глубокий аудит», «расскажи
  детально»). Если сомневаешься — пиши коротко, пользователь сам попросит
  раскрыть.
- **Плохой паттерн (не делай так):** в ответ на «что предлагаешь» вываливать 3
  варианта с заголовками, таблицей сравнения и блоком «что рекомендую» — даже
  если каждый кусок полезен, в сумме это портянка. Правильно: одно предложение
  «предлагаю X, потому что Y» + вопрос «делать?». Детали — после того как
  спросят.

## Execution autonomy

- **Пользователь не выполняет команды сам.** Не пиши «запусти sql миграцию»,
  «задеплой cloud function», «сделай git push» как инструкции на потом. Делай
  эти шаги сам в своей сессии: SQL миграции через
  `bash scripts/db/psql.sh -f ...`, cloud functions через
  `cd yandex-cloud-functions && ./deploy-all.sh <name>`, коммиты и push через
  `git`. Если деплой-скрипт ругается на сетевой таймаут или checksum — пробуй
  `--skip-checks` (после явной проверки что credentials валидны), retry с
  экспоненциальным backoff, или альтернативный путь.
- **Просить пользователя что-то выполнить — только когда:** (1) операция требует
  физического подтверждения у внешнего сервиса (2FA, hardware key), (2)
  требуется доступ который у тебя точно отсутствует (другая машина, чужой
  логин), (3) destructive операция вне согласованного плана. Сетевые глюки, IAM
  таймауты, checksum-warnings — это твои проблемы, решай retry/skip/workaround.
- **Если что-то не вышло с n-й попытки** — пиши что попробовал и какие
  альтернативы доступны, и переходи к ним. Не оставляй пользователю «осталось
  тебе сделать X».

## Working principles

- **Diagnose root cause before fixing.** For non-trivial bugs, trace end-to-end:
  route → page → container → orchestration → state, OR function → hook → service
  → API → DB. For trivial fixes (typo, lint, rename) — be proportional, no
  ritual.
- **Fix at the source-of-truth layer.** Fallback chains, silent recovery
  branches, duplicated logic are signals that you're patching the wrong layer.
- **Watch for coupled layers.** Contracts, handlers, queries, cache,
  serializers, loading states often need to move together.
- **One-file fixes are suspect.** Justify why other layers are unaffected.
- **Keep changes proportional.** Bug fix doesn't need surrounding cleanup.
- **Never write cleanup/garbage-collection by shape inference.** Functions that
  decide "valid vs invalid" by checking the presence of fields like `.name` or
  `.id` will inevitably break when data shape evolves (overlay v2 → TypeA rows
  have no `.name`; tombstone arrays hold IDs not objects). Use explicit
  tombstones / versioning / migrations instead. See `BUGS_HISTORY.md` cloud
  cleanup destruction (2026-05-11) for the cost.

## Local dev

- **`pnpm dev:local`** — full stack (API:4001 + web:3001). Default for any
  full-stack work.
- `pnpm dev:web` / `pnpm dev:api` — isolated, only if API is already up
  separately. Web-only will fail sync with `ERR_CONNECTION_REFUSED:4001`.

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

See [apps/web/ARCHITECTURE.md](apps/web/ARCHITECTURE.md) for full details on
each.

---

## Pre-commit / pre-push gates

- **commitlint**: type must be
  `feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert|release`.
- **prepare-release:check** (pre-push): every code-bearing commit needs a
  `whats-new.json` entry with matching `buildHash`. For docs/release-only
  commits the hash auto-resolves to the previous meaningful commit.
- **lint-direct-localstorage-writes** (pre-push, warn-only): new
  `localStorage.setItem` outside the allowlist blocks the push. Allowlist:
  [scripts/bootstrap-bypass-allowlist.txt](scripts/bootstrap-bypass-allowlist.txt).
- **lint-shared-cache-writes** (pre-commit): `_sharedProductsCache =` always
  pairs with `_invalidateSharedIndex()`.
- **legacy-sync hook** (pre-commit): when source files change, regenerates
  legacy bundles + manifest + index.html hashes + sw.js cache version. The
  rebundled output gets auto-staged.

To skip a hook the user must explicitly authorize. Default: do not
`--no-verify`.

### How to react when a hook fires

**`prepare-release:check` failed (no whats-new entry)** — add an entry to
[apps/web/public/whats-new.json](apps/web/public/whats-new.json) at the top of
`releases[]`:

```json
{
  "version": "2026.05.11.<HASH>",
  "buildHash": "<HASH>",
  "date": "<YYYY-MM-DD>",
  "kind": "technical", // or "user-facing"
  "profile": "technical-infra", // or "user-facing-general", etc.
  "title": "Short user-friendly title",
  "items": [
    {
      "type": "fix|improvement|chore",
      "title": "...",
      "description": "..."
    }
  ]
}
```

The `<HASH>` is the **short SHA of the source-bearing commit** (not the docs
commit). Get it via `git log -1 --format=%h`. Then make a fresh
`chore(release): bump whats-new build hash to <HASH>` commit. The check is
re-run on push.

**`lint-direct-localstorage-writes` failed (new direct setItem)** — preferred
fix: refactor the new call site to `HEYS.utils.lsSet(key, value)` or
`HEYS.store.set(key, value)`. If the call must stay direct (bootstrap-time
before Store loads), add the new line as `relative/path:line` to
[scripts/bootstrap-bypass-allowlist.txt](scripts/bootstrap-bypass-allowlist.txt).
**Common surprise**: editing a file shifts other lines, breaking existing
allowlist entries with stale line numbers. The hook output names exactly which
lines to update — just re-sync.

**`legacy-sync` regenerated bundles** — this is normal. The hook auto-stages the
rebuilt `apps/web/public/boot-*.bundle.<hash>.js` + manifest + index.html

- sw.js. Just commit them together with the source change. Never hand-edit those
  generated files.

---

## Working with code

- **Prefer editing existing files** — НЕ создавай новые модули без явной
  необходимости. Legacy bundle = IIFE modules in `apps/web/heys_*.js`,
  registered into `window.HEYS = {...}` namespace.
- **Bundles regenerate on commit** — `apps/web/public/boot-*.bundle.<hash>.js`
  - `boot-init`, `boot-app`, `boot-core`, `boot-day`, `boot-calc`,
    `postboot-*-lazy`. Don't hand-edit anything in `apps/web/public/` or
    `apps/web/dist/`.
- **Bundle hash in DOM ≠ executed code** if SW serves a stale cache. After
  `pnpm bundle:legacy` use **Incognito** for verification.

---

## Memory and external references

- **DB access pattern** (Lockbox + psql + Yandex Postgres): memory
  `reference_db_migration.md`.
- **DB inspection scripts**: [scripts/db/](scripts/db/) — `psql.sh` обёртка
  (auto-loads password from Lockbox) + готовые аудиты (`audit-clients.sql`,
  `audit-products.sql`, `audit-orphans.sql`, `inspect-client.sh <cid8>`).
  Используй их вместо ручного писания SQL и передачи пароля.
- **User profile / preferences**: memory `user_*.md`, `feedback_*.md`.
- **Project context** specific to this codebase: memory `project_*.md`.

---

## Diagnostics quick reference

```js
HEYS.diagnostics.overlay(); // products overlay health
HEYS.diagnostics.storageAudit(); // LS size + violations (read-only)
HEYS.diagnostics.runStorageAuditNow(); // trigger audit on demand
window.__heysLogControl.reset(); // logs back to default groups
window.__heysNativeConsole.error(x); // bypass log filtering
```

Full diagnostics catalog: [DEBUGGING.md](apps/web/DEBUGGING.md).
