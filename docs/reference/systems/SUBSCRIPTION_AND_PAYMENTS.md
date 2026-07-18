# Подписка, trial, paywall и платежи

> **Статус:** client access core проверен 2026-07-18; payment code-path —
> 2026-07-17<br> **Охват:** статусы, кэш, write gate, trial UI, payment
> create/status/webhook/refund, auth и идемпотентность<br> **Не подтверждено:**
> фактический deployment payment routes, production env, webhook secret и
> состояние таблиц/миграций

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
  → HEYS.Paywall.canWriteSync / gateWrite
  → write разрешён только для trial | active

Payment UI (feature flag)
  → POST /payments/create (client session)
  → internal payment row → ЮKassa confirmation URL
  → webhook/poll → payment_events dedupe
  → transaction: payment status + client subscription
```

## Статусы и владелец решения

| Статус          | Запись данных | Смысл                            |
| --------------- | ------------- | -------------------------------- |
| `none`          | нет           | подписка/доступ отсутствуют      |
| `trial_pending` | нет           | trial одобрен, но ещё не активен |
| `trial`         | да            | пробный доступ активен           |
| `active`        | да            | оплаченный доступ активен        |
| `read_only`     | нет           | trial/подписка завершились       |

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

Ошибки API, неизвестный status и отсутствие `HEYS.Subscription` не открывают
доступ. `useWriteAccess()` начинается с `canWrite: false` и меняет решение
только после завершённой проверки или события `heys:subscription-changed`.

## Trial

Текущий контракт различает `trial_pending` и активный `trial`. Legacy
`startTrial()` оставлен только для совместимости и не запускает trial.
`activateTrialTimer()` также помечен deprecated в коде после перехода к
выбранной куратором дате; новый flow не должен строиться на этих legacy API.

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

1. Внешний webhook проверяет IP allowlist; HMAC проверяется только если secret
   настроен.
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
2. Browser-supplied `clientId` не является authority для payment/status.
3. Cache ускоряет gate, но server status остаётся владельцем доступа.
4. Subscription-only refresh не должен затирать полный profile.
5. Payment event применяется максимум один раз.
6. Активация payment и изменение client subscription должны быть одной
   транзакцией.
7. Payment metadata не должна содержать контактные или health данные.
8. Версия `payment_oferta` должна совпадать между consent UI и backend.
9. Payment UI нельзя считать активным только потому, что backend-код существует.

## Подтверждённые слабые места и пробелы

- `HEYS.config.paymentsEnabled` по умолчанию `false`; UI направляет к куратору.
  Код payment screen/backend не доказывает, что платежи включены пользователям.
- Payment routes присутствуют только в `api-gateway-spec-v2.yaml`, где есть TODO
  о замене function id; в основном `api-gateway-spec.yaml` их нет. Deployment
  wiring по репозиторию не подтверждён.
- HMAC webhook fail-open при отсутствии `YUKASSA_WEBHOOK_SECRET` и полагается
  только на IP allowlist. Фактическое env-состояние не проверено.
- Комментарии вокруг auto-start trial противоречат более новому curator-date
  flow; deprecated functions нельзя использовать как описание продукта.

## Ключевые тесты

- `apps/web/__tests__/subscription-curator-guard.test.js` — curator/PIN status,
  единый access helper, sync/async/meta, malformed payload и boot-order.
- `yandex-cloud-functions/heys-api-payments/__tests__/auth-helpers-cookie-session.test.cjs`
  — cookie/session auth.
- `yandex-cloud-functions/heys-api-payments/__tests__/payment-status-webhook.test.cjs`
  — metadata, activation transaction и duplicate webhook.
- `yandex-cloud-functions/test_subscription_protection.cjs` — отдельная
  operational/DB проверка; её наличие не подтверждает текущий production run.

## Facts Table

| ID  | Утверждение                                                                               | Проверка                                                                                                                                             | Статус                    |
| --- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| B1  | `canWriteStatus` — единый pure helper и разрешает только trial/active                     | `rg -n -e 'function canWriteStatus' -e 'return status === STATUS.TRIAL' apps/web/heys_subscription_v1.js`                                            | проверено 2026-07-18      |
| B2  | Cache key имеет TTL и Phase A загружает status                                            | `rg -n -e 'CACHE_KEY' -e 'CACHE_TTL_MS' apps/web/heys_subscription_v1.js && rg -n 'heys_subscription_status' apps/web/heys_storage_supabase_v1.js`   | проверено 2026-07-17      |
| B3  | Paywall async/sync и начальный hook state fail-closed                                     | `sed -n '875,985p' apps/web/heys_paywall_v1.js`                                                                                                      | исправлено 2026-07-18     |
| B4  | Parameterized, consumer и boot-order contract проходят                                    | `pnpm vitest run apps/web/__tests__/subscription-curator-guard.test.js --no-coverage`                                                                | 24/24 пройдено 2026-07-18 |
| B5  | Payment UI feature flag default false                                                     | `rg -n -e 'paymentsEnabled = false' -e 'HEYS.config.paymentsEnabled' apps/web/heys_subscriptions_v1.js`                                              | проверено 2026-07-17      |
| B6  | Create/status используют client auth, refund curator auth, webhook отдельный path         | `sed -n '1080,1120p' yandex-cloud-functions/heys-api-payments/index.js`                                                                              | проверено 2026-07-17      |
| B7  | Webhook использует IP gate и optional HMAC                                                | `sed -n '720,750p' yandex-cloud-functions/heys-api-payments/index.js`                                                                                | проверено 2026-07-17      |
| B8  | Event dedupe предшествует transactional subscription mutation                             | `sed -n '498,690p' yandex-cloud-functions/heys-api-payments/index.js`                                                                                | проверено 2026-07-17      |
| B9  | Основной gateway spec не содержит payment routes, v2 содержит TODO routes                 | `rg -n 'payments' yandex-cloud-functions/api-gateway-spec.yaml yandex-cloud-functions/api-gateway-spec-v2.yaml`                                      | проверено 2026-07-17      |
| B10 | Metadata получает `canWrite` из того же helper                                            | `sed -n '375,430p' apps/web/heys_subscription_v1.js`                                                                                                 | исправлено 2026-07-18     |
| B11 | Девять diary write consumers и day UI fail-closed при отсутствующем модуле/unknown status | `rg -n -e 'Paywall\?\.canWriteSync' -e 'canWriteStatus' apps/web/heys_day_day_handlers.js apps/web/day/_meals.js apps/web/heys_day_tab_render_v1.js` | исправлено 2026-07-18     |
| B12 | Legacy `Subscriptions.canEdit` и status metadata делегируют каноническому helper          | `rg -n -e 'canWriteStatus' -e 'can_edit' apps/web/heys_subscriptions_v1.js`                                                                          | исправлено 2026-07-18     |
