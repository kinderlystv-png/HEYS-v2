# HEYS-v2 — Debugging procedures

How to debug runtime issues in the legacy bundle. See
[ARCHITECTURE.md](ARCHITECTURE.md) for invariants,
[BUGS_HISTORY.md](BUGS_HISTORY.md) for known issue archive.

---

## Quick reference

```js
HEYS.diagnostics.overlay(); // products overlay health
HEYS.diagnostics.storageAudit(); // LS size + violations (read-only)
HEYS.diagnostics.runStorageAuditNow(); // trigger audit on demand
window.__heysLogControl.reset(); // logs back to default groups (см. ниже)
window.__heysNativeConsole.error(x); // bypass log filtering (см. ниже)
```

---

## Products / orphan / tombstones (Wave 2-4, 2026-05-24)

После Wave 2-4 продуктовых правок добавлены диагностические входы.

```js
// 1. SetAll audit ring — последние 50 операций уменьшения массива продуктов
//    через HEYS.products.setAll() и OverlayStore.writeRaw().
//    Запись: { ts, source, prevLen, newLen, removedIdsSample, blocked,
//             tombstoneCovered, tombstoneReason }.
//    Используй когда: «куда делся продукт» / «почему массив усох».
HEYS.diagnostics.setAllAudit();

// 2. Tombstone registry — список product_id/name, помеченных как удалённые.
HEYS.deletedProducts.list(); // массив записей
HEYS.deletedProducts.isProductDeleted(id); // boolean

// 3. Emergency kill-switch для shrink-guard (если клиент жалуется
//    «не могу сохранить» из-за неизвестного source). В support-chat:
//      «Открой DevTools (F12) → Console → вставь и нажми Enter:»
localStorage.setItem('__heys_disable_shrink_guard__', '1');
//    После reload guard полностью отключён. После решения — удалить ключ.

// 4. Event log (Wave 5) — облачный append-only лог mutation'ов на 7 дней.
//    Каждый mutation (meal-add, supplement-mark, delete-product, etc.)
//    пишется через debounced batch в client_event_log table.
HEYS.eventLog.getPendingBuffer(); // не-flush'нутые события (debug)
HEYS.eventLog.flush(); // manual flush (полезно перед reload)
```

Query event log через psql:

```sh
bash scripts/db/psql.sh -c "
  SELECT ts, kind, summary, source
  FROM client_event_log
  WHERE client_id = '<cid>'
  ORDER BY ts DESC LIMIT 50;"
```

### Когда что использовать

| Симптом                          | Инструмент                                          |
| -------------------------------- | --------------------------------------------------- |
| «Куда делся продукт?»            | `setAllAudit()` → найти source с `prevLen > newLen` |
| «Tombstone не сработал»          | `deletedProducts.list()` → проверить id/name        |
| Жалоба «X отметилось не туда»    | psql query `client_event_log` за нужный день        |
| Client stuck «не могу сохранить» | kill-switch через support-chat                      |

---

## Log filtering (`__heysLogControl`)

All `console.info/warn/log` calls in the app pass through a wrapper in
[index.html](index.html) IIFE. Logs are grouped by prefix and only enabled
groups reach the native console. `console.error` always passes (cannot be
filtered).

**Default enabled groups in prod**: `['startup', 'sync']`.

**Native console** (bypasses all filters): `window.__heysNativeConsole`.

### Commands

```js
window.__heysLogControl.all(); // enable everything (~700+ msg on boot)
window.__heysLogControl.only('startup', 'sync', 'day', 'products'); // targeted
window.__heysLogControl.enable('cloud', 'api'); // add to current
window.__heysLogControl.disable('insights'); // remove from current
window.__heysLogControl.getEnabledGroups();
window.__heysLogControl.getKnownGroups();
window.__heysLogControl.reset(); // back to ['startup', 'sync']
```

Settings persist in `localStorage.heys_log_groups_v1` (survive reloads).

If `reset()` doesn't seem to silence noise — settings might be stuck:

```js
localStorage.removeItem('heys_log_groups_v1');
localStorage.removeItem('heys_log_verbose');
location.reload();
```

