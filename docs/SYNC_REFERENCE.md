# HEYS Sync Architecture Reference

> **Version:** v2.4.0 | **Updated:** 27.02.2026 **Status:** Production Reference

---

## Related Documents

| Document                                                                   | Description                                                  |
| -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [SYNC_PERFORMANCE_REPORT.md](SYNC_PERFORMANCE_REPORT.md)                   | History of 5 optimization phases, metrics, incident analysis |
| [SYNC_PERFORMANCE_SESSIONS_LOG.md](SYNC_PERFORMANCE_SESSIONS_LOG.md)       | Bundle file mapping, session journals, PERF data             |
| [dev/STORAGE_PATTERNS.md](dev/STORAGE_PATTERNS.md)                         | Storage API cheat sheet (localStorage, Store API)            |
| [CURATOR_VS_CLIENT.md](CURATOR_VS_CLIENT.md)                               | Detailed curator vs client flow/feature differences          |
| [DATA_LOSS_PROTECTION.md](DATA_LOSS_PROTECTION.md)                         | SQL guards against empty meal overwrites                     |
| [EWS_WEEKLY_CLOUD_SYNC_DEPLOYMENT.md](EWS_WEEKLY_CLOUD_SYNC_DEPLOYMENT.md) | EWS weekly snapshots cloud sync subsystem                    |
| [ARCHITECTURE.md](ARCHITECTURE.md)                                         | Overall system architecture                                  |

---

## 1. Data Flow Pipeline

Complete chain from user action to PostgreSQL:

```
U.lsSet(key, value)
  -> nsKey = heys_<clientId>_<key>
  -> HEYS.store.set(nsKey, value) -> Store.set()
    -> rawSet() -> localStorage.setItem()          <- INSTANT (offline-first)
    -> notifyWatchers() -> UI updates
    -> saveClientKey() -> Cloud sync
      -> clientUpsertQueue.push()
      -> savePendingQueue() -> localStorage         <- Crash persistence
      -> notifyPendingChange()                      <- UI shows "Syncing..."
      -> scheduleClientPush() -> debounce 500ms -> doClientUpload()
        -> batch_upsert_client_kv_by_session RPC -> PostgreSQL
```

**Key guarantees:**

| Guarantee                  | Implementation                                       |
| -------------------------- | ---------------------------------------------------- |
| Instant UI feedback (0ms)  | `notifyPendingChange()` fires before debounce        |
| Error notification         | `HEYS.Toast?.error()` with `persistent: true`        |
| Queue persistence          | `heys_pending_client_queue` in localStorage          |
| Pre-logout sync (up to 5s) | `await cloud.flushPendingQueue(5000)`                |
| Single entry point         | `U.lsSet` -> `Store.set` -> `saveClientKey` -> Cloud |

---

## 2. Two-Phase Sync

On client load, sync is split into two phases to unblock UI faster.

### Phase A (Blocking) -- 5 critical keys

1. `heys_profile`
2. `heys_norms`
3. `heys_products`
4. `heys_hr_zones`
5. `heys_dayv2_{today}`

UI shows skeleton (loads in ~0.2s) until Phase A completes. Fires
`heysSyncCompleted` with `{ clientId, phaseA: true }` to unblock DayTab. **Does
NOT contain historical day records** — cascade guard must reject this event.

### Phase B (Background, Full Sync) -- 530+ keys

All remaining keys (historical `heys_dayv2_*` days, settings, caches). UI is
interactive during Phase B. Fires `heysSyncCompleted` with
`{ clientId, phase: 'full', viaYandex: true }` upon completion.

