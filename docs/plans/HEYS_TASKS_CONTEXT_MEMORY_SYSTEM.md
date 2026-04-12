# HEYS Tasks + Context Memory System

> **Status:** 📋 Planning  
> **Priority:** ⭐⭐⭐⭐⭐  
> **Updated:** 2026-04-12  
> **Owner:** Product / AI-first workflow  
> **Scope:** `apps/web/heys_planning_*`, Store API, cloud sync, optional agent
> extraction

---

## TL;DR

HEYS должен развить текущий раздел `tasks` из обычного planning-tab в
**context-aware memory system**:

- пользователь пишет свободным текстом;
- агент или встроенный extraction-layer превращает текст в:
  - задачи,
  - заметки,
  - темы,
  - связи,
  - жизненный контекст;
- всё хранится в стандартном HEYS sync pipeline;
- в planning subnav появляется **4-й пункт после Ганта** — **`Контекст`**;
- внутри `Контекста` есть не только список заметок и тем, но и **граф связей** в
  стиле «нейронной карты».

Ключевая идея: **HEYS должен помнить не только дела, но и жизненный сюжет вокруг
этих дел**.

---

## Почему это нужно

### Проблема текущего состояния

Сейчас planning в HEYS уже умеет хранить:

- проекты,
- задачи,
- календарные слоты,
- дедлайны,
- иерархию.

Но он почти не хранит:

- **почему** задача появилась;
- **с каким контекстом жизни** она связана;
- **что уже обсуждалось и было решено**;
- **какие темы тянутся через недели и месяцы**;
- **что находится в голове, но ещё не оформлено в действия**.

### Цель

Сделать так, чтобы пользователь мог:

1. написать мысль в свободной форме;
2. не потерять её;
3. быстро превратить её в структуру;
4. позже вернуться не только к задаче, но и к **контексту этой задачи**;
5. видеть карту связей между проектами, людьми, темами, решениями и состоянием
   дня.

---

## Продуктовая гипотеза

Если дать пользователю быстрый способ фиксировать мысли, а системе — возможность
связывать их с задачами, темами и дневным состоянием, то `tasks` перестанет быть
просто списком дел и станет **центром координации жизни**.

---

## Не цель

Это **не** попытка встроить полный Obsidian-клон в HEYS.

Мы не строим:

- markdown-vault с папками и wiki-links как основу продукта;
- отдельную внешнюю knowledge base, живущую отдельно от HEYS sync;
- тяжёлую desktop-first систему для long-form writing.

Мы строим:

- быстрый capture;
- агентное извлечение структуры;
- хранение в HEYS;
- life-aware prioritization;
- контекстный recall;
- graph-view для связей.

---

## Целевой UX

### 1. Нижняя planning-навигация

Текущая planning subnav:

1. `Список`
2. `Календарь`
3. `Гант`

Целевое состояние:

1. `Список`
2. `Календарь`
3. `Гант`
4. **`Контекст`**

### UI-решение

- это **4-й docked action-button / FAB-like пункт** после `Гант`;
- label: **`Контекст`**;
- shortLabel: `Контекст` или `Конт.`;
- иконка: `🧠`, `🕸`, `◉` или кастомная «нейронная» пиктограмма;
- визуально этот пункт должен ощущаться как «пространство памяти и связей», а не
  как ещё один таб с таблицей.

### Почему именно так

Пользователь уже привык к Planning как к отдельному режиму. Добавлять `Контекст`
рядом со `Списком / Календарём / Гантом` — логичнее, чем прятать его в отдельный
раздел приложения.

---

### 2. Экран `Контекст`

Экран `Контекст` должен стать отдельной поверхностью внутри Planning.

### Блоки экрана

#### A. Quick Capture

Верхняя карточка:

- поле свободного ввода;
- CTA вида:
  - `Разобрать агентом`
  - `Сохранить в контекст`
  - `Создать задачи и связи`
- быстрые режимы:
  - `Мысль`
  - `Задача`
  - `Встреча`
  - `Решение`
  - `Вопрос`

