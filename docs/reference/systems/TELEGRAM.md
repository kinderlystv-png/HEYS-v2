# Telegram Mini App и боты

> **Статус:** source-контракты перепроверены 2026-07-30 **Охват:** curator Mini
> App frontend, client bot, HEYS Start bot, webhook и polling delivery, lead
> handoff **Не подтверждено:** curator webhook state; Mini App backend
> отсутствует в найденном gateway/source-контуре. Claim/ownership и
> consent-proof fixes опубликованы. Личный smoke подтвердил, что HEYS Start
> показывает действующую privacy policy 1.7 до кнопки отправки контакта, а после
> контакта пишет registry-backed proof без дубля лида/handoff. Telegram-часть
> зелёная; production smoke DNS-fallback 2026-07-30 в 00:44–00:50 МСК подтвердил
> `/start` 1/1, обработку квиза и контакта 10/10, один curator handoff и четыре
> последующих polling-цикла 0/0. DB ACL дефект trial-intake prepare технически
> устранён, сквозная проверка до клиента ждёт финального ручного operator smoke.

## Главное разделение

В репозитории есть четыре разные Telegram-поверхности, и их нельзя считать одной
готовой системой:

| Поверхность         | Назначение                                                    | Состояние по source                                |
| ------------------- | ------------------------------------------------------------- | -------------------------------------------------- |
| Curator Mini App    | список клиентов и просмотр дня внутри Telegram                | frontend-прототип; production API wiring не найден |
| Client bot          | привязка Telegram по одноразовой ссылке и служебные сообщения | реализованный backend-контур                       |
| HEYS Start bot      | квиз, заявка на неделю и передача лида                        | реализованный backend-контур                       |
| Curator/support bot | operational alerts и callback «Взял в работу»                 | callback обрабатывается через Start poll worker    |

## Curator Mini App

`apps/tg-mini` получает `Telegram.WebApp.initData`, ожидает серверную проверку
через `POST /api/telegram/auth/verify`, а затем добавляет initData и выданный
bearer token в запросы списка клиентов и дня. В production интерфейс не должен
доверять `initDataUnsafe`; authority должна появляться только после проверки
подписи на backend.

Однако реализация или gateway routes для `/api/telegram/auth/verify` и
`/api/curator/*` в репозитории не найдены. Dev-режим создаёт фиктивную curator
session и использует встроенные mock clients/day data. Поэтому README и
`API_CONTRACT.md` описывают целевой контракт, а не доказанный production flow.

## Client bot

Клиент получает персональную ссылку `/start <pin_token>`. Бот проверяет UUID и
передаёт token вместе с Telegram `chat_id` в SQL `claim_pin_token_chat`. После
успешного claim он отправляет обычную ссылку на PWA и инструкцию входа; сам
token не превращается в web-session и повторно использоваться не должен.

Входящие updates могут маршрутизироваться через защищённый webhook, но
канонический operational pattern проекта — минутный timer trigger с окном long
polling до 55 секунд и прямой `sendMessage`. Offset подтверждается отдельным
`getUpdates(lastUpdateId + 1)` после обработки batch. Poll lease защищает от
перекрывающихся запусков. Если offset commit не принят Telegram, poller
останавливает текущий цикл, возвращает `telegram_ok=false` и не пишет успешный
heartbeat; это предотвращает повторную доставку в том же invocation.

Telegram Bot API вызывается одним HTTPS request к hostname `api.telegram.org`.
Custom DNS lookup передаёт Node обычные DNS-addresses и allowlisted fallback
IPv4, а `autoSelectFamily` переключает connect-address до TLS и записи HTTP
body. Host, SNI и проверка сертификата остаются привязаны к `api.telegram.org`;
повторный POST после неоднозначного timeout не выполняется, чтобы `sendMessage`
не мог задублироваться на уровне приложения.

