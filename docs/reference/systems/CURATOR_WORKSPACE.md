# Рабочее пространство куратора

> **Статус:** core source-пути проверены 2026-07-17 **Охват:** вход куратора,
> список и выбор клиента, переключение client context, редактирование клиента,
> очередь trial, moderation и связанные data boundaries **Не подтверждено:**
> production permissions/ownership, browser UX всех вкладок и live API state

## Какой Curator Panel является реальным

В repository существуют две реализации с похожим названием:

- активный legacy web flow в `heys_app_gate_flow_v1.js`, `heys_app_hooks_v1.js`
  и `heys_app_shell_v1.js`;
- TypeScript `src/components/CuratorPanel`, который использует mock API,
  placeholder tabs и skipped tests.

Для текущего приложения каноничен первый. README TypeScript-компонента —
описание прототипа/рефакторинга, не runtime-спецификация продукта.

## Основной поток

```text
curator login / cookie session
        ↓
YandexAPI.getClients → cloud list или cached heys_clients
        ↓
gate: clients | trial queue | product moderation
        ↓ select client
HEYS.cloud.switchClient(target, previous)
        ↓ только после загрузки нового scope
heys_client_current + HEYS.currentClientId + heys:client-changed
        ↓
обычный app shell в curator context: diary, reports, messenger, sync
```

Выбор клиента — смена security/data context, а не только UI selection. Gate
сначала ставит switching state и вызывает cloud switch; глобальный current id
обновляется после завершения загрузки. Это защищает от чтения/записи ключей под
новым id до фактической смены namespace.

Logout также завершает data context полностью: storage/runtime очищаются, React
получает `heys:client-changed` с пустым `clientId` и перемонтируется до
следующего входа. Факт ранее активного клиента сохраняется в page-lifetime
reload guard, включая восстановленные PIN-сессии, которые не проходили через
`switchClient` при старте.

## Владельцы ответственности

| Область                                          | Точка                                              |
| ------------------------------------------------ | -------------------------------------------------- |
| HTML login gate и восстановление curator session | `index.html`, `heys_auth_v1.js`                    |
| React state клиентов и CRUD                      | `heys_app_hooks_v1.js` → `useCloudClients`         |
| Экран выбора, queue, moderation                  | `heys_app_gate_flow_v1.js`                         |
| App header/dropdown после выбора                 | `heys_app_shell_v1.js`                             |
| Переключение storage namespace                   | `heys_storage_supabase_v1.js` → cloud switch flow  |
| Curator/session RPC facade                       | `heys_yandex_api_v1.js`                            |
| Server authorization и allowlists                | `yandex-cloud-functions/heys-api-rpc/index.js`     |
| Trial queue                                      | `heys_trial_queue_v1.js`                           |
| Product moderation                               | `heys_product_moderation_v1.js`                    |
| Messenger                                        | `heys_messenger_api_v1.js`, `heys_messenger_v1.js` |
| Диагностика запусков клиента                     | `heys_client_diagnostics_v1.js`                    |
| Prototype, не active owner                       | `src/components/CuratorPanel/*`                    |

## Список и CRUD клиентов

`useCloudClients` получает список через YandexAPI и защищается от параллельной
загрузки. При ошибке используется cached `heys_clients`; UI хранит источник
`cloud/local/error`, поэтому offline список не должен восприниматься как свежий.
Событие `heys:clients-updated` повторно загружает список после
queue/subscription операций.

Создание с phone+PIN предпочитает curator auth RPC. Есть fallback create path, а
при отсутствии cloud user код способен создать local-only client. Rename, phone
и PIN используют разные API paths; PIN reset не является частью обычного profile
update.

Удаление сначала оптимистично меняет local list, затем вызывает server delete.
При ошибке local snapshot восстанавливается. Если удаляется выбранный клиент,
current/last ids очищаются; undo поддерживается только при наличии общего Undo
API и выбранной опции.

## Queue, moderation и работа внутри клиента

До выбора клиента куратор видит список, trial queue и product moderation. Queue
и subscription actions отправляют `heys:clients-updated`, чтобы список и статусы
обновлялись без reload. Product moderation использует curator-only publish
contracts, отделённые от client pending requests.

После выбора куратора переводят в общий app shell. Дневник и остальные client
данные используют тот же client-scoped storage слой, но server должен проверять
ownership куратора. Для записи storage способен запросить write-context
capability через `issue_write_context_by_curator`.