### Available groups

| Group                                                | Prefixes                                                                                        | Notes                             |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------- |
| `startup`                                            | `[HEYS.startup]`, `[HEYS.entry]`, `[APP]`, `[DEPS]`                                             | boot lifecycle                    |
| `sync`                                               | `[HEYS.sync]`, `[HEYS.products]`, `[HEYS.day-trace]`, `[HEYS.addProduct]`, `[HEYS.dayRealData]` | sync + day-trace + products       |
| `cloud`                                              | `[HEYS.cloud]`, `[HEYS.cloud:ERR]`                                                              | cloud routing/save                |
| `api`                                                | `[HEYS.api]`                                                                                    | REST/RPC — **chatty** (~50+/sync) |
| `day`                                                | `[HEYS.day]`, `[HEYS.calendar]`, `[PullRefresh]`                                                | DayTab                            |
| `products`                                           | `[HEYS.portions]`, `[HEYS.presets]`, `[HEYS.prodRec]`, `[GramsStep]`, `[HarmSelectStep]`        | product details                   |
| `photos`, `sw`, `platform`, `perf`, `insights`, `ui` | niche modules                                                                                   |                                   |

To make a new prefix visible: register it in [index.html](index.html) →
`PREFIX_GROUP_MAP`. Mapping like `'[HEYS.day-trace]': 'sync'` makes the prefix
appear with the always-on `sync` group.

---

## Cloud Trace Logging Standard

Use cloud trace when the question is: "what happened on the user's device, and
did that state cross the local/client/cloud boundary?" The canonical sink is
Postgres table `client_log_trace`, filled by
[heys_client_log_trace_v1.js](heys_client_log_trace_v1.js). Do not rely on
Yandex Function logs for user-action traces: function logs show server
invocation/errors, not the browser-side decision path.

### How to add a trace family

Use a stable prefix and direct log-trace API:

```js
function traceDomain(event, payload, level) {
  try {
    const flowId =
      payload?.flowId || HEYS.LogTrace?.makeFlowId?.('domain-action');
    const body = {
      event,
      source: 'module-or-layer',
      client: String(HEYS.currentClientId || '').slice(0, 8) || null,
      flowId,
      ...(payload || {}),
    };
    if (HEYS.LogTrace && typeof HEYS.LogTrace.trace === 'function') {
      HEYS.LogTrace.trace(level || 'info', '[HEYS.<domain>.trace]', body);
      return;
    }
    (level === 'warn' ? console.warn : console.info)(
      '[HEYS.<domain>.trace]',
      body,
    );
  } catch (_) {}
}
```

Required shape:

- `event`: stable snake_case event name, for example `entry_created`,
  `upload_success`, `storage_write`.
- `source`: layer or module, for example `chrono-ui`, `planning-store`,
  `storage-setItem`, `sync-queue`.
- `flowId`: one id for one user action from UI submit through store, storage,
  sync and readback. Create it once with `HEYS.LogTrace.makeFlowId('domain')`
  and pass it down.
- `client`: short client id prefix only; full `client_id` is already a DB
  column.
- `key`, `status`, `reason`, `count`, `bytes`, short ids, timestamps when
  useful.
- For arrays/objects: send summaries only (`len`, `hash`, `lastEntry`, counts),
  not the full payload.

Never log secrets or user content: tokens, cookies, auth headers, phone/email,
free text, product names, meal names, health values, full day/profile/product
payloads. If a value helps debug, log presence/count/hash instead.

### Boundary model

Good trace families cover boundaries, not every line of code:

| Boundary       | Example event                | Proves                                  |
| -------------- | ---------------------------- | --------------------------------------- |
| UI submit      | `ui_submit`                  | User action reached the handler         |
| Domain store   | `store_created` / `rejected` | Business validation accepted/rejected   |
| Local storage  | `storage_write`              | Data actually hit browser storage       |
| Sync queue     | `sync_enqueued`              | Data entered upload path                |
| Upload result  | `upload_success` / `error`   | Server accepted/rejected client write   |
| Cloud readback | `cloud_readback_ok`          | DB state matches expected local summary |

