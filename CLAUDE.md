# HEYS-v2 — project instructions

## Язык общения

**Всегда отвечай на русском языке.** Это касается всех объяснений, вопросов,
комментариев и любого текстового общения с пользователем. Код, переменные и
технические идентификаторы остаются на английском.

## Принципы диагностики и исправления багов

- **Do not fix symptoms before identifying the root cause.**
- **Fix at the source-of-truth (owner layer), not where the symptom appears.**
- Avoid child-layer compensation: fallbacks, patches, duplicated logic,
  branching are signals that the wrong layer is being fixed.
- Always do ultra-deep system research end-to-end before fixing:
  - top-down: route → page → container → orchestration → state
  - bottom-up: function → hook → service → API → DB
- Diagnose by layers: data/contracts → business logic → async/timing → UI state
  → integration → architecture.
- If a bug appears in a child, inspect the parent/owner layer first.
- When changing a mechanic, align all directly coupled layers: contracts,
  handlers, queries, cache, serializers, loading/error states.
- Be skeptical of one-file fixes; justify why other layers are unaffected.
- For frontend issues, inspect the full flow: route → layout → page → hooks →
  API → backend.
- Prefer systemic fixes, but keep changes proportional.
- If re-architecture is required, define scope, risks, compatibility, and
  rollout order.

## Local dev

- **Use `pnpm dev:local`** to start the local stack. It runs API (`:4001`) and
  web (`:3001`) together via `concurrently`.
- **Do not use `pnpm dev:web` alone** for full-stack work — it starts only the
  web app, and sync requests to `:4001` fail with `ERR_CONNECTION_REFUSED`.
- `pnpm dev:api` / `pnpm dev:web` exist for running each side in isolation (e.g.
  when an API is already up in another terminal). Default to `dev:local` unless
  the user explicitly wants split processes.

## Products storage architecture (post-2026-04 overlay rollout)

`heys_products` is no longer a denormalized snapshot per client. The canonical
reader is **`HEYS.OverlayStore` merged view** (file
`apps/web/heys_products_overlay_v1.js`), gated by feature flag
`overlay_products_v2` (default `true`).

- **Source of truth for nutrient data**: `shared_products` (cloud catalog, ~364
  entries, full schema with iron/calcium/vitamins).
- **Per-user overlay** (`heys_products_overlay_v2` LS key, scoped per client):
  array of `{id, shared_origin_id, overrides:{}, in_my_list:bool}` for
  shared-linked rows + `{id, _custom:true, ...full}` for custom-only rows.
- **`HEYS.products.getAll()`** (wrapped in `heys_core_v12.js`
  `installOverlayWrapper`): when flag on → returns merged view (shared +
  per-user overrides); when off → legacy `_origGetAll`.
- **Legacy `heys_products` LS key** is still dual-written via `interceptSetItem`
  (`heys_storage_supabase_v1.js`) for backward-compat. Plan to retire after
  Phase ε.
- **Migration** (one-shot, idempotent via `heys_overlay_migrated_at` +
  `heys_overlay_migration_version`): runs in `runOverlayMigrationOnce`
  (heys_app_tabs_v1.js) after orphan-recovery. v4 logic links by
  fingerprint→name fallback when `shared_origin_id` missing; `overlayBigger`
  branch self-heals TypeA duplicates by `shared_origin_id` and stamps
  `heys_overlay_self_healed_at`.

### Sync architecture (post-2026-05 cleanup)

The previous flow had multiple cloud→LS entry points (paginated bootstrap,
HOT-sync, YANDEX RESTORE) each writing overlay rows directly with `ls.setItem`.
Combined with `upsertRow` deduping only by `id` (not `shared_origin_id`) and
`addFromShared` checking duplicates via `getAll()` (which returns `[]` while
shared cache is loading), the boot-time `autoRecoverOnLoad` race produced 3-5
TypeA duplicates per shared product on every boot.

Current architecture:

- **Single cloud entry point**:
  `HEYS.OverlayStore.applyCloudSnapshot(rows, opts)`. Dedupes incoming TypeA by
  `shared_origin_id`, filters tombstones (`heys_deleted_ids` by id+name),
  preserves pending-local TypeB customs not yet propagated to cloud, then writes
  via `writeRaw(merged, { skipCloudSync: true })`. Returns
  `{ applied, before, after, pendingCustoms }`.
- **`upsertRow` dedupes TypeA by `shared_origin_id`** (not just by id) — stops
  duplicate accumulation at the source.
