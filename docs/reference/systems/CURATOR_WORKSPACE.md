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
Транспортные коды ошибок остаются внутренними: messenger преобразует их в
понятное пользовательское сообщение на границе UI. Если ответ на desired-state
операцию `done/acked` потерян, UI контрольным чтением сверяет отметку с сервером
и не показывает ошибку для уже применённого изменения.

Каждая операция `done/acked` блокируется отдельно по `message.id`: повторный
клик по тому же сообщению не создаёт конкурирующий запрос, а отметка другого
сообщения остаётся независимой. Кнопка действия отражает собственное состояние
текущей роли (`acked_at` для клиента или `done_at` для куратора), тогда как
пузырь сообщения может одновременно показывать обе отметки участников.

## Диагностика запусков и синхронизации

Четвёртая вкладка curator gate показывает все клиентские запуски без
переключения client context. Первый слой содержит сводные метрики, server-side
фильтры и список запусков; главное действие «Показать сбои». Раскрытие строки
показывает русскоязычный timeline входа, загрузки, модалок, sync и
агрегированных пакетов сохранения. Автообновление выполняется раз в 60 секунд
только пока вкладка открыта; длинные выборки продолжаются cursor pagination.

В карточке клиента остаётся точечная диагностика. Оба представления показывают
исход запуска, время, устройство, PWA/browser, build и длительность; проблемные
и незавершённые сессии выделены.

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
timeline структурированных событий с allowlisted context. Дневник, сообщения,
телефон, IP, токены и raw console в отчёт не попадают. После `boot_ready`
неструктурированная ошибка зависимости помечает запуск как `degraded`, а не
`failed`; фатальный статус требует именованного lifecycle-события сбоя.

Curator inbox использует health-check соединения перед запросом и один retry на
новом PostgreSQL client при протухшем pooled socket. Это не превращает успешную
загрузку панели в повторяющийся `500` на первом warm-запросе.

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

## Facts Table

| ID  | Утверждение                                                                              | Проверка                                                                                                                                                                                                                               | Статус               |
| --- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| C1  | TypeScript CuratorPanel использует mock API и placeholder tabs                           | `sed -n '1,90p' apps/web/src/components/CuratorPanel/CuratorPanelContainer.tsx && sed -n '1,230p' apps/web/src/components/CuratorPanel/hooks/useCuratorData.ts`                                                                        | проверено 2026-07-17 |
| C2  | Его component tests целиком skipped                                                      | `sed -n '65,85p' apps/web/src/components/CuratorPanel/__tests__/CuratorPanel.test.tsx`                                                                                                                                                 | проверено 2026-07-17 |
| C3  | Active state/CRUD принадлежат `useCloudClients` в legacy hooks                           | `sed -n '1995,2415p' apps/web/heys_app_hooks_v1.js`                                                                                                                                                                                    | проверено 2026-07-17 |
| C4  | List fetch имеет in-flight guard и local cache fallback                                  | `sed -n '2055,2195p' apps/web/heys_app_hooks_v1.js`                                                                                                                                                                                    | проверено 2026-07-17 |
| C5  | Gate содержит clients, queue, moderation и diagnostics tabs                              | `rg -n "setCuratorTab\('(clients\|queue\|moderation\|diagnostics)'" apps/web/heys_app_gate_flow_v1.js`                                                                                                                                 | проверено 2026-07-24 |
| C6  | Gate switch обновляет current id после `cloud.switchClient`                              | `sed -n '2325,2385p' apps/web/heys_app_gate_flow_v1.js`                                                                                                                                                                                | проверено 2026-07-17 |
| C7  | Client CRUD разделяет profile update и PIN reset                                         | `sed -n '2195,2335p' apps/web/heys_app_hooks_v1.js`                                                                                                                                                                                    | проверено 2026-07-17 |
| C8  | Curator RPC allowlist содержит clients/create/write-context contracts                    | `sed -n '930,1008p' yandex-cloud-functions/heys-api-rpc/index.js`                                                                                                                                                                      | проверено 2026-07-17 |
| C9  | Storage запрашивает curator write-context capability                                     | `sed -n '11740,11785p' apps/web/heys_storage_supabase_v1.js`                                                                                                                                                                           | проверено 2026-07-17 |
| C10 | Prototype не импортируется вне своей директории/demo в `apps/web/src`                    | `rg -n 'CuratorPanel' apps/web/src --glob '*.{ts,tsx}'`                                                                                                                                                                                | проверено 2026-07-17 |
| C11 | Есть guard tests для login/switch/access, но prototype test skipped                      | `rg --files apps/web/**tests**                                                                                                                                  \| rg '(curator         \| client-switch \| client-access)'`           | проверено 2026-07-17 |
| C12 | Messenger send retry-safe по request ID и canonical fingerprint                          | `apps/web/heys_messenger_api_v1.js`, `yandex-cloud-functions/heys-api-messages/index.js`, `scripts/db/migrations/2026-07-21_messenger_reliability_privacy.sql`                                                                         | проверено 2026-07-21 |
| C13 | История использует cursor pagination и merge по ID                                       | `apps/web/heys_messenger_v1.js`, `apps/web/__tests__/messenger-reliability-contract.test.js`                                                                                                                                           | проверено 2026-07-21 |
| C14 | Messenger преобразует технические ошибки в пользовательский текст                        | `apps/web/heys_messenger_v1.js`, `apps/web/__tests__/messenger-reliability-contract.test.js`                                                                                                                                           | проверено 2026-07-23 |
| C15 | Потерянный ответ `done/acked` разрешается контрольным чтением server truth               | `apps/web/heys_messenger_v1.js`, `apps/web/__tests__/messenger-reliability-contract.test.js`                                                                                                                                           | проверено 2026-07-23 |
| C16 | Диагностика проверяет ownership и не возвращает raw console/user content                 | `scripts/db/migrations/2026-07-24_client_session_observability.sql`, `apps/web/__tests__/client-session-observability.test.js`                                                                                                         | проверено 2026-07-24 |
| C17 | Общая диагностика использует один RPC, server filters и cursor pagination                | `apps/web/heys_client_diagnostics_v1.js`, `scripts/db/migrations/2026-07-24_client_session_observability.sql`, `apps/web/__tests__/client-session-observability.test.js`                                                               | проверено 2026-07-24 |
| C18 | UI разворачивает scalar RPC, а curator cookie не идёт в client-session RPC               | `apps/web/heys_client_diagnostics_v1.js`, `apps/web/heys_gamification_v1.js`, `apps/web/__tests__/client-session-observability.test.js`                                                                                                | проверено 2026-07-24 |
| C19 | Полный лог безопасен, outcome отличает fatal от post-ready error, inbox переподключается | `apps/web/heys_client_diagnostics_v1.js`, `scripts/db/migrations/2026-07-24_client_session_outcome_classification.sql`, `yandex-cloud-functions/heys-api-messages/index.js`, `apps/web/__tests__/client-session-observability.test.js` | проверено 2026-07-24 |

## Связанные источники

- [`CURATOR_VS_CLIENT.md`](../../CURATOR_VS_CLIENT.md) — role/data boundaries.
- [`SYNC_REFERENCE.md`](../../SYNC_REFERENCE.md) — client-scoped persistence.
- [`SECURITY_DOCUMENTATION.md`](../../SECURITY_DOCUMENTATION.md) —
  auth/ownership.
- [`PRODUCTS_AND_SEARCH.md`](PRODUCTS_AND_SEARCH.md) — moderation contracts.
- [`SUBSCRIPTION_AND_PAYMENTS.md`](SUBSCRIPTION_AND_PAYMENTS.md) —
  trial/subscription.
