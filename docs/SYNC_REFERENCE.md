# HEYS — хранение и синхронизация

> **Статус:** проверено по коду 2026-07-20<br> **Охват:** web-клиент;
> local-first запись, download/upload, очереди, события и переключение
> клиента<br> **Не охвачено:** полный контракт каждого RPC, схема PostgreSQL и
> эксплуатационные метрики<br> **Перепроверить при изменениях:**
> `heys_storage_layer_v1.js`, `heys_storage_supabase_v1.js`,
> `heys_pending_queue_pure_v1.js`

Этот документ — системное досье, а не журнал всех исторических оптимизаций. Он
описывает устойчивые контракты и места, где ошибка может привести к потере или
смешению данных клиентов.

## Связанные документы

- [DATA_MODEL_REFERENCE.md](DATA_MODEL_REFERENCE.md) — формы основных данных.
- [DATA_LOSS_PROTECTION.md](DATA_LOSS_PROTECTION.md) — защита от пустых
  перезаписей.
- [CURATOR_VS_CLIENT.md](CURATOR_VS_CLIENT.md) — различия куратора и
  PIN-клиента.
- [ARCHITECTURE.md](ARCHITECTURE.md) — общая архитектура web-приложения.
- [SYNC_PERFORMANCE_REPORT.md](SYNC_PERFORMANCE_REPORT.md) — история оптимизаций
  и инцидентов.

## Коротко: как движутся данные

```text
Действие пользователя
  → HEYS.store.set(key, value)
  → client-scoped localStorage + memory cache + watchers
  → HEYS.saveClientKey(clientId, scopedKey, value)
  → durable pending queue
  → debounce / retry
  → session- или context-authorized cloud upload

Вход / переключение клиента / принудительное обновление
  → HEYS.cloud.syncClient(clientId)
  → bootstrapClientSync(clientId)
  → Phase A (данные первого экрана)
  → Phase B / delta (остальные изменившиеся данные)
  → client-scoped localStorage + сброс memory cache
```

Главный принцип — **local first**: обычная запись сначала становится доступна
локально, а облачная отправка идёт через восстанавливаемую очередь. Загрузка из
облака и отправка в облако — разные процессы и имеют разные события.

## Владельцы и точки входа

| Ответственность                              | Каноническая точка                                            |
| -------------------------------------------- | ------------------------------------------------------------- |
| Чтение/запись локальных client-scoped данных | `HEYS.store.get/set` в `apps/web/heys_storage_layer_v1.js`    |
| Универсальный запуск загрузки клиента        | `HEYS.cloud.syncClient(clientId)`                             |
| Полная/delta загрузка и Phase A              | `HEYS.cloud.bootstrapClientSync(clientId, options)`           |
| Постановка локального изменения в upload     | `HEYS.cloud.saveClientKey(...)` / прокси `HEYS.saveClientKey` |
| Debounce и отправка очереди                  | `scheduleClientPush()` / `doClientUpload()`                   |
| Диагностика pending queue                    | `HEYS.cloud.getPendingCount()` и `getPendingItemsDetail()`    |
| Безопасное переключение клиента              | `HEYS.cloud.switchClient(newClientId, oldClientIdHint)`       |

Продукты имеют дополнительный слой: при включённом overlay v2 каноническое
чтение идёт через `HEYS.products.getAll()`, а legacy `heys_products` остаётся
локальным fallback и может не отправляться в облако.

## Контракты хранения

1. Данные клиента хранятся под scope клиента. Например, логический
   `heys_profile` превращается в `heys_<clientId>_profile`.
2. `Store.set` обновляет memory cache, localStorage и watchers до облачной
   отправки. Значения `undefined` и функции не отправляются.
3. Global/non-client, session-sensitive, local-only и backup-ключи не должны
   попадать в `client_kv_store`; гейты стоят и в storage layer, и в sync layer.
4. Cloud хранит `client_id` отдельно, поэтому перед upload scoped key
   нормализуется обратно в логический `heys_*` key.
5. Для `dayv2` действуют дополнительные гейты: совпадение даты, наличие
   признаков реального изменения, запрет отправки бессодержательного дня и
   ID/tombstone-проверка каждой автоматической внешней замены.
6. Прямая запись в `localStorage` допустима только для явно global/runtime
   ключей или внутри sync-механизма. Продуктовый код должен предпочитать
   доменный API или `HEYS.store`.

## Durable upload queue

Основные глобальные ключи очереди:

| Ключ                                      | Назначение                            |
| ----------------------------------------- | ------------------------------------- |
| `heys_pending_client_sync_queue`          | ожидающие client writes               |
| `heys_pending_client_sync_inflight_queue` | batch, уже переданный upload-процессу |

Элемент очереди несёт `client_id` и ключ, поэтому очередь может пережить reload
без привязки к текущему выбранному клиенту. Перед debounce состояние очереди
сохраняется в localStorage. Обычная online-задержка — 500 мс; при ошибках
используется retry/backoff, а batch возвращается в очередь.

Очередь и in-flight нужно рассматривать вместе. UI не должен считать upload
завершённым только потому, что основной массив pending временно пуст.

Перед отправкой каждого `dayv2` из pending/in-flight `saveClientViaRPC` повторно
читает актуальный client-scoped LS. Если queued snapshot отличается, общий
resolver объединяет их через `mergeDayData(..., { forceKeepAll: true })`,
поэтому same-ID поля решаются по entity timestamps, а fresh/stale tombstones —
по существующему tombstone-контракту. Canonical queued payload проходит как
no-op; реальный merge не создаёт новый queue item и стабилизирует root merge
metadata, поэтому retry того же batch не меняет timestamps. Недоступный или
падающий resolver/merge блокирует RPC: существующий upload runtime возвращает
исходный in-flight item в pending.

`heys_hunger_energy_status_events_v1` — отдельный append/update log, а не
атомарный LWW-массив. Browser merge-save, RPC/REST legacy batch и foreground
hot-sync объединяют его по `event.id`; для одинакового ID выигрывает более
свежий `updatedAt`, а отсутствие события в одном snapshot не считается
удалением. После детерминированной сортировки применяется прежний лимит 120
событий / 38 КБ с сохранением самого свежего хвоста.

`heys_insights_feedback` синхронизируется тем же merge-before-write принципом:
рекомендации объединяются по `record.id`, обновления `followed`, `outcome` и
`reminders` выбираются по их временам, затем сохраняются 30 самых свежих
записей. Канонический browser key остаётся `heys_insights_feedback_<clientId>`;
cloud key не содержит client suffix, потому что client уже задан колонкой.

## Download: две фазы и delta

`syncClient` дедуплицирует параллельные вызовы одного клиента, применяет
короткий cooldown и выбирает `bootstrapClientSync` для curator- и PIN-потоков.
Старый `syncClientViaRPC` оставлен fallback-путём, если bootstrap ещё
недоступен.

### Phase A

Phase A выполняется при первом полном sync и разблокирует первый полезный
рендер. Это **не фиксированный список из пяти ключей**. На дату проверки в него
входят:

- профиль, нормы, продукты, зоны пульса и сегодняшний день;
- настройки/прочитанность советов, геймификация и статус подписки;
- layout виджетов и meal presets;
- основные planning/chrono/checklist/goal данные и tombstones.

Код запрашивает и логические, и legacy scoped варианты этих ключей. Перед
локальной записью применяются ownership, pending-local-mutation и anti-wipe
гейты. После успешной записи dispatch-ится:

```js
heysSyncCompleted { clientId, phaseA: true }
```

Состав Phase A неизбежно меняется вместе с первым экраном, поэтому источник
истины — массив `criticalBaseKeys`, а не продублированный числовой счётчик в
документации.

### Phase B и delta

Остальные записи приходят paginated full-sync или delta-путём. Timestamp
`heys_<clientId>_last_sync_ts` позволяет запросить только изменения; force sync
тоже использует delta, если начальная синхронизация уже была завершена.

Завершение download обозначается вариантом события:

```js
heysSyncCompleted { clientId, phase: 'full', ... }
```

Конкретные дополнительные поля зависят от ветки (full, light delta, no-change,
error), поэтому потребитель должен опираться на `phase`/`phaseA`, а не на один
необязательный флаг вроде `viaYandex`.

### Защита dayv2 от delayed external snapshot

Автоматические inbound-пути (`bootstrap`, full/delta, `fetchDays`, hot/live
refresh и server merge) не считают больший `day.updatedAt` доказательством
удаления. Перед записью внешнего дня в localStorage общий gate сравнивает точные
`meal.id`/`item.id`: исчезновение разрешено только если входящий
`deletedMealIds`/`deletedItemIds` tombstone не старее соответствующей сущности.
Любой содержательно отличающийся снимок при наличии локального baseline
объединяется через `mergeDayData(..., { forceKeepAll: true })`: конфликт полей
существующего item (например, граммов) решается по `item.updatedAt`, а не по
`day.updatedAt`. Результат проверяется повторно, а при недоступном/ошибочном
merge сохраняется текущий день. Periodic reconciler и обработчик внешнего
`heys:day-updated` применяют тот же контракт перед переносом LS в React;
содержательно одинаковый результат считается no-op, чтобы не создавать повторные
LS writes и upload-loop. Явный force pull сохраняет отдельный
`preferRemote`-контракт и не относится к автоматическим background-путям.

