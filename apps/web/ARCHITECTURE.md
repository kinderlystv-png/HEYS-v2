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

### Navigating `heys_storage_supabase_v1.js` (~13k LOC)

This file is huge and gets re-read across sessions. Don't load the whole file —
jump straight to the area:

| Area                                     | Approx line | What's there                                                             |
| ---------------------------------------- | ----------- | ------------------------------------------------------------------------ |
| Constants / setup                        | 1-600       | `CLIENT_SPECIFIC_KEYS`, RPC tail constants, helpers                      |
| Queue / pending                          | 1500-3500   | `enqueueClientUpsertForUpload`, `flushPendingQueue`, persistence         |
| `interceptSetItem`                       | 3800-4200   | Universal LS hook: cloud-canonical gate, overlay guard, legacy mirror    |
| `safeSetItem`                            | 4400-4700   | 3-tier reactive recovery on quota errors                                 |
| Phase A / full-sync guards               | 6300-6800   | Profile-empty guards (Phase A 6397, full-sync 6700)                      |
| Delta-light                              | 8100-8300   | `delta-light` profile guard 8174                                         |
| `applyForegroundHotSyncValue`            | 10700-11000 | HOT-sync per-key router; overlay branch ~10791                           |
| `dispatchForegroundHotSyncProfileEvents` | nearby      | Auto-dispatch `heys:*-updated` events                                    |
| `cloud.saveClientKey`                    | 9800-10100  | Direct save API; `isValidProfile` guard at 9893                          |
| `cloud.switchClient`                     | 12100-12400 | Client switching: emit stages, flush queue, cleanup other-client LS keys |

Use `grep -n 'function name'` to find exact lines — addresses drift with edits.

---

## Day / meal feature ownership

When working on the diary / meal-add / meal-edit flow, these files own what:

| File                                                             | Owns                                                                                           |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [day/\_meals.js](day/_meals.js)                                  | Meal rendering, meal-row UI, meal calculations. **SOURCE** for `heys_day_meals_bundle_v1.js`.  |
| [day/\_advice.js](day/_advice.js)                                | Advice toasts on day tab. **SOURCE** for `heys_advice_bundle_v1.js`.                           |
| [heys_day_core_bundle_v1.js](heys_day_core_bundle_v1.js)         | `useDayAutosave`, `flush`, day-trace pipeline (4c, 5)                                          |
| [heys_day_add_product.js](heys_day_add_product.js)               | `handleAdd` for meal-add; `MealAddProduct` callback                                            |
| [heys_add_product_step_v1.js](heys_add_product_step_v1.js)       | Add-product modal: search, grams, harm-select, portions sync                                   |
| [heys_day_copy_meal_modal_v1.js](heys_day_copy_meal_modal_v1.js) | Copy-meal modal: target picker, gram tweaks, calorie preview                                   |
| [heys_day_effects.js](heys_day_effects.js)                       | Day state replacement after external update (`heys:day-updated` listener)                      |
| [heys_day_utils.js](heys_day_utils.js)                           | `autoRecoverOnLoad`, day-key parsing, scoped read helpers                                      |
| [heys_gamification_v1.js](heys_gamification_v1.js)               | XP/missions writes that touch `dayv2` — **gotcha source** (see day-write race in BUGS_HISTORY) |

**Important**: `heys_day_bundle_v1.js`, `heys_day_meals_bundle_v1.js`,
`heys_advice_bundle_v1.js` are **auto-generated** from `day/*.js` via
`apps/web/scripts/bundle-day.cjs` and `bundle-meals.cjs`. Direct edits to the
bundle files will be overwritten on next `pnpm bundle:legacy`. Edit [day/](day/)
sources only.

---

## Meal Planner card (badge «Планнер» в Дневнике)

Карточка `MealRecCard` в diary-секции — мульти-приём рекомендер на оставшийся
день до сна. Подключена через `HEYS.MealRecCard.renderCard()` между `refeedCard`
и `supplementsCard` ([heys_day_diary_section.js](heys_day_diary_section.js)).

### Слои

1. **UI**: [insights/pi_ui_meal_rec_card.js](insights/pi_ui_meal_rec_card.js)
   - `buildRecommendationContext(day, dayTot, normAbs, prof, optimum, pIndex)` —
     собирает context.
   - **Не рендерит карточку для прошлых дат** (`day.date !== todayISO()`):
     `currentTime = new Date()` не имеет смысла для исторических записей.
2. **Recommender**:
   [insights/pi_meal_recommender.js](insights/pi_meal_recommender.js)
   - `recommendNextMeal(context, profile, pIndex, days)` — single-meal scenario
     detection + multi-meal mode по условию.
   - Вызывает planner если `days.length >= 3` И есть `planRemainingMeals`.
   - После planner — **двусторонний timing sync** (`timingRec.idealStart` ←
     `meals[0].timeStart`).
