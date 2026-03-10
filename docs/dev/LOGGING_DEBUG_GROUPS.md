# HEYS logging groups and debug presets

Краткая памятка для агентов и разработчиков: какие группы логов уже есть в
legacy runtime, что включено по умолчанию, и когда нужен новый пресет вместо
нового кода.

## TL;DR

- По умолчанию включены только группы `startup` и `sync`.
- Шумные boot/sync детали вынесены в `startup-detail` и `sync-detail`.
- Insights / EWS / MealRec логи сидят в отдельной группе `insights`.
- Управление доступно через `DEV.logs` и `window.__heysLogControl`.
- Это именно runtime-фильтрация логов по префиксам/эвристикам, а не отдельная
  система логирования на сервере.
- Если нужный сценарий уже покрывается комбинацией существующих групп, новый
  пресет не нужен — достаточно включить нужные группы.
- Если после изменения legacy runtime логика не видна на `localhost`, нужно
  пересобрать public bundles.

## Где это живёт

- Ранний роутер и фильтрация логов: `apps/web/index.html`
- Удобный dev facade: `apps/web/heys_dev_utils.js`
- Runtime использует public bundles из `apps/web/public/*.bundle.*.js`

## Runtime API

Предпочтительно использовать:

- `DEV.logs.groups()` — вернуть все известные группы
- `DEV.logs.enabled()` — вернуть текущие включённые группы
- `DEV.logs.enable('api')`
- `DEV.logs.disable('api')`
- `DEV.logs.only('startup', 'sync', 'api')`
- `DEV.logs.reset()` — вернуть дефолт (`startup`, `sync`)
- `DEV.logs.all()` — включить всё

Низкоуровневый эквивалент:

- `window.__heysLogControl.*`
- `window.HEYS.logSettings.*`

## Группы логов

Ниже — текущие известные группы. Это не абстракция “на будущее”, а реально
существующая runtime-конфигурация.

| Group            | Что покрывает                                    | Типичные префиксы                                                                                                                                                                                                                                 |
| ---------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `startup`        | Запуск приложения, bootstrap, critical init      | `[HEYS.startup]`, `[HEYS.entry]`, `[HEYS.loginGate]`, `[HEYS.css]`, `[APP]`, `[DEPS]`, `[CRITICAL]`, `[WATCHDOG]`, `[RECOVERY]`, `[LoginGate]`                                                                                                    |
| `startup-detail` | Подробные boot-шаги и ранний HTML/login-gate шум | `HTML parsing started`, `Body parsing started`, `Theme applied`, `Session detected`, `auth token`, `dependency loader start`, `Returning user — gate hidden`                                                                                      |
| `sync`           | Ключевая клиентская синхронизация                | `[HEYS.sync]`, `[HEYS.sinhron]`, `[SYNC ERROR]`                                                                                                                                                                                                   |
| `sync-detail`    | Delta/prefetch/internal sync debug               | `restoreSession`, `DELTA`, `PREFETCH`, `SYNC DEBUG`, `setProducts callback`, `React state updated`, `DAYV2 BACKUP`, `YANDEX SAVE`                                                                                                                 |
| `cloud`          | Cloud/storage sync детали                        | `[HEYS.cloud]`, `[HEYS.cloud:ERR]`                                                                                                                                                                                                                |
| `api`            | RPC/REST/API вызовы                              | `[HEYS.api]`                                                                                                                                                                                                                                      |
| `insights`       | Insights / EWS / MealRec / threshold diagnostics | `[MEALREC]`, `[HEYS.insights]`, `[HEYS.InsightsPI]`, `[HEYS.thresholds.compute]`, `ews / ...`, `priority / ...`                                                                                                                                   |
| `photos`         | Фото, загрузки, storage media                    | `[HEYS.photos]`                                                                                                                                                                                                                                   |
| `sw`             | Service worker/PWA                               | `[SW]`                                                                                                                                                                                                                                            |
| `day`            | День, календарь, refresh сценарии                | `[HEYS.day]`, `[HEYS.calendar]`, `[PullRefresh]`                                                                                                                                                                                                  |
| `products`       | Продукты, поиск, порции, пресеты                 | `[HEYS.portions]`, `[HEYS.addProduct]`, `[HEYS.presets]`, `[HEYS.prodRec]`, `[HEYS.search]`, `[SharedSearch]`, `[AddProductStep]`, `[CreateProductStep]`, `[HarmSelectStep]`, `[ProductSearchStep]`, `[GramsStep]`, `[openProductPortionsEditor]` |
| `platform`       | Device/platform/browser APIs                     | `[PlatformAPIs]`, `[Storage]`, `[Device]`, `[Idle]`, `[WCO]`, `[Barcode]`, `[Share]`, `[Contacts]`, `[Speech]`, `[Launch]`, `[Protocol]`, `[FileSystem]`, `[Credentials]`, `[Orientation]`, `[Fullscreen]`, `[Vibration]`                         |
| `perf`           | Производительность и замеры                      | `[PERF]`                                                                                                                                                                                                                                          |
| `ui`             | UI-level сценарии и local UX flows               | `[Refeed]`, `[CONSENTS]`, `[Widgets Registry]`, `[App]`                                                                                                                                                                                           |

