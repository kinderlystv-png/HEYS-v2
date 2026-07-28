# Планировщик: задачи, календарь, chrono, чек-листы, цели, книги и игры

> **Статус:** core-контракты проверены 2026-07-28<br> **Охват:** web store,
> локальное/облачное хранение, merge/delete, cloud pull, основные UI-границы и
> тесты<br> **Не охвачено:** детальная UX-логика каждого экрана, все поля каждой
> сущности, визуальный Gantt layout и planning-agent OpenAPI<br>

## Назначение и граница

Планировщик объединяет семь пользовательских поверхностей: задачи, цели,
календарь/Gantt, хронометраж, чек-листы, библиотеку книжных саммари и каталог
игр. UI разделён на модули; владельцем изменяемых client-side данных и операций
является `HEYS.Planning.Store`, а статичного редакционного каталога —
`HEYS.Reading`.

```text
PlanningTab
  ├─ Tasks / task matrix
  ├─ Goals / goal map
  ├─ Calendar / Gantt
  ├─ Reading / fullscreen reader
  ├─ Games / catalog + fullscreen lazy modules
  ├─ Chrono
  └─ Checklists
        ↓
HEYS.Planning.Store
        ↓
client-scoped local storage → sync queue → client_kv_store
        ↑
Phase A / refreshPlanningFromCloud → merge + tombstones + anti-wipe guards
```

## Владельцы ответственности

| Область                                             | Владелец                                                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Ключи, CRUD, нормализация, merge, tombstones, hooks | `apps/web/heys_planning_store_v1.js`                                                                  |
| Координатор вкладки и sub-navigation                | `apps/web/heys_planning_v1.js`                                                                        |
| Задачи и матрица                                    | `apps/web/heys_planning_tasks_v1.js`                                                                  |
| Calendar/schedule                                   | `apps/web/heys_planning_schedule_v1.js`                                                               |
| Chrono UI и timer lifecycle                         | `apps/web/heys_planning_chrono_v1.js`                                                                 |
| Checklists                                          | `apps/web/heys_planning_checklists_v1.js`                                                             |
| Goal map                                            | `apps/web/heys_planning_goal_map_v1.js`                                                               |
| Reading registry/schema                             | `apps/web/heys_reading_catalog_v1.js`                                                                 |
| Reading books and manifest                          | `apps/web/reading/books/*`, `scripts/legacy-bundle-config.mjs`                                        |
| Reading library/reader UI                           | `apps/web/heys_planning_reading_v1.js`                                                                |
| Games catalog/fullscreen shell/lazy-loader          | `apps/web/heys_planning_v1.js`, `styles/modules/908-planning-games.css`                               |
| Word Builder game                                   | `apps/web/heys_planning_game_word_builder_v1.js`, `styles/modules/909-planning-game-word-builder.css` |
| Robot Route game                                    | `apps/web/heys_planning_game_robot_route_v1.js`, `styles/modules/910-planning-game-robot-route.css`   |
| Color Trail game                                    | `apps/web/heys_planning_game_color_trail_v1.js`, `styles/modules/911-planning-game-color-trail.css`   |
| Gantt rendering/layout/touch                        | семейство `apps/web/heys_planning_gantt_*`                                                            |
| Облачная очередь и Phase A                          | `apps/web/heys_storage_supabase_v1.js`                                                                |
| Контекст от приложения/агента                       | `planning_context_ingest` в `yandex-cloud-functions/heys-api-rpc/index.js`                            |

## Данные и источник истины

