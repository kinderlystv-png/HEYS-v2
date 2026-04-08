---
description:
  'HEYS planning/productivity module — что нужно построить: projects +
  tasks/gantt + calendar'
---

# HEYS Planning/Productivity Module

Сделай внутри Tracker HEYS отдельный модуль продуктивности: **проекты, задачи,
диаграмма Ганта и календарь**.

Это не отдельное приложение. Используй существующую инфраструктуру HEYS, но
держи planning-логику отдельно от health-домена.

## Где живёт модуль

- **Приложение**: `apps/web` — новый таб в bottom navigation, tab id: `tasks`,
  название: «Задачи».
- **Хранилище**: per-client, как health-данные — `client_kv_store` через
  `HEYS.YandexAPI`. Storage keys: `heys_planning_projects`,
  `heys_planning_tasks`, `heys_planning_slots`.
- **Desktop gate bypass**: для таба `tasks` не применять десктоп-заглушку. Для
  этого нужно прокинуть `tab` из `heys_app_root_impl_v1.js` в `useGateState` и
  дальше в `buildDesktopGate`, потому что сейчас gate state не знает активный
  таб. Это единственное исключение из desktop gate; остальные табы остаются как
  есть.

## Что нужно построить

Внутри HEYS появляется один новый таб `tasks` с тремя экранами внутри:

- `Project` / категория — контейнер задач (проект и категория — это одна
  сущность с разными именами, не два разных типа);
- `Task` — задача с иерархией, основная рабочая единица;
- `CalendarSlot` — слот задачи или события в календаре.

Три экрана внутри таба (переключение через sticky subnav сверху):

1. **Tasks** — главный экран. Сверху: поле быстрого создания + фильтры + выбор
   приоритета/даты. Ниже: иерархический список задач, сгруппированных по
   проектам/категориям.
2. **Calendar** — недельная сетка в стиле Google Calendar. Task slots и обычные
   события.
3. **Gantt** — диаграмма Ганта. Задачи на таймлайне с bars, зависимостями,
   baseline.

## Главная логика

- `Task` — источник истины.
- Календарь не должен хранить вторую копию задачи.
- `CalendarSlot` — это либо slot задачи через `taskId`, либо обычное событие.
- `dueDate` задачи — это дедлайн, а не обязательно время слота.
- У задачи в `v1` должны быть явные поля `startDate`, `dueDate` и
  `plannedMinutes`.
- Задача может существовать без слота.
- Если у задачи есть дедлайн, но нет slot, она должна оставаться видимой как
  unscheduled task.
- Подзадачи, зависимости, приоритеты, длительность и baseline принадлежат
  task-логике, а не календарю.
- Для иерархии задач нужен `parentTaskId`, для зависимостей —
  `blockedByTaskIds: string[]`.
- В `v1` достаточно `task slot` и `event slot`, но модель слота не должна мешать
  позже добавить `source`/`readOnly` для system или derived событий.

## Три экрана в `v1`

### Экран 1: Tasks (по умолчанию)

- **Шапка**: поле «Новая задача...» + быстрый выбор длительности + фильтры по
  приоритету/дате/проекту/статусу;
- **Список**: иерархический — проект/категория → задачи → подзадачи;
- проект/категория — это одна сущность: имя, цвет, статус; группировка
  обязательна;
- приоритет задачи: `p1` (сегодня/критично), `p2` (эта неделя), `p3` (бэклог);
- статус задачи: `todo` / `in_progress` / `done` / `cancelled`;
- inline-редактирование прямо в списке;
- drag-to-reorder внутри группы;
- переход в задачу для детального редактирования.

### Экран 2: Calendar

- недельная сетка в стиле Google Calendar;
- task slots (привязаны к задаче через `taskId`) и обычные события;
- unscheduled tasks — видны отдельно как неразмещённые;
- создание slot по клику/тапу на ячейку;
- перенос slot по дням и времени (drag);
- resize slot;
- клик на slot → переход к связанной задаче.

