# HEYS PWA Performance Investigation — Session Log (2026-03-21)

> Цель документа: зафиксировать, что именно было исследовано и изменено в этой
> сессии, какие гипотезы уже проверены, какие фиксы дали эффект, какие файлы и
> бандлы затронуты, и с какого места продолжать дальше.

---

## Краткий статус

На этой сессии шла **итеративная runtime-оптимизация HEYS PWA** по данным
`HEYS.perfMon.start()` / `v`.

Подход по раундам:

1. пользователь снимает perfMon;
2. анализируется top slow events / long tasks;
3. выбирается самый болезненный bottleneck;
4. вносятся точечные фиксы;
5. legacy-бандлы пересобираются;
6. пользователь делает следующий perfMon.

Состояние на конец сессии:

- **R8–R12**: реализованы и проверены / частично проверены;
- **R13**: реализован, **ожидает perfMon-проверку**;
- последняя фактическая метрика в этой сессии — **отчёт после R12**, на базе
  которого был сделан R13.

---

## Главные выводы сессии

### 1. Основной паттерн успешных фиксов

Для тяжёлых React-обновлений в event handlers лучшим паттерном здесь оказался:

- `setTimeout(0)`
- - `React.startTransition(...)`

То есть:

- **обработчик клика завершается почти мгновенно**;
- тяжёлый render уезжает в отдельный task;
- пользователь перестаёт видеть `click handler took 300–500ms`.

Для document-level / async-path обработчиков иногда хватает **только**
`startTransition`, без `setTimeout`.

### 2. В DayTab слишком дорогие перерисовки

Корневая архитектурная проблема не устранена полностью:

- DayTab остаётся тяжёлым монолитом;
- многие локальные `setState` триггерят большой React re-render;
- поэтому после фикса одного click bottleneck почти всегда «всплывает» следующий
  элемент с тем же временем processing (~370–500ms).

### 3. Часть «slow touchstart/touchend» — это не бизнес-логика, а React/event-loop cost

Несколько раз повторилось, что у элемента **нет собственного `onTouchStart` /
`onClick`**, но perfMon всё равно показывает высокий `processing`.

Это происходило из-за:

- всплытия к родителям;
- document-level listeners;
- последующего тяжёлого React flush/re-render.

### 4. Для advice/UI-path теперь ключевой следующий фронт — не popup state, а advice overlay / tab switching / swipe flows

После R12 bottleneck сместился из popup-state области в:

- advice tab badge;
- advice overlay/content;
- advice card details toggle;
- caloric balance expand/collapse.

Под это и был сделан R13.

---

## Что было реализовано по раундам

## R1–R4 — Baseline и изучение архитектуры

**Цель:** установить baseline performance, понять архитектуру DayTab, подключить
`HEYS.perfMon`.

**Что делалось:**

- Подключена инфраструктура `HEYS.perfMon` (`PerformanceObserver` для
  `longtask`, FPS drop, scroll jank, slow events).
- Сделан первый raw perfMon snapshot: зафиксированы общие метрики (sessionMs,
  longTasks, slowEvents, scrollJanks).
- Изучена архитектура `DayTab` — монолитный React-компонент с десятками
  `useState`, который обслуживает всё: popup-state, date navigation, advice,
  stats, water, steps, meals.
- Проведён анализ legacy bundle системы: файл → concat → bundle → `boot-*` →
  `public/boot-*.bundle.{hash}.js`.
- Установлены ключевые наблюдения: тяжёлые click handlers синхронно блокируют
  main thread через React flush.

**Результат:** baseline зафиксирован. Стратегия определена: `setTimeout(0)` +
`React.startTransition` для переноса setState из click handlers.

---

## R5 — FIX B v1 (steps slider, первая попытка)

**Идея:** ускорить drag/release на слайдере шагов.

**Что менялось:** логика onChange слайдера; попытка defer setState через
`useCallback`.

**Результат:** **не дало заметного эффекта.** perfMon показал, что processingMs
практически не изменился.

