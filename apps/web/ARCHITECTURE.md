# HEYS-v2 — Architecture reference

Stable architecture facts. Project-status / TODO lives in
[todo.md](../../todo.md). Bug post-mortems in
[BUGS_HISTORY.md](BUGS_HISTORY.md). Debugging procedures in
[DEBUGGING.md](DEBUGGING.md).

---

## Products storage (overlay)

`heys_products` is no longer a denormalized snapshot per client. Canonical
reader is **`HEYS.OverlayStore` merged view** in
[heys_products_overlay_v1.js](heys_products_overlay_v1.js), gated by feature
flag `overlay_products_v2` (default `true`).

- **Source of truth for nutrient data**: `shared_products` (cloud catalog, ~364
  entries, full schema with iron/calcium/vitamins).
- **Per-user overlay** (`heys_products_overlay_v2` LS key, scoped per client):
  array of `{id, shared_origin_id, overrides:{}, in_my_list:bool}` (TypeA links
  to shared catalog) + `{id, _custom:true, ...full}` (TypeB custom-only rows).
- **`HEYS.products.getAll()`** is wrapped in
  [heys_core_v12.js](heys_core_v12.js) by `installOverlayWrapper`: with flag on
  returns merged view (shared + per-user overrides); off falls through to legacy
  `_origGetAll`.
- **Legacy `heys_products` LS key** is still dual-written via `interceptSetItem`
  in [heys_storage_supabase_v1.js](heys_storage_supabase_v1.js) for backward
  compat. Retirement is Phase 3 — see [todo.md](../../todo.md) «Legacy
  heys_products».
- **Migration** (one-shot, idempotent via `heys_overlay_migrated_at` +
  `heys_overlay_migration_version`): runs in `runOverlayMigrationOnce`
  ([heys_app_tabs_v1.js](heys_app_tabs_v1.js)) after orphan-recovery. v4 logic
  links by fingerprint→name fallback when `shared_origin_id` missing;
  `overlayBigger` branch self-heals TypeA duplicates by `shared_origin_id` and
  stamps `heys_overlay_self_healed_at`.

### Sync architecture

Cloud is the single source of truth. Single cloud entry point for products is
`HEYS.OverlayStore.applyCloudSnapshot(rows, opts)`. It:

- Dedupes incoming TypeA by `shared_origin_id` (not just `id`)
- Filters tombstones (`heys_deleted_ids` by id+name)
- Preserves pending-local TypeB customs not yet propagated to cloud
- Writes via `writeRaw(merged, { skipCloudSync: true })`
- Returns `{ applied, before, after, pendingCustoms }`

Key guarantees:

- **`upsertRow` dedupes TypeA by `shared_origin_id`** — stops duplicate
  accumulation at the source.
- **`addFromShared` checks via `readRaw()`** — independent of shared cache
  readiness; eliminates the race that earlier caused 3-5 TypeA dupes per shared
  product on boot.
- **`writeRaw(rows, opts)` auto-syncs to cloud** (debounced 2s) for any local
  mutation. Pass `opts.skipCloudSync: true` for restore paths to avoid cloud →
  LS → cloud round-trips.
- **HOT-sync includes `heys_products_overlay_v2`** in `CLIENT_SPECIFIC_KEYS`.
  Deletions on one device propagate to others without waiting for full
  bootstrap.
- **`applyForegroundHotSyncValue`** has a dedicated overlay branch that routes
  overlay-key payloads through `applyCloudSnapshot`, not the legacy bridge.
- **BroadcastChannel cross-tab** carries `clientId`; receivers ignore foreign
  clientId messages (prevents curator-tab + PIN-tab interference).

Boot order:

1. shared catalog ready
2. `applyCloudSnapshot` from cloud
3. orphan recovery — only TypeB customs from diary, **skipped for curator
   sessions** to avoid cross-client stamp pollution

### PIN vs curator session

Products data is loaded identically. No migration top-up from legacy
`heys_products`.