- **`addFromShared` checks via `readRaw()`** — independent of shared cache
  readiness, eliminates the race.
- **`writeRaw(rows, opts)` auto-syncs to cloud** (debounced 2s) for any local
  mutation (upsertRow, addFromShared, removeRow, migration). Pass
  `opts.skipCloudSync: true` for restore paths to avoid cloud → LS → cloud
  round-trips.
- **HOT-sync includes `heys_products_overlay_v2`** in `CLIENT_SPECIFIC_KEYS`
  (`heys_storage_supabase_v1.js:128`). Without this, deletions on one device
  never propagated to others until next full bootstrap.
- **`applyForegroundHotSyncValue`** has a dedicated overlay branch (~`:10791`)
  that routes overlay-key payloads through `applyCloudSnapshot`, not the legacy
  `heys_products` bridge.
- **BroadcastChannel cross-tab** (`heys_products_overlay_v2` channel) now
  carries `clientId` in messages. Receivers ignore writes from foreign clients —
  prevents curator-tab + PIN-tab interference in the same browser.

Boot order:
`shared catalog ready → applyCloudSnapshot from cloud → orphan recovery (only TypeB customs from diary, gated by curator session — curator sessions skip recovery to avoid cross-client stamp pollution from foreign dayv2 keys)`.

#### PIN vs curator session — products contract (post-2026-05-08)

**Same path for both.** Products data is loaded identically: cloud is the single
source of truth, `applyCloudSnapshot` is the only entry point, no migration
top-up from legacy `heys_products` (legacy is dead-data after overlay rollout —
only kept as a backward-compat mirror via interceptor).

| Aspect                     | PIN session                                                | Curator session                                                     |
| -------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------- |
| Cloud entry                | `applyCloudSnapshot`                                       | `applyCloudSnapshot`                                                |
| Migration on boot          | skipped if overlay non-empty (cloud-canonical)             | same                                                                |
| HOT-sync overlay key       | yes (`heys_products_overlay_v2` in `CLIENT_SPECIFIC_KEYS`) | same                                                                |
| BroadcastChannel           | clientId-isolated (foreign clientId messages ignored)      | same — prevents PIN tab + curator tab cross-talk                    |
| `addFromShared` race       | `readRaw()` check, independent of shared cache             | same                                                                |
| Orphan recovery from dayv2 | runs (only TypeB customs)                                  | **skipped** — curator's dayv2 scan would pull foreign-client stamps |
| RationTab content          | personal subtab only                                       | personal + shared catalog + moderation subtabs                      |
| Auto-sync of writes        | debounced 2s via `writeRaw`                                | same                                                                |

**Curator-only extras:**

- Sees shared catalog + moderation subtabs in RationTab
  ([heys_core_v12.js](apps/web/heys_core_v12.js) `RationTab` subtab gate
  `!isCurator || activeSubtab === 'personal'` for personal-only content).
- Orphan-recovery is gated by `HEYS.auth.isCuratorSession()` (with
  `HEYS.Bootstrap` and `window.isCuratorSession` fallbacks). Curator's
  `autoRecoverOnLoad` would otherwise scan all dayv2 keys in LS, including
  stamps from previously-viewed clients, and pollute the current client's
  overlay with foreign products.

**Why cloud-canonical (and not "merge from legacy on boot"):** After overlay
rollout, the migration TOP-UP path was the primary corruption source. When LS
overlay was small (e.g., fresh incognito boot at 12 rows mid-bootstrap) and
legacy `heys_products` was large (e.g., 150 rows from a stale snapshot), TOP-UP
would push the legacy 150 into overlay, then push that 150 to cloud — clobbering
the real 297-row overlay there. Removed entirely. Now: if overlay LS has rows →
trust cloud snapshot, never repopulate from legacy. The interceptor's
cloud-canonical gate
([heys_storage_supabase_v1.js](apps/web/heys_storage_supabase_v1.js)
`interceptSetItem` `_overlayCanonical` check) blocks legacy → overlay migration
paths when overlay is non-empty.

**Verifying for both sessions:**

```js
HEYS.diagnostics.overlay(); // expect total=297 (or whatever client has),
// typeA dedup count = 0
```

And cloud:

```sql
SELECT jsonb_array_length(v) FROM client_kv_store
WHERE k = 'heys_products_overlay_v2' AND client_id = '<cid>';
-- should match overlay length, no oscillation across logins
```