**Диагноз:** handler был «отложен», но React всё ещё синхронно флашил из-за
того, что не был использован `startTransition`; кроме того, анимация слайдера
добавляла свои лонг-таски поверх обновления state.

---

## R6 — Диагноз после FIX B v1

**Что исследовалось:**

- Почему FIX B v1 не помог: разобрали, что `useCallback` без `startTransition`
  только переупаковывает функцию, но не меняет scheduling.
- Поняли, что нужен `setTimeout(0)` чтобы разорвать synchronous call stack,
  **плюс** `startTransition` чтобы React понял, что это non-urgent render.
- Изучили конкретный путь: `onPointerUp` → setState → React flush → весь DayTab
  re-renders за один task.

**Итог:** сформулирован правильный паттерн для R9.

---

## R7 — FIX C (промежуточный фикс, ограниченный эффект)

**Что делалось:** применён defer-паттерн к одному из менее критичных click
handlers (предположительно date navigation или один из overlay triggers).

**Результат:** незначительный — processingMs упал, но ненадолго стал top
bottleneck другой handler. Это подтвердило «whack-a-mole» эффект в монолитном
DayTab.

**Важный вывод:** нельзя оптимизировать только «самый тяжёлый» путь по одному
разу и ждать кардинального улучшения — нужна систематическая zap по всем
expensive click handlers.

---

## R8 — первые deferred fixes

### FIX A — confirm modal

**Идея:** закрывать модалку сразу, а тяжёлую логику выполнять defer’ом.

**Результат:**

- было: ~469ms processing;
- стало: ~1–9ms.

**Статус:** подтверждено как успешный fix.

---

## R9 — steps slider (v2)

### FIX B v2 — шаги

**Идея:**

- во время drag не гонять тяжёлые state updates;
- визуальную часть вести легче;
- подтверждение / запись — defer’ом.

**Результат:**

- было: ~590ms processing;
- стало: ~0ms на целевом сценарии.

**Статус:** подтверждено как успешный fix.

---

## R10 — water preset animation

### FIX D — DOM-based animation for water preset

**Проблема:** React state использовался и для факта действия, и для визуальной
анимации, что делало click дорогим.

**Решение:**

- вынести анимацию в DOM-injection путь;
- не заставлять React синхронно обслуживать декоративный эффект.

**Результат:**

- было: ~426ms;
- стало: ~52ms.

**Статус:** подтверждено как успешный fix.

### Важное архитектурное открытие R10

Файл `apps/web/heys_day_day_handlers.js` не просто source-файл: он **ручным
concat-путём** попадает в `apps/web/heys_day_core_bundle_v1.js`, а уже тот — в
`boot-calc`.

То есть для похожих правок важно помнить:

- source может быть в одном файле;
- реально исполняемый код — в manual concat bundle;
- selective rebuild нужно выбирать с учётом этого.

---

## R11 — popup open/close

### FIX E — deferred popup state changes

**Затронутый файл:** `apps/web/heys_day_popups_state_v1.js`

**Что изменено:**

- `openExclusivePopup(...)`
- `closeAllPopups()`

Оба path были переведены на defer-паттерн:

- `setTimeout(0)`
- `React.startTransition(...)`

**Результат по perfMon:**

`metrics-value` click processing:

- было: ~375ms;
- стало: **~1ms**.

**Статус:** подтверждено как очень успешный fix.

---

## R12 — click-outside path

### Диагноз R12

После успеха R11 вылез новый top bottleneck:

- `div.risk-radar-badge`
- touchstart / click / touchend ~371–377ms

Исследование показало:

- у `risk-radar-badge` **нет собственного click handler**;
- стоимость приходила из `handleClickOutside` в `heys_day_popups_state_v1.js`;
- этот путь **обходил** уже оптимизированный `closeAllPopups()` и напрямую
  вызывал пачку `setState(...)`.

### FIX F — deferred handleClickOutside

**Файл:** `apps/web/heys_day_popups_state_v1.js`

**Изменение:**

все setState в `handleClickOutside` обёрнуты в `React.startTransition(...)`.

### Результат R12

`risk-radar-badge` исчез из top slow events.