Messenger также различает роль: curator передаёт explicit client id, client —
нет. Shell лишь отображает inbox cache; polling/backoff принадлежат
MessengerAPI.

Отправка сообщения использует стабильный `request_id` одной пользовательской
операции. HTTP retry повторяет тот же ключ, а DB-функция возвращает исходное
сообщение при совпадающем canonical payload либо `idempotency_conflict` при
повторном использовании ключа с другим payload. Статусы `done/acked` задаются
как желаемое boolean-состояние, поэтому повтор запроса не переключает их назад.

Thread загружается страницами через `before`; UI объединяет страницы по
`message.id`, сохраняет scroll при prepend и не даёт ответу старого client
context обновить новый диалог. Свежий silent poll в открытом окне также вызывает
`mark-read`, не меняя отдельную семантику action-badge по `done_at/acked_at`.
Фото при разовом сетевом/декодирующем сбое автоматически повторно загружается с
cache-busting и через альтернативную форму URL того же Yandex Object Storage;
после исчерпания прямых кандидатов UI запрашивает бинарную копию через
аутентифицированный `/photos/read`. Backend принимает только canonical messenger
path, проверяет client/curator ownership и существующую ссылку сообщения. Если
не сработал и этот fallback, UI оставляет действие «Повторить» и пишет
privacy-safe событие с состоянием сети, типом кандидата, числом попыток и
поверхностью mobile/PWA — без URL, path, client id, имени файла и текста.
Транспортные коды ошибок остаются внутренними: messenger преобразует их в
понятное пользовательское сообщение на границе UI. Если ответ на desired-state
операцию `done/acked` потерян, UI контрольным чтением сверяет отметку с сервером
и не показывает ошибку для уже применённого изменения.

На реальном iPhone/iPad web-composer подтверждает открытие экранной клавиатуры
не одним вызовом `focus()`, а сочетанием фактического фокуса и изменения
`visualViewport`. Desktop DevTools с профилем iPhone исключён из диагностики,
потому что он не создаёт экранную клавиатуру iOS. Если подтверждения нет, рядом
с полем появляется наблюдаемая причина, код для поддержки, действие «Повторить»
и совет отправить куратору скриншот. Диагностическое событие содержит только
allowlisted этап попытки и не включает текст сообщения, client id или user
agent.

Если до первого касания поле было неактивно, click-фаза того же жеста выполняет
синхронный `blur → focus` и восстанавливает позицию курсора. Это тот же
recovery, который доступен через «Повторить», но он не запускается для
последующих тапов по уже активному полю. На iOS страница остаётся без
`position: fixed`, а non-passive touch guard разрешает прокрутку внутри thread и
останавливает жест на его границах, чтобы контент вкладки под модальным окном не
двигался. При закрытии messenger исходный `scrollY` восстанавливается сразу, на
следующем кадре и после завершения анимации клавиатуры; повторное открытие
отменяет отложенное восстановление.

Каждая операция `done/acked` блокируется отдельно по `message.id`: повторный
клик по тому же сообщению не создаёт конкурирующий запрос, а отметка другого
сообщения остаётся независимой. Кнопка действия отражает собственное состояние
текущей роли (`acked_at` для клиента или `done_at` для куратора), тогда как
пузырь сообщения может одновременно показывать обе отметки участников.

## Диагностика посещений и синхронизации

Четвёртая вкладка curator gate показывает все клиентские посещения без
переключения client context. Первый слой содержит сводные метрики, server-side
фильтры и список посещений; главное действие «Показать сбои». Холодный запуск,
явный повторный PIN-вход/открытие клиента и каждый возврат PWA из фона получают
отдельный `visit_id`, сохраняя общий неизменяемый `boot_id` загрузки страницы.
Первичная anonymous→client активация остаётся частью cold start, чтобы не
создавать две карточки одного запуска. Раскрытие строки показывает русскоязычный
timeline входа, загрузки, модалок, sync и агрегированных пакетов сохранения.
Автообновление выполняется раз в 60 секунд только пока вкладка открыта; длинные
выборки продолжаются cursor pagination.