### Экран 3: Gantt

- задачи на таймлайне;
- bars с drag / resize;
- dependency arrows;
- baseline vs current plan;
- zoom level, collapse/expand групп;
- **на мобилке**: только bars + даты + статус, горизонтальный скролл; dependency
  arrows и baseline — скрыть или минимизировать;
- **на десктопе**: полноценный вид.

### Связь между экранами

- одна задача — одно состояние; Tasks / Calendar / Gantt показывают одно и то же
  без рассинхрона;
- задача создаётся в Tasks-экране или быстрым вводом из шапки;
- слот — это только time placement, не копия задачи.

## Доступ

- Планировщик доступен **только PIN-пользователям**. Куратор не должен видеть
  этот таб и данные в нём.
- В `AppTabContent` рендерить `PlanningTab` только когда
  `!cloudUser && clientId` (то есть клиент вошёл через PIN, а не curator auth).
- Когда open curator session — показывать или скрывать таб кнопку `tasks` в nav
  barrel, либо выводить пустое состояние.

## Desktop vs Mobile

- **Мобильная версия (≤768px)** — приоритет. Все три экрана должны полностью
  работать на телефоне.
- **Gantt на мобилке**: горизонтальный скролл внутри экрана задач; показывать
  bars + даты + статус; dependency arrows и baseline — скрыть или упростить до
  минимума.
- **Gantt на десктопе**: полная версия — drag/resize, dependency arrows,
  baseline, zoom, collapse/expand, широкий таймлайн.
- **Desktop gate**: таб `tasks` является исключением из `buildDesktopGate` — при
  этом табе не показывать заглушку «Откройте на телефоне». Все остальные табы
  HEYS остаются без изменений.
- **Responsive внутри таба**: достаточно `window.innerWidth > 768` или CSS media
  query — тот же механизм, что используется в остальных компонентах HEYS.

## В каком порядке делать

1. Описать общую модель: `Project`, `Task`, `CalendarSlot`; planning state /
   store.
2. Сделать экран **Tasks**: шапка с быстрым созданием + иерархический список по
   проектам.
3. Добавить inline-редактирование, drag-to-reorder, subtasks.
4. Сделать экран **Calendar**: недельная сетка, task slots, unscheduled tasks,
   drag.
5. Сделать экран **Gantt**: timeline, bars, drag/resize, dependency arrows,
   baseline.
6. Связать все три экрана через единый planning state.
7. Проверить, что нет рассинхрона между экранами.

## Что не нужно включать в первую волну

- personal planning notes / journal;
- recurring tasks / recurring slots;
- derived/system slots;
- pressure / overload analytics;
- focus history / pomodoro;
- сложный approval flow;
- advanced sync protection.

Это можно делать потом, после рабочего `v1`.

При этом базу под будущее стоит заложить уже сейчас: не предполагать, что каждый
слот всегда пользовательский, всегда редактируемый и всегда должен храниться как
обычный persisted event.

## Что заложить в `v1`, но не реализовывать полностью сейчас

- предусмотреть, что у slot позже может появиться `source` (`user` / `system` /
  `derived`);
- предусмотреть, что slot позже может стать `readOnly`;
- не смешивать persisted user slots и будущие derived/system slots в одну
  неразличимую массу;
- не зашивать completion-логику так, будто все slots одинаково завершаемы;
- не строить модель так, будто проект — это просто текстовый фильтр, а не
  сущность с будущими агрегатами.

## Что важно не сломать

- не смешивать planning с health-логикой;
- не делать календарь вторым task-store;
- не превращать проект в обычный label;
- не плодить несколько источников истины для одной и той же задачи;
- максимально использовать уже существующую инфраструктуру HEYS.

## Точки интеграции в legacy runtime

Весь runtime HEYS — это legacy bundle из `apps/web/*.js`. Новый модуль
встраивается через стандартный паттерн, а не заново изобретает архитектуру.

### Какие файлы менять