Книжные саммари не входят в Planning Store и не синхронизируются как
пользовательские данные. Каждая книга регистрируется отдельным source-файлом
через `HEYS.Reading.registerBook`; порядок загрузки задаёт
`READING_BOOK_SOURCES`. Контракт Reading v3 требует после начального вердикта
два разных блока: `quick-summary` с пересказом пяти–семи тезисов и
`applicability` с редакторской оценкой силы, условий, границ и проверочного
эксперимента. Ридер повторно использует тот же `quick-summary` в свёрнутом
финальном блоке «Книга в N тезисах», поэтому второй авторский список в схеме не
нужен. Команды `pnpm reading:new` и `pnpm reading:check` поддерживают manifest и
проверяют этот контракт до публикации. Обзор адресован самостоятельному
читателю: быстрый слой содержит все существенные тезисы, модели, ограничения и
вердикт, а полный слой добавляет основания и примеры. HEYS обозначает
редакционный голос, а не адаптацию под внутренний продуктовый контекст.
Персональная применимость хранится отдельно в client-scoped ключе
`heys_reading_personalization_v1`. Профиль Полтавского содержит только
содержательные связи с Kinderly и/или HEYS: до восьми связанных с книгой
вопросов, без обязательного покрытия каталога и выдуманной конкретики. Ридер
получает overlay через session-safe KV; публичный каталог, поиск, «Главное» и
расчёт времени его не учитывают. Все подходящие текстовые поля содержат
дословные `highlights`: ридер показывает их маркером и строит из них режим
«Главное», не меняя прогресс полного текста. Подробности — в
[`READING_CONTRACT_V3_PROTOCOL.md`](../../implementation/READING_CONTRACT_V3_PROTOCOL.md).
Обязательный `depthProfile` задаёт диапазон полного текста: `compact` — 1 200–1
700 слов, `standard` — 1 700–2 400, `deep` — 2 400–3 400. Профиль не меняет
быстрый слой; дополнительный контекст остаётся во втором слое `details`. Размер
шрифта, тема, видимость и цвет маркера сохраняются в client-scoped ключе
`heys_reading_preferences_v1` и синхронизируются между устройствами по
`updatedAt` (последнее изменение побеждает); ключ не входит в Planning Store.
`editorialRank` управляет сортировкой «Рекомендуемые». Необязательное
`editorialRole: 'popular-canon'` отмечает книгу, включённую в библиотеку из-за
широкой известности и влияния: карточка показывает спокойную плашку на обложке,
а reader поясняет, что она не означает редакционную рекомендацию. Роль не
заменяет темы и теги. `sourceIds` отображаются в reader как нумерованные сноски,
а блок `details` даёт единый аккордеон для вторичного контекста. Каждый раздел
начинается открытым тезисом; длинные разделы распределяют механику,
доказательства и оговорки по аккордеонам, а ключевые выводы остаются открытыми.
Карточки библиотеки используют `content-visibility: auto`, чтобы рост каталога
не заставлял браузер перерисовывать элементы вне viewport при прокрутке. Reader
строит содержание по heading-блокам и поддерживает прямую ссылку через
query-параметр `reading=<book-id>`. Позиция и процент чтения хранятся локально в
`heys_reading_progress_v1`, используются для действия «Продолжить чтение» и не
входят в Planning Store или cloud sync. При поиске карточка показывает фрагмент
блока с совпадением вместо общего вердикта. Опубликованное саммари обязано
совмещать пересказ с собственным редакторским ревью: минимум три блока
`voice: 'review'` и 180 слов оценки, включая открытый review-абзац в разделе
`critique`. Валидатор отклоняет нейтральный конспект или критику, спрятанную
только в аккордеоне.

Игры также не входят в Planning Store и не создают пользовательские данные.
Первый слой содержит только каталог из трёх карточек. После явного открытия
общий shell параллельно запрашивает отдельные JS и CSS выбранной игры, проверяет
контракт `HEYS.PlanningGames.modules[gameId] = { Component, api }` и только
затем монтирует компонент. У каждого ресурса независимый cache/status: повтор
после ошибки не перезагружает уже готовый файл. Закрытие shell инвалидирует
текущую loading-session, а игровой компонент обязан убрать свои timers,
listeners, observer и animation frame. Модули не используют сеть, storage,
аналитику или фоновые циклы вне открытой игры.

Канонические логические ключи объявлены в `Planning.Constants.KEYS`. Основные
группы: projects, tasks, slots, links, chrono activities/entries/snapshots,
checklists, goals, goal-map records, tombstones и durable delete commands.

Store делит ключи по поведению:

- **critical client keys** — должны попадать в cloud sync и parity diagnostics;
- **mergeable arrays** — объединяются по `id`, а не заменяются целиком;
- **append-only date sets** — отклонённые пользователем незаполненные хвосты
  хронометража объединяются по дате, чтобы stale cloud pull не открыл модалку
  повторно;
