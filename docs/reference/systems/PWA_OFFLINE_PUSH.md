# PWA, offline, Service Worker и Web Push

> **Статус:** core-контракты проверены 2026-08-15<br> **Охват:** SW
> registration/update, cache routing, offline banner, background sync bridge,
> push subscribe/delivery/click и server identity<br> **Не подтверждено:**
> фактическая browser compatibility по устройствам, production VAPID/env и
> delivery rate

## Граница системы

В контуре три владельца:

- `HEYS.PlatformAPIs` регистрирует SW и управляет update lifecycle;
- `public/sw.js` владеет network/cache routing и background events;
- `HEYS.push` + `heys-api-push` владеют Web Push subscription и preferences.

`HEYS.PWA` — тонкий compatibility facade над update helpers, а не отдельный
service-worker engine.

Установленная PWA фиксируется в `portrait-primary` через web manifest;
`HEYS.PlatformAPIs` дополнительно применяет runtime-lock при запуске, первом
жесте пользователя и возврате из фона там, где браузер поддерживает lock. На
iPhone бесполезный runtime-запрос не выполняется: в landscape телефон получает
полноэкранную плашку с просьбой вернуться в portrait, которая автоматически
исчезает после поворота. Обычная вкладка на остальных устройствах ориентацию не
блокирует.

## Service Worker lifecycle

1. `registerServiceWorker()` не регистрирует SW на localhost и в demo mode;
   существующие registrations там удаляются.
2. В production `/sw.js` регистрируется только после завершения postboot, чтобы
   активация worker не обрывала стартовые lazy bundle-запросы. Registration
   сохраняется, подключаются update/message/controller listeners.
3. `updatefound` показывает update flow только при существующем
   controller/active worker; первая установка не считается обновлением.
4. Update lock, state machine и fallback timers защищают от параллельных reload.
5. Install handler не вызывает `skipWaiting` сам: обновление активируется только
   явным page-side update lifecycle. `controllerchange` перезагружает страницу,
   только если есть pending/lock/non-idle update state; незапрошенная смена
   controller во время boot не прерывает текущую страницу.
6. Каждая попытка применить обновление (`triggerSkipWaiting`) считается в
   `heys_update_recovery` по версии, с которой уходим. На старте
   `runUpdateRecoveryCheck()` сверяет: версия сменилась — счётчик очищается; не
   сменилась после `MAX_UPDATE_ATTEMPTS` — показывается ручной prompt «Требуется
   обновление», но только если `build-meta.json` подтверждает более новую сборку
   (пересборка `sw.js` без релиза и офлайн не дают ложной тревоги). «Позже»
   глушит prompt на 6 часов, ручная перезагрузка — на 5 минут без сброса
   счётчика; ключ переживает чистку сессии при обновлении.
7. Online/offline events управляют системным banner; данные при offline
   продолжают писаться local-first через общий storage/sync слой.
8. `What's New` временно полностью выключен центральным
   `HEYS.ReleaseFeatures.whatsNewEnabled = false`: нет fetch, retry-таймеров,
   модалки и изменения seen-state. Реализация и история сохранены.
9. Подтверждение модалки правок куратора сначала попадает в browser-global
   runtime/local/session очередь, затем отправляется на сервер по entry id.
   Pending entry id скрывается из повторного ответа до успешного ack, поэтому
   отказ browser storage или временная ошибка RPC не открывает модалку по кругу.
   Перед показом meal-actions сверяются с синхронизированным днём: уже удалённые
   клиентом приёмы и продукты скрываются только при явном `deletedMealIds` /
   `deletedItemIds` tombstone. Простое отсутствие записи в ещё старой локальной
   копии не считается удалением и не вызывает auto-ack. Возврат вкладки/PWA в
   foreground и повторный PIN-вход перечитывают changelog и открывают найденные
   правки сразу, не ожидая 30-минутное live-окно.