3. **Planner**: [insights/pi_meal_planner.js](insights/pi_meal_planner.js)
   - `planRemainingMeals({...})` → `{ available, meals[], summary }` или
     `{ available: false, error: 'NO_TARGET'|'InsulinWave module missing'|... }`.
   - `replanRemainingMeals(...)` — incremental с поддержкой `lockedMeals`.

### Источники истины

| Поле                     | Источник                                                                                             | Замечания                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------- |
| `currentTime`            | `new Date()`                                                                                         | Только для сегодняшнего `day.date`.                                                        |
| `lastMeal`               | `day.meals` отсортированы по `time` ASC, берётся последний                                           | Сортировка обязательна — meals могут быть not-in-order.                                    |
| `dayEaten`               | Пересчитан из `day.meals` через `HEYS.models.mealTotals`                                             | Не доверяем входному `dayTot` — может отстать в гонке add/remove.                          |
| `dayEaten` + supplements | `day.supplements[*]` с `macros`/`totals`/`nutrition` (не `taken=false`)                              | Без этого протеиновый шейк не считается.                                                   |
| `dayTarget.kcal`         | `optimum                                                                                             |                                                                                            | normAbs.kcal` | `optimum` уже включает workout boost и refeed-надбавку из [heys_day_stats_vm_v1.js](heys_day_stats_vm_v1.js). |
| `sleepTarget`            | приоритет: `day.sleepStart` → среднее из истории `days[].sleepStart` → `profile.sleepTarget` → 23:00 | Кластеризация до/после полуночи в `estimateSleepTarget` (избегаем смешения 23:50 и 01:30). |
| `profile.weight`         | `getWeightKg(profile)`: weight → weightKg → bodyMassKg → 70                                          | Для MPS и POST_WORKOUT (Areta 2013, Ivy 2004).                                             |

### Адаптивные ветви

- **Late dinner → morning**: если `lastMeal.time >= 20:00` И
  `currentTime < 12:00`, волна сбрасывается (`hasLastMeal = false`) — это новый
  день.
- **Hunger trade-off** (Kinsey & Ormsbee 2015): дефицит ≥800 ккал → буфер до сна
  1.5ч; ≥400 → 2ч; <400 + ≥2ч до сна → одиночный лёгкий белковый приём (15-25г,
  ~150 ккал).
- **Fasting window** (`profile.fastingWindow = { eatStart, eatEnd }`): первый
  приём не раньше `eatStart`.
- **forceMultiMeal** (остаток >900 ккал): gap = `max(2ч, 0.75 × estimatedWave)`
  — wave-aware, не фиксированные 2ч.

### Сценарии (R4-обновлено)

Порядок проверки в `analyzeCurrentContext`:

1. GOAL_REACHED — цели достигнуты
2. PRE_WORKOUT — тренировка ≤2ч впереди
3. POST_WORKOUT — тренировка ≤2ч назад (полный режим)
4. LIGHT_SNACK — мало бюджета
5. LATE_EVENING — после `lateEatingHour` 5.5. **MOOD_SUPPORT_BREAKFAST** (R4-5)
   — mood ≤2 + утро (<11:00) → триптофановые продукты
6. STRESS_EATING — stress ≥4 OR mood ≤2 (после морнинга) 6.5.
   **MICRONUTRIENT_FOCUS** (R4-4) — 2+ серьёзных дефицита (iron/Mg/Zn/Ca <50%),
   не последний приём
7. PROTEIN_DEFICIT — белок <50% от цели
8. BALANCED — fallback

### Recovery factor после тренировки (R4-8)

```
0-2ч:    POST_WORKOUT scenario (0.35 г/кг прот + 1.0 г/кг карб → meal[0])
2-6ч:    MPS_PROT_PER_KG × 1.15 (strength) / 1.05 (cardio) / 1.10 (mixed)
6-12ч:   MPS_PROT_PER_KG × 1.10
12-24ч:  MPS_PROT_PER_KG × 1.05
24ч+:    baseline
```

### Advisories (R4-6)

Planner возвращает `summary.advisories[]` с soft-рекомендациями по паттернам:

- `wave_overlap` — если juvel ест до окончания волны >40% дней истории
- `high_stress` — при высоком стрессе текущего дня

UI рендерит в раскрытой карточке как `meal-rec-card__advisory` блоки.

### Что НЕ учитывается (намеренно или roadmap)

- Привычное персональное время приёмов (chrono-pattern detection).
- Различие типов тренировок (силовая vs кардио).
- Активность днём кроме явных `day.workouts`.
- Food-from-pantry / time-to-cook / стоимость / кофеин.
- Cloud-sync текущего плана между устройствами.

См. roadmap в [todo.md](../../todo.md) (раздел «Meal Planner roadmap»).

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
