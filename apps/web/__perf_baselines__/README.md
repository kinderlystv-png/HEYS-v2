# HEYS Performance Baseline Protocol

Этот директорий используется для хранения Performance traces до/после
перф-изменений и для сбора численных metrics через console snippets.

## Quick links

- App: http://localhost:3001/
- Health: http://localhost:4001/health
- Запуск: `pnpm dev:local`

## Console snippets для live измерений

Открыть Chrome DevTools → Console → вставить нужный snippet:

### 1. Проверить, что foundations загружены

```js
console.table({
  contentHash: !!HEYS?.contentHash?.hashDay,
  lruCache: !!HEYS?.lruCache?.create,
  dispatcher: !!HEYS?.events?.dayUpdated?.subscribe,
  'contentHash version': HEYS?.contentHash?.version,
  'lruCache version': HEYS?.lruCache?.version,
  'dispatcher version': HEYS?.events?.dayUpdated?.version,
});
```

### 2. Замерить hashDay vs JSON.stringify на текущем дне

```js
(function () {
  const day = HEYS.Day?.getDay?.() || HEYS.dayUtils?.getCurrentDay?.();
  if (!day) {
    console.warn('No current day; open Day tab first');
    return;
  }
  const N = 1000;
  // Warmup hashDay caches
  HEYS.contentHash.hashDay(day);

  let t0 = performance.now();
  for (let i = 0; i < N; i++) JSON.stringify(day);
  const stringifyMs = (performance.now() - t0) / N;

  t0 = performance.now();
  for (let i = 0; i < N; i++) HEYS.contentHash.hashDay(day);
  const hashMs = (performance.now() - t0) / N;

  const speedup = stringifyMs / hashMs;
  console.log(
    `Day: ${(day.meals || []).length} meals × avg ${Math.round((day.meals || []).reduce((s, m) => s + (m.items || []).length, 0) / (day.meals || []).length || 1)} items`,
  );
  console.log(`  JSON.stringify: ${stringifyMs.toFixed(3)} ms/op`);
  console.log(
    `  hashDay:        ${hashMs.toFixed(3)} ms/op  → ${speedup.toFixed(1)}× faster`,
  );
})();
```

### 3. Замерить EWS detect (#6 кэш)

```js
(async function () {
  if (!HEYS?.InsightsPI?.earlyWarning?.detect) {
    console.warn('EWS not loaded');
    return;
  }
  // First call — cold (compute scores)
  let t0 = performance.now();
  await HEYS.InsightsPI.earlyWarning.detect();
  console.log(`EWS detect (cold): ${(performance.now() - t0).toFixed(1)} ms`);
  // Second call — warm (hashDay cache hit)
  t0 = performance.now();
  await HEYS.InsightsPI.earlyWarning.detect();
  console.log(`EWS detect (warm): ${(performance.now() - t0).toFixed(1)} ms`);
  // Third
  t0 = performance.now();
  await HEYS.InsightsPI.earlyWarning.detect();
  console.log(`EWS detect (warm): ${(performance.now() - t0).toFixed(1)} ms`);
})();
```

### 4. Cascade pre-filter (NEW-5) проверка через тестовый rename

ПРЕДУПРЕЖДЕНИЕ: реально мутирует localStorage. Снимать только в test profile.

```js
// Не запускать без явной необходимости — это ИЗМЕНЯЕТ продукт
// Замер уже выполнен Node-бенчем (19.5× faster, 360 days skipped из 365).
// См. /tmp/heys-bench/cascade_prefilter_bench.mjs
```

### 5. Долгие задачи (Long Tasks) live-monitor

```js
const obs = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    console.warn(
      `Long Task: ${entry.duration.toFixed(1)} ms`,
      entry.attribution?.[0]?.containerName || '(no container)',
    );
  }
});
obs.observe({ entryTypes: ['longtask'] });
console.log('Long Task observer armed. Stop: longTaskObserver.disconnect()');
window.longTaskObserver = obs;
```

### 6. F2 LRU cache hit-rate (если включен)

```js
console.log(
  'readDayV2 cache stats:',
  HEYS?._readDayV2Cache?.stats?.() || 'not exposed',
);
console.log(
  'EWS score cache stats:',
  HEYS?._ewsScoreCache?.stats?.() || 'not exposed',
);
```

### 7. Smoothness counters

```js
HEYS.perf?.dumpSmoothnessCounters?.() || console.log('No smoothness counters');
```

### 8. React Profiler ring (если включен)

```js
// Включить (требует перезагрузки):
localStorage.setItem('heys_debug_react_profiler', '1');
location.reload();
// После reload + взаимодействия:
HEYS.perf?.dumpReactProfilerRing?.(50);
HEYS.perf?.getSlowCommitSourceStats?.(10);
```

## Сценарии для Performance trace (Chrome DevTools)

Открыть DevTools → Performance → Settings:

- **CPU throttle: 4× slowdown**
- **Network: Slow 4G** (для сценариев 4, 5)
- **Disable cache** в Network tab

Записывать 10-20 секунд каждый сценарий, сохранять trace в этот директорий с
именами:

| Файл                          | Сценарий                                            | Что валидирует                                 |
| ----------------------------- | --------------------------------------------------- | ---------------------------------------------- |
| `01-type-meal-name.json`      | Открыть существующий день с 50+ meals, печатать имя | #1 autosave hash, NEW-3 callback stable        |
| `02-type-product-search.json` | Фокус в product search, печатать 10 символов        | NEW-2 deferred + memo                          |
| `03-rename-product.json`      | Rename продукт в 30+ днях                           | NEW-5 prefilter + #6 EWS cache                 |
| `04-switch-client-3g.json`    | Switch client с 365 днями на Slow 4G                | #8 mergeDayData hash + NEW-13 progressive sync |
| `05-first-load.json`          | Hard refresh, throttle                              | NEW-21 idle parse, #4 (если делается)          |
| `06-ews-trigger.json`         | Add meal, дождаться EWS detect                      | #6 EWS cache                                   |
| `07-idle-5min.json`           | Открыть, скрыть вкладку, 5 минут                    | NEW-6 visibility check                         |
| `08-drag-widget-ios.json`     | Drag widget на iOS Safari                           | NEW-17 passive touch                           |
| `09-scroll-planning.json`     | Длинный скролл календаря                            | (planning module)                              |

## Метрики для extraction

Из каждого trace:

- Number of Long Tasks > 50ms
- Longest Long Task duration
- Total scripting time
- INP (если применимо)
- React commit p50, p95

## Node-side benchmarks (уже выполнены, см. /tmp/heys-bench/)

| Бенч                            | Результат                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| `content_hash_bench.mjs`        | FNV-1a сравнение с JSON.stringify (5-21× в incremental режиме)                         |
| `cascade_prefilter_bench.mjs`   | NEW-5: **19.5× faster, 48ms saved** на cascade в 365 днях с 5 affected                 |
| `hashday_application_bench.mjs` | #1 autosave: 11-517× faster; #8 merge: 11-567× faster; full pull 365d: **449ms saved** |