Это означает, что FIX F сработал по целевому bottleneck.

### Снимок R12 perfMon

Сессия:

- `sessionMs`: **139,752**
- `totalEntries`: **600**

Сводка:

- `longTasks`: **181**
- `longTasksAvgMs`: **264ms**
- `longTasksMaxMs`: **541ms**
- `longTasksTotalMs`: **47,766ms**
- `scrollJanks`: **24**
- `slowEvents`: **332**
- `fpsDrops`: **57**
- `slowTimers`: **6**

### Что стало top bottleneck после R12

Top slow events уже были не про popup state, а про advice / stats interactions:

1. `click` target `""` — **503ms**
2. `button.advice-card-footnote-link` — **422ms**
3. `div.advice-list-content` `touchend` — **419ms**
4. `click` target `""` — **404ms**
5. `div.advice-list-content` `touchend` — **395ms**
6. `div.advice-list-content` `touchend` — **395ms**
7. `span#nav-advice-badge.tab-advice-badge` `click` — **394ms**
8. `button.advice-card-footnote-link` `touchend` — **385ms**
9. `span#nav-advice-badge.tab-advice-badge` `touchstart` — **376ms**
10. `span#nav-advice-badge.tab-advice-badge` `touchend` — **376ms**

Также в логе был `span.caloric-balance-rec-short` / surrounding caloric balance
card path с ~372ms click cost.

---

## R13 — advice & caloric-balance defer pass

R13 был реализован **на основе R12 perfMon**, но ещё не проверен новым perfMon
на момент завершения этой сессии.

### FIX G — defer advice tab dispatch

**Файл:** `apps/web/heys_app_shell_v1.js`

Клик по advice-tab делал:

- условный `setTab('stats')`
- затем `window.dispatchEvent(new CustomEvent('heysShowAdvice'))`

Dispatch был переведён в:

- `setTimeout(() => dispatchEvent(...), 0)`

**Цель:** убрать тяжёлый synchronous advice render из click handler на tab
badge.

### FIX H — defer handleShowAdvice state

**Файлы:**

- `apps/web/day/_advice.js`
- `apps/web/heys_day_bundle_v1.js` (generated concat / synced copy)

`handleShowAdvice` теперь выполняет state changes внутри
`React.startTransition(...)`.

**Цель:** advice overlay / toast / expansion не должны синхронно висеть на click
handler.

### FIX I — defer advice details toggle

**Файлы:**

- `apps/web/day/_advice.js`
- `apps/web/heys_day_bundle_v1.js`

`handleAdviceToggleExpand(adviceId)` переведён на:

- `haptic('light')`
- `setTimeout(0)`
- `React.startTransition(() => setExpandedAdviceId(...))`

**Цель:** `advice-card-footnote-link` click не должен синхронно рендерить
тяжёлую карточку.

### FIX J — defer caloric balance / debt card expand

**Файл:** `apps/web/heys_day_stats_v1.js`

Оптимизированы **два** expand path:

- `caloric-balance-card excess`
- `debt-card`

Оба onClick теперь используют defer-pattern.

**Цель:** убрать ~372ms processing из открытия карточки калорийного баланса /
debt card.

---

## Затронутые файлы этой сессии

Ниже — practical shortlist, с которым имеет смысл начинать следующую сессию.

### Основные runtime-файлы

- `apps/web/heys_day_popups_state_v1.js`
  - R11, R12
  - popup open/close + click-outside

- `apps/web/heys_app_shell_v1.js`
  - R13 FIX G
  - advice tab dispatch defer

- `apps/web/day/_advice.js`
  - R13 FIX H, I
  - advice overlay / expand logic

- `apps/web/heys_day_bundle_v1.js`
  - generated / synced day bundle copy
  - содержит те же advice fixes, что и `day/_advice.js`

- `apps/web/heys_day_stats_v1.js`
  - R13 FIX J
  - caloric balance / debt expand defer

### Файлы, важные как архитектурный контекст

- `apps/web/heys_day_day_handlers.js`
  - R10 logic source