## Cache routing

| Запрос                            | Стратегия                                          |
| --------------------------------- | -------------------------------------------------- |
| `build-meta.json`, `version.json` | network/no-store                                   |
| versioned legal Markdown          | network-first/no-store + обязательный precache     |
| auth/payments/sms/leads API       | network no-store                                   |
| RPC                               | network-first                                      |
| GET client KV                     | stale-while-revalidate со специальной инвалидацией |
| HTML                              | network-first/no-store                             |
| hash bundle                       | cache-first                                        |
| прочий JS                         | stale-while-revalidate                             |
| CDN/static assets                 | cache-first или профильная static strategy         |

KV SWR cache требует client isolation. При curator switch страница отправляет
`CLIENT_SWITCH`/`CLEAR_API_KV`, а SW инвалидирует cache до загрузки нового
клиента. Этот контракт связан с `cloud.switchClient` и не должен меняться
изолированно.

## Background sync

Browser page регистрирует tag `heys-sync`. SW при событии не хранит собственную
durable data queue: он посылает открытым client windows `SYNC_START`, ждёт одну
секунду и затем посылает `SYNC_COMPLETE`. Page-side `SYNC_START` вызывает cloud
sync, если приложение открыто.

Client observability фиксирует один набор событий на реальный цикл, а не на
каждый ключ: `sync_cycle_started/completed/failed`, `sync_recovered` и
`write_queued/uploaded/failed`. Контекст содержит только агрегаты (`count`,
`queue_size`), безопасные `key_group`/`key_family`, непрозрачный стабильный
`key_id` и нормализованный `error_code`; в `event_context` не уходят raw storage
keys, browser-supplied client ID и значения дневника (identity строки отдельно
резолвится сервером). Для частично неуспешного batch контекст ошибки строится
только по элементам, которые сервер не сохранил.

Structured boot-события не отправляются до появления client context, а REST не
принимает их под anonymous identity. `abandoned` требует явного `boot_started`
без последующего `boot_ready`; отдельное sync/write-событие не считается сбоем
загрузки. `app_shell_ready` отмечает только готовность каркаса, а канонический
`boot_id` остаётся идентификатором загрузки страницы. Каждый cold start, явный
повторный вход/открытие клиента и возврат PWA из фона получает отдельный
`visit_id`; первичная anonymous→client активация cold start не дробится. Resume
фиксирует время в фоне, безопасное состояние авторизации и sync, а дальнейшие
sync/write-события относятся к этому посещению. `boot_ready` приходит из Day tab
после снятия sync gate. Известные отклонения EWS и первого sync batch
сохраняются как warning, но получают безопасные структурированные причины и
числовой контекст; build определяется и по `boot-app.bundle.<hash>.js`, включая
повторное определение после раннего старта логгера. После PIN-входа или
восстановления PIN-cookie приложение отправляет `heys:client-changed` и
немедленно flush'ит сохранённые `visit_started` и `boot_started`, не ожидая
периодического интервала.

Повторный `heys:client-changed` для того же клиента и посещения не дублирует
`client_context_ready`. Phase A фиксируется отдельно от полной синхронизации;
hot/error/повторные `heysSyncCompleted` не объявляют initial sync готовым.

Для returning session React mount больше не уничтожает последний видимый знак
ожидания без замены: boot visual guard держит `data-heys-boot-mark` отдельным
слоем до подтверждённого двойным `requestAnimationFrame` paint видимого
Day/active-tab контента или автоматически открытой hunger/check-in модалки.
Route-level `subscription-loading` несёт метку кадра, но считается transient:
ожидание subscription RPC не снимает overlay и не запускает blank-screen
recovery. Бюджет 15 секунд начинается только при видимой странице и
установленном client context, приостанавливается в фоне и перезапускается после
возврата. Штатный auth gate завершает guard без показа ложного восстановления.
Реальный таймаут показывает ручные действия «Повторить» и «Перезагрузить
приложение»; retry перезапускает Day sync без автоматического reload. Один boot
получает не более одного `first_visible_frame`, `blank_screen_guard_triggered` и
`blank_screen_recovery_failed`; успешный paint после timeout дополнительно
фиксирует `blank_screen_recovered`.

