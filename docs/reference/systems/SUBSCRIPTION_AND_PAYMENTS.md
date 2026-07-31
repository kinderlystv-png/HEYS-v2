# Подписка, trial, paywall и платежи

> **Статус:** client access core проверен 2026-07-18; pre-trial profile-only и
> post-activation registration-marker contracts проверены production 2026-07-31;
> active-trial UI contract обновлён локально 2026-07-31; payment code-path —
> 2026-07-28<br> **Охват:** статусы, кэш, write gate, trial UI, payment
> create/status/webhook/refund, auth и идемпотентность<br> **Не подтверждено/Не
> охвачено:** production payment rollout. **Deferred до отдельного post-trial
> этапа:** deployment `heys-api-payments`, payment routes, отдельный Lockbox и
> credentials ЮKassa. Их отсутствие не блокирует первые реальные trial.

## Назначение и границы

Система решает две связанные, но разные задачи:

1. **Access control в продукте:** можно ли клиенту изменять данные.
2. **Billing:** создание платежа, приём статуса ЮKassa, активация или отзыв
   подписки.

Client-side gate улучшает UX, но не является security boundary. Серверные RPC и
payment endpoints обязаны независимо проверять session/curator ownership.

```text
PIN/curator session
  → get_subscription_status_by_session или локальный curator profile
  → HEYS.Subscription cache
  → none/trial_pending: согласия + профиль, затем экран ожидания
  → HEYS.Paywall.canWriteSync / gateWrite
  → write разрешён только для trial | active

Payment UI (feature flag)
  → POST /payments/create (client session)
  → internal payment row → ЮKassa confirmation URL
  → webhook/poll → payment_events dedupe
  → transaction: payment status + client subscription
```

До отдельного разрешения `HEYS.config.paymentsEnabled` остаётся `false`. Все
точки завершения trial направляют пользователя к куратору; payment UI и
`createPayment` недостижимы. Продление первых trial выполняется куратором через
существующий subscription-management flow и не зависит от ЮKassa.

## Статусы и владелец решения

| Статус          | Запись данных  | Смысл                             |
| --------------- | -------------- | --------------------------------- |
| `none`          | только профиль | аккаунт готов, дата не назначена  |
| `trial_pending` | только профиль | trial запланирован, но не активен |
| `trial`         | да             | пробный доступ активен            |
| `active`        | да             | оплаченный доступ активен         |
| `read_only`     | нет            | trial/подписка завершились        |

Каноническое client-side решение находится в
`HEYS.Subscription.canWriteStatus(value)`: helper нормализует поддержанные формы
status payload и разрешает только `trial|active`. `Subscription.canWrite`,
metadata, legacy `Subscriptions.canEdit` и async/sync Paywall делегируют ему.
Кэш `heys_subscription_status` имеет короткий TTL и входит в Phase A, чтобы
первый write gate не ждал полного sync.

Для PIN-клиента актуальный статус запрашивает
`get_subscription_status_by_session`. Для curator-сессии модуль не выполняет
этот client-session RPC, а берёт status из выбранного profile/client state.

## Основные точки реализации

| Область                                   | Точка                                                                                               |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Статусы, cache, session-aware refresh     | `apps/web/heys_subscription_v1.js`                                                                  |
| Write gate, modal и readonly UI           | `apps/web/heys_paywall_v1.js`                                                                       |
| Diary write consumers и readonly banner   | `apps/web/heys_day_day_handlers.js`, `apps/web/day/_meals.js`, `apps/web/heys_day_tab_render_v1.js` |
| Trial/banner/payment screen orchestration | `apps/web/heys_subscriptions_v1.js`                                                                 |
| Очередь заявок на trial                   | `apps/web/heys_trial_queue_v1.js`                                                                   |
| Browser payment requests                  | payment methods в `apps/web/heys_yandex_api_v1.js`                                                  |
| RPC allowlist/status                      | `yandex-cloud-functions/heys-api-rpc/index.js`                                                      |
| Payment backend                           | `yandex-cloud-functions/heys-api-payments/index.js`                                                 |
| Payment event uniqueness                  | `database/2026-04-28_payment_events.sql`                                                            |
| Trial semantics/migrations                | `database/2026-02-09_trial_machine_v3.sql` и последующие migrations                                 |

## Access-control поток

1. `getStatus()` сначала использует свежий cache и дедуплицирует параллельные
   запросы.
2. PIN-session вызывает session-safe RPC; curator использует локальный статус
   выбранного клиента.
3. Изменение статуса обновляет cache и dispatch-ит `heys:subscription-changed`.
4. Async/sync Paywall делегируют решение `canWriteStatus()`; отсутствие модуля
   или известного статуса блокирует действие, sync path запускает background
   refresh.