#### B. Inbox

Неразобранные или частично разобранные capture-записи:

- raw текст;
- краткий summary;
- suggested tasks;
- suggested threads;
- статус разбора.

#### C. Threads / Темы

Карточки длинных тем, которые не должны растворяться в одноразовых задачах:

- Клиент X;
- Личное здоровье;
- Дом / быт;
- Проект Y;
- Отношения / семья;
- Переезд / ремонт / финансы.

#### D. Context Capsule

Снимок текущего жизненного состояния на основе day-data:

- сон;
- стресс;
- энергия;
- перегруз недели;
- число активных фронтов;
- рекомендованный режим:
  - `бережный`
  - `обычный`
  - `сфокусированный`

#### E. Graph / Карта связей

Отдельная секция или полноэкранный режим «нейронной карты»:

- связи между задачами;
- связями между заметками;
- thread-level связи;
- проекты;
- люди;
- life areas;
- решения;
- контекст дня.

---

## Основные пользовательские сценарии

### Сценарий 1 — свободная мысль

Пользователь пишет:

> "Созвонился с клиентом, он хочет пересобрать тариф, надо в среду отправить
> цифры и уточнить дедлайн, а ещё я уже подустал от этой темы"

Система создаёт:

- raw capture;
- note-summary;
- 1–2 tasks;
- thread `Клиент / тариф`;
- link на day-context;
- пометку о повышенной когнитивной нагрузке.

### Сценарий 2 — возврат к теме

Пользователь открывает thread через неделю и видит:

- последние заметки;
- открытые хвосты;
- решения;
- кто упоминался;
- связанные задачи и слоты;
- timeline + graph.

### Сценарий 3 — планирование с учётом ресурса

HEYS учитывает:

- недосып;
- стресс;
- перегруженную неделю;
- уже занятые слоты;

и показывает:

- что тащить сегодня;
- что отложить;
- какие задачи требуют контекстного возврата, а не тупого выполнения.

---

## Сущности данных

Система должна расширить planning слоем памяти, а не пытаться хранить всё в
одной сущности `Task`.

### 1. Task

Существующая planning task остаётся основой действий, но получает контекстные
поля:

| Поле                | Назначение                                     |
| ------------------- | ---------------------------------------------- |
| `linkedNoteIds`     | связанные заметки                              |
| `threadId`          | длинная тема, к которой относится задача       |
| `sourceCaptureId`   | откуда задача была извлечена                   |
| `lifeArea`          | работа / здоровье / дом / семья / admin / idea |
| `contextSummary`    | 1–2 строки «почему задача существует»          |
| `openQuestionCount` | сколько вопросов ещё не закрыто                |
| `lastContextAt`     | когда контекст по задаче обновлялся            |

### 2. Note

Контекстная запись, не обязана быть задачей.

| Поле                  | Назначение                                                         |
| --------------------- | ------------------------------------------------------------------ |
| `id`                  | идентификатор                                                      |
| `type`                | `capture`, `note`, `decision`, `meeting`, `question`, `reflection` |
| `title`               | короткий заголовок                                                 |
| `body`                | полный текст                                                       |
| `summary`             | agent summary                                                      |
| `threadId`            | связь с темой                                                      |
| `linkedTaskIds`       | связанные задачи                                                   |
| `tags`                | свободные метки                                                    |
| `people`              | упомянутые люди                                                    |
| `lifeArea`            | жизненная область                                                  |
| `source`              | `user`, `agent`, `import`, `system`                                |
| `createdAt/updatedAt` | timestamps                                                         |

### 3. Thread

Долгоживущая тема.

| Поле               | Назначение                                |
| ------------------ | ----------------------------------------- |
| `id`               | идентификатор                             |
| `title`            | название темы                             |
| `summary`          | краткое описание                          |
| `status`           | `active`, `watch`, `resolved`, `archived` |
| `lifeArea`         | доминирующая область                      |
| `linkedTaskIds`    | задачи темы                               |
| `linkedNoteIds`    | заметки темы                              |
| `linkedProjectIds` | проекты темы                              |
| `lastTouchedAt`    | последняя активность                      |

