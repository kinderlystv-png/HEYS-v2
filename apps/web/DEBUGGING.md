# HEYS-v2 — Debugging procedures

How to debug runtime issues in the legacy bundle. See
[ARCHITECTURE.md](ARCHITECTURE.md) for invariants,
[BUGS_HISTORY.md](BUGS_HISTORY.md) for known issue archive.

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

## Common gotchas

1. **Service Worker / Vite cache** can serve stale bundles. After
   `pnpm bundle:legacy`, restart `pnpm dev:local` (in-memory cache) or use
   **Incognito** (no SW).

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
