# HEYS Sync Architecture Reference

> **Version:** v1.0.0 | **Updated:** 26.02.2026 **Status:** Production Reference

---

## Related Documents

| Document                                                                   | Description                                                  |
| -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [SYNC_PERFORMANCE_REPORT.md](SYNC_PERFORMANCE_REPORT.md)                   | History of 5 optimization phases, metrics, incident analysis |
| [SYNC_PERFORMANCE_SESSIONS_LOG.md](SYNC_PERFORMANCE_SESSIONS_LOG.md)       | Bundle file mapping, session journals, PERF data             |
| [dev/STORAGE_PATTERNS.md](dev/STORAGE_PATTERNS.md)                         | Storage API cheat sheet (localStorage, Store API)            |
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

UI shows skeleton until Phase A completes.

### Phase B (Background) -- 530+ keys

All remaining keys (historical days, settings, caches). UI is interactive during
Phase B.

**Implementation:** `heys_storage_supabase_v1.js:3787`

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

| Mode         | Who                | Cloud auth    | Sync method           | Flag                 |
| ------------ | ------------------ | ------------- | --------------------- | -------------------- |
| **Curator**  | Nutritionist       | JWT           | `bootstrapClientSync` | `_rpcOnlyMode=false` |
| **PIN auth** | Client (phone+PIN) | session_token | `syncClientViaRPC`    | `_rpcOnlyMode=true`  |

### Universal sync

```javascript
// Always use universal sync (auto-selects strategy)
await HEYS.cloud.syncClient(clientId);

// Never call bootstrapClientSync directly -- curator-only
```

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
RETRY_DELAY_ESCALATION_MS: [1000, 3000, 7000];
```

**Implementation:** `heys_yandex_api_v1.js:30`

### Pre-logout Sync

`cloud.signOut()` calls `await cloud.flushPendingQueue(5000)` before clearing
auth state. Prevents data loss.

---

## 8. Events

| Event                   | Payload               | When                |
| ----------------------- | --------------------- | ------------------- |
| `heys:pending-change`   | `{ count }`           | Queue changed       |
| `heys:sync-progress`    | `{ total, done }`     | Upload progress     |
| `heys:sync-error`       | `{ error, retryIn? }` | Push failed         |
| `heysSyncCompleted`     | `{}`                  | Both queues drained |
| `heys:day-updated`      | `{ date, source }`    | Day data changed    |
| `heys:data-saved`       | `{}`                  | Data saved locally  |
| `heys:network-restored` | `{}`                  | Connectivity back   |

### DayTab Integration

`DayTabWithCloudSync` listens for `heysSyncCompleted` with:

- **clientId filtering:** ignores events from other clients
- **5000ms fallback timer:** unblocks UI if event never arrives
- **No syncVer in React key:** prevents unmount/remount flash

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

---

## 10. Key Implementation Files

| File                          | Role                                                |
| ----------------------------- | --------------------------------------------------- |
| `heys_storage_supabase_v1.js` | Main sync engine (6000+ LOC monolith)               |
| `heys_storage_layer_v1.js`    | Store API (cache, watchers, namespacing)            |
| `heys_yandex_api_v1.js`       | YandexAPI wrapper (RPC, REST, retry, backoff)       |
| `heys_app_sync_effects_v1.js` | React sync hooks (post-sync load, event listeners)  |
| `heys_cloud_queue_v1.js`      | Cloud queue management                              |
| `heys_cloud_merge_v1.js`      | Cloud merge logic                                   |
| `heys_core_v12.js`            | Legacy storage API (U.lsSet/lsGet)                  |
| `sw.js`                       | Service Worker (precache, caching, background sync) |
| `index.html`                  | Speculative prefetch, bundle loader v10.0           |

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
