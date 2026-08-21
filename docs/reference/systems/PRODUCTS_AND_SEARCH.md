# Продукты, overlay и поиск

> **Статус:** core source-контракты проверены 2026-07-18, CHECK-violation UX
> публикации — 2026-08-13, рецепт product.recipe и MCP-работа с составом —
> 2026-08-18 **Охват:** shared catalog, client overlay, merge/sync, commit gate,
> moderation entrypoints, поиск и Type B recipe **Не подтверждено:** production
> catalog contents/count, runtime feature flags, database function bodies после
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
    различается — на кавычках в названии слои расходятся в разные стороны.

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
19. Рецепт (`product.recipe`) живёт только на Type B. Save молча поднимает `rev`
    и `updatedAt` и пересчитывает КБЖУ карточки; прошлые дни не трогает.
    Исправление прошлого — `heys_reapply_recipe`: превью читает дни пакетом,
    запись только `mergeSaveKV` по одному дню. Ингредиенты при ретро — текущие
    карточки. Позиция дня хранит снимок `recipe_items` / `recipe_yield` /
    `recipe_rev`. След — `recipe_backfill_log[]` на дне: `ensureDay` и
    `mergeDayData` его сохраняют. В shared export рецепт не уходит: и веб
    (`heys_cloud_shared_v1.js`, whitelist полей), и MCP-коннектор публикуют
    карточку без `recipe`, а блюдо с составом MCP не публикует автоматически
    вовсе — бренд у авторского блюда не делает его промышленным (правка
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
    хранит снимок КБЖУ на 100 г, и при промахе по id и по имени приём пишется из
    этого снимка (как в приложении), с явным предупреждением в ответе. Отказ
    `preset_item_missing` остался только для позиции без нутриентов — там
    восстанавливать нечего. Ингредиент резолвится по слоям: личная карточка
    клиента (точное совпадение имени выигрывает), затем общая база; настоящая
    неоднозначность отдаётся кандидатами (`recipe_item_ambiguous`), а не
    молчаливым "не найден". `heys_get_recipe` показывает слой каждого
    ингредиента (`card_source`).

20. ГИ и вред рецепта считаются по массе ингредиентов, `kcal100` — Atwater
    `3×Б + 4×У + 9×Ж` после агрегации. `fiber100` отдельно от `complex100`.

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