5. `gateWrite()` показывает readonly toast и не вызывает wrapped action.
6. Девять прямых diary handlers используют sync gate fail-closed: отсутствие
   Paywall не превращается в разрешение. Day UI считает запись закрытой, пока
   `canWriteStatus()` явно не вернул `true`.
7. Auth/client/focus/visibility события инициируют пассивное обновление.
8. После обязательных согласий клиент без активного trial заполняет только
   профиль. После подтверждённого cloud readback route-level gate не допускает
   его в чекин, дневник и основной интерфейс.
9. После полного sync того же клиента stale browser-global marker регистрации не
   перекрывает `profileCompleted=true`, если sync не старее `profile.updatedAt`.
   Локальный completed-профиль, записанный после последнего sync, остаётся
   fail-closed до точечного cloud readback.

Ошибки API, неизвестный status и отсутствие `HEYS.Subscription` не открывают
доступ. `useWriteAccess()` начинается с `canWrite: false` и меняет решение
только после завершённой проверки или события `heys:subscription-changed`. При
этом тревожный баннер «Триал закончился» показывается только для явно
подтверждённого `read_only`: fail-closed write gate не должен превращать
`unknown/loading` в ложное сообщение об окончании доступа.

## Trial

Текущий контракт различает `trial_pending` и активный `trial`. Legacy
`startTrial()` оставлен только для совместимости и не запускает trial.
`activateTrialTimer()` также помечен deprecated в коде после перехода к
выбранной куратором дате и возвращает `curator_activation_required` без RPC.
Клиентские RPC `start_trial_by_session` и `activate_trial_timer_by_session`
удалены из gateway allowlist, а migration №20 отзывает их `EXECUTE` у
`heys_rpc`. Одобрение анкеты создаёт аккаунт и PIN, но не запускает trial: дату
куратор выбирает отдельно в существующем управлении подпиской.

Пробная неделя относится только к Pro. Pro Спорт использует сохранённый
внутренний plan-id `proplus`, но публично называется «Pro Спорт», стоит 19 990
₽/мес и подключается только после личного согласования. В paywall прямой платёж
этого плана не открывается: пользователь направляется в существующий ручной
контур, а платёж создаётся только после подтверждения места.

Активный полный `trial` не занимает основной экран и шапку отдельным banner,
сроком или CTA оплаты. Краткий остаток показывается только в свёрнутом разделе
настроек, подробные `status/days_left` — внутри блока «Подписка». Досрочное
оформление не предлагается клиенту: первые trial продлевает куратор. Для
`read_only` сохраняются write-gate, readonly UI и paywall, но не постоянная
subscription-строка над шапкой.

Отдельный `refreshProfileSubscription()` обновляет профиль после auth, но не
пишет subscription-only объект поверх ещё не загруженного полного профиля. При
неполном local profile обновляется только отдельный status cache, а профиль
оставляется общей cloud sync.

## Payment flow

### Создание

1. `/payments/create` аутентифицирует client request и сверяет requested
   `clientId` с server-resolved session client.
2. Проверяется актуальный consent `payment_oferta`.
3. Сначала создаётся internal pending payment, затем запрос в ЮKassa.
4. В metadata ЮKassa передаются только внутренние identifiers/plan; контакт для
   чека находится в receipt customer, а не metadata.

### Webhook / polling

1. Внешний webhook проверяет IP allowlist. Отдельная custom HMAC-ветка
   `YUKASSA_WEBHOOK_SECRET` удалена: YooKassa не предоставляет этот секрет в
   используемом контуре.
2. Event вставляется в `payment_events` с unique constraint. Duplicate завершает
   обработку без повторных mutation.
3. Payment row и client subscription обновляются в одной DB transaction.
4. `payment.succeeded` активирует/продлевает доступ; `refund.succeeded`
   переводит клиента в `read_only`.

### Refund и status

- `/payments/refund` требует curator auth и проверяет принадлежность payment
  куратору до обращения к ЮKassa.
- `/payments/status` требует client session и фильтрует payment по resolved
  client id.

## Инварианты

1. `trial_pending` не разрешает запись; только `trial` и `active`.
2. Переход `trial_pending → trial` после полного sync сразу повторно оценивает
   обязательный чек-ин без reload.
3. Browser-supplied `clientId` не является authority для payment/status.
4. Cache ускоряет gate, но server status остаётся владельцем доступа.
5. Subscription-only refresh не должен затирать полный profile.
6. Payment event применяется максимум один раз.
7. Активация payment и изменение client subscription должны быть одной
   транзакцией.
8. Payment metadata не должна содержать контактные или health данные.
9. Версия `payment_oferta` должна совпадать между consent UI и backend.
10. Payment UI нельзя считать активным только потому, что backend-код
    существует.