### 4. Link

Явная связь между сущностями.

| Поле                 | Назначение |
| -------------------- | ---------- |
| `fromId`, `toId`     | узлы       |
| `fromType`, `toType` | типы узлов |
| `relation`           | тип связи  |
| `weight`             | сила связи |
| `createdAt`          | timestamp  |

### 5. Context Capsule

Вычисляемый, а не редактируемый источник.

| Поле            | Назначение                               |
| --------------- | ---------------------------------------- |
| `date`          | дата                                     |
| `energyMode`    | режим ресурса                            |
| `sleepScore`    | оценка сна                               |
| `stressScore`   | оценка стресса                           |
| `overloadScore` | перегруз по неделе                       |
| `focusAdvice`   | совет по режиму задач                    |
| `sourceDayKeys` | какие записи `heys_dayv2_*` использованы |

---

## Storage-архитектура

### Текущая база

Сейчас planning хранит данные в:

- `heys_planning_projects`
- `heys_planning_tasks`
- `heys_planning_slots`

### Целевое расширение

Добавить отдельные ключи для memory-context слоя:

- `heys_planning_tasks_v2`
- `heys_planning_projects_v2`
- `heys_planning_slots_v1`
- `heys_planning_notes_v1`
- `heys_planning_threads_v1`
- `heys_planning_links_v1`
- `heys_planning_inbox_v1`
- `heys_planning_context_capsules_v1`

### Рекомендуемый формат хранения

Не хранить всё как огромный «плоский массив». Для v2 использовать
нормализованное состояние:

```ts
type EntityStore<T> = {
  version: 1;
  itemsById: Record<string, T>;
  order: string[];
  deletedIds: Record<string, string>;
  updatedAt: string;
};
```

### Почему не plain array

Потому что context-memory слой будет чаще:

- частично обновляться;
- редактироваться с нескольких поверхностей;
- связываться многими ссылками;
- требовать мягкого merge без ненужного whole-array overwrite.

---

## Критические решения, которые нужно зафиксировать до старта разработки

Ниже — список вещей, которые легко забыть на уровне product vision, но которые
обязательно всплывут в реальной реализации.

### 1. Scope доступа: PIN-only или shared surface?

Это **ключевое решение**, потому что текущий planning runtime сейчас живёт в
PIN-only логике:

- `tasks` рендерится только когда `!cloudUser && clientId`;
- planning явно помечен как `PIN-only access`;
- `tasks` bypass-ит desktop gate.

#### Что нужно решить явно

1. **V1 recommendation:** `Контекст` тоже остаётся **PIN-only**;
2. решить, нужен ли позже:
   - read-only доступ куратора;
   - shared view между клиентом и куратором;
   - полностью приватный memory-layer, который куратор вообще не видит.

#### Рекомендация

Для V1 зафиксировать:

- `Контекст` = **личная клиентская память**;
- работает по тем же scoped-client правилам, что и planning;
- curator-sharing не делать до отдельного privacy-review.

### 2. Migration-стратегия с текущего planning

Сейчас planning уже хранит `projects/tasks/slots` в существующих ключах. Поэтому
перед началом нужно зафиксировать migration path.

#### Что нужно добавить

- one-time migration adapter;
- версионирование store-схем;
- marker вида `heys_planning_context_migrated_v1`;
- dual-read на переходный период;
- fallback, если миграция упала посередине.

#### Рекомендация

Не делать instant hard switch. Лучше так:

1. read old planning keys;
2. build new normalized state;
3. сохранить v2 state;
4. подтвердить валидность;
5. только после этого считать миграцию завершённой.

### 3. Privacy / encryption / sharing policy

Это один из самых важных пробелов. `Контекст` почти гарантированно будет
содержать:

- личные мысли;
- частные заметки;
- potentially medical / relationship / finance context;
- чувствительные формулировки про состояние и людей.