Следствие: это **wake-up bridge**, а не автономная background upload гарантия.
Без открытого client window он ничего не отправляет; `SYNC_COMPLETE` означает
окончание фиксированной задержки, а не подтверждённый drain cloud queue.

## Push subscription

1. `HEYS.push.getStatus()` проверяет browser capability, permission,
   subscription и iOS standalone requirement.
2. `subscribe()` запрашивает permission только из пользовательского flow,
   получает VAPID public key и создаёт browser PushSubscription. В первой
   регистрации выбор сохраняется как client-scoped pending intent:
   `setEnabled(true)` запускается только после облачного подтверждения
   четвёртого шага профиля и не блокирует завершение регистрации при ошибке
   push.
3. Endpoint + `p256dh/auth` отправляются в `/push/subscribe`.
4. Backend server-side резолвит identity из curator JWT или client session
   (Bearer/HttpOnly cookie) и upsert-ит отдельную client/curator таблицу.
5. `unsubscribe()` сначала удаляет server row, затем browser subscription.
6. `pushsubscriptionchange` может только уведомить открытые окна; стартовая
   auto-resubscribe ветка восстанавливает subscription при следующем визите,
   если permission и onboarded state позволяют.

VAPID public key endpoint публичный; subscribe/unsubscribe/prefs/test требуют
auth. Gateway routes подключены в основном `api-gateway-spec.yaml`.

## Доставка и click

Backend выбирает subscriptions по resolved identity, отправляет через `web-push`
и удаляет dead endpoints после delivery errors. SW показывает notification с
payload title/body/tag/url. Click фокусирует существующую вкладку и навигирует
её либо открывает новое окно.

Messenger push использует приватный generic preview: «Новое сообщение от
клиента/куратора» и «Открыть диалог». Текст, intent payload, продукты, граммы,
имена файлов и transcript остаются внутри авторизованного messenger и в push не
передаются. Idempotency replay уже сохранённого send не создаёт повторный push.
В уже открытой PWA рост unread-счётчика клиента показывает устойчивое верхнее
уведомление «Куратор написал сообщение»: «Прочитать» открывает messenger, а
«Позже» только скрывает уведомление и не помечает сообщение прочитанным.

## Инварианты

1. Auth/payment responses и version metadata не кэшируются как обычные assets.
   Legal Markdown кэшируется только по неизменяемому versioned URL; экран
   дополнительно сверяет версию текста перед показом и подписью.
2. Hash bundles immutable; HTML всегда должен иметь путь к свежей версии.
3. Client switch инвалидирует KV API cache до первого fetch нового клиента.
4. Update reload не должен обрывать активную auth sync.
5. Push subscription всегда принадлежит server-resolved identity.
6. iOS Safari push требует installed standalone PWA.
7. Permission prompt вызывается только из понятного user flow.
8. Push payload URL не должен обходить допустимую navigation policy.
9. Messenger push не содержит пользовательский текст или attachment metadata.
10. Отказ `localStorage` не должен превращать закрытие `What's New` в цикл.
11. Клиентский push не уходит без живого `consents.push_notifications`.
    Кураторский — без живого `curator_consents.curator_push_notifications`. Нет
    согласия → `skipped: push_consent_missing`, не ошибка.
12. Push permission/subscribe первой регистрации не запускается на экране
    обязательных согласий; pending opt-in потребляется один раз на финальном
    шаге профиля после подтверждённого cloud save.
13. Payload уходит только через
    `webpush.sendNotification(subscription, payload)`. Содержательный текст в
    push-`topic` и заголовках запрещён: в Web Push они не шифруются. Тест:
    `yandex-cloud-functions/__tests__/push-encryption-invariant.test.cjs`.