| Aspect                     | PIN                                                        | Curator                                                             |
| -------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------- |
| Cloud entry                | `applyCloudSnapshot`                                       | same                                                                |
| Migration on boot          | skipped if overlay non-empty (cloud-canonical)             | same                                                                |
| HOT-sync overlay key       | yes (`heys_products_overlay_v2` in `CLIENT_SPECIFIC_KEYS`) | same                                                                |
| BroadcastChannel           | clientId-isolated                                          | same                                                                |
| `addFromShared` race       | `readRaw()` check, independent of shared cache             | same                                                                |
| Orphan recovery from dayv2 | runs (only TypeB customs)                                  | **skipped** — curator's dayv2 scan would pull foreign-client stamps |
| RationTab content          | personal subtab only                                       | personal + shared catalog + moderation subtabs                      |
| Auto-sync of writes        | debounced 2s via `writeRaw`                                | same                                                                |

Orphan-recovery gate uses `HEYS.auth.isCuratorSession()` (with `HEYS.Bootstrap`
and `window.isCuratorSession` fallbacks).

### Why cloud-canonical (not "merge from legacy on boot")

Migration TOP-UP path was the primary corruption source. When LS overlay was
small (e.g. fresh incognito boot at 12 rows mid-bootstrap) and legacy was large
(e.g. 150 rows from a stale snapshot), TOP-UP would push the legacy 150 into
overlay, then push that 150 to cloud — clobbering the real 297-row overlay
there. Removed entirely. If overlay LS has rows → trust cloud snapshot, never
repopulate from legacy. The interceptor's cloud-canonical gate
(`interceptSetItem` `_overlayCanonical` check) blocks legacy → overlay migration
paths when overlay is non-empty.

### Diagnostics

- `HEYS.diagnostics.overlay()` — current state (flag, overlay/legacy length,
  type A/B counts, health metric).
- `HEYS.diagnostics.benchOverlay(200)` — cold/warm timing of merged view.
- `HEYS.diagnostics.relinkOverlay()` — manual re-migration.
- `HEYS.diagnostics.retryOverlayMigration()` — clear migration markers; reload
  retries.
- `HEYS.flags.disable('overlay_products_v2')` — kill-switch (instant memo
  invalidation; reverts read-side to legacy).

### Critical files (products)

| File                                                                               | Owns                                                                                                              |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [heys_products_overlay_v1.js](heys_products_overlay_v1.js)                         | OverlayStore (readRaw, writeRaw, applyCloudSnapshot, upsertRow, BroadcastChannel, migrate, verifier, diagnostics) |
| [heys_core_v12.js](heys_core_v12.js)                                               | `installOverlayWrapper`, `addFromShared`, `deduplicate`, `RationTab` subtab gate                                  |
| [heys_storage_supabase_v1.js](heys_storage_supabase_v1.js)                         | `cloud.getSharedIndex`, `interceptSetItem`, `applyForegroundHotSyncValue` overlay branch, `CLIENT_SPECIFIC_KEYS`  |
| [heys_app_tabs_v1.js](heys_app_tabs_v1.js)                                         | `runOverlayMigrationOnce` boot trigger, curator-session orphan-recovery gate, migration v4 self-heal              |
| [heys_day_utils.js](heys_day_utils.js)                                             | `autoRecoverOnLoad` scopes dayv2 scan to current clientId                                                         |
| [scripts/lint-shared-cache-writes.mjs](../../scripts/lint-shared-cache-writes.mjs) | pre-commit gate: `_sharedProductsCache =` always pairs with `_invalidateSharedIndex()`                            |

---

## Storage management (registry + enforce)

[heys_storage_registry_v1.js](heys_storage_registry_v1.js) is the single source
of truth for `localStorage` policies.