- `apps/web/heys_day_core_bundle_v1.js`
  - manual concat bundle copy of day handlers

- `apps/web/heys_day_page_shell.js`
  - исследовался в R12 при поиске `risk-radar-badge`

- `apps/web/heys_app_swipe_nav_v1.js`
  - исследован для понимания tab-content touch/swipe path

---

## Важные технические находки

### 1. `risk-radar-badge` был ложной целью

`risk-radar-badge` казался тяжёлым click-target, но сам по себе не имел handler.

Истинная причина была в document-level `handleClickOutside`.

### 2. Advice tab badge — это child, а логика живёт в родителе

`span#nav-advice-badge.tab-advice-badge` не содержит отдельного onClick.

Реальный handler живёт в:

- `apps/web/heys_app_shell_v1.js`
- у родителя `.tab.tab-advice`

### 3. `advice-list-content` сам по себе не click-handler

`div.advice-list-content` — контейнер.

Processing там возникает из-за родительских paths:

- swipe/touch handlers;
- expand logic;
- overlay render;
- последующего React flush.

### 4. `caloric-balance-rec-short` тоже не был отдельной бизнес-логикой

Боль шла не от текста как такового, а от раскрытия/перерисовки surrounding
caloric balance card.

### 5. `day/_advice.js` — source, `heys_day_bundle_v1.js` — важная delivery-копия

При следующей работе по advice-path надо учитывать, что:

- source of truth концептуально — `apps/web/day/_advice.js`;
- но delivery/concat-слой — `apps/web/heys_day_bundle_v1.js`;
- после правок нужно проверять, что generator path действительно
  синхронизировался.

---

## Бандлы и хэши на конец сессии

Актуальное состояние legacy assets:

- `boot-core.bundle.9b1dd62c0baf.js`
- `boot-calc.bundle.0c992e608f08.js`
- `boot-day.bundle.c0254c594bbb.js`
- `boot-app.bundle.7a9e02dc7a1d.js`
- `boot-init.bundle.14e083d7af95.js`
- `postboot-1-game.bundle.b298b218e23e.js`
- `postboot-2-insights.bundle.1655bfa6815b.js`
- `postboot-3-ui.bundle.14cf14d446d8.js`

### Что именно обновлялось в этой сессии

#### После R12

- `boot-day`: `d9b550819b46` → `c0254c594bbb`

#### После R13

- `boot-calc`: `6784dba18c6a` → `0c992e608f08`
- `boot-app`: `66f10b2b5822` → `7a9e02dc7a1d`

### Lazy-loaded path

- `apps/web/heys_day_stats_v1.js` обслуживается через
  `heys_day_stats_bundle_loader_v1.js`
- то есть часть R13 effect сидит не только в boot-bundles, но и в lazy-loaded
  stats file

---

## Что уже доказано как working

### Подтверждённые успешные фиксы

- confirm modal defer
- steps slider defer / DOM-first interaction
- water preset DOM-animation path
- popup openExclusivePopup / closeAllPopups defer
- click-outside popup close defer

### Что реализовано, но ещё требует perfMon-подтверждения

- advice tab dispatch defer
- handleShowAdvice transition wrapping
- advice details toggle defer
- caloric balance / debt card defer

---

## Что смотреть в следующей сессии (R14+)

Если после R13 perfMon всё ещё покажет advice-heavy bottlenecks, идти по такому
порядку:

### Гипотеза 1 — advice swipe end path всё ещё synchronous

Проверить:

- `handleAdviceSwipeEnd(...)` в `day/_advice.js`

Почему это кандидат:

- `div.advice-list-content touchend` держится на ~395–419ms;
- внутри swipe end есть несколько state updates, storage writes, haptic/sound
  side effects.

Осторожность:

- нельзя сломать UX swipe-dismiss / snap-back;
- возможно, надо разделить «визуальный откат» и «тяжёлую побочку».

### Гипотеза 2 — touchstart/touchend на tab/advice partly React overhead

Если после R13 останутся:

- `touchstart` / `touchend` на advice badge ~300ms+,

то это может быть уже не локальный handler, а React delegation + render cost.

