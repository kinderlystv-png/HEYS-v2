# Фоновые задачи и обслуживание

> **Статус:** source-контракты проверены 2026-07-18<br> **Охват:** timer
> routing, maintenance, reminders, trial drip, security alerts, backup, photo
> cleanup, SpeechKit worker и operational checker<br> **Не подтверждено:**
> фактическое состояние YC triggers/functions, последние heartbeat и доставка
> внешних уведомлений

## Роль системы

Фоновые процессы HEYS — не один cron, а несколько независимых worker-функций.
Они обслуживают trial, push и Telegram, чистят данные, создают резервные копии,
проверяют защитные инварианты и завершают асинхронную транскрибацию.

```text
YC timer triggers
  ├─ heys-maintenance → queue, cleanup, integrity, reports, heartbeat watcher
  ├─ heys-cron-reminders → client/curator web push
  ├─ heys-cron-trial-drip → expiry + Telegram stages
  ├─ heys-cron-security-alerts → security/ops rules + Telegram
  ├─ heys-client-daily-backup → PostgreSQL snapshots → Object Storage
  ├─ heys-cron-photo-cleanup → orphan S3 prefixes
  ├─ heys-cron-speechkit-transcribe → queued/processing jobs
  └─ heys-bot-client → two long-poll workers (см. TELEGRAM.md)

check-heys-ops-status.cjs
  → проверяет ожидаемые functions/triggers/secrets и делает canary invokes
```

## Основные владельцы

| Контур                    | Источник истины / side effect                     | Реализация                                |
| ------------------------- | ------------------------------------------------- | ----------------------------------------- |
| Maintenance               | PostgreSQL + Telegram alerts                      | `heys-maintenance/index.js`               |
| Напоминания               | KV/subscription prefs + Web Push                  | `heys-cron-reminders/index.js`            |
| Trial drip                | subscription SQL functions + client Telegram bot  | `heys-cron-trial-drip/index.js`           |
| Security alerts           | audit/ops tables, YC logs + Telegram              | `heys-cron-security-alerts/index.js`      |
| Backup                    | PostgreSQL → `heys-backups` Object Storage        | `heys-client-daily-backup/index.js`       |
| Photo cleanup             | `clients` table vs photo bucket                   | `heys-cron-photo-cleanup/index.js`        |
| Speech transcription      | `message_transcription_jobs` + message attachment | `heys-cron-speechkit-transcribe/index.js` |
| Expected runtime topology | declarative checker expectations                  | `check-heys-ops-status.cjs`               |

## Maintenance router

`heys-maintenance` выбирает задачу по JSON payload timer trigger. Он намеренно
не доверяет автоматически созданному YC `details.trigger_id`, похожему на ID
триггера. Без явного task name используется `default`.

Режимы:

- `trial_queue` — обрабатывает очередь пробного периода;
- `daily_cleanup` — TTL-cleanup и проверки защитных/data-integrity контрактов;
- `kv_health` и `kv_cleanup` — диагностика и отдельно разрешаемая очистка;
- `daily_report` / `weekly_report` — операционные отчёты;
- `ops_canary` — короткая DB/heartbeat проверка;
- `all` — совмещённый ручной проход.

Destructive KV cleanup не входит в `default`; он запускается только явно или
через `all`. Тяжёлые проверки memoized только внутри одного invocation. Успешные
задачи ставят heartbeat. В конце обычного прохода maintenance сверяет остальные
heartbeat и синхронизирует backup marker. Это dead-man watcher внутри того же
контура, поэтому полное падение самой функции требует внешнего checker.
Handler-level ошибка возвращает `500` и best-effort отправляет Telegram alert.

## Напоминания и сообщения

Reminder worker каждые 15 минут последовательно выполняет набор client/curator
push-сценариев. Он учитывает MSK, пользовательские preferences и quiet hours,
читает день/norms из KV и чистит push endpoints после HTTP 404/410.

Все keyed-сценарии отправляют push через `deliverIdempotently`. Запись в
`push_idempotency` сначала получает состояние `claimed`, уникальный token и
пятиминутный lease. После хотя бы одной успешной отправки состояние меняется на
`delivered`; нулевая отправка или ошибка удаляет принадлежащий worker claim, а
после аварийного завершения lease позволяет следующему cron забрать попытку. Для
scheduled-сценариев ранняя граница осталась 7 минут, а поздняя расширена до 60
минут: при timer cadence 15 минут это оставляет несколько реальных retry слотов
без дублей после успеха.

