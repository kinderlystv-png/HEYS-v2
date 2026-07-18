# Проверенный backlog улучшений HEYS

> **Статус:** проверено по source и тестам 2026-07-18 **Назначение:** очередь
> подтверждённых улучшений, а не третий слой справочника **Правило:** перед
> реализацией задачи её факты повторно сверяются с текущим кодом

Во время актуализации справочников новые несостыковки сразу добавляются сюда с
механизмом, последствием, доказательством и проверкой. На месте исправляется
только подтверждённая находка внутри текущего scope с соразмерным риском;
несвязанные находки сначала обсуждаются и приоритизируются, чтобы документация
не превращалась в бесконечный скрытый рефакторинг.

Этот файл собирает только проблемы с конкретным последствием или существенным
риском. Системные досье объясняют устройство проекта; backlog отвечает на другой
вопрос — что исправлять первым. Само наличие замечания в досье не считается
доказательством.

## Приоритеты

- **P0** — безопасность, потеря или смешение данных.
- **P1** — неверные расчёты и основной пользовательский сценарий.
- **P2** — надёжность, рассинхронизация, эксплуатация и критичный тестовый
  пробел.
- **P3** — поддерживаемость и документационный долг.

## P0

Активных P0 после проверки 2026-07-17 нет. Закрытые P0 и их обязательные
регрессии перечислены в разделе «Закрыто» ниже.

## P1

Активных P1 после проверки 2026-07-18 нет. P1-01…P1-05 перенесены в раздел
«Закрыто» и защищены регрессионными тестами.

## P2

### P2-02 — Automation functions выпадают из auto-deploy, регулярный health monitor выключен

- **Тип / система / вероятность:** эксплуатационный пробел; infra & background;
  высокая для изменения `heys-cron-*`, `heys-maintenance` или backup worker.
- **Последствие:** merge в `main` может не обновить worker, а production outage
  останется незамеченным до ручной проверки или следующего косвенного сигнала.
- **Доказательство:** workflow auto-deploy следит только за
  `yandex-cloud-functions/heys-api-*/**`; schedule health monitor
  закомментирован.
- **Минимальное исправление:** расширить classifier/deploy inventory на
  automation group и включить дешёвый внешний scheduled heartbeat/dead-man
  check.
- **Проверка:** workflow contract test на changed paths и controlled dry-run;
  искусственно stale heartbeat создаёт alert независимо от maintenance worker.

### P2-06 — Product overlay достиг whole-array KV ceiling

- **Тип / система / вероятность:** подтверждённый архитектурный риск; products &
  sync; возрастающая с размером личного каталога.
- **Последствие:** при HTTP 413 новая строка остаётся local queued, но следующий
  whole-array retry не может уменьшить payload; другое устройство её не увидит.
- **Доказательство:** commit отправляет весь `heys_products_overlay_v2`;
  отдельная ветка `cloud_save_queued_after_413` признаёт лимит, но не меняет
  формат хранения.
- **Минимальное исправление:** перейти на per-row/versioned mutations или
  chunked collection с manifest; миграция должна сохранить tombstones и
  rollback.
- **Проверка:** boundary test больше текущего лимита, multi-device
  add/update/delete, миграция и восстановление после частичной отправки.

### P2-07 — Planning не имеет атомарности между связанными сущностями

- **Тип / система / вероятность:** архитектурный риск; planning; средняя при
  offline/ошибке между несколькими writes.
- **Последствие:** task, slot, link и goal могут оказаться в разных revisions;
  merge защищает каждый key, но не бизнес-операцию целиком.
- **Доказательство:** сущности сохраняются разными KV arrays; snapshots
  replace-only, а общей transaction/revision envelope между ключами нет.
- **Минимальное исправление:** сначала определить 1–2 операции, где cross-key
  целостность обязательна, и дать им atomic command/envelope; не переписывать
  весь planning store без доказанного сценария.
- **Проверка:** fault-injection после каждого шага выбранной операции, повтор
  команды и merge с другого устройства сохраняют целостный invariant.

### P2-08 — Backup и restore не дают единой точки согласованности

- **Тип / система / вероятность:** архитектурный риск восстановления данных;
  backup & reports; низкая в обычный день, высокая по последствиям во время
  изменения account/subscription state или сбоя restore.
- **Последствие:** snapshot может соединить KV из одного DB snapshot и account
  tables из более позднего; при restore успешный KV transaction может остаться
  применённым, если следующий account transaction упадёт.