Тогда следующий шаг — не ещё один defer, а:

- component split;
- isolate overlay state;
- сократить размер re-render subtree.

### Гипотеза 3 — scroll jank теперь заметнее, чем clicks

В R12:

- `scrollJanks`: 24
- много long tasks по 360–540ms

Если клики после R13 станут легче, следующий главный фронт может быть:

- render during scroll;
- heavy list sections;
- advice overlay / diary subtree mount cost.

### Гипотеза 4 — нужен structural split, а не только defer

Если после ещё 1–2 раундов processing остаётся на уровне ~350–450ms, стоит
рассмотреть:

- вынос advice overlay state в отдельный subtree/portal-owner;
- дальнейшую декомпозицию DayTab;
- более агрессивное memo/useMemo по тяжёлым веткам;
- уменьшение числа независимых state-переменных в одном рендер-дереве.

---

## Рекомендуемый протокол следующего perfMon

Чтобы сравнение было полезным, повторять примерно такой сценарий:

1. перезагрузка страницы;
2. `HEYS.perfMon.start()`;
3. клик по advice tab badge;
4. открытие/закрытие advice overlay;
5. клик по `Детали` у advice-card;
6. взаимодействие с caloric balance / debt card;
7. немного scroll;
8. при желании — шаги/вода для контроля regressions;
9. `HEYS.perfMon.report()`.

Важно смотреть отдельно:

- top10slowEvents;
- longTasksMaxMs;
- longTasksTotalMs;
- scrollJanks.

---

## Проверенные rebuild paths в этой сессии

### R12 rebuild

Использовался selective rebuild для:

- `apps/web/heys_day_popups_state_v1.js`

Обновился:

- `boot-day.bundle.c0254c594bbb.js`

### R13 rebuild

Использовался selective rebuild для:

- `apps/web/heys_app_shell_v1.js`
- `apps/web/day/_advice.js`
- `apps/web/heys_day_bundle_v1.js`

Скрипт автоматически понял, что нужно:

- пересобрать intermediate generator `day`;
- затем собрать `boot-app` и `boot-calc`.

Итоговые updated assets:

- `boot-app.bundle.7a9e02dc7a1d.js`
- `boot-calc.bundle.0c992e608f08.js`

Также была отдельно подтверждена наличие R13 комментариев / кодовых маркеров в
бандлах и обновление `index.html`.

---

## Короткий changelog по файлам

### `apps/web/heys_day_popups_state_v1.js`

- R11: deferred `openExclusivePopup`
- R11: deferred `closeAllPopups`
- R12: `handleClickOutside` → `startTransition`

### `apps/web/heys_app_shell_v1.js`

- R13: advice tab `heysShowAdvice` dispatch → `setTimeout(0)`

### `apps/web/day/_advice.js`

- R13: `handleShowAdvice` → `startTransition`
- R13: `handleAdviceToggleExpand` → `setTimeout(0)` + `startTransition`

### `apps/web/heys_day_bundle_v1.js`

- synced R13 advice changes for generated/day delivery layer

### `apps/web/heys_day_stats_v1.js`

- R13: `caloric-balance-card` expand defer
- R13: `debt-card` expand defer

---

## На что обратить внимание перед следующими правками

1. **Не забывать про legacy rebuild.** Простого diff недостаточно — нужно
   пересобрать реальные public assets.

2. **Для advice-path помнить про generator layer.** `day/_advice.js` и
   `heys_day_bundle_v1.js` нельзя рассматривать как полностью независимые миры.

3. **Не путать target с source of work.** Элемент из perfMon top list не
   обязательно сам содержит handler.

4. **При optimizations не ломать UX.** Особенно в swipe/touch gestures, где
   синхронная визуальная реакция иногда нужна.

---

## R14 — supplements-card defer + perfMon v2

После R13 был снят **первый полноценный perfMon snapshot на тяжёлом клиенте**.

### Snapshot R14 baseline (тяжёлый клиент)