Среда телеметрии определяется серверным контуром: local dev-proxy маркирует
server-to-server запрос, ingest сохраняет эту метку вне browser payload, а
production и автотесты получают свои runtime-значения. Сводка и мегалог по
умолчанию считают только production. Фильтр «Включая локальные тесты» явно
добавляет QA-посещения, не удаляя их и не маскируя найденные в них сбои.

В карточке клиента остаётся точечная диагностика. Оба представления показывают
тип посещения, исход, время, устройство, PWA/browser, build и длительность;
проблемные и незавершённые посещения выделены. Успешный PIN-вход без последующей
клиентской телеметрии также остаётся видимым: до 90 секунд как запускающийся,
затем как незавершённый запуск.

Точечное представление читает `get_client_observability_by_curator`, общее —
`get_curator_observability_overview`. Оба RPC curator-only: gateway подставляет
`p_curator_id` из проверенного JWT, SQL повторно проверяет `clients.curator_id`.
Gateway возвращает scalar JSON-функции в объекте с именем RPC; оба UI-пути
разворачивают эту обёртку перед чтением `summary`, `sessions` и `logins`.
Точечный доступ пишет audit middleware, агрегатный — сама SQL-функция один раз
на запрос. RPC не возвращают raw console, phone, IP, cookie/token или значения
здоровья; отчёт копирует только те же безопасные поля.

Проблемная сессия имеет действие «Скопировать полный лог»: отчёт включает
идентификаторы запуска/build/device, итог, длительность, счётчики и полный
timeline структурированных событий с allowlisted context. Для cloud write в нём
доступны безопасные `key_family`, непрозрачный `key_id` и нормализованный
`error_code`, поэтому повтор одного проблемного ключа отличим без раскрытия
самого ключа. Дневник, сообщения, телефон, IP, токены и raw console в отчёт не
попадают. После `boot_ready` неструктурированная ошибка зависимости помечает
запуск как `degraded`, а не `failed`; фатальный статус требует именованного
lifecycle-события сбоя. Именованные warning-события также заполняют
`problem_event`, кроме обычного закрытия hunger prompt и краткого ожидания
резервного sync batch: сами по себе они не ухудшают готовое посещение.
Безымянный raw console `warn` остаётся в ring-buffer, но не ухудшает итог; raw
`error` по-прежнему считается отклонением, а безопасный отчёт показывает число
скрытых raw-ошибок без их текста. Промежуточная неудачная попытка API retry
остаётся warning; только исчерпание всех попыток считается raw error. Таймаут
облачной записи недельного EWS-снимка пишется как нефатальный `write_failed` с
`key_group=ews_weekly`; локальный derived-снимок при этом уже сохранён. Первый
фактически видимый кадр отделён от `app_shell_ready` и `boot_ready`: Day tab и
автоматически открытые hunger/check-in модалки подтверждают видимый кадр,
таймаут и результат ручного восстановления — именованные `blank_screen_*`
события только с allowlisted phase/reason/screen/attempt/online context.

Stale resume-посещение, состоящее только из `visit_started` и `app_foregrounded`
с `auth_state=pending`, после 90 секунд исключается из метрик: это фоновое
пробуждение до появления client context, а не брошенный вход. Фильтр узкий —
любое другое именованное событие, warning или error сохраняет посещение в
диагностике.

Над фильтрами общей диагностики находится независимое действие дневного
мегалога. Оно всегда запрашивает все `failed/degraded/abandoned` посещения от
локальной полуночи куратора, проходит cursor pagination до конца с page size 100
и отказывается копировать частичный результат при сломанном cursor. Отчёт
сначала показывает статусы, этапы, события и почасовую динамику, затем без
клиентского сокращения добавляет полный безопасный timeline каждого проблемного
посещения в хронологическом порядке. Из экранных фильтров на состав мегалога
влияет только явное включение local/test; клиент, build, устройство и этап не
сужают дневной отчёт.

Curator inbox и предшествующий `resolveIdentity` используют health-check
соединения перед запросом и один retry на новом PostgreSQL client при протухшем
pooled socket. Identity lookup находится внутри общего handler catch; после
исчерпания retry backend возвращает privacy-safe `500` с exact-origin
credentialed CORS, а не platform `502` без browser-readable ответа.

Фоновые запросы истории геймификации выбирают curator RPC до client-session RPC,
если присутствует любой подтверждённый curator context. Curator HttpOnly cookie
не считается PIN-cookie и не вызывает ожидаемо запрещённые `*_by_session`
запросы.