`POST /bot/send` — отдельный внутренний выход для drip-сообщений; он требует
internal cron authorization и не является публичным send API.

## HEYS Start bot

Второй token обслуживает квиз «Твой тип срыва». Ответы фиксируются в funnel
events; после выбора заявки бот просит Telegram contact или номер телефона.
`createStartLeadFromContact` создаёт либо переиспользует активный lead,
связывает его с `week_request`, пишет lead funnel event и отправляет куратору
минимизированный handoff без телефона, имени и raw chat id.

Versioned privacy proof разрешён только после сообщения с прямой ссылкой на
действующую policy и последующей отправки контакта пользователем. Для нового
лида version/method проходят через insert trigger; для уже связанного активного
лида bot source берёт active `privacy_policy` version/hash из серверного
`legal_consent_registry` (`START_LEAD_PRIVACY_VERSION`, сейчас 1.8) и обновляет
proof в той же транзакции. Если active registry row не найден или лид уже не в
допустимом статусе, транзакция откатывается и заявка не объявляется сохранённой.
In-app `personal_data` 1.0 этим путём не ставится.

Start bot также имеет webhook path, но source поддерживает отдельный long poll с
`message` и `callback_query`, прямой доставкой ответов и commit offset.

## Curator/support bot

`heys-api-leads` отправляет минимизированную карточку с `lead_taken_<uuid>`
через `TELEGRAM_BOT_TOKEN`. Отдельный timer не создаётся: source переиспользует
уже активный `heys-start-bot-poll`, который после публикации этой версии под
одним lease параллельно вызывает `getUpdates` для Start и curator tokens.
Curator channel принимает только `callback_query`, после batch подтверждает
offset и пишет отдельный heartbeat.

Callback разрешён только для настроенного curator chat. Private chat требует
совпадения `from.id` и `chat.id`; group chat без `TELEGRAM_CURATOR_USER_IDS`
закрыт. DB claim — условный `new → contacted`; direct `answerCallbackQuery`
вызывается для success/repeat/malformed/forbidden/not-found/error, а message
edit с actor/time — только после успешной mutation.

Тот же support token принимает operational alerts. Yandex workers получают его
из Lockbox; внешний GitHub health monitor хранит отдельную копию token/chat id в
GitHub Secrets, чтобы сбой Yandex/Lockbox не лишал систему единственного
внешнего канала. Scheduled/push alert считается доставленным только при успешном
HTTP и Telegram `ok: true`. `heys-maintenance` ходит в Bot API тем же DNS/IPv4
fallback, что и `heys-bot-client`: один HTTPS request, hostname/SNI и проверка
сертификата остаются на `api.telegram.org`. Heartbeat по-прежнему ставится
только после Telegram `ok`.

Cross-client API guards не ждут Telegram: блокировка сохраняется в
`data_loss_audit`, а 15-минутный security worker доставляет агрегированный alert
с DB watermark. Неуспешная попытка не двигает watermark и повторяется; успешная
не отправляется снова.

## Инварианты

1. Mini App `initDataUnsafe` — UI hint, не полномочие; нужна server hash check.
2. Dev/mock session никогда не должна активироваться в production build.
3. Client pin token проверяется и погашается серверной SQL-функцией.
4. Входящий webhook без Telegram secret header отклоняется.
5. Polling и webhook одного bot token не работают одновременно; production режим
   выбирается операционно.
6. Ответы ботам отправляются прямым Bot API, а не считаются доставленными только
   из webhook response body.
7. Offset продвигается после обработки updates, не до неё.
8. Handoff HEYS Start в curator Telegram не содержит ПДн.
9. Curator callback fail-closed по chat/actor и не доверяет одному callback
   UUID.
10. Один Start poll lease защищает оба параллельных token-poller.
11. Operational heartbeat не обновляется, если обязательное Telegram-сообщение
    не получило delivery success.
12. Ошибка offset commit останавливает соответствующий poll loop и помечает
    invocation неуспешным; следующий batch в том же запуске не читается.