For critical user-data writes, add the lowest useful layer in
[heys_client_log_trace_v1.js](heys_client_log_trace_v1.js) by patching
`Storage.prototype.setItem` or the relevant core boundary. That catches facts
even if React code, lazy bundles, or console filters are stale.

### Built-in trace tools

`HEYS.LogTrace` exposes the shared tooling:

| API                                                       | Use                                                                                                        |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `makeFlowId(scope)`                                       | Create one stable action id, e.g. `chrono-add-mr...`.                                                      |
| `trace(level, prefix, body)`                              | Immediate trace write; flushes quickly.                                                                    |
| `event(name, context, level)`                             | Privacy-allowlisted lifecycle/UI event with boot, build and device metadata; retries offline.              |
| `verifyKvWrite({ prefix, flowId, key, expectedSummary })` | Delayed cloud KV readback; logs `cloud_readback_ok`, `cloud_readback_mismatch`, or `cloud_readback_error`. |
| `summarizeValue(value)`                                   | Privacy-safe summary with `kind`, `length`, `hash`, and small tail info.                                   |
| `recent()`                                                | Local in-memory trace viewer data for the current tab.                                                     |
| `exportSnapshot()`                                        | Text snapshot for clipboard/debug reports.                                                                 |
| `health()`                                                | Sync/log health summary: pending, queue, retry, buffered trace rows.                                       |

Use `verifyKvWrite` only on important writes. It reads cloud after a short
delay, so it is useful for "did it reach cloud?" questions, but too expensive
for render loops, timers, polling, or every item in a large collection.

### Client session observability

Every page load gets a new `boot_id`; the pseudonymous `device_id` survives
reloads. Structured events include build hash, device class, OS, browser and
display mode. The core sequence is `boot_started` → `app_shell_ready` →
`initial_sync_ready` → `day_screen_ready` → `boot_ready`; failures use
`boot_failed`, `app_runtime_failed` or a degraded status. SW transitions, What's
New, morning-checkin steps (including `yesterdayVerify`) and hunger prompts add
their own events.

Structured events are kept in a bounded local queue until an authenticated POST
succeeds. `event_id` makes beacon/fetch retries idempotent. The REST API
resolves `client_id` from the HttpOnly client session or verified curator JWT;
an anonymous caller cannot claim another client. Curator UI reads a safe
per-client timeline through `get_client_observability_by_curator` and the
all-client dashboard through `get_curator_observability_overview`. The latter
applies filters and cursor pagination on the server in one RPC. Sync telemetry
is aggregated per cycle/upload batch (`sync_cycle_*`, `write_*`), never per KV
value. Raw console messages, health values, phones, IPs and tokens are not
returned.

### How to query cloud trace

Focused query by client and prefix:

```sh
bash scripts/db/psql.sh -c "
  SELECT captured_at, client_ts, level, session_id, message, args
  FROM client_log_trace
  WHERE client_id = '<client_uuid>'
    AND captured_at >= now() - interval '30 minutes'
    AND message LIKE '[HEYS.<domain>.trace]%'
  ORDER BY captured_at DESC
  LIMIT 100;"
```

Find recent sessions for a client:

```sh
bash scripts/db/psql.sh -c "
  SELECT session_id, min(client_ts) AS first_ts, max(client_ts) AS last_ts,
         count(*) AS rows
  FROM client_log_trace
  WHERE client_id = '<client_uuid>'
    AND captured_at >= now() - interval '2 hours'
  GROUP BY session_id
  ORDER BY last_ts DESC;"
```

Check whether the browser is still flushing logs:

```sh
bash scripts/db/psql.sh -c "
  SELECT max(captured_at) AS last_captured,
         max(client_ts) AS last_client_ts,
         count(*) FILTER (WHERE captured_at >= now() - interval '5 minutes') AS rows_5m
  FROM client_log_trace
  WHERE client_id = '<client_uuid>';"
```

Find a single user-action chain by `flowId`:

```sh
bash scripts/db/psql.sh -c "
  SELECT captured_at, client_ts, level, message, args
  FROM client_log_trace
  WHERE client_id = '<client_uuid>'
    AND captured_at >= now() - interval '2 hours'
    AND args::text LIKE '%<flow_id>%'
  ORDER BY captured_at ASC;"
```

When the trace says data was queued but cloud state is stale, check server logs
only after the client boundary is proven:

```sh
yc serverless function logs heys-api-rest --since 30m
yc serverless function logs heys-api-rpc --since 30m
```

### Maintenance rules

- Add every new trace family to this file: prefix, events, SQL, interpretation.
- Add the prefix to `PREFIX_GROUP_MAP` in [index.html](index.html) if it must be
  visible in DevTools.
- Keep event names stable; add fields, do not rename casually.
- Keep volume low. Log state transitions and errors, not render loops, timers,
  polling ticks, or every item in a collection.
- If trace output is needed immediately after a user action, use
  `HEYS.LogTrace.trace(...)`; it flushes quickly. Plain console logs can wait
  for periodic/pagehide flush and can be hidden locally.
- For mobile/local debugging, open the hidden debug panel and use Trace Viewer,
  Export Trace and Health. Those read from `HEYS.LogTrace.recent()`,
  `exportSnapshot()` and `health()`; cloud truth still comes from
  `client_log_trace` SQL.

---

## Day-write trace pipeline

When investigating "added product disappears" or similar dayv2 races, the
sequenced trace channel `[HEYS.day-trace]` covers add-product → save → cloud →
re-read end-to-end. Enabled by default with the `sync` group.

| #      | Stage                         | File                                                                          | Shows                                                                            |
| ------ | ----------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 0      | GramsStep button click        | [heys_add_product_step_v1.js](heys_add_product_step_v1.js) `handleSubmit`     | modal's green ✓ button was actually pressed                                      |
| 1      | `handleAdd` entry             | [heys_day_add_product.js](heys_day_add_product.js) `handleAdd`                | product+mealIndex received                                                       |
| 3      | Item built                    | same                                                                          | `newItem` shape with all nutrient fields inlined                                 |
| 4      | `setDay` applied              | same                                                                          | `itemsBefore → itemsAfter` inside React state callback                           |
| 4b     | requestFlush                  | same                                                                          | what `HEYS.Day.getDay()` (ref) sees just before flush                            |
| 4d     | flush picked ref over closure | [heys_day_core_bundle_v1.js](heys_day_core_bundle_v1.js) `flush`              | fires only when race-recovery kicks in — closureItems vs refItems mismatch       |
| 4c     | inside flush about to write   | same                                                                          | what flush is about to persist (effDay)                                          |
| 5      | LS write (saveToDate)         | same                                                                          | `lsSetFn(key, payload)` invoked                                                  |
| 5b     | LS interceptor                | [heys_storage_supabase_v1.js](heys_storage_supabase_v1.js) `interceptSetItem` | every `localStorage.setItem` for `dayv2_*` (stack trace) — catches stray writers |
| 6a     | cloud queue enqueue           | same `enqueueClientUpsertForUpload`                                           | dayv2 entering pending upload queue                                              |
| 6b     | saveClientKey direct          | same `cloud.saveClientKey`                                                    | direct API entry (rare for dayv2)                                                |
| 6c-pre | batch reaches outbound        | same `doClientUpload`                                                         | log right before `[SYNC] → отправка`                                             |
| 6c     | batch upload outbound         | same                                                                          | actual dayv2 keys leaving for cloud                                              |
| 7      | boot LS read                  | [heys_day_core_bundle_v1.js](heys_day_core_bundle_v1.js) `doLocal`            | what came back from localStorage on refresh                                      |
| 8      | day-updated event             | same `handleDayUpdated`                                                       | `heys:day-updated` event from sync/external                                      |
| 8b     | day applied (state replaced)  | [heys_day_effects.js](heys_day_effects.js) (synced into core bundle)          | final React state replacement                                                    |

### Diagnosing where data is lost

Compare `totalItems` across the chain. The boundary where it shrinks reveals the
bug:

- `4` shows N+1, `5b` shows N → some code wrote a stale snapshot between setDay
  and flush. Add `new Error().stack` to `5b` and look for non-flush writers.
- `5b` shows N+1, `7` (after refresh) shows N → cloud is overwriting LS via
  HOT-sync. Check `applyForegroundHotSyncValue` guards.
- `4` shows N+1, `4c` not fired → flush exits via guard. Inspect closure-vs-ref
  drift via `4d`. If drift detected, `flush` should `force = true` to bypass
  downstream guards.

---

## Chrono activity cloud trace

Для жалоб вида «я только что записал активность, а в облаке её нет» главный
источник не Yandex Function logs, а таблица `client_log_trace`. Правильный путь
для продуктового trace —
`HEYS.LogTrace.trace(level, '[HEYS.<domain>.trace]', payload)`: ранний
[heys_client_log_trace_v1.js](heys_client_log_trace_v1.js) кладёт событие в
облачный ring-buffer и быстро flush'ит в `/rest/client_log_trace`. Голый
`console.info` допустим только как fallback, потому что console-фильтр и
lazy-bundle cache могут скрыть событие локально.

Что покрывает trace:

| Layer   | Event                               | Что означает                                                                                               |
| ------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| UI      | `ui_add_minutes_submit`             | пользователь подтвердил ручное добавление минут                                                            |
| UI      | `ui_untracked_apply_now_submit`     | пользователь распределил неучтённое время                                                                  |
| UI      | `ui_persist_segment_saved`          | UI получил entry id после сохранения сегмента                                                              |
| Store   | `entry_created`                     | store создал chrono entry после пользовательского действия                                                 |
| Store   | `entry_create_rejected`             | запись не создана: нет activityId, минуты ≤ 0 или activity не найдена                                      |
| Store   | `entry_updated`                     | существующая запись изменена                                                                               |
| Store   | `entry_update_rejected`             | update отклонён: нет id, запись/activity не найдены, минуты ≤ 0                                            |
| Store   | `entry_deleted`                     | запись удалена и tombstone поставлен                                                                       |
| Store   | `entries_persist_enqueued`          | ключ `heys_planning_chrono_entries` записан локально и поставлен в sync                                    |
| Storage | `storage_chrono_entries_write`      | фактическая запись массива entries в localStorage; нижний слой, виден даже если UI/store trace не загружен |
| Guard   | `entries_queue_guard_force_enqueue` | guard увидел отсутствие pending/recent sync marker и форсировал enqueue                                    |

### Быстрый разбор инцидента

1. Найти клиентские chrono-события за окно инцидента:

```sh
bash scripts/db/psql.sh -c "
  SELECT client_ts, level, session_id, message, args
  FROM client_log_trace
  WHERE client_id = '<client_uuid>'
    AND client_ts >= now() - interval '30 minutes'
    AND message LIKE '[HEYS.chrono.trace]%'
  ORDER BY client_ts DESC
  LIMIT 80;"
```

2. Проверить, есть ли запись в cloud KV:

```sh
bash scripts/db/psql.sh -c "
  SELECT k,
    CASE WHEN jsonb_typeof(v) = 'array' THEN jsonb_array_length(v) END AS len,
    updated_at
  FROM client_kv_store
  WHERE client_id = '<client_uuid>'
    AND k IN (
      'heys_planning_chrono_entries',
      'heys_planning_chrono_activities',
      'heys_planning_chrono_tombstones_v1'
    )
  ORDER BY updated_at DESC;"
```

3. Посмотреть entries за конкретную дату:

```sh
bash scripts/db/psql.sh -c "
  SELECT
    e->>'id' AS id,
    e->>'activityId' AS activity_id,
    e->>'date' AS date,
    e->>'minutes' AS minutes,
    COALESCE(e->>'at', e->>'createdAt') AS at
  FROM client_kv_store kv,
       jsonb_array_elements(kv.v) AS e
  WHERE kv.client_id = '<client_uuid>'
    AND kv.k = 'heys_planning_chrono_entries'
    AND e->>'date' = '<YYYY-MM-DD>'
  ORDER BY COALESCE(e->>'at', e->>'createdAt') DESC;"
```