## Инварианты

1. До выбора реального клиента нельзя читать/мигрировать client product/data.
2. `heys_client_current` меняется только вместе с полноценной сменой namespace.
3. Client switch сначала загружает target scope, затем публикует новый current
   id.
4. Cached clients list явно маркируется как cache/local, а не cloud truth.
5. Curator RPC проверяет session и ownership target client на server side.
6. PIN никогда не хранится/передаётся как обычное поле profile update.
7. Удаление выбранного клиента очищает current/last client ids.
8. Событие `heys:client-changed` отправляется после фиксации глобального
   context.
9. TypeScript prototype не используется как источник runtime-контрактов.
10. Retry одного send возвращает один `message_id` и не создаёт повторный push.
11. Вложения сообщения принимаются только из canonical messenger namespace
    выбранного клиента; произвольные HTTPS URL не являются доверенными.
12. Push сообщает только о новом сообщении и не содержит текст переписки.
13. Messenger не показывает пользователю транспортные и HTTP-коды ошибок.
14. Неоднозначный ответ `done/acked` сверяется с server truth до отката UI.
15. Для одного `message.id` одновременно выполняется не более одной мутации
    `done/acked`; сообщения с другими id не блокируются.
16. Диагностика клиента доступна только его куратору и не раскрывает raw console
    или содержимое health/user data.
17. `failed` означает именованный lifecycle-сбой; ошибка зависимости после
    `boot_ready` остаётся видимым отклонением, но не фатальным запуском.
18. Известные EWS/sync warning имеют именованное событие и безопасный контекст;
    штатный resume check-in остаётся информационным событием `plan_resumed`.
19. `first_visible_frame` подтверждается после paint и дедуплицируется на boot;
    blank-screen recovery не запускает автоматический reload.
20. Явный повторный вход/открытие клиента создаёт `client_entry` visit; обычный
    повтор `heys:client-changed` без маркера входа не дробит посещение.
21. Local/test телеметрия сохраняется, но не входит в production-сводку без
    явного фильтра; окружение назначается сервером, а не browser payload.
22. Диагностика iOS-клавиатуры описывает только наблюдаемый этап сбоя и не
    передаёт текст сообщения, client id или user agent.
23. Открытый messenger не передаёт touch-scroll вкладке под ним; на iOS thread
    остаётся прокручиваемым без фиксации body, а закрытие возвращает исходный
    `scrollY` после анимации клавиатуры.
24. API-fallback фото читает только image-path, уже привязанный к сообщению
    выбранного клиента, после независимой server-side проверки
    identity/ownership.

## Подтверждённые слабые места и пробелы

- Старый `CuratorPanel/README.md` уверенно описывает production architecture, но
  хук работает на mock data, три вкладки — placeholders, весь test suite помечен
  `describe.skip`.
- По active imports TypeScript CuratorPanel вне своей demo/директории не найден;
  изменения в нём могут никак не повлиять на пользовательский интерфейс.
- Реальный curator UI распределён по очень крупным legacy-файлам gate/hooks/
  shell, поэтому ownership и границы трудно увидеть без этого досье.
- При ошибке загрузки cached clients могут быть устаревшими; последующая
  destructive операция всё равно должна подтверждаться server ownership/state.
- Есть local-only fallback создания клиента без cloud user. Это полезно для
  offline/dev, но такой объект не равен зарегистрированному server client.
- Client switch содержит retry, но после второго failure отправляет sync-error и
  продолжение flow зависит от окружающего UI; atomic runtime поведение не
  проверялось браузером.
- `get_curator_clients` и write-context есть в curator allowlist, однако live
  grants/function bodies production в этой ревизии не проверены.
- Значительная часть curator поведения покрыта узкими guard tests, но active
  full-panel component/E2E test отсутствует; существующий TS test skipped.
- Показ экранной клавиатуры зависит от реального iOS/WebKit runtime; source-
  контракты и классификация покрыты тестами, но device smoke остаётся отдельной
  проверкой.
- Бейджи активности на карточке клиента (`🔥 стрик`, `📅 последний визит`)
  считаются `getClientStats` перебором localStorage за 30 дней, а не серверным
  запросом. Для клиента, в которого куратор не заходил на этом устройстве,
  значения пустые или устаревшие. Сводка дня рядом с ними уже серверная (см.
  ниже), но сами эти два бейджа на localStorage пока остались.