- **local only** — активный `heys_planning_chrono_timer`, который не переносится
  между устройствами; завершённые chrono entries синхронизируются.

Источник истины во время обычной работы — локальный Store с durable cloud
очередью. При cloud pull удалённая запись не становится безусловно главнее:
pending local mutation, tombstones и anti-wipe проверки могут сохранить local.

## Основные потоки

### Локальное изменение

1. UI вызывает domain-метод Store (`addTask`, `saveSlots`, `addChronoEntry` и т.
   п.).
2. `persistPlanningKey` сохраняет client-scoped значение и, если ключ не
   local-only, ставит его в общую sync queue.
3. Store обновляет planning state/event consumers.
4. После успешного upload может планироваться readback для проверки parity.

### Задача на выбранные даты

Форма новой задачи в списке может создать одну задачу и несколько связанных
календарных слотов на конкретные даты, в том числе в разных месяцах. Слоты
объединяются `recurrenceGroupId`, используют одинаковое время и могут быть
обычными или фоновыми; диапазон задачи идёт от первой до последней выбранной
даты.

### Облачная загрузка

1. Planning-ключи первого экрана входят в общую Phase A sync.
2. `refreshPlanningFromCloud()` отдельно получает batch ключей через
   `YandexAPI.getKVBatch`.
3. Tombstones применяются первым проходом.
4. Если по ключу есть pending local write, обычная remote-замена пропускается.
5. Mergeable collections объединяются по `id`; подозрительная пустая remote
   коллекция не затирает непустую local без delete evidence.
6. После pull отправляется `heys:planning-updated` и отмечается client-specific
   `cloudPullDone` для корректного initial UI state.

### Удаление

Для синхронизируемых коллекций удаление — не просто исчезновение элемента из
массива. Tombstone должен пережить merge и сообщить другому устройству, что
запись удалена. Chrono tombstones имеют ограниченный срок хранения; snapshots
остаются replace-only, потому что Store не считает их безопасными для merge по
стабильному record id.

Каскадное удаление task/project сначала сохраняет `heys_planning_commands_v1`, а
затем меняет tombstones, projects, tasks, slots и links. Команда mergeable и
идемпотентно повторяется после startup, Phase A и собственного cloud pull.
Поэтому сбой между отдельными KV writes оставляет durable intent, по которому
каскад завершается на этом или другом устройстве.

## Инварианты

1. Активный chrono timer остаётся local-only; готовая запись времени — cloud
   data.
2. Равные timestamps при merge по `id` оставляют local запись: это защищает
   возможно ещё не отправленную правку.
3. Tombstones объединяются до основных массивов и не должны теряться при pull.
4. Pending local key нельзя перезаписать stale cloud value.
5. Пустой remote array не означает массовое удаление без tombstone evidence.
6. Merge должен быть детерминированным и идемпотентным, иначе возникает
   echo-upload loop.
7. `cloudPullDone` привязан к client id; состояние одного клиента нельзя
   использовать для empty/loading state другого.
8. UI-модули не должны обходить `Planning.Store` прямой записью контейнеров.
9. Delete command записывается до первой затронутой коллекции; повтор команды не
   меняет уже согласованное состояние.
10. Даты, отмеченные как «Не актуально» в хронометраже, объединяются через set
    union во всех cloud-pull путях и не могут быть удалены старым
    remote-массивом.
11. Опубликованное книжное саммари содержит не только пересказ, но и
    содержательное собственное ревью; быстрый пересказ и применимость имеют
    разные типы блоков и редакторские голоса.
12. Раздел начинается открытым тезисом; существенная критика, аудитория и
    вердикт об оригинале не зависят от раскрытия `details`.
13. Объём опубликованного саммари соответствует обязательному `depthProfile`, но
    быстрый слой и критические открытые выводы не зависят от профиля.
14. Персональный Reading overlay не входит в публичный каталог и показывается
    только при совпадении текущего `clientId` с client-scoped данными.
15. JS и CSS конкретной игры не входят в eager/postboot bundle и не
    запрашиваются до открытия её карточки.