## Upload- и UI-события

| Событие               | Что означает                                                                  |
| --------------------- | ----------------------------------------------------------------------------- |
| `heysSyncStarting`    | началась загрузка данных клиента                                              |
| `heysSyncCompleted`   | завершена Phase A или full/delta download; различать по payload               |
| `heys:pending-change` | изменилось суммарное состояние очередей; payload содержит `count` и `details` |
| `heys:sync-progress`  | прогресс upload (`total`, `done`)                                             |
| `heys:data-uploaded`  | успешно отправлен очередной batch                                             |
| `heys:queue-drained`  | pending + in-flight пусты и upload не выполняется                             |
| `heys:sync-error`     | блокирующая ошибка upload/storage с retry-контекстом                          |
| `heys:sync-restored`  | синхронизация восстановилась после ошибки                                     |

Ключевой инвариант: `heysSyncCompleted` относится к **получению** данных, а
`heys:data-uploaded`/`heys:queue-drained` — к **отправке**. Подменять одно
другим нельзя.

## Авторизация и изоляция клиентов

- PIN-клиент работает через `session_token`; curator — через curator auth и
  выдаваемый сервером write context.
- `saveClientKey` извлекает client scope из ключа, блокирует foreign-scoped key
  и нормализует ключ только после проверок.
- Сервер должен определять целевого клиента из доверенного session/context, а не
  принимать browser-supplied `client_id` как единственное полномочие.
- При switch активные writers останавливаются или откладываются, старые pending
  writes сначала дренируются, memory/day/overlay caches сбрасываются, затем
  загружается новый клиент.
- Deferred writes сохраняют scope старого клиента и replay-ятся после switch;
  это защита от stale React effects и debounced autosave.

## Инварианты, которые нельзя ломать

1. Нельзя скачать cloud state поверх недоставленных локальных изменений без
   flush либо явного защищённого сценария.
2. Нельзя вычислять владельца записи только из `currentClientId`, если scoped
   key или write context уже несёт владельца.
3. Нельзя очищать/перепривязывать durable queue при смене клиента как очередь
   «текущего» клиента: внутри элементов уже есть их настоящий `client_id`.
4. Нельзя писать cloud-данные в localStorage без ownership/foreign-scope gate.
5. Нельзя считать Phase A полной историей клиента.
6. Нельзя принимать пустой профиль, planning-массив или день за безопасную
   замену непустых локальных данных без соответствующего delete/tombstone
   контракта.
7. Нельзя считать отсутствие meal/item во внешнем `dayv2` удалением только из-за
   большего `updatedAt` или совпавшего количества строк: нужен свежий tombstone.
8. Нельзя разрешать конфликт полей одинакового `item.id` по `day.updatedAt`:
   автоматический inbound обязан учитывать `item.updatedAt` через общий merge.
9. Нельзя отправлять queued/in-flight `dayv2`, отличающийся от актуального LS,
   без того же entity-level merge: pending dedup не защищает уже начатый upload.

## Подтверждённые слабые места и зоны особого риска

- Основной sync engine остаётся крупным монолитом: download, upload, auth,
  очереди, миграции и switch-защиты сосредоточены в одном файле. Это повышает
  цену изменений и требует проверять обе стороны потока.
- Комментарий у Phase A всё ещё называет её загрузкой «5 ключей», хотя массив
  давно расширен. Это подтверждённый локальный documentation drift в коде;
  поведение определяется массивом, а не комментарием.
- Payload `heysSyncCompleted` неодинаков в разных ветках. Новый listener должен
  проверять только поля, относящиеся к его задаче, и корректно обрабатывать
  Phase A, full и error/no-change ветки.
- Switch клиента содержит много defensive guards, появившихся после реальных
  cross-client race-инцидентов. Упрощать этот flow без целевого теста на stale
  writes, pending queue и cache isolation опасно.

## Что проверять при изменении sync

- local write сразу читается обратно и попадает в durable pending queue;
- reload восстанавливает pending и in-flight без смены `client_id`;
- ошибка возвращает batch в очередь, success очищает его и даёт upload event;
- Phase A разблокирует нужный UI, но не выдаётся за полную историю;
- full/delta не затирает pending local mutation;
- delayed `dayv2` без tombstones не уменьшает точный набор meal/item IDs ни в
  localStorage, ни после periodic reconcile;