## Подтверждённые слабые места и пробелы

- Background Sync не является реальным queue processor: нет SW-owned durable
  queue, нет ожидания upload promise, а `SYNC_COMPLETE` отправляется через 1 с.
- `pushsubscriptionchange` не может восстановить подписку без открытой страницы;
  восстановление откладывается до следующего запуска.
- PWA update logic распределена между крупным `PlatformAPIs`, facade и SW;
  изменение message type требует проверять обе стороны.
- `pwa-update-logic.test.js` моделирует часть алгоритма отдельно, а не исполняет
  реальный `PlatformAPIs`/SW lifecycle; это полезный unit contract, но не
  browser smoke.
- Production VAPID keys, permissions и реальная доставка не проверены этим
  аудитом.
- 15.08.2026: SQL кураторского согласия на проде (`curator_push_notifications`
  1.0, два активных куратора). Гейт в CF ещё не задеплоен — до выкладки
  `heys-api-messages`, `heys-api-push`, `heys-cron-reminders` прод шлёт
  кураторские push без этой проверки.
- SW push click принимает `data.url`; backend producers должны гарантировать
  безопасный same-app URL. В самом click handler allowlist не виден.

## Ключевые точки и тесты

- `apps/web/heys_platform_apis_v1.js` — registration/update/offline coordinator.
- `apps/web/heys_pwa_module_v1.js` — facade.
- `apps/web/public/sw.js` — runtime SW source.
- `apps/web/heys_push_v1.js` — browser push API.
- `yandex-cloud-functions/heys-api-push/index.js` — push backend.
- `yandex-cloud-functions/heys-api-push/__tests__/push-consent.test.js` — live
  consent predicate.
- `yandex-cloud-functions/heys-cron-reminders/__tests__/curator-push-consent-gate.test.js`
  — curator skip/send.
- `yandex-cloud-functions/__tests__/push-encryption-invariant.test.cjs` — send
  only via webpush.sendNotification.
- `apps/web/__tests__/pwa-update-logic.test.js` — update guards.
- `apps/web/__tests__/client-switch-reload-guard.test.js` — switch/reload guard.
- `apps/web/__tests__/push-agent.test.js` — push-related agent behavior (не Web
  Push delivery E2E).
- `apps/web/__tests__/curator-actions-banner.test.js` — очередь и retry
  подтверждения модалки правок куратора.

SW update state machine публикует структурированные события
`sw_update_detected/downloading/ready/activating`, `sw_reload_requested` и
`sw_reload_suppressed`. Они входят в один `boot_id` с событиями What's New и
позволяют отличить штатное обновление PWA от повторного reload-цикла.

Обязательный утренний check-in загружает StepModal и проверку пропущенных дней
из независимых lazy chunks. Если проверка дней загрузилась раньше и исчерпала
короткие retry, она повторно регистрирует шаг по `heys-stepmodal-ready`; пока
конфигурация шага ещё не готова, блокирующая модалка показывает статус загрузки,
а не скрывает приложение пустым экраном.

Если конфигурация всё же не появилась за 8 секунд, StepModal пишет privacy-safe
`step_registry_timeout`: отсутствующие code step ids, running app version, SW
state и update version. Ожидаемый отказ `screen.orientation.lock()`
(`NotSupportedError`/`SecurityError` и родственные capability-state ошибки) не
считается runtime incident и не отправляется как Analytics error; неожиданные
ошибки по-прежнему fail visibly.

## Канонический source-push

1. Закоммить только согласованные source/test/docs/migration-файлы;
   generated/release-файлы source-only guard не пропускает.
2. Запустить `pnpm push:agent -- --dry-run --no-push` для быстрой проверки
   scope, secrets, migration safety, auth/ownership, static guards и релевантных
   тестов.
