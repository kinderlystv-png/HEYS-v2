# Продукты, overlay и поиск

<!-- reference-passport: id=PRODUCTS_AND_SEARCH verified=2026-08-23 commit=local-fix-cascade -->

> **Статус:** проверено (углублённый аудит overlay/MCP/search)  
> **Актуален на:** 2026-08-23 — снимок кода `56516003` на `main`  
> **Верификация:** перечитывание исходников + Facts Table P1–P35 (см.
> [Верификация и срок годности](#верификация-и-срок-годности))  
> **Охват:** shared catalog, overlay, merge/sync, поиск, MCP glue v9; модель
> сущностей и стык с дневником; [архитектурная оценка](#архитектурная-оценка) и
> варианты эволюции  
> **Канон:** единственное досье по продуктам и питательным сущностям —
> дублирующих файлов нет  
> **Не подтверждено:** production catalog contents/count, runtime feature flags
> в конкретном браузере, live ACL/function bodies после последней migration,
> browser/E2E  
> **Не верь на слово:** дата и коммит — момент проверки, не гарантия на сегодня.
> Перед правкой или утверждением перечитай символы из досье в **текущем**
> дереве; при расхождении верен код.

**Сначала это** — простая карта; детали и доказательства — ниже и в §
[Архитектурная оценка](#архитектурная-оценка).

| Что есть сейчас                                                                                                                                                                                                                         | Куда двигаться                                                                                                                                       | Срок (грубо)                                                                     | Риск сломать                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Каскад при правке карточки** — **исправлено 2026-08-23:** `HEYS.dayUtils.isDayv2KeyForCurrentClient` в `__collectCascadeDayKeys()` (scoped + unscoped `heys_dayv2_*`, без foreign/pollution); то же в геймификации (`:4347`, `:4383`) | Мониторинг: старые ключи `heys_<cid>_<foreign>_dayv2_*` в LS/KV — артефакты до фикса; cleanup отдельно                                               | —                                                                                | **Низкий** после фикса                                            |
| **Общая база + личный каталог** (overlay, облако, модерация)                                                                                                                                                                            | **Не переписывать** — ядро нормальное; чинить только дыры                                                                                            | —                                                                                | **Низкий**, если не трогать без нужды                             |
| **При добавлении еды** цифры копируются в день (слепок)                                                                                                                                                                                 | **Оставить** — так и задумано                                                                                                                        | —                                                                                | **Низкий**                                                        |
| **В приложении** прошлые дни пересчитываются из карточки; **куратор в чате** — из слепка. **Свести каналы = уже выбор правила** (в сторону веба → «день живёт с карточкой»; в сторону MCP → «день зафиксирован»)                        | **Сначала** продуктово выбрать: «день зафиксирован» или «день живёт с карточкой»; **потом** код под это правило. Нейтрального «просто выровнять» нет | решение **1–2 нед**; сведение под него **1–2 мес**                               | **Высокий** — любое сведение меняет привычку (куратор или клиент) |
| **Наборы:** UI — preview-снимок; `ensureMealProductReady` **может** подставить живую карточку, если строки в overlay **нет**, но продукт виден через `getById`/`getAll` (`visible_product_present`, редко); MCP — id → имя → снимок     | Вписать в **то же** правило, что строка выше (две правды в двух каналах); отдельного проекта не требует, но в инвентаризации обязателен              | вместе с правилом про день                                                       | **Средний**                                                       |
| **Два хранилища каталога** (overlay + старый `heys_products`)                                                                                                                                                                           | **Постепенно** читать только overlay; старое — запасной выход, не основной путь                                                                      | упрощение **2–4 нед**; полное отключение — **когда** нет старых вкладок/клиентов | **Высокий**, если вырубить legacy рано                            |
| **Commit gate:** `heardFromCloud` — **исправлено 2026-08-23:** сбрасывается в `OverlayStore.clear()`                                                                                                                                    | —                                                                                                                                                    | —                                                                                | **Низкий**                                                        |
| **Алкоголь, полиолы, два поиска, качество shared**                                                                                                                                                                                      | **Отдельные** темы, не «переписать продукты»                                                                                                         | **месяцы** каждая                                                                | **Средний** (формулы и данные на весь HEYS)                       |

**Вывод одной строкой:** переписывать с нуля не надо; каскад и `heardFromCloud`
на стыке смены клиента **закрыты 2026-08-23**; дальше — продуктовый выбор
«зафиксирован vs из карточка» и постепенное упрощение legacy read path.

## Модель владения данными

Продукт в HEYS — не одна строка в одном массиве. Текущая архитектура разделяет
общую пищевую базу и личную проекцию клиента:

```text
shared_products (server catalog, nutrient source)
                 +
heys_products_overlay_v2 (client-scoped cloud/LS rows)
  ├─ Type A: shared_origin_id + overrides + in_my_list
  └─ Type B: _custom=true + full custom product
                 ↓
OverlayStore.getMergedView()
                 ↓
HEYS.products.getAll() / getById()
                 ↓
AddProductStep + day meal item stamp
```

Legacy `heys_products` всё ещё существует как fallback/dual-write и migration
source, но при default `overlay_products_v2=true` не является каноническим
reader. Kill switch возвращает read path на legacy без удаления overlay.

## Владельцы ответственности

| Область                                                | Точка                                          |
| ------------------------------------------------------ | ---------------------------------------------- |
| Общая архитектурная граница                            | `apps/web/ARCHITECTURE.md` → Products storage  |
| Raw overlay, merge, migration, diagnostics             | `heys_products_overlay_v1.js`                  |
| Public products facade и commit gate                   | `heys_core_v12.js`                             |
| Создание/редактирование, search UI, moderation request | `heys_add_product_step_v1.js`                  |
| Shared cache, bootstrap/HOT sync и legacy bridge       | `heys_storage_supabase_v1.js`                  |
| Migration/orphan recovery order                        | `heys_app_tabs_v1.js`, `heys_day_utils.js`     |
| Feature/rollback gates                                 | `heys_feature_flags_v1.js`                     |
| Web search engine                                      | `heys_smart_search_v2.js`                      |
| Server RPC allowlist/contracts                         | `yandex-cloud-functions/heys-api-rpc/index.js` |
| Shared/pending schema evolution                        | managed migrations in `scripts/db/migrations/` |

## Overlay types и merged view

Type A хранит связь с `shared_products` и только пользовательские overrides; при
чтении nutrients и остальные поля берутся из shared row. Type B — полностью
личный продукт. `in_my_list=false` скрывает строку из списка, но специальный
`getById` всё ещё может разрешить её для старой записи дня.

Merged view фильтрует tombstones и synthetic rows, применяет overrides и
нормализует barcodes. Если весь shared index пуст, а overlay содержит Type A, он
возвращает `null`, чтобы facade использовал полный legacy snapshot. Если shared
index непустой, но конкретный `shared_origin_id` отсутствует или base не
содержит валидный `kcal100`, строка остаётся в view как disabled placeholder с
`_nutrientsPending`; raw link не выдаётся за полноценный продукт.

Результат memoized по ссылке на shared index и инвалидируется при overlay/shared
updates и переключении клиента.

## Запись и cloud merge

Локальный `writeRaw`:

- удаляет synthetic rows;
- блокирует уменьшение без tombstone/`allowShrink`;
- пишет через client-scoped Store;
- инвалидирует merged cache и уведомляет другие вкладки;
- планирует cloud save, кроме явно cloud-originated apply.

`applyCloudSnapshot` — единая точка входа cloud → overlay. Она отказывается
писать до установки current client id, дедуплицирует Type A по
`shared_origin_id`, фильтрует tombstones, сохраняет ещё не подтверждённые
локальные Type A/B и пишет с `skipCloudSync`, чтобы не создавать round trip.

BroadcastChannel содержит client id; сообщения другого клиента игнорируются. Это
критично для параллельной curator/PIN работы в разных вкладках.

## Overlay assemble: строки + manifest (web и MCP)

Личный каталог клиента в облаке — **не один массив**, а пара ключей: основной
блок строк (`heys_products_overlay_v2`), опциональные tail-шарды и **manifest**
(`rowCount` + canonical hash). Reader принимает поколение только целиком:
`OverlayShardCodec.assemble(main, tails, manifest)` — и в вебе, и в MCP.

| Слой                        | Чтение                                                                                                                                                              | Запись                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Web bootstrap/HOT/RPC merge | `mergeOverlayRpcTailRawClientRows` → assemble; при `!assembled.ok` — `reportOverlayAssemblyFailure` и **отказ принять** cloud snapshot (остаётся локальный каталог) | upload path в `heys_storage_supabase_v1.js`: tails → main → manifest последним                         |
| Web commit gate             | readback через `getKV` после save                                                                                                                                   | `ensurePersonalProductCommitted`: `saveKV` overlay + manifest (`OverlayShardCodec.createSingle`)       |
| MCP tools                   | `products.loadOverlayAssembled` (`getKVMany` batch)                                                                                                                 | `products.saveOverlayRows` — **обязательно** пара строк+manifest; `priorTailCount` для cleanup хвостов |

Инцидент 2026-08-22: три MCP-инструмента писали только строки без manifest — на
новом устройстве каталог собирался пустым/урезанным при живом локальном
состоянии. С 2026-08-22/23 все MCP write path идут через `saveOverlayRows`.

**Не путать с 413:** при переполнении payload commit gate
(`ensurePersonalProductCommitted`) ставит продукт в **локальную очередь**
(`commitLocallyQueued`) — это один слой. Дробление на main/tails при фоновой
загрузке overlay — отдельный механизм в `heys_storage_supabase_v1.js`.

## MCP: каталог, resolve и подсказки

MCP не читает overlay «как массив из одного KV». Каталог = assembled overlay +
shared index (`loadCatalog` в `tools.js`):

1. `loadOverlayAssembled` + `sharedCatalog.loadSharedProducts`
2. `buildCatalog` — own rows из overlay + shared minus уже связанных
   `shared_origin_id`
3. если в overlay есть Type A (`shared_origin_id`, `in_my_list !== false`), а
   shared index пуст — **`shared_catalog_unavailable`** (fail-closed, не
   молчаливый пустой каталог)

**Resolve продукта** (`resolveProduct`, `findRecipeIngredient`,
`resolvePresetItem`, ингредиенты рецепта) идёт через `searchProducts` +
**`pickSearchMatch`** (`products.js`):

- единственное **точное** own-имя → ответ (инцидент 21.08: иначе own+shared с
  одним именем всегда `ambiguous_product`);
- `preferOwnOverMatchingShared` убирает shared-дубль с тем же именем, если
  совпали агрегаты Б+У+Ж с **допуском** 0.05 (`sameAggregateComposition`,
  `products.js`) — это **не то же**, что overlay autolink `_sameComposition`:
  **семь** макро-полей, **точное** равенство после округления до 0.1, без
  допуска (`heys_products_overlay_v1.js:781`, вызов в `applyCloudSnapshot`).

При `product_not_found` MCP добавляет **`missingProductHints`**: fuzzy
(`fuzzySearchProducts`) и совпадения из наборов — отдельный контур от web
`SmartSearchWithTypos`.

## Добавление продукта и commit gate

Добавление shared продукта создаёт/обновляет Type A, custom — Type B. Перед
вставкой продукта в meal `ensureMealProductReady` приводит shared result к
личной строке и при необходимости вызывает `ensurePersonalProductCommitted`.
Сначала он повторно разрешает Type A через `OverlayStore.resolveMealProduct`:
missing/неполный shared base возвращает `shared_nutrients_pending` до day write;
после refresh тот же overlay id сливается с base без второй строки.

При включённом overlay commit gate требует client id и cloud API, сохраняет
overlay и затем читает его обратно. Обычная запись остаётся plain array для
совместимости со старым reader, после неё публикуется versioned manifest.

**Gate «каталог загружен» (инцидент 21.08):** `ensurePersonalProductCommitted`
отклоняет commit с `catalog_not_loaded`, если локальный overlay пуст **и** в
сессии ещё не было успешного `applyCloudSnapshot` (`hasHeardFromCloud`). Пустой
каталог у нового клиента законен только после ответа облака. **`heardFromCloud`
не сбрасывается в `OverlayStore.clear()`** при switch клиента в той же вкладке —
риск ложного «облако уже отвечало» до bootstrap нового клиента; при отладке
cross-client publish проверять этот стык.

При HTTP 413 на save overlay commit gate **не дробит** массив сам: вызывает
`commitLocallyQueued` (`cloud_save_queued_after_413` / manifest queue).
Шардирование main/tails при upload — отдельный путь storage sync (см. «Overlay
assemble»).

При HTTP 413 background upload делит массив на основной блок и numbered tails:
tails и main пишутся первыми, manifest — последним. Новый reader применяет
поколение только при совпадении числа блоков, row count и canonical hashes;
частичная отправка сохраняет предыдущий локальный snapshot и повторяется из
pending queue. Старый cloud layout без manifest по-прежнему читается как legacy.

## Модель сущностей и стык с дневником

Отдельной сущности «блюдо» нет. Три сущности + строка дня:

```text
Карточка продукта (Type A / Type B)
  ├─ обычная: КБЖУ на 100 г
  └─ с рецептом: product.recipe → КБЖУ из ингредиентов, rev ↑ при save
           ↓
Набор (heys_meal_presets_v1) — позиции + снимок КБЖУ на каждую
           ↓
Позиция в приёме (meal.items[]) — слепок КБЖУ (+ recipe_items для блюд)
```

| Уровень            | Где                        | Что хранит                                                               | Задним числом                                                                                                   |
| ------------------ | -------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Продукт            | overlay / shared           | КБЖУ на 100 г, опционально `recipe`                                      | Карточку можно править; в вебе — каскад в прошлые позиции (ниже)                                                |
| Продукт с рецептом | `product.recipe` на Type B | ингредиенты, `yield_grams`, `rev`                                        | Смена **состава** — `recipe_patch` или полный `recipe`; смена **КБЖУ ингредиента** — на блюде `recipe_patch:{}` |
| Набор              | `heys_meal_presets_v1`     | id, имя, позиции со снимком нутриентов                                   | В приём копируются позиции, не весь набор                                                                       |
| Позиция в приёме   | `day.meals[].items[]`      | `product_id`, граммы, `kcal100`…, для блюд `recipe_items` / `recipe_rev` | Слепок при записи; в вебе пересчёт и каскад — ниже                                                              |

Каталог заканчивается на `HEYS.products.getById`; дальше — слой дня.

**При записи — слепок.** MCP (`buildMealItem` в `day.js`) и штатный web add
(`buildMealItemFromProduct` в `heys_day_add_product.js`) копируют в
`meal.items[]` полный нутриентный слепок (`kcal100`, макросы, для блюд —
`recipe_items` / `recipe_rev` через `recipeSnapshotFields`). Приём считается
даже если overlay позже потеряет карточку.

**После записи — из чего считается приём**

| Слой         | Источник КБЖУ при пересчёте                                                                                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP / сервер | **Inline-поля позиции.** `itemKcal` читает `item.kcal100` (`day.js`); карточку при сумме не подставляет                                                                                |
| Приложение   | **Карточка каталога.** `mealTotals` → `getProductFromItem` (дефолт `hybrid`): пока карточка резолвится по `product_id`, нутриенты берутся из неё; inline позиции не первичный источник |

`applyItemFallback` только **добирает** у карточки поля, которых нет, или весь
item уходит в дело, если карточку не нашли (`getSnapshot`). При живой карточке
сумма **всегда** из каталога — не «может подставить».

| Ещё (веб)            | Где                               | Поведение                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Отображение позиции  | тот же `getProductFromItem`       | Та же логика: карточка, fallback из inline                                                                                                                                                                                                                                                                                                                                                                                                       |
| Правка карточки в UI | `cascadeMealItemsOnProductUpdate` | Смена имени/бренда/нутриентов переписывает inline-поля прошлых позиций с тем же `product_id`. **С 2026-08-23:** `isDayv2KeyForCurrentClient` — scoped + unscoped legacy, без foreign/pollution. **Legacy `heys_dayv2_<date>`:** каскад читает unscoped ключ, пишет через `store.set` в scoped `heys_<cid>_dayv2_<date>`; сырой unscoped в LS остаётся со старым inline (молчаливая миграция). E2E: `products-cascade-client-scope-smoke.spec.ts` |

MCP при правке карточки **не** каскадирует прошлые дни; ретро по рецепту —
только `heys_reapply_recipe`. «Дневник не поплывёт» верно для записи куратора
(MCP) и для «карточку удалили — inline остался»; в приложении пересчёт из
карточки и каскад меняют прошлое. Синтез tradeoff'ов и стратегии эволюции — §
[Архитектурная оценка](#архитектурная-оценка).

**Наборы (`heys_meal_presets_v1`).** Позиция набора хранит снимок КБЖУ на 100 г
(`PRESET_ITEM_FIELDS` / `presetItemSnapshot`). Разворот в приём **различается**:

1. **UI** (`handleAddAll` → `onAddMany` → `ensureMealProductReady`): в preview —
   снимок набора; в приём по умолчанию **тот же снимок** — `overlay_present`
   возвращает переданный `finalProduct`, строку overlay не читает
   (`heys_core_v12.js:5085`; позиция без `shared_origin_id` →
   `resolveMealProduct` выходит с `not_linked`,
   `heys_products_overlay_v1.js:743`). Исключения:

   | Исход `reason`                            | Что в приём                          | Частота                       |
   | ----------------------------------------- | ------------------------------------ | ----------------------------- |
   | `overlay_present`                         | preview-снимок набора                | обычный                       |
   | `visible_product_present`                 | живая карточка из `getById`/`getAll` | редкий (строки в overlay нет) |
   | commit / `ensurePersonalProductCommitted` | карточка, пересозданная из снимка    | редкий                        |

2. **MCP** (`resolvePresetItem`): карточка по `product_id` → живая по имени
   (`searchProducts` + `pickSearchMatch`, glue v9) → снимок из набора только
   если живой карточки нет → `preset_item_missing`, если нет и того и другого.

Инцидент 21.08: после удаления карточки кофе наборы продолжили работать по
снимку; MCP при живой карточке предпочитает её, а не снимок.

**Рецепт — действия и прошлые дни**

| Действие                    | Прошлые дни                                                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Правка карточки-ингредиента | Рецепты сами не пересчитываются; MCP назовёт блюда. КБЖУ блюда без смены состава: `heys_update_product(..., recipe_patch:{})` |
| Save состава рецепта        | Только карточка вперёд                                                                                                        |
| Исправить прошлое в дне     | `heys_reapply_recipe` — dry_run, затем confirm; в позиции обновляются `recipe_items`, `recipe_rev`, КБЖУ                      |

В позиции блюда: `recipe_items`, `recipe_yield`, `recipe_rev`
(`recipeSnapshotFields`). Рецепт в shared export не уходит — только КБЖУ без
состава.

**Сквозной сценарий**

```text
1. «Салат домашний» с рецептом → КБЖУ из ингредиентов, rev = 1
2. Набор «Обед лёгкий» → в позиции набора снимок КБЖУ салата
3. Приём из набора → копия КБЖУ (+ recipe_items)
4. Помидор-ингредиент изменился → салат сам не пересчитался; салат — recipe_patch:{}, дни — reapply
5. Карточку кофе удалили → набор и старые приёмы живут по снимку
6. Клиент правит карточку в UI → каскад inline-полей; сумма дня из каталога (mealTotals)
```

**Инварианты модели (день)**

1. «Блюдо» — только `product.recipe`, не отдельная таблица.
2. При записи приёма — полный нутриентный слепок (MCP и web add path).
3. Save рецепта поднимает `rev` и КБЖУ карточки; прошлые дни по рецепту — только
   `reapply` (каскад обычной карточки — отдельно).
4. КБЖУ ингредиента на блюдо — `recipe_patch:{}`; прошлое по рецепту —
   `reapply`.
5. Набор хранит снимок на позицию; без снимка и без карточки запись из набора
   невозможна.
6. MCP при развороте набора: id → имя → снимок; UI «Добавить всё» — preview в
   модалке, в приём по умолчанию **тот же снимок** (`overlay_present`); живая
   карточка — только `visible_product_present` (строки в overlay нет).
7. Каскад при правке карточки — только веб, не MCP.
8. MCP считает приём из inline `item.kcal100`; веб `mealTotals` — из карточки,
   пока она резолвится (тест P31).

Изменения общей базы идут через разные server contracts: PIN-клиент создаёт
pending product/change request, curator может использовать защищённую direct
publish ветку; barcode имеет append-only RPC. Одобрение и отклонение pending
идут через curator-only RPC: gateway берёт curator id только из JWT, а SQL под
`FOR UPDATE` проверяет ownership и одной транзакцией меняет shared product и
статус pending. Для `product_update` browser-local metadata фильтруется явным
allowlist до typed record mapping; managed migration
`2026-07-29_atomic_shared_product_moderation_sanitize` применена и
live-проверена на `portions=[{"name":"1 шт","grams":90}]`. Direct publish,
barcode attach и portions update также входят в curator-only gateway allowlist;
managed migration `2026-07-29_curator_product_function_acl` применена в
production и убирает `PUBLIC EXECUTE` у их `SECURITY DEFINER` функций, сохраняя
execute для `heys_rpc`. Удалённый ранее массовый sync shared products не должен
возвращаться как произвольный client UPSERT.

## Удаление и восстановление

Удаление должно сначала оставить tombstone, затем уменьшить overlay. До этого во
вкладке «База» спрашивается подтверждение, если продукт входит в наборы приёмов
или в состав блюд (`HEYS.products.findUsage`, матч по id и по нормализованному
имени). Ссылки удаление не чистит ни здесь, ни в MCP — позиция остаётся со
снимком КБЖУ, но без карточки, и состав больше не пересчитается. Проверка —
подсказка, а не гейт: собственный сбой она глушит и удаление не блокирует.
Shrink guards в facade и OverlayStore специально блокируют тихое исчезновение
строк. Day item хранит stamp продукта; если каталог не может его разрешить,
orphan recovery восстанавливает только допустимые personal customs и не должен
загрязнять другой client context.

Cloud-canonical overlay не пополняется автоматически из большого legacy snapshot
после bootstrap: исторический top-up мог затереть более полный cloud массив.
Interceptor **пропускает dual-write legacy→overlay**, если overlay уже непустой
(cloud-canonical guard в `heys_storage_supabase_v1.js`) — stale legacy
`heys_products` не должен перестраивать overlay. Ручные diagnostics/relink
существуют для расследования, а не для обычного boot flow.

## Фактический поиск

Основной legacy web flow использует глобальный `HEYS.SmartSearchWithTypos` из
`heys_smart_search_v2.js`. AddProductStep передаёт ему merged product list,
персональную usage history, favorites и включает
phonetic/synonym/transliteration ranking. При исключении или пустом результате
используется простой normalized contains/prefix fallback.

Search cache очищается на sync/product update events, usage statistics
периодически пересобираются из истории. Поэтому результат зависит не только от
строки запроса, но и от текущего client history/favorites и content version.

В модалке добавления продукта быстрый фильтр «Недавние» использует тот же
client-scoped usage snapshot: показывает без дублей продукты из приёмов за
сегодня и два предыдущих календарных дня и сортирует их по `lastUsed` от новых к
старым. Скрытые продукты в эту подборку не попадают.

Workspace package `@heys/search` имеет собственный TypeScript API и tests, но
прямых импортов его runtime-класса в текущем пользовательском web path не
найдено. Он участвует в dependency build и упоминается dynamic-import registry,
однако не является доказанным движком AddProductStep.

## Инварианты

1. Nutrient source Type A — shared row; overlay хранит только link/overrides.
2. Все persistent personal rows client-scoped.
3. Cloud snapshot применяется только после фиксации current client id.
4. Cloud-originated apply не отправляется обратно в cloud.
5. Уменьшение списка требует tombstone или явного разрешённого merge.
6. Один shared product не должен накапливать несколько Type A с одним
   `shared_origin_id`.
7. Meal не ссылается на Type A без валидного shared nutrient source и на новый
   persistent product до commit/accepted queue path.
8. Shared mutations проходят session/curator authorization и moderation policy.
9. Search работает по тому же merged view, который видит product picker.
10. Legacy `heys_products` — rollback/fallback, не источник для boot top-up.
11. Sharded overlay принимается только целым поколением по manifest; main/tails
    остаются plain arrays для backward compatibility.
12. «Недавние» строятся из той же client-scoped истории использования, что и
    персонализация поиска; отдельная глобальная история не создаётся.
13. Pending moderation не использует generic REST PATCH: curator id приходит из
    JWT, browser metadata не попадает в typed DB columns, а product mutation и
    итоговый статус pending атомарны.
14. Curator-suffixed product RPC доступны через gateway только с curator JWT;
    DB-функции не имеют `PUBLIC EXECUTE`, execute разрешён только `heys_rpc`.
15. `fingerprint` и `brand_fingerprint` в `shared_products` считает сервер
    триггером `trg_shared_products_set_fingerprint`, а не вызывающий. Значение,
    пришедшее в запросе, перезаписывается: отпечаток обязан соответствовать
    строке при любом пути записи.
16. Автолинковка Type B → Type A требует совпадения состава, а не только имени.
    При расхождении макронутриентов запись остаётся личной копией.

    Следствие, подтверждённое инцидентом 21.08: одна и та же еда законно
    существует двумя несвязанными карточками — личной Type B и строкой общей
    базы. Поэтому резолв позиции по названию обязан иметь правило приоритета:
    **единственное точное совпадение имени в личном списке — это ответ, а не
    неоднозначность** (`resolveProduct` в `heys-mcp/lib/tools.js`, то же правило
    в `findRecipeIngredient`). Без него пара «личная + общая» неразрешима
    арифметически: точное имя даёт обеим по 1000 очков, надбавка own — +60, а
    порог уверенности требует превосходства в 1.25 раза, и `ambiguous_product`
    возвращался всегда. Настоящая неоднозначность (несколько разных карточек под
    запрос) по-прежнему отдаётся кандидатами.

    Открытым остаётся сам класс: связь ставится только по `shared_origin_id`,
    autolink требует точного равенства макросов, бэкфилл `shared_origin_id`
    (`heys_core_v12.js`) срабатывает лишь для карточек с нехваткой нутриентов, а
    нормализация имени в MCP (пунктуация вырезается) и в вебе/SQL (сохраняется)
    различается — на кавычках в названии слои расходятся в разные стороны. В MCP
    dedup shared-дубля по имени — три агрегата Б+У+Ж **с допуском** 0.05
    (`sameAggregateComposition`); в overlay autolink — **семь** макро-полей
    **без допуска** (`_sameComposition`). Веб строже дважды: полей больше и
    расхождение в сотые не склеивается.

17. Имя колонки в REST-запросе к каталогу никогда не приходит из запроса
    напрямую: и фильтры (ключ query-параметра), и колонки INSERT (ключи
    JSON-тела, `on_conflict`) проходят whitelist `ALLOWED_COLUMNS` таблицы,
    иначе запрос отбивается до обращения к БД. Это идентификатор в SQL —
    параметризовать его нельзя, поэтому проверка обязательна (SEC-029).
18. Write в `shared_products` и `shared_products_pending` через REST требует
    кураторский JWT (SEC-028), а для `shared_products_pending` сервер вдобавок
    сам дописывает `curator_id` из токена в WHERE на PATCH/DELETE: куратор
    работает только со своей очередью модерации (SEC-032). У `shared_products`
    владельца-куратора нет, правило на него не распространяется.
19. Модель «продукт → рецепт на карточке → набор → позиция в дне» — § «Модель
    сущностей и стык с дневником» выше. Ниже — контракты каталога и MCP вокруг
    рецепта.

    Рецепт (`product.recipe`) живёт только на Type B. Save молча поднимает `rev`
    и `updatedAt` и пересчитывает КБЖУ **карточки**; **прошлые дни по save
    рецепта** не трогает (ретро — `heys_reapply_recipe`). Это не отменяет веб-
    каскад при правке обычной карточки и пересчёт дня из карточки, не inline
    (см. «Карточка → позиция в дне»). Исправление прошлого —
    `heys_reapply_recipe`: превью читает дни пакетом, запись только
    `mergeSaveKV` по одному дню. Ингредиенты при ретро — текущие карточки.
    Позиция дня хранит снимок `recipe_items` / `recipe_yield` / `recipe_rev`.
    След — `recipe_backfill_log[]` на дне: `ensureDay` и `mergeDayData` его
    сохраняют. В **shared_products** рецепт не попадает: колонки `recipe` в
    таблице нет, `publish_shared_product_by_curator` пишет только типизированный
    набор полей из JSONB (`scripts/db/migrations/…_shared_products_barcode.sql`,
    INSERT без recipe). Веб в pending шлёт весь объект
    (`heys_cloud_shared_v1.js:646` — `p_product_data: { ...product }`), не
    whitelist на клиенте; лишнее отсекается на сервере при публикации и при
    sanitize pending (`…_moderation_sanitize`). MCP перед publish отдельно
    отклоняет `recipe_on_shared_forbidden`; блюдо с составом в общую базу само
    не уезжает — бренд у авторского блюда не делает его промышленным (правка
    2026-08-18; до неё MCP лил в `publish_shared_product_by_curator` весь row).

    Работа с составом через MCP: `heys_get_recipe` отдаёт ингредиенты с
    `product_id`, вклад каждого в калорийность, уварку (`yield` минус сумма) и
    сверку сохранённых КБЖУ с текущими карточками ингредиентов; без `product_id`
    — список блюд клиента. Правка — `heys_update_product`: `recipe` заменяет
    состав целиком, `recipe_patch` ({set, remove, yield_grams}) правит только
    названные позиции, пустой `recipe_patch` пересчитывает КБЖУ по текущим
    карточкам. Без явного `yield_grams` выход едет за составом, сохраняя прежнюю
    долю уварки. Правка или удаление карточки-ингредиента возвращает список
    блюд, где она используется: пересчёта по цепочке нет и не планируется.
    Удаление возвращает и список наборов приёмов с этим продуктом — до 21.08
    проверялись только рецепты, из-за чего на проде четыре набора двух клиентов
    ссылались на удалённые карточки. Сам набор от этого не ломается: позиция
    хранит снимок КБЖУ на 100 г. **MCP** при развороте сначала ищет живую
    карточку, снимок — fallback; **UI** — preview в модалке, в день по умолчанию
    снимок (`overlay_present`); живая карточка редко
    (`visible_product_present`). См. наборы выше. Отказ `preset_item_missing`
    остался только для позиции без нутриентов — там восстанавливать нечего.
    Ингредиент резолвится по слоям: личная карточка клиента (точное совпадение
    имени выигрывает), затем общая база; настоящая неоднозначность отдаётся
    кандидатами (`recipe_item_ambiguous`), а не молчаливым "не найден".
    `heys_get_recipe` показывает слой каждого ингредиента (`card_source`).

20. ГИ и вред рецепта считаются по массе ингредиентов, `kcal100` — Atwater
    `3×Б + 4×У + 9×Ж` после агрегации. `fiber100` отдельно от `complex100`.
21. Overlay в облаке читается и пишется только парой строк+manifest; MCP
    `saveOverlayRows` и web assemble обязательны — один ключ без manifest
    рассинхронизирует каталог между устройствами.
22. Failed overlay assemble в web логируется (`reportOverlayAssemblyFailure`) и
    не подменяет локальный каталог «тихим пустым» cloud snapshot.
23. MCP: Type A в overlay при пустом shared index →
    `shared_catalog_unavailable`.
24. Interceptor: непустой overlay блокирует legacy dual-write migrate в overlay
    (cloud-canonical); первичный bootstrap из legacy допустим только пока
    overlay пуст.

## Конвенция углеводов: `simple + complex` — БЕЗ пищевых волокон

`simple100` — сахара, `complex100` — «углеводы минус сахара», `fiber100` —
пищевые волокна **отдельным** полем, не входящим в первые два. Это конвенция
российской этикетки (ТР ТС 022/2011, где углеводы и пищевые волокна указаны
раздельно), и именно её задаёт описание MCP-инструмента `heys_create_product`:
«complex100 = углеводы минус сахара».

Из этого следует, что формула `3*белок + 4*углеводы + 9*жир` корректна:
клетчатка в неё не входит и калорий не даёт. Отклонение от строгой нормы есть —
по EU 1169/2011 волокна считаются по 2 ккал/г, — но оно втрое меньше прежнего и
работает в безопасную сторону (занижение, а не завышение).

**Чем это грозит на практике.** Часть каталога исторически заполнена по
американской схеме, где `Total Carbohydrate` волокна ВКЛЮЧАЕТ. Такие карточки
считают клетчатку дважды — в `complex100` и в `fiber100` — и завышают
калорийность на `4 × клетчатка`. Проверка на 2026-08-02: у 52 карточек из 398
расхождение превышает 10 ккал, у пяти — 30 ккал, максимум 50 ккал
(какао-порошок).

**Почему это нельзя починить массовым вычитанием.** Признака «уже исправлено» в
данных нет, и правило ломается на реальных примерах:

| Продукт       | complex | fiber | вычесть клетчатку                |
| ------------- | ------- | ----- | -------------------------------- |
| Яблоко        | 2.3     | 2.4   | 0 — верно (усвояемых 11.4)       |
| Семена чиа    | 7.2     | 34.4  | 0 — верно, чиа почти вся волокна |
| Какао-порошок | 23.2    | 33    | 0 — **неверно**, там ~25 г       |

Какао уже приведено к конвенции миграцией
`2026-08-02_fix_catalog_arithmetic.sql`; повторное вычитание его сломает.
Поэтому приведение остальных карточек делается только поштучно, при сверке с
этикеткой или справочником.

Крайние случаи двойного счёта теперь отбиваются на входе констрейнтом
`shared_products_mass_within_100g` (сумма нутриентов ≤ 105 г на 100 г) — именно
он поймал бы какао и грецкий орех, если бы существовал в мае.

Нарушение этого CHECK — бизнес-отказ, не падение БД. `heys-api-rpc` мапит
SQLSTATE `23514` в HTTP 200 `{ success: false, code: 'CHECK_VIOLATION', error }`
с текстом про сумму и лимит 105 г; коннектор и вкладка каталога показывают
`error`, а не сырой `"Database error"`. Личная карточка клиента при этом уже
создана: общая база отказала, overlay нет. `heys_update_product` общую карточку
не перепубликует — это личный override, не баг публикации.

## Ограничение модели: энергия алкоголя не учитывается

Калорийность считается как `3*белок + 4*углеводы + 9*жир` (NET-Atwater, белок
намеренно по 3). Поля для этанола в модели нет, а он даёт 7 ккал/г — у вина это
около двух третей калорийности. Без обхода алкоголь занижается втрое: красное
вино считалось как 20 ккал вместо ~90.

Текущий обход (2026-08-02): энергия спирта вносится эквивалентом `7/4 = 1.75` г
на грамм спирта в **сложные** углеводы, а не в сахара — так спирт не попадает в
оценку сахарной нагрузки и гликемические расчёты. У каждой такой карточки в
`description` это указано явно. Затронуты три позиции: красное вино полусладкое,
Bakalář, Жигулёвское пшеничное.

Что это стоит: калорийность верная, но БЖУ искажены — у вина в углеводах
числится ~18 г, которых там нет. Значит любая аналитика по углеводам и сахарной
нагрузке на алкогольных позициях врёт.

Полное решение — отдельное поле `alcohol100` и слагаемое `7*алкоголь` в формуле.
Оно затрагивает формулу разом в клиенте, сервере и MCP, поэтому вынесено в
отдельную задачу и на 2026-08-02 не сделано. Пока поле не появилось, новые
алкогольные позиции нужно заводить тем же обходом, иначе их калорийность будет
занижена.

## Подтверждённые слабые места и пробелы

- Legacy и overlay продолжают dual-write/fallback. Большое число guards,
  migration markers и recovery paths повышает риск расхождения при изменении
  одного канала без второго.
- `products-protection.test.js` преимущественно повторяет упрощённые функции в
  самом test, а не исполняет production facade; его зелёный результат не
  доказывает актуальные shrink/merge contracts.
- Search package `@heys/search` и фактический `heys_smart_search_v2.js` — два
  разных движка. Изменение package может не повлиять на продуктовый поиск.
- Search fallback активируется и при настоящем нулевом результате smart engine,
  поэтому semantic/typo policy и fallback могут давать качественно разные
  ранжирования без явного признака для пользователя.
- Shared/pending database contracts распределены по длинной цепочке миграций;
  при следующих изменениях нужно повторно проверять live ACL и function bodies.
- Production flag override из localStorage может выключить overlay и вернуть
  legacy reader; source default `true` не доказывает состояние конкретного
  браузера.
- Качество данных каталога не проверяется ничем автоматическим. Ревью 415
  карточек 2026-08-02 нашло потерянные макронутриенты (сало 394 вместо ~800
  ккал, чипсы 353 вместо ~530), перепутанные сахара и крахмал, инверсии `harm` и
  трансжиры у продуктов, где их не бывает. Исправлена часть; остаток и разбор —
  `scripts/db/migrations/2026-08-02_*`. На вход общей базы стоят CHECK
  (отрицательные нутриенты, сумма > 105 г, энергия > 950, трансжиры, GI,
  вредность); форма редактора по-прежнему не считает сумму до отправки, поэтому
  отказ приходит с сервера.
- Сахарные спирты (мальтит и подобные) в протеиновых батончиках записываются в
  `fiber100`, из-за чего выпадают из расчёта и калорийность занижается примерно
  вдвое. Отдельного поля для полиолов в модели нет — та же природа пробела, что
  и у алкоголя.
- ~~`heardFromCloud` не сбрасывается при `OverlayStore.clear()`~~ — **исправлено
  2026-08-23** (`heardFromCloud = false` в `clear()`; тест
  `overlay-publish-guard.test.js`).
- Два критерия «склейки дублей»: overlay `_sameComposition` — 7 макро-полей,
  точное равенство (округление 0.1); MCP `sameAggregateComposition` — Б+У+Ж с
  допуском 0.05. Не переносить выводы между слоями.
- MCP fuzzy/hints (`fuzzySearchProducts`, `missingProductHints`) не дублируют
  web SmartSearch; поведение поиска в чате куратора и в AddProductStep может
  расходиться.
- ~~`cascadeMealItemsOnProductUpdate` без фильтра клиента~~ — **исправлено
  2026-08-23:** `HEYS.dayUtils.isDayv2KeyForCurrentClient` в каскаде и
  геймификации (`isDayKeyForCurrentClient` с inline-fallback как в каскаде —
  fail-safe без dayUtils); unscoped `heys_dayv2_*` сохранены (инвариант 9).
  Тест: `dayv2-client-scope.test.js` · E2E:
  `products-client-scope-smoke.spec.ts`,
  `products-cascade-client-scope-smoke.spec.ts` (legacy migration: scoped
  After + raw unscoped Before).
- **`heardFromCloud` E2E:** `products-heardfromcloud-smoke.spec.ts` (PIN +
  `OverlayStore.clear()`).
- **Pollution-ключи `heys_<текущий>_<чужой>_dayv2_*`:** новые не пишутся;
  **recovery в `Store.get` не реализован** (ветка `doubleScopedKey` мёртвая —
  форма ключа другая; откат ложного фикса 2026-08-23). Старый мусор в LS/KV —
  отдельная cleanup-задача.
- **Контракт `ensureMealProductReady` по `reason`:** тест
  `ensure-meal-product-ready-reason.test.js` — `overlay_present` возвращает
  переданный объект; `visible_product_present` — из `getById`/`getAll`.

## Архитектурная оценка

> **Статус раздела:** ориентир для решений (tradeoff'ы, сроки, риски) — **не**
> Facts Table и не «проверено» как инвариант кода. Факты со статусом — в таблице
> P\* и в § «Подтверждённые слабые места»; очередь работ — в
> `IMPROVEMENT_BACKLOG.md`, если заведена.

Концептуальный разбор по состоянию на 2026-08-23 (коммит `56516003`). Дополняет
Facts Table и список слабых мест выше: **зачем** система устроена так и **куда**
давит долг. Ссылки на задачник не ведут — только модель и tradeoff'ы.

### Вердикт

Не «всё идеально» и не «переписывать с нуля».

**Ядро** (shared + overlay, `applyCloudSnapshot`, commit gate, manifest/shards,
слепок при записи в `meal.items[]`, moderation shared) — **уместно** для
constraints HEYS: offline/PWA, куратор с несколькими клиентами, общая база без
копии каталога на каждого, fail-closed после серии инцидентов 2025–08/2026.

**Главный концептуальный долг** — не «overlay плохой», а две линии параллельно:

1. **Семантика дня:** при записи слепок, после записи в вебе — живая карточка +
   каскад; MCP — только inline. Нет одного явного контракта (`snapshot-only` /
   `live-with-cascade` / `explicit reapply`).
2. **Legacy:** dual-write и kill-switch — страховка миграции, но каждая правка
   «только overlay» или «только legacy» рискует рассинхроном, пока оба канала
   живы.

Вторичный долг (модель полей алкоголь/полиолы, два search-движка, два критерия
«один продукт») общий для HEYS, не только для overlay.

### Сильные стороны (опора)

| Область                     | Почему держится                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| Shared + overlay Type A/B   | Nutrients из shared; личное — связь, overrides, рецепты без N×копий базы                  |
| Единый cloud → overlay      | `applyCloudSnapshot`; нет десятка writer'ов в каталог                                     |
| Fail-closed                 | Shrink/tombstone, `catalog_not_loaded`, loud assemble failure, Type A без shared → ошибка |
| Manifest + шарды            | Целое поколение KV; инцидент 22.08 без manifest                                           |
| Слепок в позицию при записи | День считается при удалённой карточке; наборы с `PRESET_ITEM_FIELDS`                      |
| Рецепт на карточке          | Нет лишней сущности «блюдо»; `rev` + `heys_reapply_recipe` — явный ретро-путь             |
| Commit gate перед meal      | Нельзя закрепить в дне продукт без принятого overlay/cloud path                           |
| Shared governance           | JWT, атомарная модерация, ACL на SECURITY DEFINER (P14–P16)                               |

### Оценка по зонам (шкала субъективная, для приоритизации)

| Зона                                             | Оценка       | Комментарий                                                               |
| ------------------------------------------------ | ------------ | ------------------------------------------------------------------------- |
| Каталог: shared + overlay + sync                 | высокая      | Зрело, дорого в сопровождении, но обосновано инцидентами                  |
| Стык каталог → день                              | средняя      | Три правила (слепок / hybrid / каскад) + расхождение MCP vs веб           |
| Рецепты и наборы                                 | средняя+     | Простая модель; цепочка ингредиент→блюдо→день требует дисциплины куратора |
| Shared governance                                | высокая      | После 07–08/2026 контракты выглядят цельными                              |
| Модель полей (алкоголь, полиолы, RU/US углеводы) | ниже средней | Долг данных и формулы, не storage                                         |
| Единообразие каналов (UI / MCP / shared)         | ниже средней | Разный resolve набора, пересчёт дня, fuzzy vs SmartSearch                 |

### Стык «каталог → день»

**Проблема.** Одна позиция `meal.items[]` одновременно:

- **слепок** при записи (`buildMealItem` / `buildMealItemFromProduct`);
- **ссылка на живую карточку** при пересчёте в UI (`mealTotals` →
  `getProductFromItem`, дефолт `hybrid`, P31);
- **объект ретро-правки** при каскаде (`cascadeMealItemsOnProductUpdate`).

MCP при сумме дня опирается на **inline** (`itemKcal`, P34) и **не** каскадирует
прошлое при правке карточки. Куратор и клиент могут видеть **разные цифры** на
одном дне при той же карточке — не баг одной строки, а **три канала без одного
контракта**.

**Три возможных контракта** (выбор продукта, сейчас смешаны):

| Контракт            | Правило                                                                                                                   | Близко к                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `snapshot-only`     | После записи день живёт только по inline; правка карточки не меняет прошлое; ретро — явный инструмент                     | MCP-сумма; «карточку удалили — inline остался»        |
| `live-with-cascade` | Пока карточка резолвится — пересчёт из каталога; правка карточки синхронизирует inline во всех днях с тем же `product_id` | Веб `mealTotals` + каскад (client-scope с 2026-08-23) |
| `explicit reapply`  | Карточка меняется только вперёд; прошлые дни — только осознанный reapply (как `heys_reapply_recipe` для состава блюда)    | Save рецепта; MCP без каскада                         |

**Стратегии эволюции**

| Стратегия     | Суть                                                                                                                                                                                                                     | Плюсы                                                                            | Минусы                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Оставить**  | Зафиксировать в доке и UI: «клиент — live+cascade, куратор MCP — snapshot»; не обещать одну цифру везде                                                                                                                  | Нулевой риск регрессии; соответствует текущему коду                              | Куратор не понимает расхождение; аналитика «день как документ» не выполняется для клиента                 |
| **Упростить** | Один контракт пересчёта в **вебе** (`hybrid` + каскад как sync inline); MCP для **отображения** дня клиента тоже резолвить карточку (не только `itemKcal`); наборы — документировать расхождение UI/MCP без смены модели | Меньше «две правды» без ломки snapshot-at-write; куратор видит то же, что клиент | Работа в `day.js`/MCP; hybrid остаётся — прошлое всё ещё «плывёт» при правке карточки                     |
| **Изменить**  | Выбрать **`snapshot-only` по умолчанию** везде; `live-with-cascade` — opt-in (флаг клиента/куратора) или только «сегодня»; ретро — только reapply/cascade по подтверждению                                               | Исторический день становится аудируемым; MCP и веб сходятся                      | Ломает ожидание «исправил карточку — прошлые дни поправились»; миграция данных/UX; нужны массовые reapply |

**Рекомендация для обсуждения (не решение):** client-scope каскада и сброс
`heardFromCloud` — **сделано 2026-08-23**. Дальше — **сначала** продуктово
выбрать контракт дня (и наборов: UI preview vs живая карточка после
`ensureMealProductReady` входят в то же решение); **потом** сводить код.
«Выровнять куратора с клиентом» без выбора = уже выбрали `live-with-cascade` или
`snapshot-only` — нейтрального шага нет.

### Overlay vs legacy

**Проблема.** Канонический reader — overlay (`overlay_products_v2=true`), но
`heys_products` dual-write, migration/self-heal, kill-switch и cloud-canonical
guard в interceptor — **параллельная вселенная**. Любая правка одного канала без
второго — класс риска (см. список слабых мест).

**Стратегии эволюции**

| Стратегия     | Суть                                                                                                                                                  | Плюсы                                                                           | Минусы                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Оставить**  | Dual-write + kill-switch до полной уверенности; все guards остаются                                                                                   | Откат на legacy за минуты; безопасно при параллельных агентах и старых вкладках | Сложность растёт; новые разработчики путают каналы                                             |
| **Упростить** | Read **всегда** overlay+shared; legacy — write-only mirror или read только при явном kill-switch; убрать migration top-up paths, оставить diagnostics | Меньше веток boot; один mental model «читаем overlay»                           | Legacy mirror всё ещё пишется; нужны тесты на kill-switch                                      |
| **Изменить**  | Удалить legacy reader и dual-write; overlay + shared — единственный path; kill-switch → «readonly degraded», не silent fallback на `heys_products`    | Минимальная сложность; нельзя случайно опубликовать из пустого LS               | Требует окно без старых клиентов/вкладок; CI и rollback plan; инцидент без overlay = hard fail |

**Рекомендация для обсуждения (не решение):** **упростить** read path — без
удаления legacy; **изменить** (выключить dual-write) — только после метрик «нет
reader'ов на legacy N недель» и без зависимости kill-switch от localStorage в
prod.

### Что не входит в «переписать продукты»

- Поля `alcohol100` / полиолы — сквозная модель нутриентов (клиент, MCP,
  shared).
- Два search-движка и fuzzy MCP — зона поиска, не overlay.
- Качество карточек shared — governance + ручной/полуавтоматический QA, CHECK
  только на вход.

## Верификация и срок годности

Досье свежее только для даты `Актуален на` и коммита в HTML-комментарии шапки.

### Файлы-сторожи

| Файл                                              | Зона                                                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `apps/web/heys_products_overlay_v1.js`            | merge, `applyCloudSnapshot`, `writeRaw`, autolink                                        |
| `apps/web/heys_core_v12.js`                       | facade, `ensurePersonalProductCommitted`, commit gate                                    |
| `apps/web/heys_storage_supabase_v1.js`            | interceptor, HOT sync, assemble merge, dual-write guard                                  |
| `apps/web/heys_storage_layer_v1.js`               | `MEAL_PRESETS_KEY`, `saveMealPreset`                                                     |
| `apps/web/heys_add_product_step_v1.js`            | AddProductStep, search UI, meal ready, `handleAddAll`, `cascadeMealItemsOnProductUpdate` |
| `apps/web/heys_models_v1.js`                      | `getProductFromItem`, `mealTotals`, `recipeSnapshotFields`                               |
| `apps/web/heys_day_add_product.js`                | `buildMealItemFromProduct`                                                               |
| `apps/web/heys_smart_search_v2.js`                | `SmartSearchWithTypos`                                                                   |
| `apps/web/heys_feature_flags_v1.js`               | `overlay_products_v2`, `dual_write_legacy`                                               |
| `yandex-cloud-functions/heys-mcp/lib/products.js` | glue v9, `pickSearchMatch`, `saveOverlayRows`                                            |
| `yandex-cloud-functions/heys-mcp/lib/tools.js`    | `loadCatalog`, resolve, hints                                                            |
| `yandex-cloud-functions/heys-mcp/lib/day.js`      | `buildMealItem`, `itemKcal`                                                              |

```bash
git log -1 --oneline -- apps/web/heys_products_overlay_v1.js apps/web/heys_core_v12.js apps/web/heys_storage_supabase_v1.js apps/web/heys_add_product_step_v1.js apps/web/heys_smart_search_v2.js yandex-cloud-functions/heys-mcp/lib/products.js yandex-cloud-functions/heys-mcp/lib/tools.js
```

Хеш новее `56516003` → перечитать затронутые символы, обновить паспорт и Facts
Table.

### Регрессия контракта

```bash
pnpm exec vitest run apps/web/__tests__/overlay-shard-codec.test.js apps/web/__tests__/product-commit-gate-contract.test.js apps/web/__tests__/overlay-cloud-snapshot-suppress.test.js apps/web/__tests__/overlay-assembly-failure-loud.test.js apps/web/__tests__/meal-item-snapshot-vs-card.test.js --no-coverage
node --test yandex-cloud-functions/heys-mcp/__tests__/products.test.cjs yandex-cloud-functions/heys-mcp/__tests__/tools.test.cjs
pnpm docs:reference:check
```

## Facts Table

| ID  | Утверждение                                                                              | Проверка                                                                                                                                                                                                                                                                                                                                                                                       | Статус                                                                                         |
| --- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| P1  | Overlay default включён, legacy dual-write сохранён                                      | `sed -n '35,70p' apps/web/heys_feature_flags_v1.js`                                                                                                                                                                                                                                                                                                                                            | проверено 2026-07-17                                                                           |
| P2  | Merged view соединяет Type A с shared и оставляет Type B full row                        | `sed -n '415,505p' apps/web/heys_products_overlay_v1.js`                                                                                                                                                                                                                                                                                                                                       | проверено 2026-07-17                                                                           |
| P3  | Missing individual shared base возвращает disabled placeholder, не raw selectable Type A | `rg -n 'hasMealNutrientSource                                               \| \_nutrientsPending                                                             \| \_selectionDisabled' apps/web/heys_products_overlay_v1.js apps/web/heys_add_product_step_v1.js`                                                                                                                               | проверено 2026-07-18                                                                           |
| P4  | Cloud snapshot dedup/tombstone/pending merge пишет без reverse sync                      | `sed -n '180,350p' apps/web/heys_products_overlay_v1.js`                                                                                                                                                                                                                                                                                                                                       | проверено 2026-07-17                                                                           |
| P5  | Public facade использует merged view с legacy fallback                                   | `sed -n '5528,5585p' apps/web/heys_core_v12.js`                                                                                                                                                                                                                                                                                                                                                | проверено 2026-07-17                                                                           |
| P6  | Persistent meal product проходит nutrient resolver и overlay/cloud commit gate           | `rg -n 'resolveMealProduct                                                  \| ensurePersonalProductCommitted                                                 \| ensureMealProductReady' apps/web/heys_products_overlay_v1.js apps/web/heys_core_v12.js && pnpm vitest run apps/web/**tests**/overlay-cloud-snapshot-suppress.test.js apps/web/**tests**/product-commit-gate-contract.test.js` | проверено 2026-07-18                                                                           |
| P7  | RPC allowlist разделяет pending, curator publish и barcode contracts                     | `sed -n '845,870p' yandex-cloud-functions/heys-api-rpc/index.js`                                                                                                                                                                                                                                                                                                                               | проверено 2026-07-17                                                                           |
| P8  | AddProductStep вызывает web SmartSearch и имеет normalized fallback                      | `sed -n '4330,4385p' apps/web/heys_add_product_step_v1.js`                                                                                                                                                                                                                                                                                                                                     | проверено 2026-07-17                                                                           |
| P9  | Web search экспортируется из `heys_smart_search_v2.js`                                   | `tail -n 45 apps/web/heys_smart_search_v2.js`                                                                                                                                                                                                                                                                                                                                                  | проверено 2026-07-17                                                                           |
| P10 | `@heys/search` не импортируется активным web product flow                                | `rg -n '@heys/search                                                        \| SmartSearchEngine' apps/web --glob '!**/node_modules/**' --glob '!**/dist/**'`                                                                                                                                                                                                                                  | проверено 2026-07-17: только dependency/config/dynamic registry, не AddProductStep runtime     |
| P11 | Production overlay tests выполняют source через VM                                       | `sed -n '1,80p' apps/web/__tests__/overlay-cloud-snapshot-suppress.test.js`                                                                                                                                                                                                                                                                                                                    | проверено 2026-07-17                                                                           |
| P12 | Legacy protection test повторяет локальную симуляцию                                     | `sed -n '1,110p' apps/web/__tests__/products-protection.test.js`                                                                                                                                                                                                                                                                                                                               | проверено 2026-07-17                                                                           |
| P13 | Overlay выше RPC budget дробится и принимается только по целому manifest generation      | `pnpm exec vitest run apps/web/__tests__/overlay-shard-codec.test.js apps/web/__tests__/product-commit-gate-contract.test.js apps/web/__tests__/hot-sync-curator-path.test.js --no-coverage`                                                                                                                                                                                                   | проверено 2026-07-18: 26 тестов                                                                |
| P14 | Shared pending moderation JWT-only и атомарно связывает product mutation со статусом     | `node yandex-cloud-functions/heys-api-rpc/tests/shared_product_moderation_rpc.contract.test.js && pnpm exec vitest run apps/web/__tests__/shared-product-moderation-contract.test.js --no-coverage`                                                                                                                                                                                            | проверено 2026-07-29                                                                           |
| P15 | Curator product functions отзывают PUBLIC execute и сохраняют grant для `heys_rpc`       | `node --test scripts/db/curator-product-acl.contract.test.mjs && node scripts/db/migrate.mjs --status --require-current`                                                                                                                                                                                                                                                                       | применено и live-проверено 2026-07-29: PUBLIC=false, heys_rpc=true для всех трёх функций       |
| P16 | Atomic product update исключает local id из typed mapping и сохраняет JSONB portions     | `node --test scripts/db/atomic-shared-product-moderation-sanitize.contract.test.mjs && node scripts/db/migrate.mjs --status --require-current`                                                                                                                                                                                                                                                 | применено и live-проверено 2026-07-29: pending=approved, requested portions=product portions   |
| P17 | Отпечатки `shared_products` считает сервер и они не расходятся со строкой                | `bash scripts/db/psql.sh -c "SELECT count(*) FILTER (WHERE fingerprint <> public.compute_product_fingerprint(jsonb_build_object('name',name,'simple100',simple100,'complex100',complex100,'protein100',protein100,'badFat100',badfat100,'goodFat100',goodfat100,'trans100',trans100,'fiber100',fiber100,'gi',gi,'harm',harm))) AS drifted FROM shared_products;"`                              | применено и live-проверено 2026-08-02: до триггера расходились 263 из 399, после — drifted = 0 |
| P18 | Автолинковка Type B → Type A блокируется при расхождении состава                         | `(cd apps/web && npx vitest run __tests__/overlay-autolink-composition.test.js)`                                                                                                                                                                                                                                                                                                               | проверено 2026-08-02: 3 теста                                                                  |
| P19 | Энергия алкоголя внесена эквивалентом в сложные углеводы, поля для этанола нет           | `bash scripts/db/psql.sh -c "SELECT name, description FROM shared_products WHERE description ILIKE '%спирт%';"`                                                                                                                                                                                                                                                                                | применено 2026-08-02: 3 позиции, обход задокументирован в разделе «Ограничение модели»         |
| P20 | Имя колонки в REST-фильтре и в INSERT проходит whitelist таблицы, иначе 400              | `node --test yandex-cloud-functions/__tests__/rest-filter-column-injection.contract.test.cjs`                                                                                                                                                                                                                                                                                                  | 11/11 pass 2026-08-02 (SEC-029); в рабочем дереве, не задеплоено                               |
| P21 | PATCH/DELETE по `shared_products_pending` всегда ограничены `curator_id` из JWT          | `node --test yandex-cloud-functions/__tests__/rest-pending-ownership.contract.test.cjs`                                                                                                                                                                                                                                                                                                        | 6/6 pass 2026-08-02 (SEC-032); в рабочем дереве, не задеплоено                                 |
| P22 | CHECK `shared_products_mass_within_100g` на RPC отдаётся как `CHECK_VIOLATION`, не 500   | `node --test yandex-cloud-functions/heys-api-rpc/__tests__/pg-check-violation.test.js && node yandex-cloud-functions/heys-api-rpc/tests/shared_product_check_violation.contract.test.js`                                                                                                                                                                                                       | проверено 2026-08-13: MEDUTEUT 107 г → текст про 105 г, без `Database error`                   |
| P23 | Рецепт Type B: snapshot в дне, save без ретро, reapply через mergeSaveKV по дням         | `node --test yandex-cloud-functions/heys-mcp/__tests__/products.test.cjs yandex-cloud-functions/heys-mcp/__tests__/tools.test.cjs && pnpm exec vitest run apps/web/__tests__/curator-authorship.test.js --no-coverage`                                                                                                                                                                         | проверено 2026-08-18                                                                           |
| P24 | MCP overlay read/write только через assemble + `saveOverlayRows` (manifest last)         | symbols `loadOverlayAssembled`, `saveOverlayRows` in `heys-mcp/lib/products.js`, `tools.js`                                                                                                                                                                                                                                                                                                    | проверено 2026-08-23                                                                           |
| P25 | Web отклоняет broken overlay assemble с `reportOverlayAssemblyFailure`                   | `pnpm exec vitest run apps/web/__tests__/overlay-assembly-failure-loud.test.js --no-coverage`                                                                                                                                                                                                                                                                                                  | проверено 2026-08-23                                                                           |
| P26 | MCP `shared_catalog_unavailable` при Type A без shared index                             | symbol `shared_catalog_unavailable` in `heys-mcp/lib/tools.js`                                                                                                                                                                                                                                                                                                                                 | проверено 2026-08-23                                                                           |
| P27 | Commit gate `catalog_not_loaded` через `hasHeardFromCloud` + пустой overlay              | symbols `catalog_not_loaded`, `hasHeardFromCloud` in `heys_core_v12.js`, `heys_products_overlay_v1.js`                                                                                                                                                                                                                                                                                         | проверено 2026-08-23                                                                           |
| P28 | 413 на commit → `commitLocallyQueued`, не shard split в gate                             | symbols `commitLocallyQueued`, `cloud_save_queued_after_413` in `heys_core_v12.js`                                                                                                                                                                                                                                                                                                             | проверено 2026-08-23                                                                           |
| P29 | Interceptor skip dual-write при непустом overlay (cloud-canonical)                       | symbols `_overlayCanonical`, log `overlay non-empty, cloud-canonical` in `heys_storage_supabase_v1.js`                                                                                                                                                                                                                                                                                         | проверено 2026-08-23                                                                           |
| P30 | Запись в приём кладёт полный нутриентный слепок (MCP + web)                              | `buildMealItem` in `day.js`, `buildMealItemFromProduct` in `heys_day_add_product.js`                                                                                                                                                                                                                                                                                                           | проверено 2026-08-23                                                                           |
| P31 | Веб: `mealTotals` считает из карточки, не из inline (пока карточка резолвится)           | `pnpm exec vitest run apps/web/__tests__/meal-item-snapshot-vs-card.test.js --no-coverage` (4 теста)                                                                                                                                                                                                                                                                                           | проверено 2026-08-23                                                                           |
| P32 | Правка карточки в UI каскадирует inline-поля прошлых позиций                             | symbol `cascadeMealItemsOnProductUpdate` in `heys_add_product_step_v1.js`                                                                                                                                                                                                                                                                                                                      | проверено 2026-08-23                                                                           |
| P33 | MCP `resolvePresetItem`: id → имя → снимок набора                                        | symbol `resolvePresetItem` in `heys-mcp/lib/tools.js`                                                                                                                                                                                                                                                                                                                                          | проверено 2026-08-23                                                                           |
| P34 | MCP: сумма приёма из inline `item.kcal100`, карточку не подставляет                      | symbol `itemKcal` in `yandex-cloud-functions/heys-mcp/lib/day.js`                                                                                                                                                                                                                                                                                                                              | проверено 2026-08-23                                                                           |
| P35 | Смена КБЖУ ингредиента не пересчитывает блюдо; на блюде нужен `recipe_patch:{}`          | `heys_update_product`, подсказки в `heys_get_recipe` in `heys-mcp/lib/tools.js`                                                                                                                                                                                                                                                                                                                | проверено 2026-08-23                                                                           |