## Сводка дня на экране выбора клиента

`get_curator_clients_day_summary(p_curator_id, p_date)` отдаёт строку на каждого
клиента куратора: приёмы с калорийностью, вода, шаги, тренировки с минутами, вес
утром, сон и `day_updated_at`. Тренировкой считается только слот с ненулевой
зоной: в дне всегда лежат три заготовки `{"z":[0,0,0,0]}`, поэтому счёт по длине
массива даёт ложные «3 тренировки» (правило совпадает с
`heys_cloud_merge_v1.js`). Функция read-only, `SECURITY DEFINER`, ownership
проверяет сама по `clients.curator_id`; клиент без записи за дату возвращается с
`has_day = false`, потому что «ничего не внёс» — значимый ответ, а не пропуск.
Калорийность считается из `kcal100`/`grams` внутри самой позиции, поэтому сводка
не зависит от каталога продуктов.

Путь: `heys_app_gate_state_v1.js` грузит сводку только в кураторском контексте
(`cloudUser`) и только на экране выбора клиента, обновляя раз в 5 минут — из
PIN-сессии этот RPC отвечает 401 → `heys_app_gate_flow_v1.js` рисует строку на
карточке, где незаполненное показано красным. Сводка необязательна: при ошибке
карточка рендерится без неё.

В `CURATOR_ONLY_FUNCTIONS` функция есть, в `CURATOR_AUDIT_SKIP` — тоже,
осознанно: это агрегат по всем клиентам сразу, единого target `client_id` у него
нет, а детальный доступ логируется при входе в конкретного клиента.

Тот же RPC читает личная доска задач владельца (`~/tasks`, блок «HEYS куратор»)
— она ходит в `/rpc` под curator JWT и ничего не сохраняет у себя. Временный
локальный инструмент `scripts/curator-board`, живший здесь до появления
серверной сводки, удалён 2026-08-02, чтобы не держать третью копию расчёта.

## Facts Table