- **Доказательство:** KV и account snapshot выполняются двумя отдельными
  `REPEATABLE READ` transactions; restore сначала завершает `executeRestore`,
  затем отдельно запускает `executeAccountRestore`.
- **Минимальное исправление:** для полного snapshot использовать одну connection
  и одну read transaction; полный restore выполнять одной transaction либо явно
  поддерживать resumable manifest со статусом каждого scope.
- **Проверка:** concurrent mutation test подтверждает одну snapshot boundary;
  fault-injection между KV/account phases не оставляет неотмеченный partial
  restore, dry-run остаётся без mutation.

## P3

### P3-01 — Старые подробные справочники выглядят актуальнее, чем являются

- **Тип / система / вероятность:** документационный долг; analytics, insulin,
  curator и infra; высокая вероятность ввести агента в заблуждение.
- **Последствие:** агент берёт старый namespace, число факторов, формулу или
  ручной deployment flow и меняет не тот runtime path.
- **Доказательство:** например, `SCORING_REFERENCE.md` описывает 9 факторов и
  `HEYS.StatusScore`, тогда как source содержит 11 и `HEYS.Status`; аналогичные
  расхождения уже отмечены в системных досье.
- **Минимальное исправление:** не переписывать старые энциклопедии; добавить
  сверху единый статус `historical/source`, ссылку на актуальное досье и удалить
  только явно ложные operational instructions.
- **Проверка:** docs-link check и короткий lint, запрещающий использовать
  известные legacy namespaces/flows без historical marker.

## Критичные тестовые пробелы

Это не отдельные «задачи ради coverage», а обязательные проверки задач выше:

1. `product-commit-gate-contract.test.js` проверяет строки source; он не
   исполняет production 413 branch и не доказывает multi-device recovery.
2. Backup/restore не имеет fault-injection regression между KV и account phases.

## Закрыто

### 2026-07-18 — P2-01 Reminder delivery idempotency

Все 16 keyed reminder-сценариев используют общий delivery wrapper. Запись в
`push_idempotency` теперь различает пятиминутную аренду `claimed` и завершённую
доставку `delivered`: нулевая отправка или ошибка освобождает claim, а упавший
worker восстанавливается после lease. У scheduled-сценариев позднее окно
расширено до часа, поэтому следующий 15-минутный cron действительно может
повторить отправку. Успех хотя бы одного endpoint фиксирует общий ключ как
доставленный; при частичном успехе весь push не повторяется, чтобы не
дублировать уведомление уже получившим устройствам.

Схему добавляет
`scripts/db/migrations/2026-07-18_push_idempotency_delivery_state.sql`, а
rejected/zero/partial/repeat/parallel/expired-lease контракты фиксирует
`heys-cron-reminders/__tests__/push-idempotency.test.js`. Миграция применена в
managed PostgreSQL, а функция reminders опубликована и прошла post-deploy
health/canary в recovery wave 2.

### 2026-07-18 — P2-03 Subscription access-decision drift

`HEYS.Subscription.canWriteStatus(value)` теперь является единым pure-решением:
запись разрешена только для `trial|active`. `Subscription.canWrite`, metadata,
legacy `Subscriptions.canEdit`, async/sync Paywall и `useWriteAccess` используют
этот helper; отсутствующий модуль, unknown/malformed status и начальный loading
работают fail-closed. Девять прямых diary write handlers тоже блокируют действие
при отсутствующем Paywall, а day UI остаётся в readonly-состоянии до явного
`trial|active`.

Parameterized contract проверяет пять статусов и поддержанные формы payload,
ошибку refresh, отсутствие модуля и boot-order Paywall → Subscription. Серверный
KV-gate не менялся и остаётся независимой защитой. Контракт фиксирует
`subscription-curator-guard.test.js` — 24 теста.

### 2026-07-18 — P2-04 Telegram lead callback

Кнопку `lead_taken_<uuid>` по-прежнему создаёт `heys-api-leads` через
curator/support token. Существующий `heys-start-bot-poll` теперь под одним lease
параллельно читает Start и curator tokens, поэтому новый webhook и отдельный
timer не нужны. Curator callback разрешён только в настроенном private chat с
совпадающим actor id; group chat требует явный `TELEGRAM_CURATOR_USER_IDS`.

Переход `new → contacted` выполняется одним условным `UPDATE`: первое нажатие
меняет строку, повторное и конкурентное получают `already_claimed` без второй
mutation. Каждая ожидаемая ветка вызывает прямой `answerCallbackQuery`, а
`editMessageText` с actor/time выполняется только после подтверждённого update.
Контракт фиксируют 9 тестов `lead-taken-callback.test.cjs`; 14 существующих bot
tests также проходят. Функция опубликована в recovery wave 2; cloud heartbeat
polling-worker был актуальным после deploy. Реальное нажатие callback в
production-чате не выполнялось, поэтому это остаётся отдельным runtime evidence.

