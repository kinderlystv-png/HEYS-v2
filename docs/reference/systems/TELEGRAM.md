# Telegram Mini App и боты

> **Статус:** source-контракты проверены 2026-07-18 **Охват:** curator Mini App
> frontend, client bot, HEYS Start bot, webhook и polling delivery, lead handoff
> **Не подтверждено:** публикация текущей source-версии и curator webhook state;
> Mini App backend отсутствует в найденном gateway/source-контуре

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
перекрывающихся запусков, heartbeat — от незаметной остановки контура.

`POST /bot/send` — отдельный внутренний выход для drip-сообщений; он требует
internal cron authorization и не является публичным send API.

## HEYS Start bot

Второй token обслуживает квиз «Твой тип срыва». Ответы фиксируются в funnel
events; после выбора заявки бот просит Telegram contact или номер телефона.
`createStartLeadFromContact` создаёт либо переиспользует активный lead,
связывает его с `week_request`, пишет lead funnel event и отправляет куратору
минимизированный handoff без телефона, имени и raw chat id.

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
- Client, Start и curator callback находятся в одном крупном handler и разделяют
  deployment: ошибка общей инициализации или релиза затрагивает три контура.

## Facts Table

| ID  | Утверждение                                                                                                  | Проверка                                                                                                                                                             | Статус                    |
| --- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------- |
| T1  | Mini App требует initData verify и прокидывает initData/bearer централизованно                               | `sed -n '1,75p' apps/tg-mini/src/App.tsx && sed -n '1,75p' apps/tg-mini/src/api/httpClient.ts`                                                                       | проверено 2026-07-17      |
| T2  | Ожидаемые Mini App endpoints встречаются только во frontend/docs                                             | `rg -n --glob '!**/node_modules/**' --glob '!**/dist/**' '/api/telegram/auth/verify                                                                                  | X-Telegram-Init-Data' .`  | проверено 2026-07-17                                                      |
| T3  | Mini App package не объявляет test script                                                                    | `cat apps/tg-mini/package.json`                                                                                                                                      | проверено 2026-07-17      |
| T4  | Gateway публикует bot/start-bot webhook, send и health routes                                                | `sed -n '390,430p' yandex-cloud-functions/api-gateway-spec.yaml`                                                                                                     | проверено 2026-07-17      |
| T5  | Client `/start` погашает UUID token через `claim_pin_token_chat`                                             | `sed -n '481,548p' yandex-cloud-functions/heys-bot-client/index.js`                                                                                                  | проверено 2026-07-17      |
| T6  | Client имеет отдельный poll, а Start timer под одним lease опрашивает Start и curator tokens с offset commit | `rg -n 'handleStartBotPoll                                                                                                                                           | runStartBotPoll           | runCuratorBotPoll                                                         | offset: lastUpdateId' yandex-cloud-functions/heys-bot-client/index.js` | проверено 2026-07-18 |
| T7  | Webhook paths требуют отдельные secret checks                                                                | `rg -n 'verifyWebhookSecret                                                                                                                                          | HEYS_START_WEBHOOK_SECRET | TELEGRAM_WEBHOOK_SECRET' yandex-cloud-functions/heys-bot-client/index.js` | перепроверено 2026-07-18                                               |
| T8  | Start contact создаёт lead и минимизированный handoff                                                        | `rg -n 'createStartLeadFromContact                                                                                                                                   | sendStartLeadHandoff      | record_funnel_event' yandex-cloud-functions/heys-bot-client/index.js`     | перепроверено 2026-07-18                                               |
| T9  | Bot tests покрывают webhook/polling/CRM и curator callback contract                                          | `node --test yandex-cloud-functions/heys-bot-client/__tests__/start-lead-crm.test.cjs yandex-cloud-functions/heys-bot-client/__tests__/lead-taken-callback.test.cjs` | 23/23 пройдено 2026-07-18 |
| T10 | Ops checker ожидает оба минутных polling trigger                                                             | `sed -n '20,28p' yandex-cloud-functions/check-heys-ops-status.cjs`                                                                                                   | проверено 2026-07-17      |