> ⚠️ **Cascade Guard** listens for `heysSyncCompleted` but **rejects Phase A**
> (checks `!detail.phaseA`). Only the Phase B (full) event unlocks CRS
> computation. See [Section 12](#12-cascade-guard-v62).

**Implementation:** `heys_storage_supabase_v1.js:3897` (Phase A), `:4155` (Phase
B full)

---

## 3. Delta Sync Optimizations

### 3.1 Speculative Prefetch

Inline `<script>` in `<head>` of `index.html` starts a REST delta fetch **before
React loads**:

1. Reads `heys_client_current` + `last_sync_ts` from localStorage
2. Starts REST delta request immediately at HTML parse time (+0.0s)
3. Stores promise in `window.__heysPrefetch`
4. Sync data arrives at +0.5-0.9s (instead of +1.5-2.0s)

### 3.2 Delta Fast-Path

If server reports **0 changed keys** since last sync -- sync terminates
immediately.

### 3.3 Delta Light-Path

For small updates (**<=10 keys**):

- Data written directly to localStorage
- UI notified instantly
- Heavy cleanup tasks deferred via `setTimeout` (3-5s)

### 3.4 Products Fingerprint

`heys_products` (404KB) uses djb2 fingerprint: `length:hash(name+updatedAt)`. If
fingerprint matches `cloud._productsFingerprint` -- upload is skipped.

**Implementation:** `heys_storage_supabase_v1.js:6028`

### 3.5 Grace Period

After sync completes, `_syncCompletedAt = Date.now()`. If
`Date.now() - _syncCompletedAt < 10_000` and key is `heys_products` -- upload is
blocked to prevent parasitic re-upload of just-downloaded data.

**Implementation:** `heys_storage_supabase_v1.js:6094`

---

## 4. Auth Modes & Sync Strategies

| Mode         | Who                | Cloud auth    | Sync method                                            | Flag                 |
| ------------ | ------------------ | ------------- | ------------------------------------------------------ | -------------------- |
| **Curator**  | Nutritionist       | JWT           | `bootstrapClientSync`                                  | `_rpcOnlyMode=true*` |
| **PIN auth** | Client (phone+PIN) | session_token | `syncClientViaRPC` via `cloud.syncClient` (v58: dedup) | `_rpcOnlyMode=true`  |

\* `_rpcOnlyMode=true` актуален после миграции на Yandex API. Реальное ветвление
идет по признаку PIN-клиента (`_pinAuthClientId`), см.
`docs/CURATOR_VS_CLIENT.md`.

### Universal sync

```javascript
// Always use universal sync (auto-selects strategy)
await HEYS.cloud.syncClient(clientId);

// Never call bootstrapClientSync directly -- curator-only
```

For complete mode-by-mode behavior (auth, events, gamification, UI gates), see
`docs/CURATOR_VS_CLIENT.md`.

### Session-based RPC (IDOR protection)

All client RPC functions use `*_by_session` pattern. `client_id` is **never
passed directly** -- the server resolves it from `session_token`:

```javascript
// Correct
HEYS.YandexAPI.rpc('client_kv_get_by_session', {
  session_token,
  k: 'heys_profile',
});

// Forbidden -- IDOR vulnerability
HEYS.YandexAPI.rpc('upsert_client_kv', { client_id, k, v });
```

---

## 5. Conflict Resolution

```
Local Change    Cloud Change    Resolution
-----------     -----------     ----------
Timestamp A     Timestamp B     Last Writer Wins (LWW)
User Action     Server Action   User Priority
Offline Queue   Online Sync     Merge (queue drain on reconnect)
```

- **LWW:** Cloud `updated_at` compared with local `updated_at`. Latest write
  wins.
- **User Priority:** Direct user action overrides server-initiated changes.
- **Offline Merge:** Pending queue (`heys_pending_client_queue`) drains via
  `doClientUpload()` on reconnect.

---

## 6. Storage API Rules

### API Hierarchy

```javascript
// Legacy API (with clientId namespace)
U.lsSet('heys_products', products); // -> heys_{clientId}_heys_products
U.lsGet('heys_products', []);

// Modern API (with cache, watchers, cloud sync)
HEYS.store.set('key', value); // Save + watchers + cloud queue
HEYS.store.get('key', defaultVal);

// Products-specific (includes React state + cloud sync)
HEYS.products.setAll(newProducts); // React state + localStorage + cloud

// Global (no namespace)
localStorage.setItem('heys_client_current', clientId);
```

### Critical Rules

```javascript
// CORRECT -- with cloud sync
HEYS.products.setAll(newProducts);

// CORRECT -- Store API
HEYS.store.set('heys_products', newProducts);

// WRONG -- only localStorage, no cloud sync
U.lsSet('heys_products', newProducts);

// WRONG -- wrong key (creates heys_{clientId}_products instead of heys_{clientId}_heys_products)
HEYS.store.set('products', newProducts);

// FORBIDDEN -- breaks clientId namespacing
localStorage.setItem('heys_products', JSON.stringify(data));
```

### Store API as Single Source of Truth (v4.8.8)

React must **always** read via Store API, never directly from localStorage:

```javascript
// Correct (v4.8.8+)
const products = window.HEYS?.products?.getAll?.() || [];

// Wrong (pre-v4.8.8 -- namespacing conflict)
const products = window.HEYS.utils.lsGet('heys_products', []);
```

---

## 7. Upload Controls

### Debouncing

`scheduleClientPush()` debounces at **500ms** -- prevents flooding cloud on
rapid local changes.

### Exponential Backoff

For auth/network failures:

```javascript
TIMEOUT_ESCALATION_MS: [15000, 20000, 30000];
RETRY_DELAY_ESCALATION_MS: [2000, 5000, 10000]; // v59: increased from [1000,3000,7000]
```

**Implementation:** `heys_yandex_api_v1.js:30`

> **v58:** `fetchWithRetry` также повторяет запрос при HTTP **502/503/504**
> (cold start / Gateway Timeout). Каждая попытка использует тот же таймаут из
> `TIMEOUT_ESCALATION_MS` (15→20→30s).
>
> **v59 (Fix I):** Retry delays увеличены с `[1000, 3000, 7000]` на
> `[2000, 5000, 10000]`. 502 возвращается мгновенно (не timeout), поэтому
> реальное окно retry = сумма delays. Старое окно 4с было короче cold start CF
> (>4с). Новое окно 7с — достаточно для прогрева.

### RPC Cloud Function Warm-up (v59)

`index.html` при загрузке отправляет fire-and-forget запрос:

```javascript
// Warm up /health (lightweight stub)
fetch('https://api.heyslab.ru/health', { mode: 'cors', cache: 'no-store' });
// v59 FIX H: Warm up /rpc (heavy function: PG pool, certs, crypto)
fetch('https://api.heyslab.ru/rpc', { method: 'POST', mode: 'cors', ... });
```

> `/health` и `/rpc` — **разные Cloud Functions** с разными `function_id`.
> Прогрев `/health` НЕ прогревает `/rpc`. POST без параметра `fn` возвращает
> 400, но триггерит cold start (загрузка PG-пула, сертификатов, crypto). К
> моменту ввода PIN (~5-10с) функция уже warm.

### Pre-logout Sync

`cloud.signOut()` calls `await cloud.flushPendingQueue(5000)` before clearing
auth state. Prevents data loss.

---

## 8. Events

| Event                     | Payload                                                                | When                                                                                                          |
| ------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `heys:pending-change`     | `{ count }`                                                            | Queue changed                                                                                                 |
| `heys:sync-progress`      | `{ total, done }`                                                      | Upload progress                                                                                               |
| `heys:sync-error`         | `{ error, retryIn? }`                                                  | Push failed                                                                                                   |
| `heysSyncCompleted`       | `{ clientId, phaseA: true }`                                           | **Phase A complete** (5 keys)                                                                                 |
| `heysSyncCompleted`       | `{ clientId, phase: 'full', viaYandex: true }`                         | **Phase B complete** (530+ keys)                                                                              |
| `heysSyncCompleted`       | `{ clientId, phase: 'full', viaYandex: true }`                         | **PIN-auth** full sync (v58)                                                                                  |
| `heysSyncCompleted`       | `{ clientId, error: true, loaded: 0, viaYandex: true, phase: 'full' }` | **PIN-auth** sync failed — UI разблокируется (v59: Fix G — dispatches from early-return path, not just catch) |
| `heys:day-updated`        | `{ date, source }`                                                     | Day data changed                                                                                              |
| `heys:day-updated`        | `{ dates: string[], batch: true, source }`                             | Batch write (cloud-sync)                                                                                      |
| `heys:data-saved`         | `{}`                                                                   | Data saved locally                                                                                            |
| `heys:network-restored`   | `{}`                                                                   | Connectivity back                                                                                             |
| `heys:cascade-recompute`  | `{ source, date }`                                                     | Force cascade recompute                                                                                       |
| `heys:crs-updated`        | `{ crs, state, historicalDays }`                                       | CRS recomputed → bar settle                                                                                   |
| `heys:client-changed`     | `{}`                                                                   | Curator switched client                                                                                       |
| `heys:mealitems-cascaded` | `{}`                                                                   | Cascade batch nutrient update                                                                                 |

> ⚠️ **`heysSyncCompleted` fires TWICE on cold start**: Phase A at ~+1s, Phase B
> at ~+3–5s (fast internet) or ~+7–15s (throttled). Cascade Guard **must filter
> by `!detail.phaseA`** to avoid computing CRS before historical data arrives.

### DayTab Integration

`DayTabWithCloudSync` listens for `heysSyncCompleted` with:

- **clientId filtering:** ignores events from other clients
- **5000ms fallback timer:** unblocks UI if event never arrives
- **No syncVer in React key:** prevents unmount/remount flash
  (`key='day_'+clientId+'_'+date`)

> **Note:** DayTab unblocks on **first** `heysSyncCompleted` regardless of phase
> (Phase A suffices for today's DayTab). Cascade Guard independently waits for
> Phase B (full).

### Progress Bar Animation Stability

`useDayAnimations` (in `heys_day_animations.js`) discriminates between user
actions and background sync:

- **Real action** (`eatenKcal` or `date/tab` changed): full 0→target animation
- **Background update** (only `optimum` changed via sync/forceReload): instant
  teleport to new position, no reset to 0

This prevents the **double-fill flicker** caused by `normAbs` recalculation
after `heys:day-updated` (batch).

```javascript
// Key logic in useDayAnimations
const isRealAction =
  eatenKcal !== prevKcalRef.current || dateTabKey !== prevDateTabRef.current;
if (!isRealAction) {
  // Teleport only — no animation reset
  setBarWidth(finalPct);
  setIsAnimating(true);
  requestAnimationFrame(() => setIsAnimating(false));
  return;
}
// Otherwise: full 0 → target animation
```

---

## 9. Service Worker & PWA

### Caching Strategy

| Resource type                       | SW strategy                     |
| ----------------------------------- | ------------------------------- |
| Boot bundles (`*.bundle.{hash}.js`) | `cacheFirst` (hash = immutable) |
| Other JS                            | `networkFirstNoStore`           |
| API calls                           | Not cached by SW                |
| Static assets                       | `cacheFirst`                    |

### Precache

5 boot bundles are proactively cached during SW `install` event.

### Background Sync

SW handles `sync` events from `heys-sync` registration. Posts
`TRIGGER_SUPABASE_SYNC` message to client for queue drain.

> **Note:** Background Sync is NOT supported on iOS Safari. Fallback: sync on
> `online`/`visibilitychange` events.

### PIN Auth Reload Guard (v62)

**File:** `heys_platform_apis_v1.js` | **Introduced:** v62

Fixes a race condition where SW `controllerchange` fired during an active PIN
auth sync — causing a PWA reload that terminated the in-flight `syncClient` call
and left the user with stale data.

#### Mechanism

```
PIN auth restore path:
  heys_storage_supabase_v1.js: restoreSessionFromStorage()
    → _authSyncPending = true                ← flag SET before sync starts
    → cloud.syncClient(pinAuthClient)
      .then()  → _authSyncPending = false    ← flag CLEARED on success
      .catch() → _authSyncPending = false    ← flag CLEARED on error

heys_platform_apis_v1.js: navigator.serviceWorker.addEventListener('controllerchange')
  → if (HEYS.cloud.isAuthSyncPending())
      → poll every 200ms (max 75 attempts = 15s)
      → on _authSyncPending cleared → window.location.reload()
  → else → window.location.reload() immediately
```

#### Key numbers

| Parameter     | Value                    |
| ------------- | ------------------------ |
| Poll interval | 200ms                    |
| Max attempts  | 75                       |
| Max wait time | 15s                      |
| Guard scope   | PIN auth only (flag set) |

**Only PIN auth sets `_authSyncPending`** — curator restore does not use this
flag. If `isAuthSyncPending()` returns `false`, `controllerchange` reloads
immediately (unchanged behavior).

#### Public API

```javascript
// heys_storage_supabase_v1.js
HEYS.cloud.isAuthSyncPending(); // returns _authSyncPending boolean
```

---

## 12. Cascade Guard v6.2

> **File:** `heys_cascade_card_v1.js` | **Introduced:** 26.02.2026

Prevents the Cascade Card from rendering with empty/stale CRS before batch-sync
arrives, eliminating the **BROKEN flash** on page load.

### Two-layer guard

#### Layer 1 — Pre-compute guard (`__heysCascadeBatchSyncReceived`)

Blocks `computeCascadeState()` entirely until reliable historical data arrives.

```
Set to TRUE by:
  • heys:day-updated  { batch: true }          ← cloud-sync batch write
  • heys:day-updated  { source: 'force-sync' }  ← pull-to-refresh (debounced 500ms)
  • heysSyncCompleted { clientId, !phaseA }     ← full sync (Phase B)
  • 5s timeout   (page-boot fallback)
  • 5s timeout   (after client switch)

KEEPS locked on:
  • heysSyncCompleted { phaseA: true }          ← Phase A (only 5 keys, no history)
  • heysSyncCompleted { no clientId }           ← synthetic RC timeout event
```

#### Layer 2 — History guard (`__heysCascadeAllowEmptyHistory`)

Safety net: even if Layer 1 opens, suppresses render when
`historicalDays.length === 0`.

```
Set to TRUE by:
  • heys:day-updated  { batch: true }           ← real historical days arrived
  • 8s timeout   (genuinely new user fallback)
```

### State machine

```
Page load:
  ├─ Fast internet (~3-4s):  hidden → (Phase B heysSyncCompleted) → STRONG 90% ✅
  └─ Throttled 3G (~7-15s): hidden → (5s timeout) → BROKEN 1% → (Phase B) → STRONG 90% ⚠️

Client switch (curator):
  └─ Guard reset → 5s/8s timers restarted → same flow as page load
```

### Global flags

| Flag                              | Type    | Description                             |
| --------------------------------- | ------- | --------------------------------------- |
| `__heysCascadeBatchSyncReceived`  | boolean | Layer 1: allow computeCascadeState()    |
| `__heysCascadeAllowEmptyHistory`  | boolean | Layer 2: allow render with 0 hist. days |
| `__heysCascadeGuardCount`         | number  | Suppressed render counter (for logs)    |
| `__heysCascadeGuardTimer`         | timeout | 5s batch-sync fallback                  |
| `__heysCascadeHistoryBypassTimer` | timeout | 8s empty-history bypass                 |
| `__heysCascadeLastRenderKey`      | string  | Dedup: state\|chain\|maxChain\|momentum |

### CrsProgressBar states

| State      | Condition                          | Animation           |
| ---------- | ---------------------------------- | ------------------- |
| `idle`     | Before first render (guard active) | Hidden / pendulum   |
| `pendulum` | `getCrsNumber() === null`          | Back-and-forth ~50% |
| `settling` | CRS received, settle armed         | Ease to real CRS%   |
| `settled`  | Animation complete                 | Static at real CRS% |

`getCrsNumber()` returns `null` when `historicalDays < 1` → prevents premature
settle.

```javascript
// Implementation: heys_cascade_card_v1.js:3432
function getCrsNumber(data) {
  if (!data || !data.historicalDays || data.historicalDays.length < 1)
    return null;
  return data.crs; // 0.0 – 1.0
}
```

---

## 10. Key Implementation Files

| File                          | Role                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `heys_storage_supabase_v1.js` | Main sync engine (6000+ LOC monolith); `_authSyncPending` flag + `isAuthSyncPending()`  |
| `heys_storage_layer_v1.js`    | Store API (cache, watchers, namespacing)                                                |
| `heys_yandex_api_v1.js`       | YandexAPI wrapper (RPC, REST, retry, backoff)                                           |
| `heys_app_sync_effects_v1.js` | React sync hooks (post-sync load, event listeners)                                      |
| `heys_day_animations.js`      | Progress bar animation hook (double-fill guard)                                         |
| `heys_cascade_card_v1.js`     | CascadeCard + CrsProgressBar + Cascade Guard v6.2 + CRS computation                     |
| `heys_platform_apis_v1.js`    | SW `controllerchange` handler; PIN Auth Reload Guard (v62): polls `isAuthSyncPending()` |
| `heys_gamification_v1.js`     | XP sync; `_auditDowngradedXP` one-time bypass for XP reconciliation (v62)               |
| `heys_cloud_queue_v1.js`      | Cloud queue management                                                                  |
| `heys_cloud_merge_v1.js`      | Cloud merge logic                                                                       |
| `heys_core_v12.js`            | Legacy storage API (U.lsSet/lsGet)                                                      |
| `sw.js`                       | Service Worker (precache, caching, background sync)                                     |
| `index.html`                  | Speculative prefetch, bundle loader v10.0, skeleton UI                                  |

---

---

## 11. localStorage Key Map

| Key Pattern                 | Description                       | Namespace | Encryption |
| --------------------------- | --------------------------------- | --------- | ---------- |
| `heys_dayv2_{date}`         | Day record (meals, sleep, weight) | clientId  | AES-256    |
| `heys_products`             | Products database (~300 items)    | clientId  | Plaintext  |
| `heys_profile`              | User profile (PII + health)       | clientId  | AES-256    |
| `heys_norms`                | Nutrition norms                   | clientId  | Plaintext  |
| `heys_hr_zones`             | Heart rate zones                  | clientId  | AES-256    |
| `heys_ews_weekly_v1`        | EWS weekly progress               | clientId  | Plaintext  |
| `heys_client_current`       | Current client ID                 | Global    | N/A        |
| `heys_pending_client_queue` | Pending sync queue                | Global    | N/A        |
| `heys_session_token`        | Client session token              | Global    | N/A        |

> ⚠️ **Key versioning:** always use exactly `heys_dayv2_{date}` (v2 prefix
> required), `heys_ews_weekly_v1` (versioned suffix required). Never use bare
> `heys_day_{date}` or `heys_ews_weekly`.

---

## Change Log

- **v2.4.0 (27.02.2026 — v62):** PIN Auth Reload Guard + XP reconciliation
  - **Section 9 NEW — PIN Auth Reload Guard:** `controllerchange` handler в
    `heys_platform_apis_v1.js` теперь опрашивает
    `HEYS.cloud.isAuthSyncPending()` каждые 200ms (макс. 75 попыток = 15s) перед
    перезагрузкой PWA. Устраняет race condition, когда обновление SW прерывало
    активный PIN-auth sync.
  - **`_authSyncPending` flag:** добавлен в `heys_storage_supabase_v1.js`;
    устанавливается до вызова `syncClient()` при PIN restore; сбрасывается в
    `.then()` / `.catch()`. Публичный геттер: `HEYS.cloud.isAuthSyncPending()`.
  - **`_auditDowngradedXP` flag** в `heys_gamification_v1.js`: после
    `ensureAuditConsistency` обнаруживает даунгрейд XP → устанавливает флаг →
    следующий `syncToCloud` обходит защиту cloud-wins для одноразовой
    force-reconciliation. Устраняет зависание XP UI после sync.
  - **Section 10 обновлён:** добавлены строки для `heys_platform_apis_v1.js` и
    `heys_gamification_v1.js`.
  - **Dead code удалён:** `_rpcSyncInProgress` полностью удалён из
    `heys_storage_supabase_v1.js`.
- **v2.3.0 (27.02.2026):** Cascade Guard v6.2 (Section 12), Progress Bar
  animation stability (Section 8), double-fill guard
- **v2.2.0 (27.02.2026):** visibilitychange sync refinements, upload controls
  v59 retry delays, RPC warm-up
- **v2.1.0 (27.02.2026):** Events table extended (PIN-auth failed path v59 Fix
  G)
- **v2.0.0 (27.02.2026):** Документ создан, полный pipeline описан