В кодовой базе уже есть понятие sensitive categories (`private`, `medical`,
`notes`, `diary`, `secrets`).

#### Что нужно определить

- какие поля считаются чувствительными;
- что шифруется;
- что можно показывать куратору;
- что можно использовать в graph;
- что нельзя логировать;
- можно ли raw capture сохранять в полном виде или нужен редактируемый privacy
  toggle.

#### Рекомендация

Ввести privacy-tier у notes/captures:

- `standard`
- `private`
- `medical`
- `sensitive`

И отдельно зафиксировать:

- raw private captures не логируются в console / telemetry;
- graph по умолчанию не показывает sensitive labels без явного раскрытия;
- шаринг с куратором в V1 выключен.

### 4. Search и быстрый recall как first-class surface

Граф — мощно, но без поиска контекст будет тяжело находить.

#### Чего не хватает в текущем roadmap

- глобального поиска по Notes / Threads / Tasks;
- быстрых фильтров;
- списка `Open loops`;
- списка `Recently active threads`;
- выдачи по людям/тегам/областям жизни.

#### Рекомендация

Для MVP включить не только graph, но и:

- строку поиска;
- фильтры по `lifeArea`, `thread`, `type`, `status`;
- smart section `Открытые циклы`;
- smart section `Недавно активное`.

### 5. AI extraction UX: preview, approval, idempotency

Если агент сразу начнёт создавать задачи и связи из любого текста, будет много
лишнего шума.

#### Нужно явно продумать

- preview before commit;
- partial accept / reject suggestions;
- edit before save;
- duplicate detection;
- idempotency при повторной отправке одного и того же capture;
- re-parse / retry flow.

#### Рекомендация

В V1 поведение такое:

1. raw capture сохраняется всегда;
2. extraction возвращает preview;
3. пользователь подтверждает создание задач/тем/связей;
4. повторный identical capture не дублирует сущности без подтверждения.

### 6. Graph как projection, а не отдельный источник правды

Это очень важный архитектурный момент.

Граф не должен иметь отдельную независимую бизнес-истину. Иначе появится второй
мир данных.

#### Правильный подход

- source of truth = `tasks + notes + threads + links`;
- graph = вычисляемая проекция этих сущностей;
- отдельно можно хранить только UI-метаданные графа:
  - pinned nodes;
  - hidden node types;
  - last selected node;
  - zoom preference;
  - maybe layout cache.

#### Рекомендация

Если нужен отдельный ключ, то только для UI-state, например:

- `heys_planning_graph_ui_v1`

Но не для дублирования всей граф-структуры как второй базы.

### 7. Data lifecycle: archive, delete, restore, export

Контекст без жизненного цикла быстро превращается в кладбище мыслей.

#### Нужно предусмотреть

- archive thread;
- soft-delete notes;
- restore;
- hard delete;
- retention для inbox;
- export context data в JSON/Markdown later.

#### Рекомендация

Для MVP достаточно:

- archive thread;
- soft-delete note/capture;
- restore from archive;
- auto-clean policy для старого inbox.

### 8. Feature flag и rollout strategy

Такой слой не стоит раскатывать всем сразу.

#### Нужно добавить

- feature flag `heys_context_mode_v1`;
- pilot cohort;
- rollback switch;
- safe empty-state if context modules not loaded.

#### Рекомендация

Пускать так:

1. internal / dev;
2. 1–3 pilot users;
3. limited rollout;
4. public default only после проверки sync, perf и privacy.

### 9. Testing и delivery constraints для HEYS runtime

Так как реализация затронет `apps/web/**`, это legacy/runtime-sensitive зона.

#### Значит нужно заранее зафиксировать

- selective rebuild legacy bundles после каждой runtime-правки;
- проверку `bundle-manifest.json` и hashed assets;
- mobile-first browser verification;
- perf-check на mid-tier mobile;
- отдельные тесты для sync/offline/duplicate capture/migration.

#### Минимальный test matrix