11. Неизвестный или ещё загружаемый статус блокирует запись, но не отображается
    пользователю как подтверждённое окончание триала.
12. Внутренний id `proplus` — техническая совместимость, а не публичное название
    тарифа; пользователь видит «Pro Спорт».
13. Legacy `admin_extend_trial` не входит в browser/backend runtime allowlist;
    ручное продление выполняется только через ownership-checked
    `admin_extend_subscription`.
14. `heys_profile` можно сохранить до trial, но `heys_dayv2_*` и другие
    дневниковые ключи сервер принимает только при `trial|active`.
15. Подтверждение первого профиля использует readback именно `heys_profile` и не
    зависит от состояния посторонних ключей общей sync-очереди.
16. `heys_registration_in_progress` нельзя считать авторитетнее завершённого
    профиля из более нового полного sync того же клиента; marker снимается как
    stale. Если локальный профиль новее sync, marker продолжает блокировать
    flow.
17. Активный `trial` не рендерит subscription status, срок или CTA на основном
    экране; эти данные доступны только во втором слое настроек.
18. Поздняя загрузка StepModal повторно регистрирует `payment_required` через
    каноническое событие `document:heys-stepmodal-ready`; альтернативное имя или
    `window` target не являются частью контракта.
19. Повторное исполнение lazy chunk не очищает существующий StepModal registry:
    внешние шаги сохраняются, а `payment_required` использует штатный
    `component` contract. В `read_only` он показывает отдельный blocking gate с
    контактом куратора, а не пустую модалку или CTA активного trial.

## Отложенный post-trial payment этап

- `HEYS.config.paymentsEnabled` по умолчанию `false`; UI направляет к куратору.
  Код payment screen/backend не доказывает, что платежи включены пользователям.
- Payment routes присутствуют только в `api-gateway-spec-v2.yaml`, где есть TODO
  о замене function id; в основном `api-gateway-spec.yaml` их нет. Deployment
  wiring по репозиторию не подтверждён.
- `YUKASSA_SHOP_ID` и `YUKASSA_SECRET_KEY` должны загружаться из отдельного
  Lockbox secret, заданного через `LOCKBOX_PAYMENTS_SECRET_ID`. CI preflight
  читает payload только этого секрета и проверяет наличие двух непустых ключей,
  не выводя значения.
- Настройка secret, IAM-доступа, repository variable и первый deploy
  `heys-api-payments` выполняются только отдельным этапом после появления первых
  реальных trial. Это осознанное deferred-state, а не текущий релизный блокер.
- Комментарии вокруг auto-start trial противоречат более новому curator-date
  flow; deprecated functions нельзя использовать как описание продукта.

## Ключевые тесты

- `apps/web/__tests__/subscription-curator-guard.test.js` — curator/PIN status,
  единый access helper, scheduled details, запрет PIN self-start и boot-order.
- `apps/web/__tests__/trial-prestart-access-contract.test.js` и
  `scripts/db/test-trial-intake-migration.mjs` — profile-only pre-trial gate,
  отозванные self-start privileges и доступ active trial.
- `apps/web/__tests__/first-login-registration-flow.test.js` — точечный cloud
  readback профиля и stale-marker guard после активации trial.
- `apps/web/__tests__/subscription-settings-status-contract.test.js` — срок
  активного trial во втором слое настроек и синхронность двух user-tab source.
- `yandex-cloud-functions/heys-api-payments/__tests__/auth-helpers-cookie-session.test.cjs`
  — cookie/session auth.
- `yandex-cloud-functions/heys-api-payments/__tests__/payment-status-webhook.test.cjs`
  — metadata, activation transaction и duplicate webhook.
- `yandex-cloud-functions/test_subscription_protection.cjs` — отдельная
  operational/DB проверка; её наличие не подтверждает текущий production run.

## Facts Table