Ключ относится ко всему логическому уведомлению, а не к отдельному устройству.
Поэтому частичный успех считается доставкой и не повторяется: это не даёт дубль
на уже успешном endpoint, но отдельно не досылает уведомление на временно
недоступное второе устройство.

Worker ловит общую ошибку, записывает её в `stats`, но всё равно возвращает
HTTP 200. Поэтому здоровье timer нельзя выводить только из кода ответа.

Trial drip ежедневно сначала best-effort вызывает `check_expired_subscriptions`,
затем получает SQL targets. Для каждого stage он отправляет обезличенное
сообщение через защищённый `/bot/send` и только после успеха вызывает
`mark_drip_sent`. Ошибка одного клиента не останавливает batch; итог также
возвращается с HTTP 200 и счётчиком errors.

## Асинхронные worker-контуры

SpeechKit worker имеет DB-backed очередь. Claim queued jobs делегирован SQL
function; polling уже запущенных operations арендует строки через
`FOR UPDATE SKIP LOCKED`. Зависшие jobs без operation id возвращаются в queue
или становятся failed после лимита попыток; слишком старые processing jobs
завершаются ошибкой. Результат записывается в attachment через серверную SQL
функцию, а не напрямую в клиентский KV.

Backup делает для каждого клиента repeatable-read snapshot KV и отдельный
repeatable-read snapshot account tables, затем gzip + checksum и upload в Object
Storage. Ошибка одного клиента не останавливает остальных. Эти две транзакции не
образуют единый моментальный snapshot — этот контракт подробнее описан в
`BACKUP_AND_REPORTS.md`.

Photo cleanup сравнивает UUID prefixes bucket с таблицей `clients`. По умолчанию
он dry-run; реальное удаление требует `DRY_RUN=0`, повторного обнаружения orphan
через soft-grace и ограничено hard cap за запуск. Результат сохраняется в
`photo_cleanup_log`.

## Наблюдаемость

`check-heys-ops-status.cjs` хранит ожидаемый список критичных functions,
расписаний, payload markers и Lockbox keys. В strict/automation mode он может
сопоставить текущий YC state и сделать короткие canary invocations. Это более
сильное доказательство deployment wiring, чем README, но в этом проходе checker
не запускался: документ подтверждает source expectation, не live state.

Security alerts раз в 15 минут выполняют независимые правила. Ошибка одного
правила становится `query_error`, не прерывая остальные; Telegram имеет
cooldown, а результат попытки фиксируется в БД. HTTP 200 означает завершение
сканирования, а не отсутствие `query_error`/`logged_only` внутри results.

## Инварианты

1. Timer payload однозначно выбирает задачу; YC trigger UUID не считается task.
2. Destructive cleanup не запускается неявным default route.
3. Идемпотентность сообщений хранится в БД, а не в serverless memory.
4. Reminder `delivered` фиксируется только после хотя бы одной успешной
   отправки; failed/zero-send остаётся retryable.
5. Старый worker не может снять более новый reminder claim: release сверяет
   уникальный lease token.
6. Drip stage помечается отправленным только после успешного `/bot/send`.
7. Параллельные transcription workers не должны обрабатывать одну operation
   одновременно.
8. Ошибка одного backup/client/drip item не останавливает весь batch.
9. Photo deletion требует явного opt-in и двух проходов через soft-grace.
10. HTTP 200 фонового worker не всегда означает отсутствие внутренних ошибок;
    нужно читать structured result/heartbeat.
11. Source schedule — ожидание; реальное расписание доказывается только YC
    state.

## Подтверждённые слабые места и пробелы

- У большинства worker-функций нет собственных end-to-end/contract tests.
  Reminder delivery state теперь покрыт отдельными contract tests, но нет
  автоматического покрытия timer routing, backup, cleanup и security rules.
- Web Push не поддерживает общий transactional commit с PostgreSQL: если push
  уже принят внешним сервисом, а запись `delivered` затем упала, после lease
  возможен повтор. Полностью исключить этот узкий дубль без provider-level
  idempotency невозможно.
- Reminders и trial drip возвращают 200 при внутренних ошибках. Trigger health,
  основанный только на HTTP status, даёт false green.