- create/edit/delete note;
- create task from capture;
- reopen app after sync;
- offline capture → reconnect;
- migration from old planning store;
- graph load on mobile;
- graph fallback on weak device.

### 10. Analytics / observability / success events

Чтобы понять, реально ли feature полезна, надо встроить события.

#### Что логировать

- `context_capture_created`
- `context_capture_parsed`
- `context_capture_confirmed`
- `context_task_created_from_capture`
- `context_thread_opened`
- `context_graph_opened`
- `context_search_used`

#### Ограничение

Telemetry не должна содержать raw personal content.

---

## Правила синка

### Каноничный путь

Новый слой должен идти через **HEYS sync pipeline**, а не через отдельное
стороннее хранилище:

1. локальная запись;
2. watchers/UI refresh;
3. pending queue;
4. debounce upload;
5. cloud KV;
6. PostgreSQL.

### Важное правило реализации

Для нового `Context Memory` persistence-слоя предпочесть адаптер поверх
`HEYS.store`, а не прямую работу с `localStorage`.

### Merge-правила

- raw capture **никогда не теряется**;
- если extraction не удался — сохраняется хотя бы raw note;
- derived fields можно пересобирать;
- user-authored text имеет приоритет над автогенерированным summary;
- graph-links можно пересчитывать инкрементально.

---

## Агентный capture-flow

### Вариант A — Agent-mediated (самый быстрый путь)

Пользователь пишет агенту в VS Code / chat / future HEYS-agent surface.

Агент делает:

1. сохраняет raw capture;
2. извлекает tasks / notes / thread / links;
3. пишет структурированные данные в HEYS storage;
4. HEYS UI получает их через обычный sync.

### Вариант B — In-app AI extraction

Пользователь пишет прямо в HEYS.

HEYS отправляет текст на backend AI endpoint и получает:

- summary;
- entity extraction;
- relation map;
- suggested tasks.

### Рекомендация

Запускать в 2 шага:

1. **сначала Agent-mediated flow** — быстрее, дешевле, проще проверить UX;
2. потом при необходимости добавить in-app extraction.

### Contract для backend-варианта

Если позже появится server-side extraction endpoint, он должен идти по
каноничному HEYS API path:

- через `HEYS.YandexAPI.rpc()` / `HEYS.YandexAPI.rest()`;
- с session-based auth;
- без прямого trust к `client_id` из UI;
- с явным rate limit и retry policy.

---

## Экран связей в стиле «нейронов»

### Product intent

Граф нужен не ради красоты, а как **exploration layer**:

- увидеть, что крутится вокруг темы;
- найти неожиданные связи;
- понять, где слишком много хвостов и узлов на одном фронте;
- быстро вернуться к старому контексту.

### Типы узлов

- `task`
- `note`
- `thread`
- `project`
- `person`
- `life_area`
- `decision`
- `day_context`

### Типы связей

- `belongs_to`
- `mentioned_in`
- `derived_from_capture`
- `related_to`
- `scheduled_on`
- `blocked_by`
- `discussed_with`
- `decided_in`
- `reflects_state`

### Визуальные правила

- размер узла = recent activity / importance;
- цвет = тип сущности или life area;
- толщина ребра = сила / частота связи;
- активный узел слегка пульсирует;
- выбранный узел открывает правую карточку с деталями;
- на мобильном по умолчанию показывать **ego network** выбранной сущности, а не
  весь universe graph.

### Режимы просмотра

1. **My active map** — только активные узлы последних 14–30 дней;
2. **Thread focus** — граф вокруг одной темы;
3. **Task context** — граф вокруг выбранной задачи;
4. **Life area lens** — фильтр по области жизни;
5. **Overload view** — показывает clusters, где слишком много хвостов.

### Ограничения производительности

Graph-view должен быть:

- **лениво загружаемым** — только при входе в `Контекст`;
- **не в boot bundle**;
- безопасным для mid-tier mobile;
- capped по размеру:
  - mobile default: до 120–200 узлов;
  - desktop default: до 250–400 узлов;
- иметь fallback на список, если устройство слабое.