4. Проверить server-side факт POST/ошибок, если trace говорит `queued`, но KV не
   обновился:

```sh
yc serverless function logs heys-api-rest --since 30m
yc serverless function logs heys-api-rpc --since 30m
```

Интерпретация:

- Нет `ui_*` событий: действие не дошло до chrono UI handler или вкладка ещё не
  загрузила свежий lazy-bundle.
- Есть `ui_*`, но нет `entry_created`/`entry_create_rejected`: проблема между UI
  handler и `state.addChronoEntry`.
- Есть `entry_create_rejected`: смотреть `reason`; облако тут ни при чём.
- Есть `entry_created`, но нет `entries_persist_enqueued`: проблема между store
  mutation и persist path.
- Есть `storage_chrono_entries_write`, но нет `entry_created`: запись пришла из
  storage/cloud/restore path, а не из текущего UI action.
- Есть `entries_persist_enqueued` со `status='queued'`, но KV не обновился:
  смотреть pending queue, REST logs и ошибки sync.
- KV `heys_planning_chrono_entries.updated_at` старше события и REST POST не
  было: запись зависла на клиенте до network/upload path.

### Правила добавления новых trace-семей

- Префикс формата `[HEYS.<domain>.trace]`; добавить его в
  [index.html](index.html) `PREFIX_GROUP_MAP`, обычно в группу `sync`.
- Для важных cloud-debug событий использовать `HEYS.LogTrace.trace(...)`, не
  только `console.info(...)`. Fallback на console оставлять внутри helper'а.
- Второй аргумент всегда структурный object: `event`, `reason`, `key`, `status`,
  короткие ids, counts, timestamps. Не писать полные массивы, тексты
  пользователя, health-data, токены, cookies, email/phone.
- Логировать переходы состояния, а не каждый render/tick: create/reject/update,
  enqueue, upload boundary, guard recovery.
- Trace не должен влиять на продуктовый flow: весь helper в `try/catch`, ошибки
  trace игнорируются.
- Для критичных user-data writes добавлять нижний storage-level trace в
  [heys_client_log_trace_v1.js](heys_client_log_trace_v1.js), если нужно
  доказать факт `localStorage.setItem` независимо от React/lazy-bundle.
- В этот файл добавлять runbook: где искать события, какие SQL/YC команды
  запускать, как отличить client/store/sync/server boundary.

### Следующие trace-кандидаты

Добавлять только под реальные инциденты, не как шум:

- `checkin.trace` уже есть; при следующем расширении перевести ключевые события
  на `HEYS.LogTrace.trace`, чтобы не зависеть от console.
- `day-write.trace`: нижний storage-level trace для `heys_dayv2_<date>` уже есть
  частично через `[CHECKIN.trace]`; для продуктовых потерь нужен единый
  `day_write_storage_set` с `date`, `mealItems`, `source`, `updatedAt`.
- `product-overlay.trace`: для удаления/воскрешения продуктов логировать
  `overlay_set_all`, `tombstone_add`, `cloud_snapshot_apply` с counts/hash, без
  названий продуктов.
- `sync-queue.trace`: для pending/in-flight проблем логировать `enqueue`,
  `upload_start`, `upload_success`, `upload_error`, `restore_inflight` с `key`,
  `queueLen`, `client`, `status`.

---

## Common gotchas

1. **Service Worker / Vite cache** can serve stale bundles. After a scoped
   preview rebuild (`pnpm bundle:legacy:auto --files=<your source files>`),
   restart `pnpm dev:local` (in-memory cache) or use **Incognito** (no SW). Full
   `pnpm bundle:legacy` is for integration/release scope, not routine local
   preview.

2. **Bundle hash in DOM ≠ executed code** — verify with

   ```js
   fetch('/boot-core.bundle.<hash>.js')
     .then((r) => r.text())
     .then((t) => t.includes('your_string'));
   ```

   or `XMLHttpRequest` synchronously to inspect what the dev-server actually
   delivers.

