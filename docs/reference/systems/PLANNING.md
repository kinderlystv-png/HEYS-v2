# Планировщик: задачи, календарь, chrono, чек-листы и цели

> **Статус:** core-контракты проверены 2026-07-17<br> **Охват:** web store,
> локальное/облачное хранение, merge/delete, cloud pull, основные UI-границы и
> тесты<br> **Не охвачено:** детальная UX-логика каждого экрана, все поля каждой
> сущности, визуальный Gantt layout и planning-agent OpenAPI<br>

## Назначение и граница

Планировщик объединяет пять пользовательских поверхностей: задачи, цели,
календарь/Gantt, хронометраж и чек-листы. UI разделён на модули, но владельцем
client-side данных и операций является `HEYS.Planning.Store`.

```text
PlanningTab
  ├─ Tasks / task matrix
  ├─ Goals / goal map
  ├─ Calendar / Gantt
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

| Область                                             | Владелец                                                                   |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| Ключи, CRUD, нормализация, merge, tombstones, hooks | `apps/web/heys_planning_store_v1.js`                                       |
| Координатор вкладки и sub-navigation                | `apps/web/heys_planning_v1.js`                                             |
| Задачи и матрица                                    | `apps/web/heys_planning_tasks_v1.js`                                       |
| Calendar/schedule                                   | `apps/web/heys_planning_schedule_v1.js`                                    |
| Chrono UI и timer lifecycle                         | `apps/web/heys_planning_chrono_v1.js`                                      |
| Checklists                                          | `apps/web/heys_planning_checklists_v1.js`                                  |
| Goal map                                            | `apps/web/heys_planning_goal_map_v1.js`                                    |
| Gantt rendering/layout/touch                        | семейство `apps/web/heys_planning_gantt_*`                                 |
| Облачная очередь и Phase A                          | `apps/web/heys_storage_supabase_v1.js`                                     |
| Контекст от приложения/агента                       | `planning_context_ingest` в `yandex-cloud-functions/heys-api-rpc/index.js` |

## Данные и источник истины

Канонические логические ключи объявлены в `Planning.Constants.KEYS`. Основные
группы: projects, tasks, slots, links, chrono activities/entries/snapshots,
checklists, goals, goal-map records и tombstones.

Store делит ключи по поведению:

- **critical client keys** — должны попадать в cloud sync и parity diagnostics;
- **mergeable arrays** — объединяются по `id`, а не заменяются целиком;
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

## Ошибки и защитные механизмы

- При отсутствии API/Store cloud refresh возвращает
  `{ok:false, reason:'no_api'}`.
- Ошибка batch pull не очищает local state.
- Suspicious wipe логируется и блокируется для chrono/checklists.
- Parity snapshot и persist history дают диагностическое доказательство, какие
  ключи local-only, pending или расходятся с последним cloud observation.
- Merge rescue может повторно поставить выживший local результат в очередь, если
  ключ уже не pending.

## Подтверждённые риски и границы гарантий

- Система хранит несколько связанных сущностей отдельными KV-массивами, поэтому
  нет общей транзакции между task/slot/link/goal изменениями.
- Snapshots не имеют merge-by-id гарантии и заменяются целиком.
- Client store и UI остаются крупными vanilla-JS модулями; изменение формы
  сущности требует проверить normalizer, tombstone, merge, persistence и UI.
- Planning одновременно загружается общей Phase A и собственным cloud pull.
  Защита от pending writes и детерминированный merge обязательны для обоих
  путей.
- Наличие `planning_context_agent_ingest` расширяет trust boundary: его bearer
  secret и allowed client ids нельзя смешивать с обычной PIN-session моделью.

## Ключевые тесты

- `apps/web/__tests__/planning-sync-persistence.test.js` — классы хранения,
  enqueue, local-only timer, parity и cloud refresh.
- `apps/web/__tests__/planning-chrono-pure.test.js` — merge-by-id, tombstones,
  идемпотентность и chrono helpers.
- `apps/web/__tests__/planning-goal-map-store.test.js` — goal-map
  persistence/merge.
- `apps/web/__tests__/planning-home-subtab.test.js` — навигационный контракт.
- `apps/web/__tests__/planning-*-ui.test.js` и render tests — ключевые
  UI-сценарии.

## Facts Table

| ID  | Утверждение                                                            | Проверка                                                                                                                 | Статус               |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| P1  | Ключи и storage classes объявлены в planning store                     | `sed -n '1,75p' apps/web/heys_planning_store_v1.js`                                                                      | проверено 2026-07-17 |
| P2  | Mergeable arrays объединяются по id, snapshots возвращают `null`       | `sed -n '820,920p' apps/web/heys_planning_store_v1.js`                                                                   | проверено 2026-07-17 |
| P3  | Cloud refresh получает batch и применяет tombstones до основных данных | `sed -n '2390,2520p' apps/web/heys_planning_store_v1.js`                                                                 | проверено 2026-07-17 |
| P4  | Pending local mutation блокирует cloud overwrite                       | `rg -n "getSyncStatus(item.k) === 'pending'" apps/web/heys_planning_store_v1.js`                                         | проверено 2026-07-17 |
| P5  | Active chrono timer local-only, completed entry cloud-synced           | `sed -n '70,110p' apps/web/__tests__/planning-sync-persistence.test.js`                                                  | проверено 2026-07-17 |
| P6  | Planning keys включены в Phase A                                       | `rg -n 'heys_planning_projects' apps/web/heys_storage_supabase_v1.js`                                                    | проверено 2026-07-17 |
| P7  | Основной UI экспортируется как `HEYS.PlanningTab`                      | `rg -n 'HEYS.PlanningTab = PlanningTab' apps/web/heys_planning_v1.js`                                                    | проверено 2026-07-17 |
| P8  | Application и agent ingest входят в RPC handler                        | `rg -n -e "'planning_context_ingest'" -e "'planning_context_agent_ingest'" yandex-cloud-functions/heys-api-rpc/index.js` | проверено 2026-07-17 |
