# Продукты, overlay и поиск

> **Статус:** core source-контракты проверены 2026-07-18 **Охват:** shared
> catalog, client overlay, merge/sync, commit gate, moderation entrypoints и
> поиск в основном web flow **Не подтверждено:** production catalog
> contents/count, runtime feature flags, database function bodies после
> последней migration и browser/E2E поведение

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
| Shared/pending schema evolution                        | versioned files in `database/`                 |

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

## Добавление продукта и commit gate

Добавление shared продукта создаёт/обновляет Type A, custom — Type B. Перед
вставкой продукта в meal `ensureMealProductReady` приводит shared result к
личной строке и при необходимости вызывает `ensurePersonalProductCommitted`.
Сначала он повторно разрешает Type A через `OverlayStore.resolveMealProduct`:
missing/неполный shared base возвращает `shared_nutrients_pending` до day write;
после refresh тот же overlay id сливается с base без второй строки.

При включённом overlay commit gate требует client id и cloud API, сохраняет
overlay и затем читает его обратно. Обычная запись остаётся plain array для
совместимости со старым reader, после неё публикуется versioned manifest. При
HTTP 413 background upload делит массив на основной блок и numbered tails: tails
и main пишутся первыми, manifest — последним. Новый reader применяет поколение
только при совпадении числа блоков, row count и canonical hashes; частичная
отправка сохраняет предыдущий локальный snapshot и повторяется из pending queue.
Старый cloud layout без manifest по-прежнему читается как legacy.

Изменения общей базы идут через разные server contracts: PIN-клиент создаёт
pending product/change request, curator может использовать защищённую direct
publish ветку; barcode имеет append-only RPC. Удалённый ранее массовый sync
shared products не должен возвращаться как произвольный client UPSERT.

## Удаление и восстановление

Удаление должно сначала оставить tombstone, затем уменьшить overlay. Shrink
guards в facade и OverlayStore специально блокируют тихое исчезновение строк.
Day item хранит stamp продукта; если каталог не может его разрешить, orphan
recovery восстанавливает только допустимые personal customs и не должен
загрязнять другой client context.

Cloud-canonical overlay не пополняется автоматически из большого legacy snapshot
после bootstrap: исторический top-up мог затереть более полный cloud массив.
Ручные diagnostics/relink существуют для расследования, а не для обычного boot
flow.

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
  allowlist подтверждён, но актуальные production function bodies/live grants
  здесь не проверялись.
- Production flag override из localStorage может выключить overlay и вернуть
  legacy reader; source default `true` не доказывает состояние конкретного
  браузера.

## Facts Table

| ID  | Утверждение                                                                              | Проверка                                                                                                                                                                                                                                                                                                                                                                                       | Статус                                                                                     |
| --- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| P1  | Overlay default включён, legacy dual-write сохранён                                      | `sed -n '35,70p' apps/web/heys_feature_flags_v1.js`                                                                                                                                                                                                                                                                                                                                            | проверено 2026-07-17                                                                       |
| P2  | Merged view соединяет Type A с shared и оставляет Type B full row                        | `sed -n '415,505p' apps/web/heys_products_overlay_v1.js`                                                                                                                                                                                                                                                                                                                                       | проверено 2026-07-17                                                                       |
| P3  | Missing individual shared base возвращает disabled placeholder, не raw selectable Type A | `rg -n 'hasMealNutrientSource                                               \| \_nutrientsPending                                                             \| \_selectionDisabled' apps/web/heys_products_overlay_v1.js apps/web/heys_add_product_step_v1.js`                                                                                                                               | проверено 2026-07-18                                                                       |
| P4  | Cloud snapshot dedup/tombstone/pending merge пишет без reverse sync                      | `sed -n '180,350p' apps/web/heys_products_overlay_v1.js`                                                                                                                                                                                                                                                                                                                                       | проверено 2026-07-17                                                                       |
| P5  | Public facade использует merged view с legacy fallback                                   | `sed -n '5528,5585p' apps/web/heys_core_v12.js`                                                                                                                                                                                                                                                                                                                                                | проверено 2026-07-17                                                                       |
| P6  | Persistent meal product проходит nutrient resolver и overlay/cloud commit gate           | `rg -n 'resolveMealProduct                                                  \| ensurePersonalProductCommitted                                                 \| ensureMealProductReady' apps/web/heys_products_overlay_v1.js apps/web/heys_core_v12.js && pnpm vitest run apps/web/**tests**/overlay-cloud-snapshot-suppress.test.js apps/web/**tests**/product-commit-gate-contract.test.js` | проверено 2026-07-18                                                                       |
| P7  | RPC allowlist разделяет pending, curator publish и barcode contracts                     | `sed -n '845,870p' yandex-cloud-functions/heys-api-rpc/index.js`                                                                                                                                                                                                                                                                                                                               | проверено 2026-07-17                                                                       |
| P8  | AddProductStep вызывает web SmartSearch и имеет normalized fallback                      | `sed -n '4330,4385p' apps/web/heys_add_product_step_v1.js`                                                                                                                                                                                                                                                                                                                                     | проверено 2026-07-17                                                                       |
| P9  | Web search экспортируется из `heys_smart_search_v2.js`                                   | `tail -n 45 apps/web/heys_smart_search_v2.js`                                                                                                                                                                                                                                                                                                                                                  | проверено 2026-07-17                                                                       |
| P10 | `@heys/search` не импортируется активным web product flow                                | `rg -n '@heys/search                                                        \| SmartSearchEngine' apps/web --glob '!**/node_modules/**' --glob '!**/dist/**'`                                                                                                                                                                                                                                  | проверено 2026-07-17: только dependency/config/dynamic registry, не AddProductStep runtime |
| P11 | Production overlay tests выполняют source через VM                                       | `sed -n '1,80p' apps/web/__tests__/overlay-cloud-snapshot-suppress.test.js`                                                                                                                                                                                                                                                                                                                    | проверено 2026-07-17                                                                       |
| P12 | Legacy protection test повторяет локальную симуляцию                                     | `sed -n '1,110p' apps/web/__tests__/products-protection.test.js`                                                                                                                                                                                                                                                                                                                               | проверено 2026-07-17                                                                       |
| P13 | Overlay выше RPC budget дробится и принимается только по целому manifest generation      | `pnpm exec vitest run apps/web/__tests__/overlay-shard-codec.test.js apps/web/__tests__/product-commit-gate-contract.test.js apps/web/__tests__/hot-sync-curator-path.test.js --no-coverage`                                                                                                                                                                                                   | проверено 2026-07-18: 26 тестов                                                            |