- свежие tombstones проходят, старые не побеждают более новое изменение
  сущности;
- stale in-flight `dayv2` перед RPC объединяется с актуальным LS, а его старый
  ack не очищает появившуюся во время upload более свежую pending-запись;
- повторная отправка того же resolved payload не меняет merge timestamps;
- switch A → B не переносит profile/day/planning writes A в B;
- global/session/local-only/backup keys не уходят в client cloud store;
- listeners различают download completion и upload completion.

## Facts Table

| ID  | Утверждение                                                             | Источник                                 | Проверка                                                                                                                         | Статус               |
| --- | ----------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| S1  | `Store.set` пишет scoped LS/cache/watchers и вызывает cloud save        | `apps/web/heys_storage_layer_v1.js`      | `rg -n -e 'Store.set = function' -e 'global.HEYS.saveClientKey' apps/web/heys_storage_layer_v1.js`                               | проверено 2026-07-17 |
| S2  | Production pending key называется `heys_pending_client_sync_queue`      | `apps/web/heys_pending_queue_pure_v1.js` | `rg -n 'heys_pending_client_sync_queue' apps/web/heys_pending_queue_pure_v1.js`                                                  | проверено 2026-07-17 |
| S3  | Универсальная загрузка идёт через `syncClient` → `bootstrapClientSync`  | `apps/web/heys_storage_supabase_v1.js`   | `rg -n -e 'cloud.syncClient =' -e 'cloud.bootstrapClientSync =' apps/web/heys_storage_supabase_v1.js`                            | проверено 2026-07-17 |
| S4  | Phase A определяется расширяемым `criticalBaseKeys` и событием `phaseA` | `apps/web/heys_storage_supabase_v1.js`   | `rg -n -e 'criticalBaseKeys' -e 'phaseA: true' apps/web/heys_storage_supabase_v1.js`                                             | проверено 2026-07-17 |
| S5  | Full/delta download dispatch-ит `phase: 'full'`                         | `apps/web/heys_storage_supabase_v1.js`   | `rg -n "phase: 'full'" apps/web/heys_storage_supabase_v1.js`                                                                     | проверено 2026-07-17 |
| S6  | Upload имеет отдельные `data-uploaded` и `queue-drained` события        | `apps/web/heys_storage_supabase_v1.js`   | `rg -n -e 'heys:data-uploaded' -e 'heys:queue-drained' apps/web/heys_storage_supabase_v1.js`                                     | проверено 2026-07-17 |
| S7  | Online upload debounce начинается с 500 мс                              | `apps/web/heys_storage_supabase_v1.js`   | `rg -n -e 'function scheduleClientPush' -e 'navigator.onLine ? 500' apps/web/heys_storage_supabase_v1.js`                        | проверено 2026-07-17 |
| S8  | Switch имеет отдельный guarded flow                                     | `apps/web/heys_storage_supabase_v1.js`   | `rg -n -e 'cloud.switchClient =' -e '_switchClientInProgress' apps/web/heys_storage_supabase_v1.js`                              | проверено 2026-07-17 |
| S9  | Automatic inbound dayv2 проходит общий ID/tombstone gate                | `apps/web/heys_storage_supabase_v1.js`   | `rg -n -e 'writeAutomaticInboundDayKey' -e "source: 'fetchDays'" apps/web/heys_storage_supabase_v1.js`                           | проверено 2026-07-20 |
| S10 | Periodic reconcile проверяет LS тем же resolver до `setDay`             | `apps/web/heys_day_effects.js`           | `rg -n -e 'resolveExternalReplacement(reactDay, lsDay' -e 'SKIP_RECONCILE_EXTERNAL' apps/web/heys_day_effects.js`                | проверено 2026-07-20 |
| S11 | Automatic inbound разрешает same-ID конфликты через entity-level merge  | `apps/web/heys_storage_supabase_v1.js`   | `rg -n -e 'resolveExternalReplacement(currentValue, incomingValue' -e 'forceKeepAll: true' apps/web/heys_storage_supabase_v1.js` | проверено 2026-07-20 |
| S12 | Outbound dayv2 перед RPC сверяется с актуальным client-scoped LS        | `apps/web/heys_storage_supabase_v1.js`   | `rg -n -e 'rehydrateDayv2UploadItemFromLocal' -e 'DAYV2_OUTGOING_' -e 'preparedItems' apps/web/heys_storage_supabase_v1.js`      | проверено 2026-07-20 |