| ID  | Утверждение                                                                                        | Проверка                                                                                                                                                                                                                                                                                                             | Статус                        |
| --- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| C1  | TypeScript CuratorPanel использует mock API и placeholder tabs                                     | `sed -n '1,90p' apps/web/src/components/CuratorPanel/CuratorPanelContainer.tsx && sed -n '1,230p' apps/web/src/components/CuratorPanel/hooks/useCuratorData.ts`                                                                                                                                                      | проверено 2026-07-17          |
| C2  | Его component tests целиком skipped                                                                | `sed -n '65,85p' apps/web/src/components/CuratorPanel/__tests__/CuratorPanel.test.tsx`                                                                                                                                                                                                                               | проверено 2026-07-17          |
| C3  | Active state/CRUD принадлежат `useCloudClients` в legacy hooks                                     | `sed -n '1995,2415p' apps/web/heys_app_hooks_v1.js`                                                                                                                                                                                                                                                                  | проверено 2026-07-17          |
| C4  | List fetch имеет in-flight guard и local cache fallback                                            | `sed -n '2055,2195p' apps/web/heys_app_hooks_v1.js`                                                                                                                                                                                                                                                                  | проверено 2026-07-17          |
| C5  | Gate содержит clients, queue, moderation и diagnostics tabs                                        | `rg -n "setCuratorTab\('(clients\|queue\|moderation\|diagnostics)'" apps/web/heys_app_gate_flow_v1.js`                                                                                                                                                                                                               | проверено 2026-07-24          |
| C6  | Gate switch обновляет current id после `cloud.switchClient`                                        | `sed -n '2325,2385p' apps/web/heys_app_gate_flow_v1.js`                                                                                                                                                                                                                                                              | проверено 2026-07-17          |
| C7  | Client CRUD разделяет profile update и PIN reset                                                   | `sed -n '2195,2335p' apps/web/heys_app_hooks_v1.js`                                                                                                                                                                                                                                                                  | проверено 2026-07-17          |
| C8  | Curator RPC allowlist содержит clients/create/write-context contracts                              | `sed -n '930,1008p' yandex-cloud-functions/heys-api-rpc/index.js`                                                                                                                                                                                                                                                    | проверено 2026-07-17          |
| C9  | Storage запрашивает curator write-context capability                                               | `sed -n '11740,11785p' apps/web/heys_storage_supabase_v1.js`                                                                                                                                                                                                                                                         | проверено 2026-07-17          |
| C10 | Prototype не импортируется вне своей директории/demo в `apps/web/src`                              | `rg -n 'CuratorPanel' apps/web/src --glob '*.{ts,tsx}'`                                                                                                                                                                                                                                                              | проверено 2026-07-17          |
| C11 | Есть guard tests для login/switch/access, но prototype test skipped                                | `rg --files apps/web/**tests**                                                                                                                                  \| rg '(curator         \| client-switch \| client-access)'`                                                                                         | проверено 2026-07-17          |
| C12 | Messenger send retry-safe по request ID и canonical fingerprint                                    | `apps/web/heys_messenger_api_v1.js`, `yandex-cloud-functions/heys-api-messages/index.js`, `scripts/db/migrations/2026-07-21_messenger_reliability_privacy.sql`                                                                                                                                                       | проверено 2026-07-21          |
| C13 | История использует cursor pagination и merge по ID                                                 | `apps/web/heys_messenger_v1.js`, `apps/web/__tests__/messenger-reliability-contract.test.js`                                                                                                                                                                                                                         | проверено 2026-07-21          |
| C14 | Messenger преобразует технические ошибки в пользовательский текст                                  | `apps/web/heys_messenger_v1.js`, `apps/web/__tests__/messenger-reliability-contract.test.js`                                                                                                                                                                                                                         | проверено 2026-07-23          |
| C15 | Потерянный ответ `done/acked` разрешается контрольным чтением server truth                         | `apps/web/heys_messenger_v1.js`, `apps/web/__tests__/messenger-reliability-contract.test.js`                                                                                                                                                                                                                         | проверено 2026-07-23          |
| C16 | Диагностика проверяет ownership и не возвращает raw console/user content                           | `scripts/db/migrations/2026-07-24_client_session_observability.sql`, `apps/web/__tests__/client-session-observability.test.js`                                                                                                                                                                                       | проверено 2026-07-24          |
| C17 | Общая диагностика использует один RPC, server filters и cursor pagination                          | `apps/web/heys_client_diagnostics_v1.js`, `scripts/db/migrations/2026-07-24_client_session_observability.sql`, `apps/web/__tests__/client-session-observability.test.js`                                                                                                                                             | проверено 2026-07-24          |
| C18 | UI разворачивает scalar RPC, а curator cookie не идёт в client-session RPC                         | `apps/web/heys_client_diagnostics_v1.js`, `apps/web/heys_gamification_v1.js`, `apps/web/__tests__/client-session-observability.test.js`                                                                                                                                                                              | проверено 2026-07-24          |
| C19 | Полный лог безопасен, outcome отличает fatal от post-ready error, inbox переподключается           | `apps/web/heys_client_diagnostics_v1.js`, `scripts/db/migrations/2026-07-24_client_session_outcome_classification.sql`, `yandex-cloud-functions/heys-api-messages/index.js`, `apps/web/__tests__/client-session-observability.test.js`                                                                               | проверено 2026-07-24          |
| C20 | Cold start и каждый foreground resume имеют разные `visit_id` при общем `boot_id`                  | `apps/web/heys_client_log_trace_v1.js`, `scripts/db/migrations/2026-07-24_client_visit_observability.sql`, `apps/web/__tests__/client-session-observability.test.js`                                                                                                                                                 | проверено 2026-07-24          |
| C21 | Полный лог различает boot readiness, фактический paint и blank-screen recovery                     | `apps/web/heys_app_initialize_v1.js`, `apps/web/heys_app_tabs_v1.js`, `apps/web/heys_client_diagnostics_v1.js`, `apps/web/__tests__/blank-screen-guard.test.js`                                                                                                                                                      | проверено 2026-07-24          |
| C22 | Дневной мегалог проходит все problem pages и не копирует частичный результат                       | `apps/web/heys_client_diagnostics_v1.js`, `apps/web/__tests__/diagnostics-daily-megalog.test.js`                                                                                                                                                                                                                     | проверено 2026-07-24          |
| C23 | Явный повторный вход/открытие клиента получает отдельный `client_entry` visit                      | `apps/web/heys_client_log_trace_v1.js`, `apps/web/heys_app_gate_flow_v1.js`, `scripts/db/migrations/2026-07-24_client_entry_observability.sql`, `apps/web/__tests__/client-session-observability.test.js`                                                                                                            | проверено 2026-07-24          |
| C24 | Server-derived local/test посещения сохраняются отдельно от production-сводки                      | `packages/core/src/server.js`, `yandex-cloud-functions/heys-api-rest/index.js`, `scripts/db/migrations/2026-07-25_client_observability_runtime_env.sql`, `apps/web/heys_client_diagnostics_v1.js`, `apps/web/__tests__/client-session-observability.test.js`                                                         | проверено 2026-07-25          |
| C25 | Web-composer отличает реальный iOS/WebKit от desktop emulation и показывает безопасную диагностику | `apps/web/heys_messenger_v1.js`, `apps/web/__tests__/messenger-reliability-contract.test.js`                                                                                                                                                                                                                         | проверено 2026-07-25          |
| C26 | Первый iOS-тап применяет recovery, а touch guard изолирует scroll модального thread                | `apps/web/heys_messenger_v1.js`, `apps/web/styles/modules/1000-messenger.css`, `apps/web/__tests__/messenger-reliability-contract.test.js`                                                                                                                                                                           | проверено 2026-07-25          |
| C27 | Фото имеет auth-bound API fallback; итоговая ошибка пишет только allowlisted context без вложения  | `apps/web/heys_messenger_v1.js`, `apps/web/heys_messenger_api_v1.js`, `apps/web/heys_client_log_trace_v1.js`, `yandex-cloud-functions/heys-api-photos/index.js`, `apps/web/__tests__/messenger-reliability-contract.test.js`, `yandex-cloud-functions/heys-api-photos/__tests__/attachment-delete-contract.test.cjs` | проверено 2026-07-26          |
| C28 | Мегалог различает безопасный write-контекст и исключает только чистый pre-auth resume шум          | `apps/web/heys_storage_supabase_v1.js`, `scripts/db/migrations/2026-07-30_client_observability_ignore_preauth_resume.sql`, `apps/web/__tests__/client-observability-signal-quality.test.js`                                                                                                                          | проверено 2026-07-30          |
| C29 | Messages identity lookup использует healthy-client/retry и сохраняет credentialed CORS на 5xx      | `yandex-cloud-functions/heys-api-messages/index.js`, `yandex-cloud-functions/heys-api-messages/__tests__/identity-db-cors.test.cjs`                                                                                                                                                                                  | проверено локально 2026-07-31 |