### 2026-07-18 — P2-05 Leads phone validation

`heys-api-leads` теперь принимает только поддержанный текущими landing-формами
российский контракт: 10 локальных цифр либо 11 цифр с префиксом `7/8`.
Допустимое форматирование нормализуется в `+7XXXXXXXXXX`; пустые, короткие,
длинные, буквенные, malformed и неподдержанные международные значения получают
понятный `400` до rate-limit, подключения к БД и иных side effects.

Каноническое значение без изменений используется в 30-минутной дедупликации,
partial unique guard и `INSERT`. Контракт фиксируют 6 тестов
`phone-validation.test.cjs`, включая границы, форматирование, отсутствие DB
вызовов для invalid input, нормализованный insert и duplicate path. Функция
опубликована в recovery wave 2 и прошла function health/canary; landing и схема
БД не менялись, реальная production-заявка намеренно не создавалась.

### 2026-07-17 — P0-01 Mobility fail-open onboarding

Defaults теперь сохраняют неизвестный возраст и непринятое предупреждение;
onboarding, public builders и UI блокируют построение и запуск сессии до двух
явных ответов. Контракт фиксируют `mobility-assessment-readiness.test.js`,
`mobility-entry.test.js` и `mobility-ui.test.js`.

### 2026-07-17 — P0-02 Gamification stale cloud overwrite

Ошибка cloud precheck теперь запрещает запись. После успешного чтения
`heys_game` сохраняется через server merge-save под row lock; более старая
semantic revision возвращает `stale_write_blocked` и не запускает retry-loop.
Контракт фиксируют `gamification-cloud-sync-guard.test.js` и
`merge-scalar-kv-meta.test.js`.

### 2026-07-18 — P1-01…P1-04 расчётные и product-source контракты

- Predictive history переводит подтверждённые `dayScoreRaw/dayScore` 1–10 в
  единую выходную шкалу 0–100 и не угадывает семантику значений вне контракта.
- Status выбирает позднейшее валидное время одним pure helper для score/details;
  результат не зависит от порядка `meals`.
- `HEYS.models.normalizeItemGrams` задаёт общую политику: missing/invalid →
  legacy default, числовые строки и числа ≥0 сохраняются, включая `0`.
  Канонический insulin path, fallback и подтверждённые аналитические readers
  используют этот helper.
- Type A без полноценного shared nutrient source остаётся видимым disabled
  placeholder; тот же resolver блокирует meal gate. После refresh строка
  разрешается из shared base без дубля.

Контракты фиксируют `predictive-score-history-scale.test.js`,
`status-latest-meal-time.test.js`, `item-grams-zero-contract.test.js`,
`overlay-cloud-snapshot-suppress.test.js` и
`product-commit-gate-contract.test.js`.

### 2026-07-18 — P1-05 Mobility partial-save orchestration

Mobility сохраняет domain record и diary через один orchestration result со
состояниями `saved_both / diary_pending / failed`. `TrainingStep.saveMobility`
возвращает проверяемый результат с readback дневника, а history write использует
стабильный idempotency key. При отказе одного из каналов UI не показывает успех
и сохраняет точные данные попытки для повтора; повтор не создаёт второй record.
После записи `recordsView` обновляет consumers прогрессии и календаря из того же
client-scoped store.

Fault injection и восстановление покрыты `mobility-ui.test.js`, идемпотентность
records — `mobility-records-progression.test.js`, результат diary write —
`training-step-drums-tab.test.js`, отказ локального storage —
`storage-layer.test.js`.

## Не включено как подтверждённая проблема

| Наблюдение                                   | Решение аудита                                                                                                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Absolute URL в mobile `getInitialWebUrl()`   | Не дефект активного WebView: `decideNavigation` подключён через `onShouldStartLoadWithRequest`, unsafe/external URL покрыты unit test. Остаётся важным контрактом caller. |
| Client Paywall позволяет запись без подписки | Не server bypass: RPC повторно вычисляет effective subscription и блокирует substantive KV writes. В backlog оставлено только рассогласование UI.                         |
| Optional HMAC payment webhook                | Source-риск смягчён обязательным IP allowlist. Без проверки production secret и доверенности source IP нельзя честно повышать до подтверждённой уязвимости.               |
| Payment routes и Telegram Mini App           | Состояние live wiring не подтверждено; до runtime/конфигурационной проверки это гипотезы, а не дефекты продукта.                                                          |
| Большие legacy-файлы и дублирование вообще   | Это контекст поддерживаемости, но не backlog без конкретного механизма ущерба.                                                                                            |

