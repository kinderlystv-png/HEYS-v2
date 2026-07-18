# Лендинг и лиды

> **Статус:** source-контракты проверены 2026-07-18 **Охват:** формы заявки,
> согласия, gateway, сохранение и дедупликация, атрибуция, Telegram-уведомление
> и передача лида в curator flow **Production evidence:** leads function
> recovery wave 2 опубликована и прошла function health/общий canary<br> **Не
> подтверждено:** реальная заявка, доставка Telegram и Метрики, фактическая
> обработка заявки командой

## Роль системы

Лендинг собирает заявку и атрибуцию, но не создаёт пользователя HEYS. Серверный
контур лидов повторно валидирует критические поля, сохраняет заявку в
PostgreSQL, фиксирует funnel event и уведомляет операционный Telegram-чат.
Создание клиента происходит позже и отдельно — из curator trial queue через
`admin_convert_lead`.

```text
TrialForm / PurchaseModal
  → POST /leads
  → origin, size и honeypot checks
  → required fields + strict phone/email validation
  → consent и age checks
  → rate limit + deduplication
  → leads row + funnel event
  → Yandex Metrica Measurement Protocol (best effort)
  → Telegram notification without name/phone
  → curator trial queue
  → admin_convert_lead
  → client + one-time PIN/access data
```

## Владельцы ответственности

| Область                                   | Точка                                                          |
| ----------------------------------------- | -------------------------------------------------------------- |
| Основная форма пробного периода           | `apps/landing/src/components/TrialForm.tsx`                    |
| Форма прямой покупки                      | `apps/landing/src/components/modals/PurchaseModal.tsx`         |
| Версии юридических документов             | `apps/landing/src/config/legal-versions.ts`                    |
| Публичный endpoint                        | `yandex-cloud-functions/api-gateway-spec.yaml` → `/leads`      |
| Валидация, запись, атрибуция, уведомление | `yandex-cloud-functions/heys-api-leads/index.js`               |
| SQL-схема и эволюция лидов                | `database/` migrations                                         |
| Curator API лида                          | `apps/web/heys_trial_queue_v1.js`                              |
| Защищённый RPC allowlist/contract         | `yandex-cloud-functions/heys-api-rpc/index.js`                 |
| Финальная конвертация                     | актуальная SQL-функция `public.admin_convert_lead(UUID, UUID)` |

## Два входа с лендинга

`TrialForm` собирает имя, телефон, optional email, мессенджер, год рождения,
источник знакомства, promo/UTM/referrer, A/B variant и два независимых согласия:

- обязательное согласие на обработку ПДн с версиями документов, временем,
  способом и user agent;
- optional marketing consent, отсутствие которого передаётся как `null`.

Форма также требует 18+ до отправки. Yandex client id запрашивается только после
обязательного согласия.

`PurchaseModal` использует тот же endpoint, добавляя `intent=direct_purchase` и
название плана. Она передаёт обязательное согласие, но сейчас не передаёт
`birth_year` и отдельное marketing consent. Эти формы являются двумя ручными
реализациями одного wire contract, а не общей клиентской библиотекой.

## Серверная граница доверия

Backend не считает браузерную проверку достаточной. До работы с данными он:

1. разрешает только `POST` и известные browser origins; server-to-server без
   `Origin` допускается;
2. ограничивает body 64 KB;
3. тихо принимает honeypot-заявку, не сохраняя её;
4. требует name и messenger;
5. нормализует поддержанные российские варианты в `+7XXXXXXXXXX` и отклоняет
   остальные до подключения к БД;
6. проверяет корректность optional email;
7. требует consent object с `privacy_version` и `method`;
8. проверяет переданный `birth_year`, но пока допускает его отсутствие;
9. ограничивает число попыток с IP и журналирует их.

Согласие записывается вместе с версией политики, временем, методом и user agent.
Год рождения хранится вместо полной даты рождения. Marketing timestamp остаётся
`null`, если отдельного согласия нет.

## Дедупликация и побочные эффекты

Сначала функция ищет тот же телефон в скользящем 30-минутном окне. Дополнительно
partial unique index не позволяет параллельно создать второй активный лид со
статусом `new`, `contacted` или `trial_started`; race обрабатывается как
duplicate. Дубликат получает успешный ответ с существующим `id`, но повторные
funnel/Метрика/Telegram side effects не запускаются.

Для нового лида запись funnel event выполняется в том же DB connection flow.
Отправка события в Метрику и Telegram — best effort по смыслу отдельных функций,
но вызовы ожидаются до HTTP-ответа. Ошибка сети Telegram перехватывается; ответ
Telegram с `ok: false` только логируется. Ошибка создания funnel event,
напротив, поднимается в общий `500`, хотя строка лида уже могла быть вставлена:
явной общей транзакции вокруг этих действий нет.

## Telegram и curator flow

Telegram получает только `lead_id`, выбранный мессенджер, UTM source и признак
прямой покупки/тарифа — без имени и телефона. Полные ПДн остаются в PostgreSQL.

Уведомление содержит кнопку `lead_taken_<id>`. Тот же curator/support token
слушается внутри существующего `heys-start-bot-poll`: callback проверяет UUID,
chat и actor, затем атомарно переводит только `new → contacted`. Повторное или
конкурентное нажатие не создаёт вторую mutation. Bot API напрямую подтверждает
каждую ветку; исходное сообщение получает отметку actor/time только после
успешного update. Дальнейшая конвертация по-прежнему выполняется через curator
trial queue и защищённый `admin_convert_lead`.