## Что видно по умолчанию

Дефолтный набор:

- `startup`
- `sync`

Идея простая: при обычной отладке должно быть видно, что приложение поднялось,
основные зависимости подхватились, и базовая синхронизация не молчит как
партизан — **без** delta/prefetch/MealRec/EWS простыней.

`console.error(...)` не скрывается фильтром и остаётся видимым всегда.

## Готовые пресеты

Важно: **сейчас в runtime нет отдельного реестра named presets**. Есть
документированные рецепты, которые агент должен сначала переиспользовать, а не
изобретать новую группу.

### 1. Default startup check

Уже активен по умолчанию:

- `startup`
- `sync`

Использовать для: “приложение вообще стартует?”, “подхватился ли boot?”, “жив ли
базовый sync?”.

### 2. API investigation

Включить:

- `startup`
- `sync`
- `api`
- при необходимости `cloud`

Пример:

- `DEV.logs.only('startup', 'sync', 'api')`

Использовать для: RPC/REST регрессий, проверки `HEYS.YandexAPI.rpc()` /
`.rest()` цепочки.

### 3. Deep sync investigation

Включить:

- `startup`
- `sync`
- `sync-detail`
- `cloud`
- при необходимости `api`

Пример:

- `DEV.logs.only('startup', 'sync', 'sync-detail', 'cloud')`

Использовать для: конфликтов sync, cloud persistence, подозрений на broken
pull/push цепочку.

### 4. Product flow debugging

Включить:

- `startup`
- `sync`
- `products`
- при необходимости `day`
- при необходимости `insights`

Пример:

- `DEV.logs.only('startup', 'sync', 'products', 'day')`

Использовать для: поиск продуктов, пресеты, порции, добавление продукта в день.

### 5. Photo/media debugging

Включить:

- `startup`
- `sync`
- `photos`
- при необходимости `cloud`

Пример:

- `DEV.logs.only('startup', 'sync', 'photos', 'cloud')`

### 6. PWA / device / browser integration

Включить:

- `startup`
- `platform`
- `sw`
- при необходимости `ui`

Пример:

- `DEV.logs.only('startup', 'platform', 'sw')`

### 7. Insights / EWS / MealRec debugging

Включить:

- `startup`
- `insights`
- при необходимости `products`
- при необходимости `sync-detail`

Пример:

- `DEV.logs.only('startup', 'insights')`

## Когда НЕ нужно делать новый пресет

Новый пресет не нужен, если задача решается комбинацией существующих групп,
например:

- API + sync issue → `startup + sync + api`
- deep sync internals → `startup + sync + sync-detail + cloud`
- photo upload + storage → `startup + sync + photos + cloud`
- PWA wake/reload issue → `startup + sw + platform`
- MealRec / EWS noise investigation → `startup + insights`

Сначала проверь `DEV.logs.groups()` и используй `DEV.logs.only(...)`.

## Когда нужен новый group/preset

Добавляй новый group/preset только если одновременно верно следующее:

1. Логи не покрываются текущими prefix-группами.
2. Сценарий регулярно повторяется, а не одноразовый.
3. Без новой группы приходится включать почти `all()`, и это снова делает
   консоль шумной.
4. У нового блока логов есть устойчивый префикс или чёткая эвристика
   маршрутизации.

Хорошие кандидаты:

- новый крупный runtime subsystem со стабильным namespace логов;
- отдельный диагностический сценарий, который часто нужен в support/debug цикле.

Плохие кандидаты:

- одноразовый баг;
- 2–3 лога в уже существующем subsystem;
- “давайте сделаем группу на всякий случай”.

## Практика для агентов

Если пользователь просит “включить побольше логов”, не включай сразу `all()` без
причины.

Предпочтительный порядок:

1. Оставить `startup + sync`
2. Добавить 1–2 релевантные группы
3. Проверить, хватает ли сигнала
4. Только потом временно идти в `DEV.logs.all()`

Если в задаче менялись legacy runtime файлы в `apps/web/**`, влияющие на runtime
bundle, после правок пересобирай public bundles, иначе `localhost` может
показывать старое поведение.

Предпочтительно:

- selective rebuild:
  `pnpm bundle:legacy:auto --files=<workspace-relative-paths>`

Если менялась bundling config:

- `pnpm --filter @heys/web run predev && pnpm bundle:legacy`

## Быстрая памятка

- Базовая проверка: `DEV.logs.reset()`
- Посмотреть группы: `DEV.logs.groups()`
- Только API: `DEV.logs.only('startup', 'sync', 'api')`
- Только sync deep dive:
  `DEV.logs.only('startup', 'sync', 'sync-detail', 'cloud')`
- Только insights/EWS/MealRec: `DEV.logs.only('startup', 'insights')`
- Всё подряд: `DEV.logs.all()`