| ID  | Утверждение                                                                                                                                    | Проверка                                                                                                                                                                                                                                                            | Статус                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| B1  | `canWriteStatus` — единый pure helper и разрешает только trial/active                                                                          | `rg -n -e 'function canWriteStatus' -e 'return status === STATUS.TRIAL' apps/web/heys_subscription_v1.js`                                                                                                                                                           | проверено 2026-07-18             |
| B2  | Cache key имеет TTL и Phase A загружает status                                                                                                 | `rg -n -e 'CACHE_KEY' -e 'CACHE_TTL_MS' apps/web/heys_subscription_v1.js && rg -n 'heys_subscription_status' apps/web/heys_storage_supabase_v1.js`                                                                                                                  | проверено 2026-07-17             |
| B3  | Paywall async/sync и начальный hook state fail-closed                                                                                          | `sed -n '875,985p' apps/web/heys_paywall_v1.js`                                                                                                                                                                                                                     | исправлено 2026-07-18            |
| B4  | Parameterized, consumer и boot-order contract проходят                                                                                         | `pnpm exec vitest run apps/web/__tests__/subscription-curator-guard.test.js`                                                                                                                                                                                        | 27/27 пройдено 2026-07-30        |
| B5  | Payment UI feature flag default false                                                                                                          | `rg -n -e 'paymentsEnabled = false' -e 'HEYS.config.paymentsEnabled' apps/web/heys_subscriptions_v1.js`                                                                                                                                                             | проверено 2026-07-17             |
| B6  | Create/status используют client auth, refund curator auth, webhook отдельный path                                                              | `sed -n '1080,1120p' yandex-cloud-functions/heys-api-payments/index.js`                                                                                                                                                                                             | проверено 2026-07-17             |
| B7  | Webhook использует IP allowlist; custom HMAC-secret отсутствует                                                                                | `rg -n 'isYukassaIp\|YUKASSA_WEBHOOK_SECRET' yandex-cloud-functions/heys-api-payments/index.js`                                                                                                                                                                     | проверено 2026-07-28             |
| B8  | Event dedupe предшествует transactional subscription mutation                                                                                  | `sed -n '498,690p' yandex-cloud-functions/heys-api-payments/index.js`                                                                                                                                                                                               | проверено 2026-07-17             |
| B9  | Основной gateway spec не содержит payment routes, v2 содержит TODO routes                                                                      | `rg -n 'payments' yandex-cloud-functions/api-gateway-spec.yaml yandex-cloud-functions/api-gateway-spec-v2.yaml`                                                                                                                                                     | проверено 2026-07-17             |
| B10 | Metadata получает `canWrite` из того же helper                                                                                                 | `sed -n '375,430p' apps/web/heys_subscription_v1.js`                                                                                                                                                                                                                | исправлено 2026-07-18            |
| B11 | Девять diary write consumers и day UI fail-closed при отсутствующем модуле/unknown status                                                      | `rg -n 'Paywall\?\.canWriteSync                                                                                                                    \| canWriteStatus' apps/web/heys_day_day_handlers.js apps/web/day/\_meals.js apps/web/heys_day_tab_render_v1.js` | исправлено 2026-07-18            |
| B12 | Legacy `Subscriptions.canEdit` и status metadata делегируют каноническому helper                                                               | `rg -n 'canWriteStatus                                                                                                                             \| can_edit' apps/web/heys_subscriptions_v1.js`                                                                  | исправлено 2026-07-18            |
| B13 | Payment backend требует ту же активную версию и SHA оферты, что manifest и consent UI                                                          | `pnpm --dir apps/web exec vitest run __tests__/consent-release-contract.test.js --no-coverage`                                                                                                                                                                      | исправлено 2026-07-28            |
| B14 | До trial доступны согласия и профиль, но не чекин/dayv2/main UI                                                                                | `pnpm exec vitest run apps/web/__tests__/consent-gate-flow.test.js apps/web/__tests__/morning-checkin-flow-resume.test.js apps/web/__tests__/trial-prestart-access-contract.test.js`                                                                                | проверено локально 2026-07-30    |
| B16 | Stale registration marker снимается только после более нового полного sync того же клиента; более свежая локальная запись остаётся fail-closed | `apps/web/heys_profile_step_v1.js:76-104`; `pnpm exec vitest run apps/web/__tests__/first-login-registration-flow.test.js --no-coverage`                                                                                                                            | 6/6 пройдено локально 2026-07-30 |
| B15 | PIN self-start закрыт в gateway и DB privilege                                                                                                 | `pnpm test:db:trial-intake`                                                                                                                                                                                                                                         | проверено локально 2026-07-30    |
| B17 | Active trial не создаёт header banner/CTA, а срок отображается только в настройках                                                             | `pnpm exec vitest run apps/web/__tests__/subscription-curator-guard.test.js apps/web/__tests__/subscription-settings-status-contract.test.js --no-coverage`                                                                                                         | проверено локально 2026-07-31    |
| B18 | `payment_required` регистрируется после канонического StepModal-ready event                                                                    | `pnpm exec vitest run apps/web/__tests__/subscription-curator-guard.test.js --no-coverage`                                                                                                                                                                          | проверено локально 2026-07-31    |
| B19 | Duplicate lazy execution сохраняет внешний StepModal registry и содержательный `payment_required` component                                    | `pnpm exec vitest run apps/web/__tests__/morning-checkin-flow-resume.test.js apps/web/__tests__/subscription-curator-guard.test.js --no-coverage`                                                                                                                   | проверено локально 2026-07-31    |
