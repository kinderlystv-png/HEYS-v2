# HEYS PWA Performance Investigation — Session Log

---

## Сессия R1–R13 (2026-03-21) — defer pass по click handlers

**Метод:** `HEYS.perfMon` + итеративный defer-паттерн: `setTimeout(0)` +
`React.startTransition(...)`.

**Главный принцип:** обработчик клика завершался мгновенно, тяжёлый render
уходил в следующий task.

### Реализованные фиксы

| Раунд | Fix                                | Файл                                                             | Было / Стало      |
| ----- | ---------------------------------- | ---------------------------------------------------------------- | ----------------- |
| R8    | FIX A — confirm modal              | `heys_day_popups_state_v1.js`                                    | ~469ms → ~1ms     |
| R9    | FIX B — steps slider               | `heys_day_day_handlers.js`                                       | ~590ms → ~0ms     |
| R10   | FIX D — water preset DOM-animation | `heys_day_day_handlers.js`                                       | ~426ms → ~52ms    |
| R11   | FIX E — popup open/close           | `heys_day_popups_state_v1.js`                                    | ~375ms → ~1ms     |
| R12   | FIX F — click-outside path         | `heys_day_popups_state_v1.js`                                    | ~377ms → устранён |
| R13   | FIX G–J — advice + caloric balance | `heys_app_shell_v1.js`, `day/_advice.js`, `heys_day_stats_v1.js` | ~503ms → ?        |

### Снимок perfMon после R12

- `longTasks`: 181, avg 264ms, max 541ms, total 47,766ms
- `slowEvents`: 332 · `scrollJanks`: 24 · `fpsDrops`: 57

### Бандлы на конец R13

- `boot-calc.bundle.0c992e608f08.js`
- `boot-day.bundle.c0254c594bbb.js`
- `boot-app.bundle.7a9e02dc7a1d.js`

### Важные технические выводы

- `risk-radar-badge` — ложная цель; стоимость шла из `handleClickOutside`
- `advice-list-content` — контейнер без собственного handler; боль — React flush
  из swipe/expand path
- `heys_day_day_handlers.js` → concat → `heys_day_core_bundle_v1.js` →
  `boot-calc` (важно для selective rebuild)
- `day/_advice.js` — source; `heys_day_bundle_v1.js` — delivery-копия; обе нужно
  синхронизировать

---

## Сессия R14–R51 (2026-03-21 — 2026-03-23) — DayNav + React scheduling

### R50 — crash fix + DayNav regression

Перед оптимизацией был исправлен crash в `heys_day_effects.js`. После этого
DayNav-bottleneck стал главной целью.

### R51 — startTransition на setDay (финальный фикс DayNav)

**Файл:** `apps/web/heys_day_effects.js`

**Изменение:** `setDay()` + `setIsHydrated(true)` в `doLocal()` обёрнуты в
`React.startTransition()` — оба branch (existing-day и new-day).

| Метрика          | До R51 |   После R51 | Улучшение |
| ---------------- | -----: | ----------: | --------: |
| DayNav (Отчёты)  |   99ms |  **10.6ms** |      −89% |
| DayNav (Дневник) |   84ms |   **0.9ms** |      −99% |
| DayNav (Инсайты) |  139ms |   **2.3ms** |      −98% |
| Water FAB        |  138ms |    **50ms** |      −64% |
| Tab→Дневник      |   97ms | **19–40ms** |      −70% |

**Также удалён:** дублирующий `requestFlush` в `heys_day_calendar_block_v1.js` →
`handleSelect()`.

**Откачены регрессии:**

- `startTransition` на `setSelectedDate` → деферило заголовок; DayNav 99ms →
  469ms
- `useDeferredValue` на `mobileSubTab` → двойной defer; Tab→Дневник 97ms → 652ms
- `setTimeout(0)` на water FAB → добавлял tick; 138ms → 231ms

### Бандлы после R51

- `boot-day.bundle.4e580f710776.js`
- `boot-app.bundle.b9f4e2fdc06d.js`

---

## Полный аудит элементов (2026-03-23)

Проверено 70+ элементов на всех 5 вкладках + хедер. State-изменения (вода,
приёмы, refeed) были отменены после каждого замера.

### Быстрые (< 50ms rAF) — всё ОК

| Элемент                           |      rAF |
| --------------------------------- | -------: |
| DayNav ← → (все вкладки)          | 0.5–17ms |
| Calendar open                     |    9.5ms |
| Cascade card open/close           |   8–15ms |
| КБЖУ / Советы expand/collapse     |   6–14ms |
| + Добавить приём / 🗑 Delete meal |   4–14ms |
| Mood, GameExpand, Info            |   3–17ms |

### Медленные (> 50ms rAF) — статус по итогам сессии R52–R53

| Элемент             |     rAF до | Статус             | Примечание                                                                                                                                |
| ------------------- | ---------: | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Refeed toggle       | ~107–114ms | ❌ **R52 отменён** | DayTab-монолит: 30+ useState, `startTransition` и `setTimeout(0)+startTransition` не помогают. Требует разбивки DayTab на sub-компоненты. |
| Sparkline 7д→30д→7д |  ~99–129ms | ✅ **R53 готово**  | In-memory Map-кэш (60s TTL) в `getActiveDaysForMonth`. Cold: 172ms, Warm: 0ms.                                                            |
| Meal quality popup  |   ~80–90ms | ⏸ отложено        | Defer-паттерн не применялся. Попробовать `setTimeout(0)` в `heys_day_popups_state_v1.js`.                                                 |
| Stat popups         |      ~80ms | ⏸ отложено        | Аналогично meal quality.                                                                                                                  |
| Theme toggle ☀️     |      ~90ms | ⏸ отложено        | `document.body.classList` + `localStorage` — можно попробовать defer.                                                                     |
| Water FAB           |      ~50ms | ✅ принято         | Пограничный после R51. `setTimeout(0)` делало хуже (231ms).                                                                               |