16. Игровой модуль считается готовым только при `api.version === 1`, наличии
    `Component` и всех методов API, объявленных каталогом.
17. Закрытая или сменившаяся loading-session не может смонтировать поздно
    загрузившийся игровой компонент.
18. Игровые API остаются pure; runtime не пишет storage и не обращается к сети.

## Ошибки и защитные механизмы

- При отсутствии API/Store cloud refresh возвращает
  `{ok:false, reason:'no_api'}`.
- Ошибка batch pull не очищает local state.
- Suspicious wipe логируется и блокируется для chrono/checklists.
- Parity snapshot и persist history дают диагностическое доказательство, какие
  ключи local-only, pending или расходятся с последним cloud observation.
- Merge rescue может повторно поставить выживший local результат в очередь, если
  ключ уже не pending.
- Ошибка JS или CSS игры остаётся внутри fullscreen shell и даёт повторить
  только упавший ресурс; готовый соседний ресурс не дублируется.
- Неверно зарегистрированный игровой API трактуется как ошибка script-ресурса,
  поэтому retry может получить исправленный модуль.

## Подтверждённые риски и границы гарантий

- Система хранит несколько связанных сущностей отдельными KV-массивами. Durable
  command закрывает каскадное удаление task/project, но не является общей
  транзакцией для прочих task/slot/link/goal изменений.
- Snapshots не имеют merge-by-id гарантии и заменяются целиком.
- Client store и UI остаются крупными vanilla-JS модулями; изменение формы
  сущности требует проверить normalizer, tombstone, merge, persistence и UI.
- Planning одновременно загружается общей Phase A и собственным cloud pull.
  Защита от pending writes и детерминированный merge обязательны для обоих
  путей.
- Наличие `planning_context_agent_ingest` расширяет trust boundary: его bearer
  secret и allowed client ids нельзя смешивать с обычной PIN-session моделью.
- `Color Trail` использует Canvas и один `requestAnimationFrame` только в
  состоянии `running`; корректность cleanup и паузы при `document.hidden`
  зависит от lifecycle компонента и требует отдельного runtime-smoke.

## Ключевые тесты

- `apps/web/__tests__/planning-sync-persistence.test.js` — классы хранения,
  enqueue, local-only timer, parity и cloud refresh.
- `apps/web/__tests__/planning-chrono-pure.test.js` — merge-by-id, tombstones,
  идемпотентность и chrono helpers.
- `apps/web/__tests__/planning-goal-map-store.test.js` — goal-map
  persistence/merge.
- `apps/web/__tests__/planning-atomic-commands.test.js` — порядок durable
  intent, fault-injection между writes, повтор и replay на другом устройстве.
- `apps/web/__tests__/planning-home-subtab.test.js` — навигационный контракт.
- `apps/web/__tests__/planning-task-matrix.test.js` — группировка матрицы и
  контракт календарных слотов задачи на выбранные даты.
- `apps/web/__tests__/planning-games-ui.test.js` — каталог, lazy-load, resource
  retry/cache, API gate, dialog и focus lifecycle.
- `apps/web/__tests__/planning-game-word-builder.test.js` — контент,
  seeded-сессия, выбор слогов, подсказка и cleanup.
- `apps/web/__tests__/planning-game-robot-route.test.js` — уровни, BFS,
  выполнение программы, управление и cleanup.
- `apps/web/__tests__/planning-game-color-trail.test.js` — deterministic core,
  коллизии, flood-fill/замыкание, территория и Canvas lifecycle.
- `apps/web/__tests__/reading-authoring-contract.test.js` — manifest, профили
  объёма, быстрый слой, применимость, источники, review и ритм раскрытий.
- `apps/web/__tests__/planning-*-ui.test.js` и render tests — ключевые
  UI-сценарии.

## Facts Table

