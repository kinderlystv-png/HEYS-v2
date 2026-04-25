# HEYS-v2 — project instructions

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
  (heys_app_tabs_v1.js) after orphan-recovery. v2 logic links by
  fingerprint→name fallback when `shared_origin_id` missing.

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

- `apps/web/heys_products_overlay_v1.js` — OverlayStore, migrate(), verifier,
  diagnostics, BroadcastChannel cross-tab.
- `apps/web/heys_core_v12.js` — `installOverlayWrapper` (getAll/getById flag
  gate), `setAll` callsite still entry point for legacy writes.
- `apps/web/heys_storage_supabase_v1.js` — `cloud.getSharedIndex()`,
  `interceptSetItem` universal dual-write hook, HOT-sync anti-shrink for
  products.
- `apps/web/heys_app_tabs_v1.js` — `runOverlayMigrationOnce` boot trigger.
- `scripts/lint-shared-cache-writes.mjs` — pre-commit gate ensuring
  `_sharedProductsCache =` always pairs with `_invalidateSharedIndex()`.

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