#### Temporary patch (will be removed once stable):

`OVERLAY GUARD` in `interceptSetItem` (`heys_storage_supabase_v1.js:3866`)
blocks all incoming overlay writes that exceed the recently-self-healed count
(5min TTL via `heys_overlay_self_healed_at`). Belt-and-suspenders defence in
case dirty cloud data arrives while self-heal upload is still draining. Plan
removes it after several rollout cycles confirm clean state.

### Diagnostics

- `HEYS.diagnostics.overlay()` — current state (flag, overlay/legacy length,
  type A/B counts, health metric).
- `HEYS.diagnostics.benchOverlay(200)` — cold/warm timing of merged view.
- `HEYS.diagnostics.relinkOverlay()` — manual re-migration (reads legacy LS,
  runs migrate v2, stamps success).
- `HEYS.diagnostics.retryOverlayMigration()` — clear migration markers; reload
  retries.
- `HEYS.flags.disable('overlay_products_v2')` — kill-switch (instant memo
  invalidation; reverts read-side to legacy).

### Critical files

- `apps/web/heys_products_overlay_v1.js` — OverlayStore: `readRaw`, `writeRaw`
  (auto-sync + skipCloudSync), `applyCloudSnapshot` (canonical cloud entry),
  `upsertRow` (TypeA dedup by shared_origin_id), BroadcastChannel cross-tab
  (clientId-isolated), migrate(), verifier, diagnostics.
- `apps/web/heys_core_v12.js` — `installOverlayWrapper` (getAll/getById flag
  gate), `addFromShared` (readRaw check, race-free), `deduplicate` (overlay
  mode), `RationTab` subtab content gate
  (`!isCurator || activeSubtab===personal`).
- `apps/web/heys_storage_supabase_v1.js` — `cloud.getSharedIndex()`,
  `interceptSetItem` universal dual-write hook + temporary OVERLAY GUARD,
  `applyForegroundHotSyncValue` overlay branch (→ applyCloudSnapshot), bootstrap
  paginated overlay path (→ applyCloudSnapshot), `CLIENT_SPECIFIC_KEYS` includes
  overlay key, products retry uses canonical getAll.
- `apps/web/heys_app_tabs_v1.js` — `runOverlayMigrationOnce` boot trigger,
  curator-session orphan-recovery gate, migration v4 self-heal dedup.
- `apps/web/heys_day_utils.js` — `autoRecoverOnLoad` scopes dayv2 scan to
  current clientId (curator session safety).
- `scripts/lint-shared-cache-writes.mjs` — pre-commit gate ensuring
  `_sharedProductsCache =` always pairs with `_invalidateSharedIndex()`.

## Storage management (Phase 2b: enforce mode, post-2026-04)

`apps/web/heys_storage_registry_v1.js` is the single source of truth for
`localStorage` policies. Phases 1 + 2a + 2b are shipped:

- **Phase 1**: registry + diagnostics, read-only.
- **Phase 2a**: shadow-mode boot audit — proposals written to
  `heys_storage_audit_pending_v1`, no LS mutations.
- **Phase 2b**: enforce mode behind `storage_audit_enforce` flag (default
  **false**). Flip to `true` via `HEYS.flags.enable('storage_audit_enforce')`
  after reviewing pending log. `cloudSync:'merge'` keys (insights_feedback,
  hidden_products) are NOT enforced — deferred to Phase 5 cloud-merge. Phases
  3–5 add lint gate, quota meter, and cloud-merge for user-state keys (see plan
  `/Users/poplavskijanton/.claude/plans/structured-mixing-stallman.md`).

### Why a registry

Audits found ~2.3 MB across ~10 keys with one offender
(`_insights_feedback_default`) at 970 KB despite a declared 96 KB cap. Three
independent failures combined: compression bypass before `Store.set` boots,
non-retroactive cap enforcement, and a `'default'` clientId fallback. The
registry centralises policies so caps apply uniformly at boot, on writes, and
via diagnostics — not whack-a-mole per call site.

### Public API

```js
HEYS.storageRegistry.register(name, {
  pattern, // RegExp | exact string
  scope, // 'per-client' | 'global' | 'per-date'
  maxSize, // bytes; 0 = forbidden, undefined = unbounded
  maxAge, // ms; 0 = no TTL
  cloudSync, // 'merge' | 'mirror' | 'local-only' | 'never'
  pruneStrategy, // 'sliding-window' | 'oldest-first' | 'wipe' | 'wipe-by-age' | 'manual'
  description,
});
HEYS.storageRegistry.match(key); // first matching policy or null
HEYS.storageRegistry.analyze(key, rawValue); // { sizeBytes, policy, violations, neverTouch }
HEYS.storageRegistry.list();
```