| ID  | Утверждение                                                                                          | Проверка                                                                                                                                                                                             | Статус               |
| --- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| P1  | Ключи и storage classes объявлены в planning store                                                   | `sed -n '1,75p' apps/web/heys_planning_store_v1.js`                                                                                                                                                  | проверено 2026-07-17 |
| P2  | Mergeable arrays объединяются по id, snapshots возвращают `null`                                     | `sed -n '820,920p' apps/web/heys_planning_store_v1.js`                                                                                                                                               | проверено 2026-07-17 |
| P3  | Cloud refresh получает batch и применяет tombstones до основных данных                               | `sed -n '2390,2520p' apps/web/heys_planning_store_v1.js`                                                                                                                                             | проверено 2026-07-17 |
| P4  | Pending local mutation блокирует cloud overwrite                                                     | `rg -n "getSyncStatus(item.k) === 'pending'" apps/web/heys_planning_store_v1.js`                                                                                                                     | проверено 2026-07-17 |
| P5  | Active chrono timer local-only, completed entry cloud-synced                                         | `sed -n '70,110p' apps/web/__tests__/planning-sync-persistence.test.js`                                                                                                                              | проверено 2026-07-17 |
| P6  | Planning keys включены в Phase A                                                                     | `rg -n 'heys_planning_projects' apps/web/heys_storage_supabase_v1.js`                                                                                                                                | проверено 2026-07-17 |
| P7  | Основной UI экспортируется как `HEYS.PlanningTab`                                                    | `rg -n 'HEYS.PlanningTab = PlanningTab' apps/web/heys_planning_v1.js`                                                                                                                                | проверено 2026-07-17 |
| P8  | Application и agent ingest входят в RPC handler                                                      | `rg -n -e "'planning_context_ingest'" -e "'planning_context_agent_ingest'" yandex-cloud-functions/heys-api-rpc/index.js`                                                                             | проверено 2026-07-17 |
| P9  | Task/project delete сохраняет command до коллекций и восстанавливается повтором                      | `pnpm exec vitest run apps/web/__tests__/planning-atomic-commands.test.js --no-coverage`                                                                                                             | проверено 2026-07-18 |
| P10 | Published Reading требует быстрый пересказ и отдельную проверку применимости                         | `pnpm exec vitest run apps/web/__tests__/reading-authoring-contract.test.js --no-coverage`                                                                                                           | проверено 2026-07-25 |
| P11 | Длинные разделы Reading идут от открытого тезиса к вторичному `details`                              | `pnpm exec vitest run apps/web/__tests__/reading-authoring-contract.test.js --no-coverage`                                                                                                           | проверено 2026-07-25 |
| P12 | Объём Reading проверяется по обязательному `depthProfile`                                            | `pnpm exec vitest run apps/web/__tests__/reading-authoring-contract.test.js --no-coverage && pnpm reading:check`                                                                                     | проверено 2026-07-25 |
| P13 | Смысловые `highlights` дословны, ограничены по плотности и питают «Главное»                          | `pnpm exec vitest run apps/web/__tests__/planning-reading.test.js apps/web/__tests__/reading-authoring-contract.test.js --no-coverage && pnpm reading:check`                                         | проверено 2026-07-25 |
| P14 | Профиль Полтавского содержит только содержательные вопросы и загружается через client-scoped KV      | `pnpm exec vitest run apps/web/__tests__/planning-reading.test.js apps/web/__tests__/reading-authoring-contract.test.js --no-coverage && pnpm reading:check`                                         | проверено 2026-07-25 |
| P15 | `games` входит в навигационный контракт; каталог из трёх карточек открывает fullscreen dialog        | `pnpm exec vitest run apps/web/__tests__/planning-games-ui.test.js apps/web/__tests__/planning-home-subtab.test.js --no-coverage`                                                                    | проверено 2026-07-28 |
| P16 | Игровые JS/CSS загружаются только после клика, независимо кешируются и проверяются по API v1         | `pnpm exec vitest run apps/web/__tests__/planning-games-ui.test.js --no-coverage`                                                                                                                    | проверено 2026-07-28 |
| P17 | Три игровые механики детерминированы, ограничены памятью открытой сессии и очищают runtime resources | `pnpm exec vitest run apps/web/__tests__/planning-game-word-builder.test.js apps/web/__tests__/planning-game-robot-route.test.js apps/web/__tests__/planning-game-color-trail.test.js --no-coverage` | проверено 2026-07-28 |