- `totalEntries`: **578**
- `longTasks`: **198**
- `longTasksMaxMs`: **380ms**
- `longTasksTotalMs`: **26,349ms**
- `scrollJanks`: **45**
- `slowEvents`: **290**
- `fpsDrops`: **43**

### Что стало главным bottleneck

Top list сместился в:

- supplements chips / batch toggles — **~228–347ms**;
- `metrics-value touchstart` — **~274ms**;
- повторяющиеся long-task пары во время scroll.

Это был первый замер, где уже явно стало видно, что **масштаб данных клиента
сам по себе начинает доминировать**, а не только один локальный handler.

### FIX K — defer supplements chip click

**Файл:** `apps/web/heys_supplements_v1.js`

`handleClick(...)` был переведён на паттерн:

- `setTimeout(0)`
- `React.startTransition(...)`

Внутрь deferred-path были убраны:

- `clearCelebrationState(...)`
- `toggleTaken(...)`
- `maybeAutoCollapse(...)`

### FIX L — defer group batch button

Там же была так же отложена групповая кнопка `markGroupTaken(...)`, чтобы batch
toggle не тащил тяжёлый render в сам click handler.

### perfMon v2 enhancement

**Файл:** `apps/web/index.html`

Для следующих раундов был усилен сам perf tooling:

- добавлен `HEYS.perfMon.mark(label, data?)`;
- добавлен ancestry-walk по `data-perf-id`;
- добавлена агрегация `clicksByComponent`;
- top timers расширены до `top10slowTimers`;
- slow event console output теперь умеет помечать компонент.

Это было нужно не ради красоты, а чтобы перестать дебажить perf «по запаху».
Иначе top slow event часто указывал на target, а не на реального владельца
render-cost.

### R14 rebuild

Selective rebuild был сделан для:

- `apps/web/heys_supplements_v1.js`

Обновился asset:

- `boot-init.bundle.14e083d7af95.js` → `boot-init.bundle.6c87215c4381.js`

---

## Сравнительный perfMon на лёгком клиенте

После R14 был снят ещё один perfMon — уже на другом, заметно более лёгком
клиенте.

### Snapshot (лёгкий клиент)

- `totalEntries`: **147**
- `longTasks`: **23**
- `longTasksMaxMs`: **144ms**
- `longTasksTotalMs`: **1,923ms**
- `scrollJanks`: **27**
- `slowEvents`: **87**
- `fpsDrops`: **9**

### Что это доказало

Разница оказалась слишком большой, чтобы списать её только на случайный шум:

- long tasks: **198 → 23** (~8.6x меньше)
- total long task time: **26.3s → 1.9s** (~13.7x меньше)
- max click processing: примерно **347ms → 98ms**

Это подтвердило ключевую гипотезу сессии:

> Основной долг уже не только в DayTab-monolith, а в том, что для части путей
> приложение слишком охотно трогает накопленную историю клиента.

Именно после этого стало ясно, что после R15/R16 нужен уже не только ещё один
defer-pass, а **data-scaling strategy**.

---

## R15 — meal-rec-card expand defer

**Файл:** `apps/web/insights/pi_ui_meal_rec_card.js`

### FIX M — defer expand/collapse

Header click был переведён с прямого:

- `setExpanded(!expanded)`

на:

- `setTimeout(() => React.startTransition(() => setExpanded(prev => !prev)), 0)`

Дополнительно на header был поставлен:

- `data-perf-id="meal-rec-card"`

### Зачем

`MealRecCard` живёт в тяжёлом insights-path и на клиенте с большой историей
может провоцировать заметный re-render хвоста diary/insights subtree. Тут была
та же идея, что и в R11/R13/R14: **дать click handler завершиться быстро, а
React-render увести в отдельный task**.

### R15 rebuild

Selective rebuild был сделан для:

- `apps/web/insights/pi_ui_meal_rec_card.js`

Обновился asset:

- `postboot-2-insights.bundle.1655bfa6815b.js` →
  `postboot-2-insights.bundle.56e70f88e15e.js`

---

## R16 — lazy mount below fold

**Файл:** `apps/web/heys_day_diary_section.js`