### Рекомендуемая реализация

### Предпочтение для v1

Граф как **отдельный lazy-loaded модуль**, например:

- `apps/web/heys_planning_context_graph_v1.js`

### Технический вариант

1. **Предпочтительно:** лёгкий 2D force-graph, загружаемый только на экране
   `Контекст`;
2. **Если берём dependency:** `force-graph` или `react-force-graph-2d` только в
   lazy-flow, не в boot-path;
3. **Если хотим zero-dependency path:** canvas renderer + простая force-layout
   логика в отдельном модуле.

### Что не делать в графе на старте

- не хранить graph как вторую бизнес-БД;
- не строить full-universe graph по умолчанию на mobile;
- не делать mandatory 3D;
- не тянуть graph-library в boot bundle.

### Важное ограничение

Graph не должен стать основным daily workflow. Это **secondary but powerful
surface** для навигации по памяти, а не замена списку задач.

---

## Life Context как дифференциатор HEYS

Это то, что отличает HEYS от внешнего vault/notes инструмента.

HEYS уже знает:

- сон;
- стресс;
- дневной комментарий;
- активность;
- weekly patterns.

Поэтому `Контекст` должен не просто хранить текст, а уметь отвечать:

- в каком состоянии пользователь сейчас находится;
- какую нагрузку реально выдержит;
- какие темы стали чрезмерно плотными;
- какие задачи не соответствуют текущему ресурсу.

### Возможные derived signals

- `energyMode`: low / normal / high;
- `contextFragility`: насколько легко потерять нить темы;
- `overloadClusterScore`: плотность незавершённых узлов;
- `lifeAreaImbalance`: перекос между фронтами жизни.

---

## Предлагаемые файлы реализации

### Изменить

- `apps/web/heys_planning_v1.js`
  - добавить 4-й пункт `Контекст` после `Гант`;
- `apps/web/heys_planning_store_v1.js`
  - вынести persistence в adapter/v2 слой;
- `apps/web/heys_planning_tasks_v1.js`
  - добавить entry-point в контекстные сущности из задач.

### Добавить

- `apps/web/heys_planning_context_v1.js`
  - основной экран `Контекст`;
- `apps/web/heys_planning_context_store_v1.js`
  - notes / threads / links / inbox store;
- `apps/web/heys_planning_capture_v1.js`
  - quick capture parsing / actions / inbox lifecycle;
- `apps/web/heys_planning_context_graph_v1.js`
  - карта связей;
- `apps/web/heys_planning_context_styles_v1.css` или секция в допустимом CSS
  слое;
- backend AI parsing endpoint (опционально, не для v1).

---

## Поэтапный roadmap

### Phase 1 — Skeleton

- добавить 4-й planning button `Контекст`;
- создать пустой экран `Контекст`;
- подключить context-store;
- отрисовать Quick Capture + Inbox stub + Context Capsule stub.

### Phase 2 — Notes / Threads / Links

- notes storage;
- threads storage;
- ручное создание связей;
- task ↔ note ↔ thread linkage;
- context card в task details.

### Phase 3 — Agent Capture

- raw capture;
- extraction pipeline;
- suggested tasks;
- suggested threads;
- auto-linking;
- failure-safe storage of raw input.

### Phase 4 — Graph View

- graph model;
- node/edge serialization;
- mobile ego-mode;
- full-screen relation map;
- filters by area / project / thread / time.

### Phase 5 — Life-aware prioritization

- context capsule from `heys_dayv2_*`;
- overload heuristics;
- focus recommendations;
- ranking tasks by fit-to-state.

---

## MVP-рекомендация

Если нужен наиболее реалистичный старт, MVP должен включать только:

1. `Контекст` как 4-й planning-pункт;
2. Quick Capture;
3. Notes + Threads;
4. Task-to-context links;
5. маленький graph-preview для выбранной темы;
6. без тяжёлого full-universe graph на первом релизе.

### Ещё одно важное MVP-решение

Для первого релиза сократить scope `узлов`:

- first-class в UI: `task`, `note`, `thread`, `project`;
- derived later: `person`, `decision`, `day_context`, `life_area cluster`.

Это снизит сложность extraction, graph layout и модерации чувствительных данных.

---

## Метрики успеха

- capture-to-structure conversion rate;
- доля задач, у которых есть контекстная связь;
- возвраты к thread/card через 3–14 дней;
- уменьшение числа потерянных открытых циклов;
- частота использования `Контекста` vs чистого task-list;
- время до повторного входа в тему (recall speed).

---

## Риски

### 1. Перегруз интерфейса

Если сделать слишком много surface area сразу, `tasks` станет тяжёлым.

**Ответ:** layered UX — сначала quick capture и threads, граф вторым слоем.

### 2. Конфликт с sync / whole-array overwrite

Если новые сущности хранить плоскими массивами, возрастает риск хрупких merge.

**Ответ:** нормализованный store + timestamps + soft delete map.

### 3. Граф как красивая, но бесполезная игрушка

**Ответ:** graph only as navigation/recall surface, не как primary workflow.

### 4. AI extraction будет иногда ошибаться

**Ответ:** raw capture всегда сохраняется; extracted structure редактируема.

---

## Claude Code / Obsidian Claude Code — что это и нужно ли вместо этого

### Что это такое

Нужно различать два слоя:

### 1. Claude Code

Это агентный инструмент Anthropic для работы с кодом и файлами:

- терминал / CLI;
- редактор / extension integration;
- доступ к репозиторию;
- понимание структуры проекта;
- выполнение задач разработки.

### 2. Obsidian Claude Code plugin

Это community-bridge, который помогает Claude работать с vault в Obsidian. Идея:
агент видит markdown-базу знаний и может отвечать на вопросы по ней.

### Нужно ли использовать это вместо HEYS-плана?

### Короткий ответ

**Нет, не вместо. Можно — рядом.**

### Почему не вместо

Claude Code / Obsidian-плагин:

- не создаёт продуктовый UX внутри HEYS;
- не использует нативно life-context HEYS;
- не встраивается автоматически в `tasks`/planning экран;
- не синкает данные по тем же правилам, что HEYS app;
- не даёт мобильную product-surface для обычного пользователя.

То есть это **инструмент агента/разработчика**, а не замена продуктовой функции.

### Где он полезен

Использовать Claude Code имеет смысл:

1. для разработки самой системы `Контекст`;
2. для тестирования prompt/extraction логики на внешнем vault;
3. как внешний вспомогательный capture-инструмент для power-user сценария;
4. как research surface перед тем, как переносить лучшие паттерны в HEYS.

### Рекомендация

Стратегия должна быть такой:

- **HEYS Context** = продуктовая система памяти и жизни;
- **Claude Code** = вспомогательный агентный инструмент для разработки,
  прототипирования и, возможно, внешнего power-user workflow.

Иными словами:

> Claude Code может помочь построить и обкатать идею, но не должен заменять то,
> что HEYS даёт как пользовательский опыт.

---

## Итоговая рекомендация

Идти в реализацию по следующей формуле:

**Planning + Context + Memory + Graph + Life State**

Приоритеты:

1. добавить `Контекст` как 4-й пункт после `Гант`;
2. ввести Notes / Threads / Links;
3. сделать quick capture;
4. только затем подключить граф как «нейронную карту»;
5. поверх этого добавить life-aware prioritization.

Это даст HEYS не просто раздел задач, а систему, где:

- пользователь пишет как думает;
- агент помогает структурировать;
- контекст жизни не теряется;
- связь между объектами видна не только списком, но и картой.

---

## Short version for implementation kickoff

- `Контекст` = 4-й planning action после `Гант`
- сущности = `Task + Note + Thread + Link + ContextCapsule`
- хранение = HEYS sync, не внешняя БД
- MVP = capture + notes + threads + links + context panel
- graph = lazy-loaded, mobile-safe, secondary view
- Claude Code = useful alongside, not instead