## Инварианты

1. Публичная заявка не создаёт client account напрямую.
2. Обязательное согласие проверяется и браузером, и backend.
3. Marketing consent независим от согласия на обработку ПДн.
4. Телефон проходит строгую server-side проверку и нормализуется до
   дедупликации; invalid input не достигает БД.
5. Дубликат не создаёт повторные уведомления и funnel event.
6. ПДн лида не отправляются в Telegram-уведомлении.
7. Curator identity для `admin_convert_lead` берётся из защищённого RPC/JWT
   flow, а не считается доверенной из публичной формы.
8. Версии документов в payload должны исходить из landing legal config, а не из
   вручную набранной строки в компоненте.
9. Lead callback принимает private actor только при совпадении с настроенным
   chat; group chat требует явный `TELEGRAM_CURATOR_USER_IDS`.
10. Telegram message edit не должен предшествовать подтверждённой DB mutation.

## Подтверждённые слабые места и пробелы

- `TrialForm` и `PurchaseModal` дублируют URL, payload и consent wiring. Уже
  есть расхождение: PurchaseModal не передаёт `birth_year`, а backend временно
  разрешает legacy-заявки без него.
- `heys-api-leads/README.md` описывает только старое базовое тело запроса и не
  отражает обязательный consent, 18+, rate limit, active-lead unique guard и
  funnel attribution; использовать его как полный контракт нельзя.
- Для `heys-api-leads` появился focused phone-validation набор. Остальные
  критичные origin, consent, age, honeypot, rate-limit, race dedup и
  partial-failure ветки по-прежнему подтверждены чтением source, а не полным
  автоматическим contract suite.
- Insert лида и последующий `record_funnel_event` не обёрнуты одной явной
  транзакцией. При ошибке funnel RPC API может вернуть `500` после фактического
  сохранения лида; повтор пользователя затем станет duplicate.
- Телефонный контракт остаётся российским (`+7`): обе текущие формы и API README
  используют его. Международные номера потребуют отдельного продуктового
  решения, country selector и согласованного изменения frontend/backend wire
  contract.
- Function deployment и общий health/canary подтверждены recovery wave 2.
  Актуальные внешние доставки Telegram/Метрики и полный production lead flow без
  создания реальной заявки не доказаны.

## Facts Table

| ID  | Утверждение                                                                            | Проверка                                                                                                                                                                                                      | Статус                  |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| L1  | Обе landing-формы отправляют заявки в `/leads`, но payload различается                 | `rg -n -e 'api.heyslab.ru/leads' -e 'birth_year' -e 'intent:' -e 'marketing_accepted_at' apps/landing/src/components/TrialForm.tsx apps/landing/src/components/modals/PurchaseModal.tsx`                      | проверено 2026-07-17    |
| L2  | Gateway направляет `POST/OPTIONS /leads` в `heys-api-leads`                            | `sed -n '157,173p' yandex-cloud-functions/api-gateway-spec.yaml`                                                                                                                                              | проверено 2026-07-17    |
| L3  | Backend имеет origin/body/honeypot/consent/age checks                                  | `sed -n '240,420p' yandex-cloud-functions/heys-api-leads/index.js`                                                                                                                                            | проверено 2026-07-17    |
| L4  | Rate limit и оба механизма dedup находятся до side effects                             | `sed -n '430,575p' yandex-cloud-functions/heys-api-leads/index.js`                                                                                                                                            | проверено 2026-07-17    |
| L5  | Telegram payload минимизирован и содержит `lead_taken_` callback                       | `sed -n '85,133p' yandex-cloud-functions/heys-api-leads/index.js`                                                                                                                                             | проверено 2026-07-17    |
| L6  | `lead_taken_` создаётся leads API и обрабатывается curator poll path                   | `rg -n --glob '!docs/**' --glob '!apps/web/public/**' --glob '!node_modules/**' -e 'lead_taken_' -e 'handleCuratorLeadCallback' yandex-cloud-functions/heys-api-leads yandex-cloud-functions/heys-bot-client` | исправлено 2026-07-18   |
| L7  | Новый lead пишет funnel event, затем вызывает Метрику и Telegram                       | `sed -n '575,610p' yandex-cloud-functions/heys-api-leads/index.js`                                                                                                                                            | проверено 2026-07-17    |
| L8  | Curator UI конвертирует лид через `admin_convert_lead`                                 | `sed -n '1370,1400p' apps/web/heys_trial_queue_v1.js`                                                                                                                                                         | проверено 2026-07-17    |
| L9  | RPC contract требует UUID лида и curator identity                                      | `sed -n '4331,4345p' yandex-cloud-functions/heys-api-rpc/index.js`                                                                                                                                            | проверено 2026-07-17    |
| L10 | Phone gate покрывает границы, форматирование, ранний 400, canonical INSERT и dedup     | `node --test yandex-cloud-functions/heys-api-leads/__tests__/phone-validation.test.cjs`                                                                                                                       | 6/6 пройдено 2026-07-18 |
| L11 | Lead callback проверяет auth/UUID, атомарный claim, direct answer/edit и offset commit | `node --test yandex-cloud-functions/heys-bot-client/__tests__/lead-taken-callback.test.cjs`                                                                                                                   | 9/9 пройдено 2026-07-18 |