3. **Logs not appearing** — most likely the prefix isn't in `PREFIX_GROUP_MAP`
   or its group isn't enabled. Use `window.__heysNativeConsole.error(...)` to
   bypass filtering.

4. **Closure drift in React `useCallback`** is a recurring pattern when
   callbacks are scheduled via `setTimeout`/`requestAnimationFrame` outside
   React's commit phase. Always prefer `dayRef.current` (`HEYS.Day.getDay()`)
   over closure-captured `day` for late-firing writes.

5. **`localStorage.setItem` is intercepted** by
   [heys_storage_supabase_v1.js](heys_storage_supabase_v1.js) at IIFE load time.
   Direct usage of `originalSetItem.bind(...)` (e.g.
   `cloud.writeLocalKvWithoutMirror`) bypasses the interceptor — when tracing,
   patch `Storage.prototype.setItem` to catch all writers.

6. **`localStorage` for products is per-clientId scoped**. Use
   `HEYS.utils.lsGet('heys_products_overlay_v2', [])` from console (returns
   scoped) vs `localStorage.getItem('heys_products_overlay_v2')` (unscoped).

---

## Inspecting cloud state

Production: Yandex Cloud Postgres. Access pattern via Lockbox secret — see
memory `reference_db_migration.md`.

Common queries:

```sql
-- All keys for a client
SELECT k, jsonb_typeof(v) AS type,
  CASE WHEN jsonb_typeof(v) = 'array' THEN jsonb_array_length(v) ELSE NULL END AS len,
  length(v::text) AS bytes,
  updated_at
FROM client_kv_store
WHERE client_id = '<uuid>'
ORDER BY updated_at DESC;

-- Audit overlay vs legacy products
SELECT k, jsonb_array_length(v) FROM client_kv_store
WHERE client_id = '<uuid>' AND k LIKE 'heys_products%';

-- Check profile (cloud is source of truth)
SELECT k, v::text, updated_at FROM client_kv_store
WHERE client_id = '<uuid>' AND k LIKE '%profile%';
```

---

## React state inspection from DevTools

Find a React component's props/state without React DevTools extension:

```js
const el = [...document.querySelectorAll('*')].find((e) =>
  e.textContent?.startsWith('Найдено:'),
);
const fk = Object.keys(el).find((k) => k.startsWith('__reactFiber'));
let node = el[fk];
while (node) {
  const p = node.memoizedProps;
  if (p?.products?.length) {
    console.log('found products in props:', p.products.length);
    window.__inspect = p.products;
    break;
  }
  node = node.return;
}
```

---

## Meal Planner (карточка «Планнер» в Дневнике)

Все логи планнера префиксованы `[MEALREC]` — фильтр в DevTools.

### Ключевые лог-теги

| Тег                 | Источник    | Что показывает                                                       |
| ------------------- | ----------- | -------------------------------------------------------------------- |
| `[PLANNER.entry]`   | planner     | Входные параметры (currentTime, lastMeal, target, eaten, sleepStart) |
| `[PLANNER.wave]`    | planner     | Расчёт инсулиновой волны после lastMeal                              |
| `[PLANNER.fatburn]` | planner     | Окно жиросжигания (+30 мин после волны)                              |
| `[PLANNER.sleep]`   | planner     | sleepTarget + deadline последнего приёма                             |
| `[PLANNER.hunger]`  | planner     | Hunger trade-off (буфер 3ч → 2ч/1.5ч)                                |
| `[PLANNER.fasting]` | planner     | IF: сдвиг nextMealEarliest до eatStart                               |
| `[PLANNER.budget]`  | planner     | Оставшийся бюджет БЖУ + ккал                                         |
| `[PLANNER.split]`   | planner     | forceMultiMeal (остаток >900 ккал)                                   |
| `[PLANNER.loop.N]`  | planner     | Каждая итерация цикла размещения                                     |
| `[PLANNER.light]`   | planner     | Fallback на один лёгкий приём перед сном                             |
| `[PLANNER.context]` | UI          | supplements добавлены в dayEaten, refeed применён                    |
| `[MEALREC.planner]` | recommender | Switch single↔multi, timing sync, per-meal products                 |
| `[MEALREC.shadow]`  | recommender | Shadow-сравнение incremental vs full replan                          |