| C30 | Стрик и «последний визит» на карточке клиента читаются из localStorage,
а не с сервера | `sed -n '60,95p' apps/web/heys_app_client_helpers_v1.js`,
`sed -n '2300,2310p' apps/web/heys_app_gate_flow_v1.js` | проверено 2026-08-02 |
| C31 | Сводка дня куратором читается через REST `client_kv_store` с curator
JWT; ккал считаются из `kcal100`/`grams` внутри самого блоба дня |
`sed -n '355,380p' yandex-cloud-functions/heys-mcp/lib/heys-api.js`, сверено с
SQL-сводкой на тех же днях | проверено на живых данных 2026-08-02 | | C32 |
`get_curator_clients_day_summary` применена в production и считает те же цифры,
что клиентский расчёт |
`bash scripts/db/psql.sh -c "SELECT * FROM get_curator_clients_day_summary((SELECT curator_id FROM clients WHERE name='Полтавский' LIMIT 1), '2026-08-01')"`
— совпало с JS-подсчётом по тем же дням (1935 и 1417 ккал) | проверено на
production 2026-08-02 |

## Связанные источники

- [`CURATOR_VS_CLIENT.md`](../../CURATOR_VS_CLIENT.md) — role/data boundaries.
- [`SYNC_REFERENCE.md`](../../SYNC_REFERENCE.md) — client-scoped persistence.
- [`SECURITY_DOCUMENTATION.md`](../../SECURITY_DOCUMENTATION.md) —
  auth/ownership.
- [`PRODUCTS_AND_SEARCH.md`](PRODUCTS_AND_SEARCH.md) — moderation contracts.
- [`SUBSCRIPTION_AND_PAYMENTS.md`](SUBSCRIPTION_AND_PAYMENTS.md) —
  trial/subscription.