## Рекомендуемый порядок исправлений

1. P2-02 и P2-08 — закрыть operational blind spot и целостность recovery.
2. P2-06/P2-07 — только после этого планировать более крупные изменения
   хранения.
3. P3-01 — маркировать старые документы параллельно затронутым исправлениям, без
   массового переписывания.

## Facts Table

| ID  | Проверенный факт                                                                                       | Как перепроверить                                                                                                                                                                                                                                                                                                                                                                                                                           | Результат на 2026-07-17                                              |
| --- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| F01 | Mobility defaults не принимают disclaimer и не выдумывают возраст                                      | `rg -n -e 'DEFAULT_PROFILE' -e 'acceptedDisclaimer' -e 'age_missing' apps/web/mobility/heys_mobility_entry_v1.js apps/web/mobility/heys_mobility_ui_v1.js apps/web/mobility/heys_mobility_onboarding_v1.js`                                                                                                                                                                                                                                 | исправлено; builders и UI fail-closed                                |
| F02 | Game upload блокируется после failed precheck                                                          | `rg -n -e 'cloud_precheck:failed_blocked' -e 'mergeSaveKV' apps/web/heys_gamification_v1.js`                                                                                                                                                                                                                                                                                                                                                | исправлено; прямого upsert в syncToCloud нет                         |
| F03 | Game merge-save блокирует stale semantic revision                                                      | `rg -n -e 'mergeScalarKvWithOutcome' -e 'stale_write_blocked' yandex-cloud-functions/heys-api-rpc/index.js yandex-cloud-functions/heys-api-rpc/lib/heys_sync_merge_v1.cjs`                                                                                                                                                                                                                                                                  | исправлено; row-lock + явный outcome                                 |
| F04 | Score history имеет единый контракт 0–100                                                              | `rg -n -e 'getStoredScore100' -e 'buildScoreHistory' apps/web/heys_predictive_insights_v1.js && pnpm vitest run apps/web/__tests__/predictive-score-history-scale.test.js`                                                                                                                                                                                                                                                                  | исправлено и покрыто 2026-07-18                                      |
| F05 | Status timing не зависит от порядка meals                                                              | `rg -n 'getLatestValidMeal' apps/web/heys_status_v1.js && pnpm vitest run apps/web/__tests__/status-latest-meal-time.test.js`                                                                                                                                                                                                                                                                                                               | исправлено и покрыто 2026-07-18                                      |
| F06 | Расчётные readers сохраняют явный `grams: 0`                                                           | `rg -n 'normalizeItemGrams' apps/web/heys_models_v1.js apps/web/heys_iw_calc.js apps/web/heys_iw_constants.js apps/web/heys_day_insulin_wave_data_v1.js apps/web/heys_day_stats_vm_v1.js && pnpm vitest run apps/web/__tests__/item-grams-zero-contract.test.js`                                                                                                                                                                            | исправлено и покрыто 2026-07-18                                      |
| F07 | Missing shared base даёт disabled placeholder и meal-gate block                                        | `rg -n -e 'shared_nutrients_pending' -e 'resolveMealProduct' -e '_nutrientsPending' apps/web/heys_products_overlay_v1.js apps/web/heys_core_v12.js apps/web/heys_add_product_step_v1.js && pnpm vitest run apps/web/__tests__/overlay-cloud-snapshot-suppress.test.js apps/web/__tests__/product-commit-gate-contract.test.js`                                                                                                              | исправлено и покрыто 2026-07-18                                      |
| F08 | Mobility возвращает явный pair-result и повторяет partial save без дубля                               | `rg -n -e 'persistMobilitySessionPair' -e 'saved_both' -e 'diary_pending' -e 'idempotencyKey' apps/web/mobility/heys_mobility_ui_v1.js apps/web/mobility/heys_mobility_records_store_v1.js apps/web/heys_training_step_v1.js && pnpm vitest run apps/web/__tests__/mobility-ui.test.js apps/web/__tests__/mobility-records-progression.test.js apps/web/__tests__/training-step-drums-tab.test.js apps/web/__tests__/storage-layer.test.js` | исправлено и покрыто 2026-07-18                                      |
| F09 | Keyed reminders используют lease и фиксируют только успешную доставку                                  | `rg -n -e 'deliverIdempotently' -e 'isInReminderDeliveryWindow' yandex-cloud-functions/heys-cron-reminders/index.js yandex-cloud-functions/heys-cron-reminders/push-idempotency.js && node --test yandex-cloud-functions/heys-cron-reminders/__tests__/push-idempotency.test.js`                                                                                                                                                            | исправлено во всех 16 keyed scenarios; 11 тестов пройдено 2026-07-18 |
| F10 | Auto-deploy path не включает automation functions                                                      | `sed -n '1,35p' .github/workflows/cloud-functions-deploy.yml`                                                                                                                                                                                                                                                                                                                                                                               | подтверждено                                                         |
| F11 | Scheduled health monitor выключен                                                                      | `sed -n '1,25p' .github/workflows/api-health-monitor.yml`                                                                                                                                                                                                                                                                                                                                                                                   | подтверждено                                                         |
| F12 | Subscription/Paywall, legacy Subscriptions и diary consumers используют один fail-closed access helper | `rg -n -e 'canWriteStatus' -e 'useState\(false\)' -e 'Paywall\?\.canWriteSync' apps/web/heys_subscription_v1.js apps/web/heys_subscriptions_v1.js apps/web/heys_paywall_v1.js apps/web/heys_day_day_handlers.js apps/web/day/_meals.js apps/web/heys_day_tab_render_v1.js && pnpm vitest run apps/web/__tests__/subscription-curator-guard.test.js --no-coverage && sed -n '105,150p' yandex-cloud-functions/heys-api-rpc/index.js`         | исправлено; client 24/24, server gate остаётся строгим 2026-07-18    |
| F13 | `lead_taken_*` обрабатывается авторизованно и идемпотентно через существующий Start poll               | `rg -n -e 'lead_taken_' -e 'claimLeadForCurator' -e 'runCuratorBotPoll' yandex-cloud-functions/heys-api-leads/index.js yandex-cloud-functions/heys-bot-client/index.js && node --test yandex-cloud-functions/heys-bot-client/__tests__/lead-taken-callback.test.cjs`                                                                                                                                                                        | исправлено; 9/9 тестов пройдено 2026-07-18                           |
| F14 | Leads API строго нормализует и валидирует телефон до DB, сохраняя canonical dedup key                  | `sed -n '30,48p;325,355p;468,525p' yandex-cloud-functions/heys-api-leads/index.js && node --test yandex-cloud-functions/heys-api-leads/__tests__/phone-validation.test.cjs`                                                                                                                                                                                                                                                                 | исправлено; 6/6 тестов пройдено 2026-07-18                           |
| F15 | Overlay whole-array write имеет 413 queued branch                                                      | `sed -n '4795,4835p' apps/web/heys_core_v12.js`                                                                                                                                                                                                                                                                                                                                                                                             | подтверждено                                                         |
| F16 | Planning хранит связанные collections разными keys                                                     | `sed -n '1,75p' apps/web/heys_planning_store_v1.js`                                                                                                                                                                                                                                                                                                                                                                                         | подтверждено                                                         |
| F17 | Mobile external navigation реально guarded и протестирована                                            | `sed -n '1,70p' apps/mobile/src/features/webview/navigation-policy.ts && sed -n '115,130p' apps/mobile/app/web/index.tsx && sed -n '40,65p' apps/mobile/src/features/webview/__tests__/navigation-session.test.ts`                                                                                                                                                                                                                          | прежнее подозрение снято                                             |
| F18 | Server subscription gate блокирует всё кроме trial/active                                              | `sed -n '105,150p' yandex-cloud-functions/heys-api-rpc/index.js`                                                                                                                                                                                                                                                                                                                                                                            | client fail-open не является server bypass                           |
| F19 | Опорные mobile/subscription/mobility/overlay tests проходят                                            | `pnpm vitest run apps/mobile/src/features/webview/__tests__/navigation-session.test.ts apps/mobile/src/features/session/__tests__/storage.test.ts apps/mobile/src/features/deeplink/__tests__/routes.test.ts apps/web/__tests__/subscription-curator-guard.test.js apps/web/__tests__/mobility-entry.test.js apps/web/__tests__/overlay-cloud-snapshot-suppress.test.js --no-coverage`                                                      | 6 файлов, 28 тестов пройдено                                         |
| F20 | Backup и restore разделяют KV и account transactions                                                   | `sed -n '185,290p' yandex-cloud-functions/heys-client-daily-backup/index.js && sed -n '690,725p' yandex-cloud-functions/heys-client-daily-backup/restore-client-backup.js`                                                                                                                                                                                                                                                                  | подтверждено                                                         |