- **Phase 2b enforce mode** behind `storage_audit_enforce` flag (default
  `false`). Flip to `true` via `HEYS.flags.enable('storage_audit_enforce')`
  after reviewing pending log. `cloudSync:'merge'` keys (insights_feedback,
  hidden_products) are NOT enforced — deferred to Phase 5 cloud-merge.

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
HEYS.storageRegistry.match(key);
HEYS.storageRegistry.analyze(key, rawValue);
HEYS.storageRegistry.list();
```

### Storage diagnostics

- `HEYS.diagnostics.storageAudit({ redact: true, topN: 20 })` — totals, top-N,
  unknown keys (no policy), violations, recent audit log. Read-only.
- `HEYS.diagnostics.runStorageAuditNow({ bypassLock? })` — trigger on demand;
  enforce mode actually deletes/prunes.
- `HEYS.diagnostics.storageAuditPending()` — view Phase 2a shadow proposals.
- `HEYS.diagnostics.restoreAuditDeletion(key)` — restore from 24h recycle bin.
- `HEYS.diagnostics.storagePolicy(key)` — inspect a single key's policy.
- `HEYS.diagnostics.browserStorageEstimate()` — `navigator.storage.estimate()`.
- `HEYS.storageRegistry.isCleanupActive()` — true if another tab mid-cleanup.

### Direct-write lint gate

[scripts/lint-direct-localstorage-writes.mjs](../../scripts/lint-direct-localstorage-writes.mjs)
scans for direct `localStorage.setItem`, checks against
[scripts/bootstrap-bypass-allowlist.txt](../../scripts/bootstrap-bypass-allowlist.txt).
Wired into `.husky/pre-push`.

- Warn-only mode: allowlisted sites → stderr warnings; exit 0. New (unlisted)
  sites → exit 1 → blocks push.
- Strict mode: `--strict` treats warnings as errors.
- Allowlist format: `relative/path:lineNumber` per line, `#` = comment.
- Excluded from scan: `heys_storage_supabase_v1.js` (interceptor),
  `heys_storage_registry_v1.js` (audit infra), generated bundles
  (`heys_advice_bundle_v1.js`, `heys_day_bundle_v1.js`,
  `heys_day_meals_bundle_v1.js`).

### Hard never-touch allowlist

`analyze()` refuses these regardless of matching policy:

- `heys_supabase_auth_token`
- `heys_pin_auth_client`
- `^sb-` (Supabase session keys)

Phase 2+ audit strategies skip them.

### Critical files (storage)

| File                                                                           | Owns                                                                                  |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| [heys_storage_registry_v1.js](heys_storage_registry_v1.js)                     | Registry + diagnostics                                                                |
| [heys_storage_layer_v1.js](heys_storage_layer_v1.js)                           | `Store.set/get`; compression `'¤Z¤'` prefix                                           |
| [heys_storage_supabase_v1.js](heys_storage_supabase_v1.js)                     | Cloud side: `safeSetItem` 3-tier reactive recovery, `interceptSetItem` universal hook |
| [insights/pi_feedback_loop.js:534-549](insights/pi_feedback_loop.js#L534-L549) | Canonical `pruneHistoryToStorageBudget` (sliding-window)                              |
| [insights/pi_feedback_loop.js:573-596](insights/pi_feedback_loop.js#L573-L596) | Canonical `trimLegacyRecords` (schema upgrader)                                       |

---

## Database schema

Production: Yandex Cloud Managed Postgres (`heys-production` cluster).

### `client_kv_store` (per-client storage)

- PK `(client_id, k)` + FK `client_id → clients(id) ON DELETE CASCADE` (added
  2026-05-11 migration)
- Trigger `trg_bump_change_marker AFTER INSERT/DELETE/UPDATE FOR EACH ROW` →
  calls `fn_bump_change_marker()` which UPSERTs into `client_change_markers`
  with scope derived from key naming (`day:YYYY-MM-DD`, `widgets`, `profile`,
  `norms`, `hr_zones`, `products`, `other`)
- Trigger function has EXISTS guard against orphan client_id (defense in depth)

### FK contract — clients(id)

11 tables FK to `clients(id)` with `ON DELETE CASCADE` (consents, payments,
client*sessions, subscriptions, trial_queue, ews_weekly_snapshots,
leaderboard*\*, client_change_markers, pending_products, client_kv_store).
`leads` uses `ON DELETE SET NULL`.

→ DELETE FROM clients caskades everywhere; no orphan data accumulates.

### Migrations

- Directory: [database/](../../database/) — files `YYYY-MM-DD_<desc>.sql`,
  applied via `psql -f --single-transaction`
- Production migrations subset:
  [yandex-cloud-functions/migrations/](../../yandex-cloud-functions/migrations/)
- No rollback support — forward-only
- Apply pattern: see memory `reference_db_migration.md`