13. HEYS Start не заявляет versioned privacy consent до показа ссылки на
    действующую policy и нового действия пользователя.
14. DNS fallback меняет только connect-address внутри одного TLS-verified HTTPS
    request; повторный Bot API POST после timeout/abort запрещён.

## Подтверждённые слабые места и пробелы

- Curator Mini App не имеет найденной backend-реализации ожидаемых endpoints;
  его нельзя считать рабочей альтернативой основной curator panel.
- В `apps/tg-mini` нет test scripts или найденных test/spec files; auth и API
  contracts подтверждены только чтением frontend source.
- Mini App хранит initData/session token только в module memory, поэтому reload
  требует повторного boot/verify; это допустимо, но должно оставаться явным.
- Gateway по-прежнему содержит webhook routes, хотя operational protocol
  фиксирует long polling. Source поддерживает оба режима, а текущий production
  выбор нельзя доказать без YC/Telegram runtime check.
- Polling оставляет небольшой разрыв между минутными окнами и зависит от
  Telegram/Yandex network; heartbeat и ops checker обнаруживают деградацию, но
  не устраняют её.
- Fail-closed остановка не может гарантировать, что Telegram сохранил offset:
  если commit действительно не принят, следующий invocation может снова получить
  update. Поэтому после offset-инцидента обязателен live-smoke следующего
  минутного запуска и проверка pending queue = 0.
- Client, Start и curator callback находятся в одном крупном handler и разделяют
  deployment: ошибка общей инициализации или релиза затрагивает три контура.
- Allowlisted Telegram fallback IPv4 — аварийная зависимость и может измениться
  у провайдера. Обычный DNS остаётся первым, fallback используется только как
  второй connect-address; доступность подтверждается transport-тестом и
  production live-smoke.
- `heys-cron-security-alerts` и GitHub `send-telegram-alert` ещё ходят через
  Node `fetch`; тот же YC DNS-сбой, что уронил `daily_report` 2026-08-13, там не
  закрыт.

## Facts Table