---

## Сессия R52–R53 (2026-03-23) — архитектурные оптимизации

### R52 — Refeed toggle startTransition (ОТМЕНЁН)

**Цель:** снизить 107ms блокировку при переключении refeed-дня через
`startTransition`.

**Попытки:**

1. `React.startTransition(() => setDay(...))` → rAF 129–145ms (хуже)
2. `setTimeout(0, () => startTransition(() => setDay(...)))` → maxBlock
   112–118ms (без улучшений)

**Вердикт:** DayTab — монолит с 30+ useState. Любой `setDay` триггерит полный
re-render ~107ms вне зависимости от обёртки. Не фиксируется без структурного
рефактора (разбивки DayTab на независимые sub-компоненты с локальным state).

### R53 — Sparkline in-memory cache ✅

**Файлы:** `apps/web/heys_day_core_bundle_v1.js`, `apps/web/heys_day_utils.js`

**Проблема:** `getActiveDaysForMonth` была определена дважды — в
`heys_day_core_bundle_v1.js` (R53 already applied) и в `heys_day_utils.js`
(перезаписывала первую без кэша). Реально работала версия из
`heys_day_utils.js`.

**Решение:** добавлен `_activeDaysCacheU` (Map, 60s TTL) в `heys_day_utils.js` с
инвалидацией по `heys:day-updated`.

| Метрика                | Без кэша (cold) | С кэшем (warm) | Экономия |
| ---------------------- | --------------: | -------------: | -------: |
| 1 месяц                |           172ms |        **0ms** |    ~100% |
| 12 месяцев (sparkline) |           682ms |        **0ms** |    ~100% |

`sameRef: true` — кэш возвращает тот же объект Map.

**Бандл:** `boot-calc.bundle.46b465787761.js`

---

## Backlog — что осталось на потом

### 🔴 DayTab рефактор (высокий приоритет, высокая стоимость)

- Разбить `DayTab` (30+ useState) на sub-компоненты с локальным state
- Единственный способ устранить refeed toggle 107ms
- Файл: `apps/web/src/` (компонент DayTab / day-related React components)

### 🟡 Popup defer-pass (низкий риск, лёгкий)

- Meal quality popup (~80–90ms): `setTimeout(0)` на open-handler
- Stat popups (~80ms): аналогично
- Файл: `apps/web/heys_day_popups_state_v1.js`

### 🟡 Theme toggle (~90ms)

- `document.body.classList` + localStorage — задержать до следующего task
- Файл: поиск по обработчику кнопки ☀️ в `heys_app_shell_v1.js`

### 🟢 Аудит других экранов

- Только DayTab-вкладки были проверены
- Виджеты, Инсайты, Месяц — не проверялись | Виджеты (все карточки) | 3–16ms | |
  Инсайты cards/tabs/filters | 1.5–36ms | | Месяц view toggles | 7–19ms | |
  Settings ⚙️, date picker | 7–10ms | | Quick date buttons | 34ms | | Tab
  switches (тёплые) | 7–50ms |

### 80–140ms — норма, нецелесообразно оптимизировать

| Элемент                            |       rAF | Причина                                 |
| ---------------------------------- | --------: | --------------------------------------- |
| Theme toggle 🌙/☀️                 | 117–137ms | Полный перерендер CSS-переменных        |
| Sparklines 7д/14д/30д              |  99–129ms | SVG-перерисовка с другим диапазоном     |
| Stat popups (Затраты/Цель/Съедено) |  91–105ms | Первичный рендер popup                  |
| Refeed toggle 🍕                   | 107–114ms | Переключение режима → полный перерендер |
| Meal bars tap                      |     113ms | Первичный рендер tooltip                |
| Meal quality ⭐                    |     103ms | Первичный рендер tooltip                |
| Wave toggle (open)                 |      99ms | Рендер графика инсулиновой волны        |
| 📊 30 дней (Инсайты)               |      96ms | Вычисление аналитики за 30 дней         |
| Water FAB 🥛                       |   67–90ms | Обновление state воды + перерендер      |

**Вывод:** дальнейших оптимизаций не требуется. Все оставшиеся >80ms — это
реальные вычисления или первичные рендеры, а не render bottleneck-и. Ускорить их
можно только архитектурными изменениями (Web Workers, виртуализация, skeleton
screens), несоразмерными текущей задаче.

---

## Актуальные бандлы (2026-03-23)

- `boot-core.bundle.9b1dd62c0baf.js`
- `boot-calc.bundle.0c992e608f08.js`
- `boot-day.bundle.4e580f710776.js`
- `boot-app.bundle.b9f4e2fdc06d.js`
- `boot-init.bundle.14e083d7af95.js`
- `postboot-1-game.bundle.540594551593.js`
- `postboot-2-insights.bundle.1655bfa6815b.js`
- `postboot-3-ui.bundle.51cbc0cea45a.js`