- Dead-man watcher живёт внутри `heys-maintenance`; полное отсутствие всех её
  запусков обнаруживается только внешним ops-check/отдельным alert контуром.
- Backup KV и account snapshots делаются в разных транзакциях и могут отражать
  немного разные состояния клиента.
- Photo cleanup safety зависит от production `DRY_RUN` и истории
  `photo_cleanup_log`; source не доказывает, включено ли реальное удаление.
- Ops checker перечисляет не все известные workers: SpeechKit trigger создаётся
  deployment script, но отсутствует в его `FUNCTIONS/TRIGGERS` ожиданиях. Значит
  общий strict status не доказывает его живость.
- Для reminders и bot polling recovery wave 2 проверил post-deploy health,
  актуальный heartbeat и общий canary. Остальные расписания и worker heartbeat
  этим проходом повторно не проверялись.

## Facts Table

| ID  | Утверждение                                                                            | Проверка                                                                                                                                                                                                             | Статус                                    |
| --- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| B1  | Ops checker задаёт critical functions и timer expectations                             | `sed -n '10,70p' yandex-cloud-functions/check-heys-ops-status.cjs`                                                                                                                                                   | проверено 2026-07-17                      |
| B2  | Maintenance безопасно разрешает trigger id и отделяет destructive cleanup              | `sed -n '1410,1515p' yandex-cloud-functions/heys-maintenance/index.js`                                                                                                                                               | проверено 2026-07-17                      |
| B3  | Maintenance пишет heartbeat и возвращает 500 при handler failure                       | `rg -n -e 'recordHeartbeat' -e 'statusCode: 500' yandex-cloud-functions/heys-maintenance/index.js`                                                                                                                   | проверено 2026-07-17                      |
| B4  | Reminder delivery использует claimed lease, delivered commit и retry failed/zero-send  | `sed -n '1,120p' yandex-cloud-functions/heys-cron-reminders/push-idempotency.js && node --test yandex-cloud-functions/heys-cron-reminders/__tests__/push-idempotency.test.js`                                        | исправлено; 11 тестов пройдено 2026-07-18 |
| B5  | Reminder handler ловит общую ошибку и возвращает 200 со stats                          | `sed -n '1190,1245p' yandex-cloud-functions/heys-cron-reminders/index.js`                                                                                                                                            | проверено 2026-07-17                      |
| B6  | Trial drip отмечает stage только после успешного send и продолжает batch               | `sed -n '100,185p' yandex-cloud-functions/heys-cron-trial-drip/index.js`                                                                                                                                             | проверено 2026-07-17                      |
| B7  | Transcription polling использует row lease и stale recovery                            | `sed -n '275,345p' yandex-cloud-functions/heys-cron-speechkit-transcribe/index.js`                                                                                                                                   | проверено 2026-07-17                      |
| B8  | Backup использует два отдельных repeatable-read snapshots                              | `rg -n -e 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ' -e 'snapshotClientAccount' yandex-cloud-functions/heys-client-daily-backup/index.js`                                                                   | проверено 2026-07-17                      |
| B9  | Photo cleanup default dry-run, soft-grace и hard cap                                   | `sed -n '1,55p' yandex-cloud-functions/heys-cron-photo-cleanup/index.js`                                                                                                                                             | проверено 2026-07-17                      |
| B10 | Security rules изолируют query failures и возвращают structured results                | `sed -n '389,470p' yandex-cloud-functions/heys-cron-security-alerts/index.js`                                                                                                                                        | проверено 2026-07-17                      |
| B11 | Reminder delivery state имеет отдельные contract tests; прочие workers покрыты точечно | `find yandex-cloud-functions -path '*/__tests__/*' -type f \( -path '*maintenance*' -o -path '*reminder*' -o -path '*drip*' -o -path '*cleanup*' -o -path '*speech*' -o -path '*backup*' -o -path '*ops*' \) -print` | проверено 2026-07-18                      |
| B12 | SpeechKit trigger создаётся deploy script, но не включён в ops checker list            | `rg -n 'speechkit' yandex-cloud-functions/deploy-all.sh; test -z "$(rg 'speechkit' yandex-cloud-functions/check-heys-ops-status.cjs)"`                                                                               | проверено 2026-07-17: второй поиск пуст   |