| ID  | Утверждение                                                                                                                          | Проверка                                                                                                                                                                                                                                                                                                                                                        | Статус                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Mini App требует initData verify и прокидывает initData/bearer централизованно                                                       | `sed -n '1,75p' apps/tg-mini/src/App.tsx && sed -n '1,75p' apps/tg-mini/src/api/httpClient.ts`                                                                                                                                                                                                                                                                  | проверено 2026-07-17                                                                                                                            |
| T2  | Ожидаемые Mini App endpoints встречаются только во frontend/docs                                                                     | `rg -n --glob '!**/node_modules/**' --glob '!**/dist/**' '/api/telegram/auth/verify                                                                                  \| X-Telegram-Init-Data' .`                                                                                                                                                                | проверено 2026-07-17                                                                                                                            |
| T3  | Mini App package не объявляет test script                                                                                            | `cat apps/tg-mini/package.json`                                                                                                                                                                                                                                                                                                                                 | проверено 2026-07-17                                                                                                                            |
| T4  | Gateway публикует bot/start-bot webhook, send и health routes                                                                        | `sed -n '390,430p' yandex-cloud-functions/api-gateway-spec.yaml`                                                                                                                                                                                                                                                                                                | проверено 2026-07-17                                                                                                                            |
| T5  | Client `/start` погашает UUID token через `claim_pin_token_chat`                                                                     | `sed -n '481,548p' yandex-cloud-functions/heys-bot-client/index.js`                                                                                                                                                                                                                                                                                             | проверено 2026-07-17                                                                                                                            |
| T6  | Client имеет отдельный poll, а Start timer под одним lease опрашивает Start и curator tokens; отказ offset commit останавливает loop | `rg -n 'runStartBotPoll                                                                                                                                               \| runCuratorBotPoll         \| runClientBotPoll                                                           \| poll offset commit failed' yandex-cloud-functions/heys-bot-client/index.js` | проверено 2026-07-28                                                                                                                            |
| T7  | Webhook paths требуют отдельные secret checks                                                                                        | `rg -n 'verifyWebhookSecret                                                                                                                                          \| HEYS_START_WEBHOOK_SECRET \| TELEGRAM_WEBHOOK_SECRET' yandex-cloud-functions/heys-bot-client/index.js`                                                                                  | перепроверено 2026-07-18                                                                                                                        |
| T8  | Start contact создаёт lead и минимизированный handoff                                                                                | `rg -n 'createStartLeadFromContact                                                                                                                                   \| sendStartLeadHandoff      \| record_funnel_event' yandex-cloud-functions/heys-bot-client/index.js`                                                                                      | перепроверено 2026-07-18                                                                                                                        |
| T9  | Bot tests покрывают webhook/polling/CRM, curator callback, consent proof и fail-closed offset contract                               | `node --test yandex-cloud-functions/heys-bot-client/__tests__/start-lead-crm.test.cjs yandex-cloud-functions/heys-bot-client/__tests__/lead-taken-callback.test.cjs`                                                                                                                                                                                            | 29/29 пройдено 2026-07-30                                                                                                                       |
| T10 | Ops checker ожидает оба минутных polling trigger                                                                                     | `sed -n '20,28p' yandex-cloud-functions/check-heys-ops-status.cjs`                                                                                                                                                                                                                                                                                              | проверено 2026-07-17                                                                                                                            |
| T11 | Operational alerts fail-closed, а cross-client события повторяются по DB watermark                                                   | `node --test scripts/ci/__tests__/send-telegram-alert.test.mjs yandex-cloud-functions/heys-maintenance/__tests__/telegram-delivery.test.cjs yandex-cloud-functions/heys-maintenance/__tests__/telegram-fetch.test.cjs yandex-cloud-functions/heys-cron-security-alerts/__tests__/telegram-delivery.test.cjs`                                                    | source проверен 2026-08-13; maintenance DNS fallback добавлен                                                                                   |
| T12 | Fail-closed offset fix опубликован в active production version                                                                       | `yc serverless function version list --function-name heys-bot-client`; `pnpm ops:heys:canary --strict`; фильтр логов по version id                                                                                                                                                                                                                              | deploy `d4eebq4t8dar9olee310`, canary green 2026-07-28                                                                                          |
| T13 | Повторная отправка контакта после показа policy записывает proof в существующий active lead без второго handoff                      | `start-lead-crm.test.cjs`: policy prompt + replay consent update; active function + operator/DB smoke                                                                                                                                                                                                                                                           | deploy `d4eeeo4qqsli8h6snbge`; version/hash/time green, 1 lead + 1 lead-creation event 2026-07-29                                               |
| T14 | Telegram DNS fallback сохраняет hostname/SNI/cert verify и выполняет ровно один HTTPS request без повторного POST                    | `node --check yandex-cloud-functions/heys-bot-client/index.js`; focused bot tests; active version и production logs                                                                                                                                                                                                                                             | deploy `d4ev6kj16h40s1qdm2br`; live-smoke 2026-07-30 00:44–00:50 МСК: `/start` 1/1, quiz/contact 10/10, handoff 1/1, четыре следующих цикла 0/0 |
| T15 | `heys-maintenance` использует тот же TLS-verified DNS fallback для sendMessage/getWebhookInfo/deleteWebhook                          | `node --test yandex-cloud-functions/heys-maintenance/__tests__/telegram-fetch.test.cjs yandex-cloud-functions/heys-maintenance/__tests__/telegram-delivery.test.cjs`; `rg -n 'fetchTelegramWithDnsFallback' yandex-cloud-functions/heys-maintenance`                                                                                                            | source 2026-08-13; live-smoke после deploy daily_report                                                                                         |