3. При нужности локального full suite отдельно запустить
   `pnpm push:preflight -- --full`; обычный push его не дублирует.
4. Запустить `pnpm push:agent -- --confirm-push`; команда не создаёт
   release-entry и не подхватывает dirty generated-файлы. Временные network/HTTP
   5xx ошибки `git push` повторяются максимум два раза для того же уже
   проверенного HEAD; auth, hook и non-fast-forward ошибки завершают flow сразу.
5. Deploy CI на том же source SHA запускает полный Vitest suite в двух
   обязательных параллельных shard и migration safety gate ровно в одном из них.
   Затем выполняется `prebuild` → React bundle → одна чистая legacy-сборка с
   verification → Vite; любая ошибка блокирует deploy.
6. Full deploy в своём же job сверяет production `build-meta.json` с hash
   собранного артефакта и проверяет доступность всех hash-bundles. Отдельная
   ancestry-проверка остаётся только у fast release path.
7. `app.heyslab.ru` не имеет Yandex CDN resource и не требует purge. Workflow
   очищает только mutable entrypoints существующих Demo/Landing CDN; ошибка
   реального purge блокирует deploy, а не маскируется как success.
8. Если поверх source-коммита существует generated bundle-only commit,
   `push-agent` сверяет `build-meta.hash` с ближайшим содержательным source SHA,
   а не с generated HEAD. Точное совпадение production manifest с каноническим
   CI-артефактом проверяет сам deploy job; после него `push-agent` дополнительно
   проверяет доступность всех опубликованных hash-bundles.
9. После full и fast deploy отдельный read-only legal canary берёт hashed
   `boot-core` из live index, распаковывает HTTP gzip, сравнивает версии с
   production `legal_consent_registry`, проверяет landing legal-страницы и
   актуальность migration ledger. Та же проверка запускается каждые 6 часов;
   drift отправляется через общий Telegram alert sender без текстов документов и
   DB rows.

## Повторное включение What's New

1. Изменить единственный флаг в `apps/web/heys_release_features_v1.js` на
   `whatsNewEnabled: true`.
2. Обновить верхнюю запись `apps/web/public/whats-new.json` для целевого source
   SHA; историю и seen-ключи не сбрасывать.
3. Запустить тесты `release-features`, `prepare-release-skip`,
   `whats-new-display`, `whats-new-seen-flag-preserved` и `push-agent`.
4. Проверить на iPhone/PWA один показ, явное закрытие, сохранение ack и
   отсутствие retry/reload-цикла.
5. После deploy проверить `build-meta.json`, hash-bundles и телеметрию
   `whats_new_shown` → `whats_new_acknowledged` без повтора в одном `boot_id`.

## Facts Table