### Diagnostics

- `HEYS.diagnostics.storageAudit({ redact: true, topN: 20 })` — full snapshot:
  totals, top-N keys, unknown keys (no policy), policy violations, recent audit
  log entries. UUIDs in keys redacted to `<cid>` by default. Read-only.
- `HEYS.diagnostics.runStorageAuditNow({ bypassLock? })` — trigger audit on
  demand (bypasses 6h gate). In enforce mode actually deletes/prunes.
- `HEYS.diagnostics.storageAuditPending()` — view Phase 2a shadow proposals.
- `HEYS.diagnostics.restoreAuditDeletion(key)` — restore a key from the 24h
  recycle bin (`heys_storage_audit_recycle_v1`). Returns
  `{ restored, reason? }`.
- `HEYS.diagnostics.storagePolicy(key)` — inspect a single key's policy.
- `HEYS.diagnostics.browserStorageEstimate()` — `navigator.storage.estimate()`
  wrapper (browser-level secondary safety net).
- `HEYS.storageRegistry.isCleanupActive()` — returns true if another tab is
  mid-cleanup (sync advisory flag `heys_storage_cleanup_active`, 5s TTL).

### Direct-write lint gate (Phase 3, warn-only)

`scripts/lint-direct-localstorage-writes.mjs` scans source files for direct
`localStorage.setItem` calls and checks them against
`scripts/bootstrap-bypass-allowlist.txt`. Wired into `.husky/pre-push`.

- **Warn-only (Phase 3):** all allowlisted sites → stderr warnings; exit 0. New
  (unlisted) sites → exit 1 → blocks push.
- **Strict (Phase 5):** `--strict` flag treats all warnings as errors.
- **Allowlist format:** `relative/path:lineNumber` per line, `#` = comment.
  Remove entries as files are migrated.
- **Excluded from scan:** `heys_storage_supabase_v1.js` (interceptor),
  `heys_storage_registry_v1.js` (audit infra), generated bundles
  (`heys_advice_bundle_v1.js`, `heys_day_bundle_v1.js`,
  `heys_day_meals_bundle_v1.js`).

Phase 3 migration complete: `apps/web/advice/*.js` (24 sites) migrated to
`HEYS.store?.set || HEYS.utils.lsSet` tiered pattern. Allowlist shrank from 193
→ 169 warnings. Phase 4 covers remaining `insights/`, `heys_app_hooks_v1.js`,
`heys_app_backup_v1.js`, etc.

Bypass inventory: `apps/web/__perf_baselines__/storage-bypass-inventory.json`
(193 sites, categorised as bootstrap/phase3/phase4/review).

### Hard never-touch allowlist

Auth-critical keys are refused by `analyze()` regardless of any matching policy:
`heys_supabase_auth_token`, `heys_pin_auth_client`, `^sb-`. Phase 2+ audit
strategies skip these.

### Critical files (storage)

- `apps/web/heys_storage_registry_v1.js` — registry + diagnostics (Phase 1).
- `apps/web/heys_storage_layer_v1.js` — Store.set/get; compression `'¤Z¤'`
  prefix.
- `apps/web/heys_storage_supabase_v1.js` — cloud-side, `safeSetItem` 3-tier
  reactive recovery; `interceptSetItem` universal hook.
- `apps/web/insights/pi_feedback_loop.js:534-549` — canonical
  `pruneHistoryToStorageBudget` (sliding-window; reused by Phase 2 audit).
- `apps/web/insights/pi_feedback_loop.js:573-596` — canonical
  `trimLegacyRecords` (schema upgrader; reused by Phase 5 cloud-merge).

## Day-write race fix (post-2026-04-26)

When adding a product to a meal silently disappeared after refresh, root cause
was a **double race condition**:

1. **`flush()` closure-drift** in `useDayAutosave`
   ([heys_day_core_bundle_v1.js:2286](apps/web/heys_day_core_bundle_v1.js#L2286)).
   React `useCallback` captured `day` via closure with `[day, ...]` deps. After
   `setDay(prev → newDay)` `addProductToMeal` scheduled `flush()` via
   `requestAnimationFrame(setTimeout(.., 50ms))`, but React commit hadn't
   propagated to closure → flush saw stale `day` → exited via guard
   `freshestDaySnap === daySnap` without writing. **Fix**: flush now reads
   `HEYS.Day.getDay()` (ref-based via `dayRef.current`) and prefers it when
   newer, with `force = true` to bypass downstream guards.
2. **Gamification overwrite**
   ([heys_gamification_v1.js:2270, :2549](apps/web/heys_gamification_v1.js)). On
   `heysProductAdded` event → `addXP → updateDailyMission`/`getDailyMissions`
   read `dayv2` from LS (stale, without the freshly added product), patched
   `dailyMissions` field, then **wrote the entire object back** — clobbering the
   user's add. **Fix**: re-read LS immediately before each
   `setStoredValue(dayKey, ...)` and merge only `dailyMissions` field on top of
   the freshest snapshot.

Both fixes are needed together — fixing only one leaves the other path open.

## State-sync clobber pattern (post-2026-05-08)

A recurring class of bug across multiple LS-backed user-state keys:

1. Module A explicitly writes a shared LS key (e.g., `saveProfileSafe` in
   supplements writing `heys_profile`).
2. Module A dispatches a NARROW event (e.g., `heys:supplements-updated`) but not
   the broader `heys:profile-updated`.
3. React component B (e.g., `UserTabBase` in `heys_user_v12.js`) holds the same
   key in React state and listens ONLY for the broader event.
4. Component B's stale state isn't refreshed.
5. User edits any field in component B → its debounced auto-save (300ms for
   norms, 1000ms for profile/zones) writes the ENTIRE stale state back, with a
   fresh `updatedAt` → uploaded to cloud, clobbering the writer's changes.

Symptom: a setting silently reverts after the user touches an unrelated field in
the user tab — sometimes minutes later, sometimes after a sync roundtrip from
another device.

**Confirmed via cloud DB audit** for `plannedSupplements`:
`profile.plannedSupplements: []` while
`dayv2.supplementsPlanned: ["omega3","b12"]` persisted in day data — the user's
plan was actively synced to days but the profile field was overwritten by a
stale UserTab state via debounced save.

**Fix template** (already applied to `heys_profile`, `heys_norms`,
`heys_hr_zones`):

1. **Writer side** — every explicit writer dispatches the canonical event
   (`heys:<key>-updated`) immediately after LS write. Includes:
   wizard/onboarding paths, cloud-import paths, supplement UI's own
   `saveProfileSafe`. Detail object: `{ field?, fields?, source }`.
2. **HOT-sync interceptor** — `dispatchForegroundHotSyncProfileEvents` in
   [heys_storage_supabase_v1.js](apps/web/heys_storage_supabase_v1.js)
   automatically dispatches `heys:<key>-updated` for `heys_profile`,
   `heys_norms`, `heys_hr_zones` whenever HOT-sync writes them — covers
   cross-device cloud sync without each writer having to know.
3. **Listener side** — every component holding the key in React state subscribes
   to `heys:<key>-updated` and refreshes via `updatedAt` timestamp compare
   (`prevTs > newTs ? prev : incoming`) so concurrent user edits don't get
   clobbered by older external writes.

**Where to look when adding a new shared LS-backed setting:**

1. Search for `setTimeout` + `lsSet`/`writeStoredValue` near the new key —
   that's the auto-save site.
2. Confirm there's a paired `addEventListener('heys:<key>-updated')` that
   refreshes state.
3. Confirm every external writer of the key dispatches `heys:<key>-updated`.
4. If HOT-sync syncs the key, extend `dispatchForegroundHotSyncProfileEvents`.

**Already-vulnerable spots that may still need this template** (audit
2026-05-08): `heys_grams_history` (multiple meal-module writers, no event
dispatch — currently no React-state holder so safe today, but track if a future
component caches it). Also legacy `heysAdviceSettingsChanged` event naming
inconsistency — rename to `heys:advice-settings-updated` if a listener is ever
added.

## Morning-checkin wizard / scoped profile race (post-2026-05-08)

`shouldShowMorningCheckin` (heys_morning_checkin_v1.js ~600) у давних клиентов
на холодной загрузке мог открывать **регистрационный визард** на долю секунды,
хотя профиль в облаке полный.

**Корень проблемы — race в наполнении scoped LS:** на ранней стадии boot'а ключ
`heys_${clientId}_profile` содержит ТОЛЬКО subscription-секцию профиля
(`subscription_status`, `trial_started_at`, `trial_ends_at`,
`subscription_ends_at` — 4 поля, ~171 байт), ДО того как Phase A / full-sync
принесут полный профиль (12 полей, ~1192 байт с `firstName`, `age`, `weight`,
`height`, `profileCompleted: true`). `shouldShowMorningCheckin` срабатывает в
этом окне → `isProfileIncomplete` возвращает true → wizard открывается.

**Кто пишет subscription-only snapshot — пока неизвестно**: stack trace в
`cloud.saveClientKey` пустой, значит запись идёт мимо canonical save-path —
вероятно через `interceptSetItem` mirror logic или subscription/trial init. Это
open question для отдельного аудита, но фикс работает независимо.

**Защита (3 слоя):**

1. **`readProfileForceRawScoped`**
   ([heys_morning_checkin_v1.js:44](apps/web/heys_morning_checkin_v1.js#L44)) и
   inline-копия в
   [heys_app_morning_checkin_v1.js:10](apps/web/heys_app_morning_checkin_v1.js#L10)
   используют `isProfileShape()` критерий —
   `(p.age || p.weight || p.height || p.firstName || p.profileCompleted === true)`
   — идентичный HOT-sync guard в `cloud.saveClientKey` ~9893. Subscription-only
   возвращается как `null`, fallback на legacy `heys_profile`.

2. **`shouldShowMorningCheckin` defer-guard**
   ([heys_morning_checkin_v1.js:590](apps/web/heys_morning_checkin_v1.js#L590)).
   Если scoped LS имеет subscription-маркеры но НЕ имеет personal-маркеров,
   возвращаем `false` (sync in progress) — wizard НЕ открывается. Time-based
   ограничение **8 секунд** от `cloud._syncCompletedAt`: для **новых клиентов**
   без cloud-профиля subscription-only состояние permanent → после 8s defer не
   блокирует, wizard legitimately открывается для регистрации. Лог при
   срабатывании:
   `[MorningCheckin] 🛡️ partial subscription-only profile — sync in progress, deferring wizard`.

3. **Phase A / full-sync / delta-light guards** в `heys_storage_supabase_v1.js`
   (~6397, ~6700, ~8174). Не клобберим валидный local профиль пустым `{}` из
   cloud при синке — симметрично с уже существующим guard в
   `cloud.saveClientKey` (~9893). Лог:
   `🛡️ [PHASE A]/[DELTA LIGHT]/[FULL SYNC] BLOCKED empty profile from cloud`.

### Critical files (morning-checkin race)

- `apps/web/heys_morning_checkin_v1.js` — `readProfileForceRawScoped`
  (isProfileShape), `shouldShowMorningCheckin` (defer-guard).
- `apps/web/heys_app_morning_checkin_v1.js` — `readProfileForceRawScopedInline`
  (та же logic, для boot-app phase когда lazy postboot ещё не загружен).
- `apps/web/heys_storage_supabase_v1.js` — Phase A guard, full-sync guards,
  существующий `isValidProfile` guard в `cloud.saveClientKey` ~9893.
- `apps/web/heys_storage_layer_v1.js` — `Store.readSafe` helper (commit
  `87215fa6`), используется в новых call site'ах.

### Diagnostics

- Если симптом возвращается — диагностика в `readProfileForceRawScoped` через
  `console.error('[MorningCheckin] readProfileForceRawScoped DIAG', ...)`
  (закомментирована в коде; раскомментировать при отладке) покажет точный размер
  scoped/legacy raw, parsed keys, hasFields. По полям видно стадию race'а:
  `scopedKeys: 4` subscription-only / `scopedKeys: 12` полный.
- Cloud profile audit:
  `psql ... -c "SELECT k, v::text, updated_at FROM client_kv_store WHERE client_id='<uuid>' AND k LIKE '%profile%';"`
  — убедиться что в облаке полный профиль (cloud — source of truth).
- Cleanup poisoned scoped LS:
  `localStorage.removeItem(\`heys\_${HEYS.currentClientId}\_profile\`);
  location.reload();`

## Debugging the day-write pipeline

The app ships with a sequenced trace channel `[HEYS.day-trace]` covering the
full add-product → save → cloud → re-read flow. **Disabled by default in prod**:
traces are gated through `index.html`'s `__heysLogControl` filter and only emit
when their group is enabled.

### How logs are filtered (index.html top-level IIFE)

- All `console.info/warn/log` calls go through a wrapper that checks
  `shouldEmit(method, args)`.
- `shouldEmit` calls `detectGroupFromArgs(args)` which matches the **first
  argument** prefix (e.g. `[HEYS.sync]`, `[HEYS.day-trace]`) against
  `PREFIX_GROUP_MAP` and resolves to a group (`sync`, `day`, `products`, etc.).
- Only enabled groups pass through to the native console.
- `console.error` always passes (cannot be filtered).
- Default enabled groups: `['startup', 'sync']`. To enable more, see below.
- A NATIVE console reference (bypasses all filters) is exposed at
  `window.__heysNativeConsole` for use during debugging.

### Enable verbose logs

In DevTools console:

```js
// Enable everything (recommended for active debugging — VERY noisy, ~700+ messages on boot):
window.__heysLogControl.all();

// Enable specific groups only (recommended for targeted debug):
window.__heysLogControl.only('startup', 'sync', 'day', 'products');

// Add a single group on top of current:
window.__heysLogControl.enable('cloud', 'api');

// Remove a group:
window.__heysLogControl.disable('insights');

// See currently enabled groups:
window.__heysLogControl.getEnabledGroups();
window.__heysLogControl.getKnownGroups(); // all available group names

// Reset to DEFAULT (= ['startup', 'sync']) — call this when console gets too noisy:
window.__heysLogControl.reset();
```

**Settings persist in `localStorage.heys_log_groups_v1`**, so a session-time
`__heysLogControl.all()` survives reloads. If you can't figure out why the
console is screaming with hundreds of messages on boot, the first thing to try
is `__heysLogControl.reset()`.

**If `reset()` doesn't seem to help** (you still see `ews / detect`,
`[MEALREC]`, `[HEYS.prodRec]`, `[HEYS.api] REST/RPC` floods after reload), nuke
the stored groups directly — the in-memory reset is sometimes overridden by
stale localStorage:

```js
localStorage.removeItem('heys_log_groups_v1');
localStorage.removeItem('heys_log_verbose');
location.reload();
```

This guarantees the next boot uses the hardcoded `DEFAULT_LOG_GROUPS` from
`index.html` (`['startup', 'sync']`).

**Available groups** (from [index.html](apps/web/index.html)
`PREFIX_GROUP_MAP`):

- `startup` — boot lifecycle (`[HEYS.startup]`, `[HEYS.entry]`, `[APP]`,
  `[DEPS]`)
- `sync` — sync engine + day-trace + product traces (`[HEYS.sync]`,
  `[HEYS.products]`, `[HEYS.day-trace]`, `[HEYS.addProduct]`,
  `[HEYS.dayRealData]`)
- `cloud` — cloud routing/save logs (`[HEYS.cloud]`, `[HEYS.cloud:ERR]`)
- `api` — REST/RPC traffic (`[HEYS.api]`) — **chatty: 50+ per sync cycle**
- `day` — DayTab logs (`[HEYS.day]`, `[HEYS.calendar]`, `[PullRefresh]`)
- `products` — product/portion/preset detail logs (`[HEYS.portions]`,
  `[HEYS.presets]`, `[HEYS.prodRec]`, `[GramsStep]`, `[HarmSelectStep]`, etc)
- `photos`, `sw`, `platform`, `perf`, `insights`, `ui` — niche modules

**Default enabled in production**: `['startup', 'sync']` — covers boot +
day-trace + products + sync engine.

To make a custom prefix visible by default in dev sessions, register it in
[index.html](apps/web/index.html) → `PREFIX_GROUP_MAP` (mapping like
`'[HEYS.day-trace]': 'sync'` makes it appear with the always-on `sync` group).

### Quiet mode (for when you don't need diagnostic logs)

```js
window.__heysLogControl.only('startup'); // boot lifecycle only
```

This silences day-trace, sync engine, products — useful for performance work or
screen recording.

To go back to the standard debug view:

```js
window.__heysLogControl.reset();
```

### Day-trace pipeline (1/8 → 8b/8)

When investigating "added product disappears" or similar dayv2 races, the key
trace points are:

| #      | Stage                         | File                                                                                   | Shows                                                                                                                      |
| ------ | ----------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 0      | GramsStep button click        | [heys_add_product_step_v1.js](apps/web/heys_add_product_step_v1.js) `handleSubmit`     | confirms the **modal's green ✓ button** was actually pressed (not some other UI path)                                      |
| 1      | `handleAdd` entry             | [heys_day_add_product.js](apps/web/heys_day_add_product.js) `handleAdd`                | product+mealIndex received in MealAddProduct callback                                                                      |
| 3      | Item built                    | same                                                                                   | `newItem` shape with all nutrient fields inlined                                                                           |
| 4      | `setDay` applied              | same                                                                                   | `itemsBefore → itemsAfter` inside React state callback                                                                     |
| 4b     | requestFlush                  | same                                                                                   | what `HEYS.Day.getDay()` (ref) sees just before flush is scheduled                                                         |
| 4d     | flush picked ref over closure | [heys_day_core_bundle_v1.js](apps/web/heys_day_core_bundle_v1.js) `flush`              | **fires only when race-recovery kicks in** — closureItems vs refItems mismatch                                             |
| 4c     | inside flush about to write   | same                                                                                   | what flush is actually about to persist (effDay)                                                                           |
| 5      | LS write (saveToDate)         | same                                                                                   | `lsSetFn(key, payload)` invoked                                                                                            |
| 5b     | LS interceptor                | [heys_storage_supabase_v1.js](apps/web/heys_storage_supabase_v1.js) `interceptSetItem` | every `localStorage.setItem` for `dayv2_*` (with stack trace via `console.warn`) — catches stray writers like gamification |
| 6a     | cloud queue enqueue           | same `enqueueClientUpsertForUpload`                                                    | dayv2 entering pending upload queue                                                                                        |
| 6b     | saveClientKey direct          | same `cloud.saveClientKey`                                                             | direct API entry (rare for dayv2; usually interceptor catches first)                                                       |
| 6c-pre | batch reaches outbound        | same `doClientUpload`                                                                  | unconditional log right before `[SYNC] → отправка`                                                                         |
| 6c     | batch upload outbound         | same                                                                                   | actual dayv2 keys leaving for cloud                                                                                        |
| 7      | boot LS read                  | [heys_day_core_bundle_v1.js](apps/web/heys_day_core_bundle_v1.js) `doLocal`            | what came back from localStorage on refresh                                                                                |
| 8      | day-updated event             | same `handleDayUpdated`                                                                | `heys:day-updated` event from sync/external source                                                                         |
| 8b     | day applied (state replaced)  | [heys_day_effects.js](apps/web/heys_day_effects.js) (synced into core bundle)          | final React state replacement after external update                                                                        |

### Diagnosing where data is lost

Compare `totalItems` across the chain. The boundary where it shrinks reveals the
bug:

- `4` shows N+1, `5b` shows N → some code wrote a stale snapshot between setDay
  and flush. Add stack trace to `5b` (`console.warn` with `new Error().stack`)
  and look for non-flush writers.
- `5b` shows N+1, `7` (after refresh) shows N → cloud is overwriting LS via
  HOT-sync. Check `applyForegroundHotSyncValue` guards.
- `4` shows N+1, `4c` not fired → flush exits via guard. Inspect closure vs ref
  drift via `4d`. If drift detected, `flush` should `force = true` to bypass
  guards.

### Common gotchas in this codebase

1. **Service Worker / Vite cache** can serve stale bundles. After
   `pnpm bundle:legacy`, restart `pnpm dev:local` (in-memory cache) or use
   **Incognito** (no SW).
2. **Bundle hash in DOM ≠ executed code** — verify with
   `fetch('/boot-core.bundle.<hash>.js').then(r=>r.text()).then(t => t.includes('your_string'))`
   or use `XMLHttpRequest` synchronously to inspect what the dev-server actually
   delivers.
3. **Logs not appearing** — most likely the prefix isn't in `PREFIX_GROUP_MAP`
   or its group isn't enabled. Use `window.__heysNativeConsole.error(...)` to
   bypass filtering.
4. **Closure drift in React `useCallback`** is a recurring pattern when
   callbacks are scheduled via `setTimeout`/`requestAnimationFrame` outside
   React's commit phase. Always prefer `dayRef.current` (`HEYS.Day.getDay()`)
   over closure-captured `day` for late-firing writes.
5. **`localStorage.setItem` is intercepted** by `heys_storage_supabase_v1.js`
   and patched at IIFE load time. Direct usage of `originalSetItem.bind(...)`
   (e.g. `cloud.writeLocalKvWithoutMirror`) bypasses the interceptor — when
   tracing, patch `Storage.prototype.setItem` to catch all writers.