| Файл                          | Что делать                                                                                                                                                                                                                                                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `heys_planning_v1.js`         | Новый файл. Регистрирует `window.HEYS.PlanningTab` — React-компонент всего модуля.                                                                                                                                                                                                                                                       |
| `heys_app_shell_v1.js`        | Добавить tab-кнопку `tasks` в `tab-switch-wrapper`; изменить класс с `--quint` на `--sext`; добавить ветку `tab === 'tasks'` в `AppTabContent`.                                                                                                                                                                                          |
| `heys_app_swipe_nav_v1.js`    | **Не** добавлять `'tasks'` в глобальный `SWIPEABLE_TABS` по умолчанию: внутри planning будут горизонтальный скролл, drag и resize, поэтому глобальный свайп-tab-switch там будет конфликтовать с UX. Если позже понадобится свайп между planning-subviews — делать его локально внутри `PlanningTab`, а не через общий HEYS swipe cycle. |
| `heys_app_gate_state_v1.js`   | Прокинуть активный `tab` в `buildDesktopGate`, потому что сейчас gate state его не получает.                                                                                                                                                                                                                                             |
| `heys_app_gate_flow_v1.js`    | В `buildDesktopGate` добавить: `if (tab === 'tasks') return null;` до рендера gate.                                                                                                                                                                                                                                                      |
| `heys_storage_supabase_v1.js` | Добавить `heys_planning_projects`, `heys_planning_tasks`, `heys_planning_slots` в `CLIENT_SPECIFIC_KEYS`, иначе sync не будет считать их client-scoped данными и не отправит их в `client_kv_store` как ожидается.                                                                                                                       |
| `index.html`                  | Добавить `<script src="heys_planning_v1.js"></script>` по аналогии с другими постбут-скриптами.                                                                                                                                                                                                                                          |
| `styles/heys-components.css`  | Добавить CSS для `tab-switch-wrapper--sext` и `tab-switch-group--sext` (аналог `--quint`).                                                                                                                                                                                                                                               |

### Паттерн нового файла

```js
// heys_planning_v1.js
(function () {
  const HEYS = (window.HEYS = window.HEYS || {});
  // ... React components ...
  HEYS.PlanningTab = PlanningTab;
  console.info('[HEYS.planning] ✅ PlanningTab registered');
})();
```

### После изменений

Все изменённые `heys_app_*.js` файлы входят в legacy bundle. После правок:

```
pnpm bundle:legacy:auto --files=apps/web/heys_planning_v1.js,apps/web/heys_app_shell_v1.js,apps/web/heys_app_swipe_nav_v1.js,apps/web/heys_app_gate_flow_v1.js
```

Проверить что hash в `bundle-manifest.json` обновился.

## Что использовать из HEYS

- текущую оболочку приложения и навигацию;
- существующий routing / lazy loading подход;
- `HEYS.store` и storage helpers;
- `HEYS.YandexAPI.rpc()` / `.rest()`;
- текущий sync transport и `client_kv_store`;
- текущие UI-паттерны, Tailwind и logging rules.

## Что можно развивать после `v1`

- safe sync / conflict protection;
- project dashboard / project health summaries;
- personal planning notes / lightweight journal;
- recurring tasks / recurring slots;
- derived/system slots;
- analytics;
- focus / pomodoro.

## Reference files in ALPHACORE

- `src/lib/projects.ts`
- `src/lib/tasks.ts`
- `src/lib/schedule.ts`
- `src/app/tasks/page.tsx`
- `src/components/task-gantt-chart.tsx`
- `src/components/week-calendar-grid.tsx`
- `src/components/use-calendar-task-dnd.ts`
- `src/lib/dashboard-events.ts`

## Definition of done

`v1` готов, когда:

- внутри HEYS есть отдельный planning/productivity модуль;
- есть first-class `Project`, `Task`, `CalendarSlot`;
- есть `Projects`, `Tasks + Gantt`, `Calendar`;
- task slots связаны с задачами через `taskId`;
- задачи, Гант и календарь показывают одно и то же состояние без рассинхрона.