### Команды отладки в DevTools

```js
// Прямой вызов планнера с текущими данными (для воспроизведения багов)
const today = new Date().toISOString().slice(0, 10);
const day =
  HEYS.dayCache?.getDay(today) ||
  JSON.parse(localStorage.getItem(`heys_dayv2_${today}`));
const profile = HEYS.profile?.get();
const pIndex = HEYS.models?.buildProductIndex?.(HEYS.products?.getAll() || []);

const plan = HEYS.InsightsPI.mealPlanner.planRemainingMeals({
  currentTime: new Date().toTimeString().slice(0, 5),
  lastMeal: day.meals?.[day.meals.length - 1] || null,
  dayTarget: {
    kcal: profile?.norm?.kcal || 2000,
    prot: 130,
    carbs: 200,
    fat: 60,
  },
  dayEaten: { kcal: 0, prot: 0, carbs: 0, fat: 0 },
  profile,
  days: [],
  pIndex,
  daySleepStart: day.sleepStart || null,
  isRefeedDay: !!day.isRefeedDay,
});
console.table(
  plan.meals?.map((m) => ({
    time: `${m.timeStart}-${m.timeEnd}`,
    ...m.macros,
    scenario: m.scenario,
  })),
);
```

### Incremental replan rollout (R4-9)

По умолчанию весь трафик идёт на `mode: 'full'` — incremental replan скрыт за
двумя feature flags и rollout-bucket'ом.

**Проверить состояние** (в DevTools консоли):

```js
HEYS.featureFlags?.isEnabled?.('adaptiveReplanEnabled');
HEYS.featureFlags?.isEnabled?.('incrementalReplanEnabled');
localStorage.getItem('heys_adaptive_replan_rollout_pct'); // дефолт '0' → bucketAllowed = false
```

**Включить на текущей сессии** (для тестирования):

```js
localStorage.setItem('heys_adaptive_replan_rollout_pct', '100');
// Перезагрузить страницу
```

Если включено, в diagnostic report должно появиться `Replan: mode=incremental`.
При отказе валидации — fallback на `full` (видно в логе
`[MEALREC.shadow] 🪞 incremental/full drift`).

**Включить shadow compare** (параллельно считать оба варианта для метрик
дрифта):

```js
// Через feature flag adminUI или напрямую:
HEYS.featureFlags?.set?.('shadowCompareEnabled', true);
```

**Что мониторить перед полным rollout**:

- `heysMealReplanComputed` event → detail.incremental, detail.fallbackUsed
- `[MEALREC.shadow] 🪞 incremental/full drift` → kcalDiff, protDiff,
  mealsCountDiff
- Если drift стабильно <50 ккал и <5г белка — можно поднимать `rolloutPct`
  поэтапно (10→25→50→100).

### Типичные симптомы и куда смотреть

| Симптом                                                   | Что смотреть                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| «Промежутки времени неверные»                             | `[PLANNER.sleep]` (sleepTarget), `[PLANNER.wave]` (волна), `daySleepStart` в context |
| «Карточка показывается на вчерашний день»                 | `day.date` vs `todayISO()` — должна return null                                      |
| «План пустой, хотя есть бюджет»                           | `[PLANNER.hunger]` (tradeoff не сработал?), `[PLANNER.light]` (одиночный приём?)     |
| «NO_TARGET ошибка»                                        | `dayTarget.kcal < 500` — проверить `optimum` и `normAbs.kcal` в context              |
| «InsulinWave fallback» (warn)                             | `[PLANNER.wave]` source: `hardcoded_default_3h` — проблема в `InsulinWave.calculate` |
| «kcal приёма не равна БЖУ-сумме»                          | MPS-бус (R1-11) — kcal пересчитывается из БЖУ; rounding до ~10% допустим             |
| «Раскрытая карточка свернулась после добавления продукта» | `localStorage.getItem('heys_meal_planner_expanded_v1')` — должно быть `'1'`          |