### FIX N — IntersectionObserver gate для below-fold subtree

В `DiarySection` был добавлен `LazyMount` wrapper на базе
`IntersectionObserver`.

Идея простая:

- пока блок ещё не рядом с viewport — React **не монтирует** тяжёлые карточки;
- в DOM держится только лёгкий placeholder;
- реальный mount случается, когда пользователь доходит до секции.

Под этот gate были убраны нижние diary cards:

- `slot-mealrec`
- `slot-supplements`
- `mealsChart`
- `insulinIndicator`

### Почему это важно

`renderCard(...)` для части модулей сам по себе дешёвый, но mount компонентов с
хуками / memo / derived calculations — нет. Поэтому даже при идеальном defer в
click handler initial render всё равно может быть дорогим, если приложение
слишком много монтирует сразу.

R16 — это уже не micro-fix в обработчике, а **структурный шаг к windowed UI**:
не тащить below-fold стоимость в first meaningful interaction.

### R16 rebuild

Selective rebuild был сделан для:

- `apps/web/heys_day_diary_section.js`

Скрипт корректно пересобрал intermediate generators и затронутые bundles:

- `boot-calc.bundle.0c992e608f08.js` → `boot-calc.bundle.7b2904c64d8f.js`
- `boot-day.bundle.c0254c594bbb.js` → `boot-day.bundle.97adda93ec89.js`

---

## Пост-R16 валидация

### File validation

После rebuild было подтверждено:

- `bundle-manifest.json` синхронизирован с новыми hash-именами;
- `index.html` preload/script ссылки обновлены;
- реальные assets существуют в `apps/web/public/`.

Актуальные ключевые assets после R16:

- `boot-init.bundle.6c87215c4381.js`
- `boot-calc.bundle.7b2904c64d8f.js`
- `boot-day.bundle.97adda93ec89.js`
- `postboot-2-insights.bundle.56e70f88e15e.js`

### Browser validation

Поскольку R16 — runtime-sensitive правка (mount scheduling / below-fold
rendering), была сделана браузерная проверка hashed assets на `localhost`.

После reload браузер реально грузил:

- `boot-calc.bundle.7b2904c64d8f.js`
- `boot-day.bundle.97adda93ec89.js`
- `postboot-2-insights.bundle.56e70f88e15e.js`
- `boot-init.bundle.6c87215c4381.js`

Полный behavioural smoke-test именно DayTab в браузере в этой точке не был
выполнен, потому что открытая страница находилась на login screen без входа в
клиентский аккаунт. То есть stale-cache риск был проверен, а не сам UX diary
после авторизации.

---

## Стратегия против деградации на клиентах с историей за год

### Главный вывод

Для HEYS уже недостаточно только «деферить клики». Это полезно, но не решает
корень проблемы у тяжёлых клиентов.

Нужна архитектура, при которой:

- **UI interaction path не читает всю историю**;
- **регулярные badge/insights вычисления не сканируют весь localStorage**;
- raw `dayv2` остаётся источником истины, но UI работает через derived layers.

### Что уже видно по коду

Хороший паттерн в кодовой базе уже существует:

- многие insights-функции берут **последние 7 / 14 / 21 / 30 дней**, а не всё;
- есть готовый пример precomputed cache: `heys_ews_weekly_v1`.

Плохой паттерн тоже уже виден:

- `EarlyWarningBadge` в `pi_ui_dashboard.js` перечитывает **все** `heys_dayv2_*`
  ключи и делает это ещё и по interval;
- часть статистик и служебных путей всё ещё линейно сканирует весь
  `localStorage`.

### Рекомендуемая целевая модель

Не «месячные summary вместо дней», а **трёхслойная схема**:

1. **Raw day data** — как сейчас, `heys_dayv2_YYYY-MM-DD`
2. **Daily digest** — компактное derived-summary на каждый день
3. **Rolling / monthly aggregates** — недельные / месячные rollups для дешёвых
  исторических графиков и badge-подсчётов

То есть:

- raw day нужен для редактирования, глубокого drill-down и пересчёта;
- daily digest нужен для обычного UI и быстрых сравнений;
- rollups нужны, чтобы история за 90–365 дней не стоила как 365 полных JSON
  документов в hot path.

### Что именно хранить в daily digest

В отдельном compact key, например `heys_dayv2_digest_YYYY-MM-DD`, хранить только
то, что реально нужно большинству historical reads:

- date;
- kcal / prot / fat / carbs;
- water, steps, trainingMinutes;
- sleepHours;
- moodAvg / dayScore / stress proxy;
- flags: `isIncomplete`, `isRefeedDay`, `isFastingDay`;
- derived summary для advice / EWS / patterns:
  - meal count;
  - last meal time;
  - simple sugar total;
  - GL-ish / harm-ish summary;
  - status / cascade / meal-quality snapshots, если они уже были посчитаны.

Критично: digest должен быть **маленьким и плоским**, без `meals[].items[]`.

### Что делать с месяцами

Для long-range history (90–365 дней) не читать daily raw/digest по одному в
каждом render-path. Вместо этого поддерживать monthly rollups, например:

- `heys_dayv2_rollup_month_2026-03`

Там хранить:

- totals / averages / counts;
- warning frequencies;
- best/worst streaks;
- compact histogram-like bins для графиков.

Идея: если UI хочет годовой overview, он должен читать:

- последние 14–30 дней из digest;
- всё старше — из monthly rollups.

### Приоритетный roadmap

#### Phase 1 — low-risk, быстрая отдача

1. Ввести `heys_dayv2_index_v1`:
  - список дат;
  - count tracked days;
  - lastUpdated;
  - optional last90 list.

  Это сразу уберёт бессмысленные сканы `localStorage.length` ради простого
  count / discover-days.

2. Переписать EWS badge на windowed read:
  - hot path: последние 30 дней;
  - недельные / месячные summary брать из `heys_ews_weekly_v1` и rollup cache;
  - invalidate по `heys:day-updated`.

3. Добавить in-memory cache для last N digests:
  - 7 / 14 / 30 / 90;
  - сбрасывать только при изменении дня или sync.

#### Phase 2 — основной structural fix

4. При каждом save day автоматически обновлять:
  - day raw;
  - day digest;
  - month rollup;
  - index.

5. Insights / advice / EWS перевести с raw-scan на:
  - digest-first;
  - raw-on-demand только для deep explainability.

6. Зафиксировать жёсткое правило:

> Ни один обычный UI handler / badge / tab-open path не должен парсить больше
> 30–45 полных dayv2 объектов.

#### Phase 3 — если истории станет ещё больше

7. Если клиенты стабильно уйдут в 180–365+ дней и появятся новые тяжёлые
  артефакты, рассмотреть перенос long-tail history в IndexedDB.

Но это именно **второй этап миграции**, а не первый. Сейчас можно получить очень
большой выигрыш, даже оставаясь на текущей localStorage-модели, если убрать
полные сканы и ввести derived layers.

### Практическое правило для HEYS

Для клиента с историей за год нормой должно стать такое поведение:

- DayTab initial open читает **только текущий день + короткие rolling caches**;
- insights badges не сканируют весь архив;
- scroll / expand / tab switch не провоцируют historical full reads;
- full raw history читается только по явному deep-analysis сценарию.

Если это соблюдено, год истории перестаёт быть runtime-проблемой, а становится
просто storage-фактом.

---

## Самый короткий resume для продолжения

Если продолжать позже совсем быстро, стартовая мысль такая:

> После R13 были сделаны R14–R16: supplements defer, meal-rec defer и
> below-fold lazy mount. Самое важное открытие — тяжёлый клиент и лёгкий клиент
> различаются на порядок по long-task cost, значит следующий большой шаг — не
> очередной micro-defer, а внедрение data-scaling layer: `day index` + `daily
> digest` + `monthly rollups`, а затем перевод EWS / insights / advice с
> full-history scans на windowed / cached reads. Перед следующим циклом полезно
> снять новый perfMon уже после R16 и проверить, насколько упал initial /
> scroll-related cost на реальном клиентском DayTab.
