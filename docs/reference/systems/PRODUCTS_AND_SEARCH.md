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
  `scripts/db/migrations/2026-08-02_*`. Валидации на вход, которая ловила бы
  такие значения при публикации, нет.
- Сахарные спирты (мальтит и подобные) в протеиновых батончиках записываются в
  `fiber100`, из-за чего выпадают из расчёта и калорийность занижается примерно
  вдвое. Отдельного поля для полиолов в модели нет — та же природа пробела, что
  и у алкоголя.

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
