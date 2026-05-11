# HEYS-v2 — Bug post-mortems

Reference of past root-cause analyses. The architecture docs (
[ARCHITECTURE.md](ARCHITECTURE.md), [DEBUGGING.md](DEBUGGING.md)) describe
**current** invariants. This file describes **how we got there** — what was
broken, what was fixed, and the pattern to watch for.

---

## Day-write race fix (2026-04-26)

Symptom: adding a product to a meal silently disappeared after refresh.

**Double race condition**:

1. **`flush()` closure-drift** in `useDayAutosave`
   ([heys_day_core_bundle_v1.js:2286](heys_day_core_bundle_v1.js#L2286)). React
   `useCallback` captured `day` via closure with `[day, ...]` deps. After
   `setDay(prev → newDay)` `addProductToMeal` scheduled `flush()` via
   `requestAnimationFrame(setTimeout(.., 50ms))`, but React commit hadn't
   propagated to closure → flush saw stale `day` → exited via guard
   `freshestDaySnap === daySnap` without writing.

   **Fix**: flush now reads `HEYS.Day.getDay()` (ref-based via `dayRef.current`)
   and prefers it when newer, with `force = true` to bypass downstream guards.

2. **Gamification overwrite**
   ([heys_gamification_v1.js:2270, :2549](heys_gamification_v1.js)). On
   `heysProductAdded` → `addXP → updateDailyMission/getDailyMissions` read
   `dayv2` from LS (stale, without the freshly added product), patched
   `dailyMissions` field, then wrote the entire object back — clobbering the
   user's add.

   **Fix**: re-read LS immediately before each `setStoredValue(dayKey, ...)` and
   merge only `dailyMissions` field on top of the freshest snapshot.

Both fixes needed together — fixing only one leaves the other path open.

**Pattern to watch**: callbacks scheduled outside React's commit phase
(`setTimeout`/`requestAnimationFrame`) capture closures that may be stale by the
time they fire. Always prefer ref-based reads (`dayRef.current`,
`HEYS.Day.getDay()`) over closure-captured state for late-firing writes.

---

## State-sync clobber pattern (2026-05-08)

A recurring class of bug across multiple LS-backed user-state keys.

**The pattern**:

1. Module A explicitly writes a shared LS key (e.g. `saveProfileSafe` in
   supplements writing `heys_profile`).
2. Module A dispatches a NARROW event (e.g. `heys:supplements-updated`) but not
   the broader `heys:profile-updated`.
3. React component B (e.g. `UserTabBase` in
   [heys_user_v12.js](heys_user_v12.js)) holds the same key in React state and
   listens ONLY for the broader event.
4. Component B's stale state isn't refreshed.
5. User edits any field in component B → its debounced auto-save (300ms for
   norms, 1000ms for profile/zones) writes the ENTIRE stale state back, with a
   fresh `updatedAt` → uploaded to cloud, clobbering writer's changes.

Symptom: a setting silently reverts after the user touches an unrelated field in
the user tab — sometimes minutes later, sometimes after sync roundtrip from
another device.

**Confirmed via cloud audit** for `plannedSupplements`:
`profile.plannedSupplements: []` while
`dayv2.supplementsPlanned: ["omega3","b12"]` persisted in day data — the plan
was actively synced to days but the profile field was overwritten.

**Fix template** (applied to `heys_profile`, `heys_norms`, `heys_hr_zones`):

1. **Writer side** — every explicit writer dispatches the canonical event
   (`heys:<key>-updated`) immediately after LS write. Detail object:
   `{ field?, fields?, source }`.
2. **HOT-sync interceptor** — `dispatchForegroundHotSyncProfileEvents` in
   [heys_storage_supabase_v1.js](heys_storage_supabase_v1.js) automatically
   dispatches the event whenever HOT-sync writes the key — covers cross-device
   cloud sync without each writer having to know.
3. **Listener side** — every component holding the key in React state subscribes
   to `heys:<key>-updated` and refreshes via `updatedAt` timestamp compare
   (`prevTs > newTs ? prev : incoming`) so concurrent user edits don't get
   clobbered by older external writes.

**Adding a new shared LS-backed setting** — verify:

1. Search for `setTimeout` + `lsSet`/`writeStoredValue` near the new key —
   that's the auto-save site.
2. Confirm there's a paired `addEventListener('heys:<key>-updated')` that
   refreshes state.
3. Confirm every external writer dispatches `heys:<key>-updated`.
4. If HOT-sync syncs the key, extend `dispatchForegroundHotSyncProfileEvents`.

**Already-vulnerable spots** (audit 2026-05-08):

- `heys_grams_history` — multiple meal-module writers, no event dispatch. Safe
  today (no React-state holder) but track if a future component caches it.
- Legacy `heysAdviceSettingsChanged` event naming — should rename to
  `heys:advice-settings-updated` if a listener is ever added.

---

## Morning-checkin scoped profile race (2026-05-08)

Symptom: `shouldShowMorningCheckin`
([heys_morning_checkin_v1.js](heys_morning_checkin_v1.js) ~600) у давних
клиентов на холодной загрузке мог открывать регистрационный визард на долю
секунды, хотя профиль в облаке полный.

**Root cause — race в наполнении scoped LS**: на ранней стадии boot ключ
`heys_${clientId}_profile` содержит ТОЛЬКО subscription-секцию профиля
(`subscription_status`, `trial_started_at`, `trial_ends_at`,
`subscription_ends_at` — 4 поля, ~171 байт) ДО того как Phase A / full-sync
принесут полный профиль (12 полей, ~1192 байт с `firstName`, `age`, `weight`,
`height`, `profileCompleted: true`). `shouldShowMorningCheckin` срабатывает в
этом окне → `isProfileIncomplete` возвращает true → wizard открывается.

Кто пишет subscription-only snapshot — точно неизвестно (stack trace в
`cloud.saveClientKey` пустой, значит запись идёт мимо canonical save-path),
вероятно через `interceptSetItem` mirror logic или subscription/trial init. Это
open question, но фикс работает независимо.

**Защита (3 слоя)**:

1. **`readProfileForceRawScoped`**
   ([heys_morning_checkin_v1.js:44](heys_morning_checkin_v1.js#L44)) +
   inline-копия в
   [heys_app_morning_checkin_v1.js:10](heys_app_morning_checkin_v1.js#L10).
   Используют `isProfileShape()` критерий:
   `(p.age || p.weight || p.height || p.firstName || p.profileCompleted === true)`
   — идентичный HOT-sync guard в `cloud.saveClientKey` ~9893. Subscription-only
   возвращается как `null`, fallback на legacy `heys_profile`.

2. **`shouldShowMorningCheckin` defer-guard**
   ([heys_morning_checkin_v1.js:590](heys_morning_checkin_v1.js#L590)). Если
   scoped LS имеет subscription-маркеры но НЕ имеет personal-маркеров,
   возвращаем `false` (sync in progress) — wizard НЕ открывается. Time-based
   ограничение 8 секунд от `cloud._syncCompletedAt`: для новых клиентов без
   cloud-профиля subscription-only состояние permanent → после 8s defer не
   блокирует. Лог:
   `[MorningCheckin] 🛡️ partial subscription-only profile — sync in progress, deferring wizard`.

3. **Phase A / full-sync / delta-light guards** в
   [heys_storage_supabase_v1.js](heys_storage_supabase_v1.js) (~6397, ~6700,
   ~8174). Не клобберим валидный local профиль пустым `{}` из cloud при синке —
   симметрично с уже существующим guard в `cloud.saveClientKey` (~9893). Лог:
   `🛡️ [PHASE A]/[DELTA LIGHT]/[FULL SYNC] BLOCKED empty profile from cloud`.

**Если симптом возвращается** — раскомментировать debug-лог в
`readProfileForceRawScoped`:
`console.error('[MorningCheckin] readProfileForceRawScoped DIAG', ...)`. По
полям видно стадию race'а: `scopedKeys: 4` subscription-only / `scopedKeys: 12`
полный.

**Cleanup poisoned scoped LS** (если у пользователя застрял bad state):

```js
localStorage.removeItem(`heys_${HEYS.currentClientId}_profile`);
location.reload();
```

---

## Legacy `heys_products` retirement (2026-05-10 / 2026-05-11)

**Goal**: убрать второй ключ `heys_products` после rollout overlay v2 как
canonical source. Phase 1-2в выполнены.

**Phase 1** (commit `52386c97`): убраны fallback reads
`|| lsGet('heys_products', [])` в 11 файлах.

**Phase 1б** (commit `fabb56f7`): фикс orphan-recovery bug (читал из legacy
вместо overlay).

**Phase 2а** (commit `fabb56f7`): удалены dead `else lsSet` branches в 2 файлах.

**Phase 2б** (commit `4b78dcc8`): removed 13 dead `else lsSet` write cascade
branches across `heys_core_v12.js`, `heys_add_product_step_v1.js`. Atwater
migration switched to overlay API.

**Phase 2в** (commit `2796d4da`):

- `heys_app_auth_init_v1.js` — `heys_products` removed from PIN-auth
  `keysToMigrate`
- `heys_app_sync_effects_v1.js` — added `overlay_products_v2` flag guard around
  `saveClientKey('heys_products', ...)` debounced effect
- `heys_app_backup_v1.js` — backup read switched to `HEYS.products.getAll()`,
  restore goes through `setAll()`

**Seed-fix** (commit `f6415481`): `initLocalData` + sync rollback path stopped
seeding React state from legacy `heys_products` LS. This was the root cause of
curator/PIN tab showing 390/443 products when canonical was 367 — stale cloud
legacy mirror (last updated 2026-05-09) was hydrating React state at boot, then
overlay overwriting, then stale path firing again.

**Cloud cleanup 2026-05-11**:

- Удалены данные 48 orphan client_ids (3.2 MB) — заархивированы в
  `client_kv_store_archive_20260511`
- У 2-х активных клиентов удалён stale legacy `heys_products`
- У одного клиента `heys_hidden_products` (300 объектов, 433 KB — багованный
  формат) сконвертирован в правильный массив ID (289 строк, 7 KB)

**Pattern uncovered**: stale cloud data + interceptor that mirrors current →
legacy can recreate phantom "old version" for years after canonical migration.
Migrating code is not enough — need to clean source data too.

**Remaining (Phase 3)**: remove interceptor block in
`heys_storage_supabase_v1.js` (~lines 4022-4155), fix `initLocalData` to read
overlay LS key directly (before wrapper loads), retire `dual_write_legacy`
feature flag. See [todo.md](../../todo.md) «Legacy heys_products».

---

## Orphan data leak in `client_kv_store` (2026-05-11)

Symptom: 48 client_ids accumulated ~3.2 MB of data in cloud despite being
deleted from `clients` table months ago.

**Root cause #1**: `client_kv_store` was the only table referencing
`clients(id)` without a FK constraint. When curator deleted a client via UI, the
`clients` row was removed but kv_store data remained orphan. 10 other tables
(consents, payments, subscriptions, ...) had `ON DELETE CASCADE` — kv_store was
the asymmetric outlier.

**Root cause #2**: trigger `fn_bump_change_marker` on
`client_kv_store AFTER INSERT/DELETE/UPDATE FOR EACH ROW` blindly UPSERTed into
`client_change_markers` for every changed row. The marker's own FK to `clients`
(with CASCADE) made any cleanup of orphan kv_store rows impossible without admin
workarounds: trigger fires → INSERT into markers → FK violation because the
orphan client_id has no `clients` row.

**Fix** (migration `database/2026-05-11_kv_store_cascade.sql`, applied
2026-05-11):

1. Added EXISTS guard to `fn_bump_change_marker` — silently skip orphan
   client_id (defense in depth).
2. Added FK `client_kv_store_client_id_fkey` with `ON DELETE CASCADE`.

After migration:

- DELETE FROM clients automatically removes corresponding kv_store rows
- INSERT with non-existent client_id is rejected by FK validation
- Future orphans are structurally impossible

**Cleanup procedure used** (one-time, before adding the FK — preserved as DR
reference):

1. Backup orphan data to `client_kv_store_archive_20260511`
2. Insert temporary placeholder rows into `clients` for each orphan client_id
3. DELETE FROM client_kv_store WHERE client_id NOT IN (active list) — trigger
   now succeeds because clients row exists
4. DELETE FROM clients WHERE name LIKE '_garbage_cleanup_%' — CASCADE removes
   markers

**Pattern to watch**: when adding a new table that references `clients(id)`,
always include `ON DELETE CASCADE`. Audit other tables periodically — any
missing FK is a future orphan leak.