| ID  | Утверждение                                                                                                                                                                                                    | Проверка                                                                                                                                                                                                                                     | Статус                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| W1  | SW пропускается и unregister-ится на localhost/demo                                                                                                                                                            | `sed -n '720,755p' apps/web/heys_platform_apis_v1.js`                                                                                                                                                                                        | проверено 2026-07-17                                     |
| W2  | SW регистрируется как `/sw.js` и обрабатывает controllerchange                                                                                                                                                 | `rg -n -F -e "register('/sw.js')" -e "addEventListener('controllerchange'" apps/web/heys_platform_apis_v1.js`                                                                                                                                | проверено 2026-07-17                                     |
| W3  | API cache routing различает no-store auth, RPC и KV SWR                                                                                                                                                        | `sed -n '266,335p' apps/web/public/sw.js`                                                                                                                                                                                                    | проверено 2026-07-17                                     |
| W4  | Client switch инвалидирует SW KV cache                                                                                                                                                                         | `rg -n -e 'CLIENT_SWITCH' -e 'CLEAR_API_KV' apps/web/public/sw.js apps/web/heys_storage_supabase_v1.js`                                                                                                                                      | проверено 2026-07-17                                     |
| W5  | Background sync лишь postMessage-ит START, ждёт 1 с и COMPLETE                                                                                                                                                 | `sed -n '745,770p' apps/web/public/sw.js`                                                                                                                                                                                                    | проверено 2026-07-17                                     |
| W6  | Browser push требует capability/permission и iOS standalone                                                                                                                                                    | `sed -n '120,180p' apps/web/heys_push_v1.js`                                                                                                                                                                                                 | проверено 2026-07-17                                     |
| W7  | Push backend резолвит client/curator identity и auth-гейтит private actions                                                                                                                                    | `sed -n '90,175p' yandex-cloud-functions/heys-api-push/index.js && sed -n '380,445p' yandex-cloud-functions/heys-api-push/index.js`                                                                                                          | проверено 2026-07-17                                     |
| W8  | SW показывает notification, обрабатывает click и subscription change                                                                                                                                           | `rg -n -F -e "addEventListener('push'" -e "addEventListener('notificationclick'" -e "addEventListener('pushsubscriptionchange'" apps/web/public/sw.js`                                                                                       | проверено 2026-07-17                                     |
| W9  | Gateway содержит все пять push routes                                                                                                                                                                          | `sed -n '430,505p' yandex-cloud-functions/api-gateway-spec.yaml`                                                                                                                                                                             | проверено 2026-07-17                                     |
| W10 | `What's New` переживает отказ `localStorage` без повторного открытия                                                                                                                                           | `rg -n "SESSION_ACK_KEY\|runtimeAcknowledgedVersion" apps/web/heys_whats_new_modal_v1.js apps/web/__tests__/whats-new-display.test.js`                                                                                                       | проверено 2026-07-23                                     |
| W11 | Ack правок куратора переживает отказ storage и не открывает pending повторно                                                                                                                                   | `pnpm vitest run apps/web/__tests__/curator-actions-banner.test.js`                                                                                                                                                                          | проверено 2026-07-23                                     |
| W12 | SW lifecycle и reload suppression входят в структурированный boot timeline                                                                                                                                     | `npx vitest run apps/web/__tests__/client-session-observability.test.js`                                                                                                                                                                     | проверено 2026-07-24                                     |
| W13 | Sync/write telemetry агрегирована по циклу/пакету и не содержит значений                                                                                                                                       | `npx vitest run apps/web/__tests__/client-session-observability.test.js`                                                                                                                                                                     | проверено 2026-07-24                                     |
| W14 | Lazy race StepModal/yesterdayVerify восстанавливает обязательный первый шаг                                                                                                                                    | `npx vitest run apps/web/__tests__/morning-checkin-flow-resume.test.js`                                                                                                                                                                      | проверено 2026-07-24                                     |
| W26 | Missing StepModal registry пишет безопасную build/SW диагностику, ожидаемый orientation reject не становится error telemetry                                                                                   | `npx vitest run apps/web/__tests__/morning-checkin-flow-resume.test.js apps/web/__tests__/pwa-update-logic.test.js --no-coverage`                                                                                                            | проверено локально 2026-07-31                            |
| W15 | Центральный флаг выключает modal/fetch/retry и не меняет seen-state                                                                                                                                            | `pnpm exec vitest run apps/web/__tests__/release-features.test.js apps/web/__tests__/whats-new-display.test.js`                                                                                                                              | проверено 2026-07-24                                     |
| W16 | Deploy CI сам собирает и верифицирует legacy artifact перед upload                                                                                                                                             | `rg -n -e "build:ci" -e "verify-legacy-bundles" .github/workflows/deploy-yandex.yml apps/web/package.json`                                                                                                                                   | проверено 2026-07-24                                     |
| W17 | Migration safety остаётся обязательной локально для SQL diff и всегда в CI                                                                                                                                     | `node --test scripts/db/migrate.test.mjs && rg -n -e "Migration safety" -e "migration safety gate" scripts/push-preflight.mjs .github/workflows/deploy-yandex.yml`                                                                           | проверено 2026-07-24                                     |
| W18 | Transient push повторяется без повтора preflight, terminal push не повторяется                                                                                                                                 | `pnpm exec vitest run apps/web/__tests__/push-agent.test.js`                                                                                                                                                                                 | проверено 2026-07-24                                     |
| W19 | Full deploy проверяет metadata/bundles inline; ancestry job только для fast path                                                                                                                               | `rg -n -e "Verify production build metadata and bundles" -e "Verify fast deploy ancestry" .github/workflows/deploy-yandex.yml`                                                                                                               | проверено 2026-07-24                                     |
| W20 | Full Vitest разделён на два обязательных shard; migration gate выполняется один раз                                                                                                                            | `rg -n -e "matrix:" -e "--shard=" -e "if: matrix.shard == 1" .github/workflows/deploy-yandex.yml`                                                                                                                                            | проверено 2026-07-24                                     |
| W21 | Bundle-only HEAD проверяется по source SHA; artifact manifest — внутри deploy job                                                                                                                              | `pnpm exec vitest run apps/web/__tests__/push-agent.test.js`                                                                                                                                                                                 | проверено 2026-07-24                                     |
| W22 | Visual guard держит boot-знак до paint, принимает blocking consent gate, считает `subscription-loading` transient и даёт ручной recovery без reload-цикла                                                      | `pnpm exec vitest run apps/web/__tests__/blank-screen-guard.test.js apps/web/__tests__/consent-gate-flow.test.js apps/web/__tests__/trial-prestart-access-contract.test.js apps/web/__tests__/yandex-api-backpressure.test.js --no-coverage` | 29/29 + isolated cookie-only smoke, проверено 2026-08-15 |
| W23 | Повторный PIN-вход/foreground сразу перечитывает правки; auto-ack требует tombstone                                                                                                                            | `pnpm vitest run apps/web/__tests__/curator-actions-banner.test.js`                                                                                                                                                                          | проверено 2026-07-26                                     |
| W24 | Live legal drift canary: обязательные (`user_agreement`, `personal_data`) + landing; push-типы (`push_notifications`, `curator_push_notifications`) — только реестр ↔ LegalVersions в boot-core, без лендинга | `node --test scripts/ci/__tests__/legal-drift-canary.test.mjs`; `node scripts/check-live-legal-drift.mjs`                                                                                                                                    | source 2026-08-16                                        |
| W27 | Versioned legal Markdown обязателен в install precache и читается через Cache Storage при сетевой ошибке                                                                                                       | `pnpm exec vitest run apps/web/__tests__/consent-offline-cache.test.js`                                                                                                                                                                      | проверено локально 2026-08-27                            |
| W28 | Push opt-in первой регистрации откладывается до подтверждённого финального шага профиля и потребляется один раз                                                                                                | `pnpm exec vitest run apps/web/__tests__/consent-offline-cache.test.js apps/web/__tests__/first-login-registration-flow.test.js`                                                                                                             | проверено локально 2026-08-28                            |
| W29 | Четыре семантических события добавок используют общий лист правок куратора и его существующий fetch/ack/retry-контракт                                                                                         | `node --test yandex-cloud-functions/heys-api-rpc/__tests__/curator-action-diff.test.js && pnpm --filter @heys/web exec vitest run __tests__/curator-actions-banner.test.js __tests__/curator-sheet-canvas-smoke.test.js --no-coverage`       | проверено локально 2026-08-28                            |
| W25 | Write telemetry различает безопасные key/error-коды, а visual guard считает только видимое post-auth время                                                                                                     | `npx vitest run apps/web/__tests__/client-session-observability.test.js apps/web/__tests__/blank-screen-guard.test.js`                                                                                                                       | проверено 2026-07-30                                     |
